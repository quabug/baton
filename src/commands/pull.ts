import { join } from "node:path";
import { restoreProjectData } from "../adapters/claude-code/writer.js";
import { getRepoDir } from "../core/config.js";
import { pullRepo, repoExists } from "../core/git.js";
import { expandPaths, getLocalPathContext } from "../core/paths.js";
import { detectProject } from "../core/project.js";
import { NoSessionsError } from "../errors.js";
import { readCheckpoint } from "./checkpoint.js";
import { ensureBatonRepo } from "./setup.js";

export async function pull(): Promise<void> {
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

	// 4. Expand paths
	const pathCtx = getLocalPathContext(cwd);
	for (const session of data.sessions) {
		session.jsonl = expandPaths(session.jsonl, pathCtx);
	}

	// 5. Restore to Claude Code's local storage
	await restoreProjectData(cwd, data);

	console.log("Pulled successfully. Sessions restored to Claude Code.");
}
