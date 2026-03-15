import { join } from "node:path";
import {
	encodeProjectDir,
	getClaudeProjectsDir,
} from "../adapters/claude-code/paths.js";
import {
	listLocalMemoryFiles,
	listLocalSessionIds,
} from "../adapters/claude-code/reader.js";
import { restoreProjectData } from "../adapters/claude-code/writer.js";
import { getRepoDir } from "../core/config.js";
import {
	detectConflicts,
	formatConflictMessage,
	hasConflicts,
} from "../core/conflicts.js";
import { pullRepo, repoExists } from "../core/git.js";
import { expandPaths, getLocalPathContext } from "../core/paths.js";
import { detectProject } from "../core/project.js";
import { ConflictError, NoSessionsError } from "../errors.js";
import { readCheckpoint } from "./checkpoint.js";
import { ensureBatonRepo } from "./setup.js";

export async function pull(options: {
	force?: boolean;
	skip?: boolean;
}): Promise<void> {
	const cwd = process.cwd();

	// 1. Detect project
	const project = await detectProject(cwd);
	console.log(`Project: ${project.normalizedRemote} (${project.projectId})`);

	// 2. Ensure baton repo is available
	await ensureBatonRepo("pull");

	const repoDir = getRepoDir();
	if (await repoExists(repoDir)) {
		console.log("Pulling latest...");
		await pullRepo(repoDir);
	}

	// 3. Read checkpoint from baton repo
	const projectDir = join(repoDir, "projects", project.projectId);
	const data = await readCheckpoint(projectDir);

	if (!data) {
		throw new NoSessionsError(
			"No checkpoint found for this project. Run 'baton push' on another machine first.",
		);
	}

	console.log(
		`Found ${data.sessions.length} session(s), ${data.memory.size} memory file(s)`,
	);

	// 4. Expand paths before conflict detection (so content comparison is meaningful)
	const pathCtx = getLocalPathContext(cwd);
	for (const session of data.sessions) {
		session.jsonl = expandPaths(session.jsonl, pathCtx);
	}

	// 5. Detect content-based conflicts
	const localProjectDir = join(getClaudeProjectsDir(), encodeProjectDir(cwd));
	const remoteSessionsDir = join(projectDir, "sessions");
	const remoteMemoryDir = join(projectDir, "memory");

	const localSessionIds = await listLocalSessionIds(cwd);
	const localMemoryFiles = await listLocalMemoryFiles(cwd);
	const remoteSessionIds = data.sessions.map((s) => s.sessionId);
	const remoteMemoryFiles = [...data.memory.keys()];

	const conflicts = await detectConflicts(
		localSessionIds,
		remoteSessionIds,
		localMemoryFiles,
		remoteMemoryFiles,
		{ localProjectDir, remoteSessionsDir, remoteMemoryDir },
	);

	if (hasConflicts(conflicts) && !options.force && !options.skip) {
		throw new ConflictError(
			formatConflictMessage(conflicts, {
				localProjectDir,
				remoteSessionsDir,
				remoteMemoryDir,
			}),
		);
	}

	// 6. Restore to Claude Code's local storage
	const skipSessions = options.skip ? new Set(conflicts.sessions) : undefined;
	const skipMemory = options.skip ? new Set(conflicts.memoryFiles) : undefined;

	await restoreProjectData(cwd, data, {
		skipSessions,
		skipMemory,
	});

	if (options.skip && hasConflicts(conflicts)) {
		const skipped = conflicts.sessions.length + conflicts.memoryFiles.length;
		console.log(`Pulled successfully. Skipped ${skipped} conflicting file(s).`);
	} else {
		console.log("Pulled successfully. Sessions restored to Claude Code.");
	}
}
