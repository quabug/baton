import { join } from "node:path";
import { collectProjectData } from "../adapters/claude-code/reader.js";
import { getRepoDir } from "../core/config.js";
import { commitAndPush, isRemoteAhead, repoExists } from "../core/git.js";
import { getLocalPathContext, virtualizePaths } from "../core/paths.js";
import { detectProject } from "../core/project.js";
import { ConflictError } from "../errors.js";
import { writeCheckpoint } from "./checkpoint.js";
import { ensureBatonRepo } from "./setup.js";

export async function push(options: { force?: boolean }): Promise<void> {
	const cwd = process.cwd();

	// 1. Detect project
	const project = await detectProject(cwd);
	console.log(`Project: ${project.normalizedRemote} (${project.projectId})`);

	// 2. Collect session data
	const data = await collectProjectData(cwd);
	console.log(
		`Found ${data.sessions.length} session(s), ${data.memory.size} memory file(s)`,
	);

	// 3. Virtualize paths
	const pathCtx = getLocalPathContext(cwd);
	for (const session of data.sessions) {
		session.jsonl = virtualizePaths(session.jsonl, pathCtx);
	}

	// 4. Ensure baton repo exists
	const repoDir = getRepoDir();
	await ensureBatonRepo("push");

	// 5. Conflict check
	if (!options.force && (await repoExists(repoDir))) {
		try {
			const ahead = await isRemoteAhead(repoDir);
			if (ahead) {
				throw new ConflictError(
					"Remote has changes you haven't pulled. Run 'baton pull' first, or use 'baton push --force' to overwrite.",
				);
			}
		} catch (error) {
			if (error instanceof ConflictError) throw error;
			// Ignore fetch errors (e.g., empty repo with no commits on remote yet)
		}
	}

	// 6. Write checkpoint to baton repo
	const projectDir = join(repoDir, "projects", project.projectId);
	await writeCheckpoint(projectDir, project, data);

	// 7. Commit and push
	await commitAndPush(
		repoDir,
		`push: ${project.normalizedRemote}`,
		options.force ?? false,
	);

	console.log("Pushed successfully.");
}
