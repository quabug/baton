import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
	encodeProjectDir,
	getClaudeProjectsDir,
} from "../adapters/claude-code/paths.js";
import { getRepoDir, loadConfig } from "../core/config.js";
import { repoExists } from "../core/git.js";
import { detectProject } from "../core/project.js";

export async function status(): Promise<void> {
	const cwd = process.cwd();

	// Project info
	const project = await detectProject(cwd);
	console.log(`Project: ${project.normalizedRemote}`);
	console.log(`Project ID: ${project.projectId}`);

	// Local sessions
	const projectDirName = encodeProjectDir(cwd);
	const localProjectDir = join(getClaudeProjectsDir(), projectDirName);
	try {
		const entries = await readdir(localProjectDir);
		const sessionCount = entries.filter((e) => e.endsWith(".jsonl")).length;
		console.log(`Local sessions: ${sessionCount}`);
	} catch {
		console.log("Local sessions: 0");
	}

	// Baton config
	const config = await loadConfig();
	if (!config) {
		console.log("Baton repo: not configured (run 'baton push' to set up)");
		return;
	}
	console.log(`Baton repo: ${config.repo}`);

	// Remote checkpoint
	const repoDir = getRepoDir();
	if (!(await repoExists(repoDir))) {
		console.log("Remote checkpoint: not cloned yet");
		return;
	}

	const metaPath = join(repoDir, "projects", project.projectId, "meta.json");
	try {
		const raw = await readFile(metaPath, "utf-8");
		const meta = JSON.parse(raw);
		console.log(`Last pushed: ${meta.pushed_at ?? "unknown"}`);
	} catch {
		console.log("Remote checkpoint: none for this project");
	}
}
