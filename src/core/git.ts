import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { promisify } from "node:util";
import { GhNotFoundError, GitNotFoundError } from "../errors.js";

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 30_000;
const GH_TIMEOUT_MS = 60_000;

/**
 * Run a git command in the given directory.
 */
export async function git(args: string[], cwd: string): Promise<string> {
	try {
		const { stdout } = await execFileAsync("git", args, {
			cwd,
			timeout: GIT_TIMEOUT_MS,
		});
		return stdout.trim();
	} catch (error) {
		if (isNotFound(error)) {
			throw new GitNotFoundError("git is not installed or not found in PATH.");
		}
		throw error;
	}
}

/**
 * Run a gh CLI command.
 */
export async function gh(args: string[]): Promise<string> {
	try {
		const { stdout } = await execFileAsync("gh", args, {
			timeout: GH_TIMEOUT_MS,
		});
		return stdout.trim();
	} catch (error) {
		if (isNotFound(error)) {
			throw new GhNotFoundError(
				"gh CLI is not installed. Install it from https://cli.github.com/",
			);
		}
		throw error;
	}
}

/**
 * Check if the local repo clone exists.
 */
export async function repoExists(repoDir: string): Promise<boolean> {
	try {
		await access(repoDir);
		return true;
	} catch {
		return false;
	}
}

/**
 * Clone a repo to the local cache directory.
 */
export async function cloneRepo(
	repoUrl: string,
	targetDir: string,
): Promise<void> {
	await execFileAsync("git", ["clone", repoUrl, targetDir], {
		timeout: GH_TIMEOUT_MS,
	});
}

/**
 * Fetch latest from remote without merging.
 */
export async function fetchRepo(repoDir: string): Promise<void> {
	await git(["fetch", "origin"], repoDir);
}

/**
 * Pull latest from remote (fast-forward).
 */
export async function pullRepo(repoDir: string): Promise<void> {
	await git(["pull", "--ff-only"], repoDir);
}

/**
 * Check if remote is ahead of local (has commits we haven't pulled).
 */
export async function isRemoteAhead(repoDir: string): Promise<boolean> {
	await fetchRepo(repoDir);
	const localHead = await git(["rev-parse", "HEAD"], repoDir);
	const remoteHead = await git(["rev-parse", "origin/main"], repoDir);
	return localHead !== remoteHead;
}

/**
 * Stage, commit, and push changes.
 */
export async function commitAndPush(
	repoDir: string,
	message: string,
	force: boolean,
): Promise<void> {
	await git(["add", "-A"], repoDir);

	// Check if there are changes to commit
	const status = await git(["status", "--porcelain"], repoDir);
	if (!status) {
		return; // Nothing to commit
	}

	await git(["commit", "-m", message], repoDir);

	const pushArgs = force
		? ["push", "--force", "origin", "main"]
		: ["push", "origin", "main"];
	await git(pushArgs, repoDir);
}

/**
 * Create a private GitHub repo via gh CLI.
 */
export async function createGhRepo(repoName: string): Promise<string> {
	const output = await gh([
		"repo",
		"create",
		repoName,
		"--private",
		"--confirm",
	]);
	// gh repo create outputs the URL
	const match = output.match(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+/);
	if (match) {
		return match[0];
	}
	// Fallback: construct from gh whoami
	const username = await gh(["api", "user", "--jq", ".login"]);
	return `https://github.com/${username}/${repoName}`;
}

/**
 * Initialize a new git repo with an initial commit.
 */
export async function initRepo(repoDir: string): Promise<void> {
	await git(["init", "-b", "main"], repoDir);
	await git(["config", "user.name", "baton"], repoDir);
	await git(["config", "user.email", "baton@localhost"], repoDir);
	await git(["commit", "--allow-empty", "-m", "init baton repo"], repoDir);
}

function isNotFound(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	return (error as NodeJS.ErrnoException).code === "ENOENT";
}
