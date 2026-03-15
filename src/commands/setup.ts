import { createInterface } from "node:readline/promises";
import { getRepoDir, loadConfig, saveConfig } from "../core/config.js";
import { cloneRepo, createGhRepo, repoExists } from "../core/git.js";

/**
 * Ensure the baton repo is configured and cloned locally.
 * On first run, prompts the user to either create a new repo (push) or enter an existing repo URL (pull).
 */
export async function ensureBatonRepo(mode: "push" | "pull"): Promise<void> {
	const repoDir = getRepoDir();
	let config = await loadConfig();

	if (!config) {
		const rl = createInterface({
			input: process.stdin,
			output: process.stdout,
		});
		try {
			if (mode === "push") {
				config = await promptCreateRepo(rl);
			} else {
				config = await promptExistingRepo(rl);
			}
			await saveConfig(config);
		} finally {
			rl.close();
		}
	}

	if (!(await repoExists(repoDir))) {
		console.log("Cloning baton repo...");
		await cloneRepo(config.repo, repoDir);
	}
}

async function promptCreateRepo(
	rl: ReturnType<typeof createInterface>,
): Promise<{ repo: string }> {
	const rawName = await rl.question(
		"Enter a name for your baton sync repo (will be created as private on GitHub): ",
	);
	const repoName = rawName.trim();
	if (!repoName) {
		throw new Error("Repo name cannot be empty.");
	}

	console.log(`Creating private repo '${repoName}'...`);
	const repoUrl = await createGhRepo(repoName);
	console.log(`Repo created: ${repoUrl}`);
	return { repo: repoUrl };
}

async function promptExistingRepo(
	rl: ReturnType<typeof createInterface>,
): Promise<{ repo: string }> {
	const rawUrl = await rl.question(
		"Enter your baton sync repo URL (e.g. https://github.com/user/baton-sync): ",
	);
	const repoUrl = rawUrl.trim();
	if (!repoUrl) {
		throw new Error("Repo URL cannot be empty.");
	}

	return { repo: repoUrl };
}
