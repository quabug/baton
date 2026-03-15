import { join } from "node:path";
import { listLocalSessionIds } from "../adapters/claude-code/reader.js";
import { restoreProjectData } from "../adapters/claude-code/writer.js";
import { getRepoDir } from "../core/config.js";
import { pullRepo, repoExists } from "../core/git.js";
import { expandPaths, getLocalPathContext } from "../core/paths.js";
import { detectProject } from "../core/project.js";
import { ConflictError, NoSessionsError } from "../errors.js";
import { readCheckpoint } from "./checkpoint.js";
import { ensureBatonRepo } from "./setup.js";

export async function pull(options: { force?: boolean }): Promise<void> {
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

	// 4. Check for local sessions that would be overwritten
	if (!options.force) {
		const localIds = await listLocalSessionIds(cwd);
		const remoteIds = new Set(data.sessions.map((s) => s.sessionId));
		const conflicts = localIds.filter((id) => remoteIds.has(id));

		if (conflicts.length > 0) {
			throw new ConflictError(
				`${conflicts.length} local session(s) would be overwritten. Use 'baton pull --force' to proceed.`,
			);
		}
	}

	// 5. Expand paths
	const pathCtx = getLocalPathContext(cwd);
	for (const session of data.sessions) {
		session.jsonl = expandPaths(session.jsonl, pathCtx);
	}

	// 6. Restore to Claude Code's local storage
	await restoreProjectData(cwd, data);

	console.log("Pulled successfully. Sessions restored to Claude Code.");
}
