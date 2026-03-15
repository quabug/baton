import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { collectProjectData } from "../adapters/claude-code/reader.js";
import { getRepoDir, loadConfig, saveConfig } from "../core/config.js";
import {
	cloneRepo,
	commitAndPush,
	createGhRepo,
	isRemoteAhead,
	repoExists,
} from "../core/git.js";
import { getLocalPathContext, virtualizePaths } from "../core/paths.js";
import { detectProject } from "../core/project.js";
import { ConflictError } from "../errors.js";
import { writeCheckpoint } from "./checkpoint.js";

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
	await ensureBatonRepo(repoDir);

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

async function ensureBatonRepo(repoDir: string): Promise<void> {
	let config = await loadConfig();

	if (!config) {
		// First-time setup: prompt for repo name
		const rl = createInterface({
			input: process.stdin,
			output: process.stdout,
		});
		try {
			const rawName = await rl.question(
				"Enter a name for your baton sync repo (will be created as private on GitHub): ",
			);
			const repoName = rawName.trim();
			if (!repoName) {
				throw new Error("Repo name cannot be empty.");
			}

			console.log(`Creating private repo '${repoName}'...`);
			const repoUrl = await createGhRepo(repoName);
			config = { repo: repoUrl };
			await saveConfig(config);
			console.log(`Repo created: ${repoUrl}`);
		} finally {
			rl.close();
		}
	}

	if (!(await repoExists(repoDir))) {
		console.log("Cloning baton repo...");
		await cloneRepo(config.repo, repoDir);
	}
}
