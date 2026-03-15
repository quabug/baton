import { createInterface } from "node:readline/promises";
import { getRepoDir, loadConfig, saveConfig } from "../core/config.js";
import { cloneRepo, createGhRepo, gh, repoExists } from "../core/git.js";

const DEFAULT_REPO_NAME = "baton-sessions";

/**
 * Ensure the baton repo is configured and cloned locally.
 * On first run:
 *   - push: auto-creates a private "baton-sessions" repo
 *   - pull: tries the current user's "baton-sessions" repo, prompts if not found
 */
export async function ensureBatonRepo(mode: "push" | "pull"): Promise<void> {
	const repoDir = getRepoDir();
	let config = await loadConfig();

	if (!config) {
		if (mode === "push") {
			config = await promptCreateRepo();
		} else {
			config = await autoDetectOrPrompt();
		}
		await saveConfig(config);
	}

	if (!(await repoExists(repoDir))) {
		console.log("Cloning baton repo...");
		await cloneRepo(config.repo, repoDir);
	}
}

async function getGitHubUsername(): Promise<string> {
	return await gh(["api", "user", "--jq", ".login"]);
}

async function promptCreateRepo(): Promise<{ repo: string }> {
	const rl = createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	try {
		const rawName = await rl.question(
			`Enter repo name for baton sync (${DEFAULT_REPO_NAME}): `,
		);
		const repoName = rawName.trim() || DEFAULT_REPO_NAME;
		console.log(`Creating private repo '${repoName}'...`);
		const repoUrl = await createGhRepo(repoName);
		console.log(`Repo created: ${repoUrl}`);
		return { repo: repoUrl };
	} finally {
		rl.close();
	}
}

async function autoDetectOrPrompt(): Promise<{ repo: string }> {
	// Try the current user's default repo name first
	const username = await getGitHubUsername();
	const defaultUrl = `https://github.com/${username}/${DEFAULT_REPO_NAME}`;

	try {
		// Check if the repo exists
		await gh([
			"repo",
			"view",
			`${username}/${DEFAULT_REPO_NAME}`,
			"--json",
			"name",
		]);
		console.log(`Found baton repo: ${defaultUrl}`);
		return { repo: defaultUrl };
	} catch {
		// Repo doesn't exist, prompt for URL
		const rl = createInterface({
			input: process.stdin,
			output: process.stdout,
		});
		try {
			const rawUrl = await rl.question(
				`No '${DEFAULT_REPO_NAME}' repo found for ${username}. Enter your baton repo URL: `,
			);
			const repoUrl = rawUrl.trim();
			if (!repoUrl) {
				throw new Error("Repo URL cannot be empty.");
			}
			return { repo: repoUrl };
		} finally {
			rl.close();
		}
	}
}
