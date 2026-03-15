import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { GitNotFoundError, ProjectNotFoundError } from "../errors.js";

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 10_000;

/**
 * Detect the git remote URL from the current working directory.
 * Uses the "origin" remote by default.
 */
export async function getGitRemote(cwd: string): Promise<string> {
	try {
		const { stdout } = await execFileAsync(
			"git",
			["remote", "get-url", "origin"],
			{ cwd, timeout: GIT_TIMEOUT_MS },
		);
		const remote = stdout.trim();
		if (!remote) {
			throw new ProjectNotFoundError(
				"No git remote URL found. Run this command from a git repository with an 'origin' remote.",
			);
		}
		return remote;
	} catch (error) {
		if (error instanceof ProjectNotFoundError) throw error;
		if (isGitNotInstalled(error)) {
			throw new GitNotFoundError(
				"git is not installed or not found in PATH. Please install git first.",
			);
		}
		throw new ProjectNotFoundError(
			"Not a git repository or no 'origin' remote configured. Run this command from a git repository.",
		);
	}
}

function isGitNotInstalled(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const err = error as NodeJS.ErrnoException;
	return err.code === "ENOENT";
}

/**
 * Normalize a git remote URL to a canonical form.
 *
 * Handles:
 * - git@github.com:user/repo.git → github.com/user/repo
 * - https://github.com/user/repo.git → github.com/user/repo
 * - https://github.com/user/repo → github.com/user/repo
 * - ssh://git@github.com/user/repo.git → github.com/user/repo
 * - git://github.com/user/repo.git → github.com/user/repo
 */
export function normalizeGitRemote(remote: string): string {
	const normalized = remote.trim();

	// SSH shorthand: git@github.com:user/repo.git
	const sshMatch = normalized.match(/^[\w.-]+@([\w.-]+):(.*?)(?:\.git)?$/);
	if (sshMatch) {
		return `${sshMatch[1]}/${sshMatch[2]}`;
	}

	// ssh:// or git:// protocol: ssh://git@github.com/user/repo.git
	const protoMatch = normalized.match(
		/^(?:ssh|git):\/\/(?:[\w.-]+@)?([\w.-]+)\/(.*?)(?:\.git)?$/,
	);
	if (protoMatch) {
		return `${protoMatch[1]}/${protoMatch[2]}`;
	}

	// HTTPS: https://github.com/user/repo.git
	const httpsMatch = normalized.match(
		/^https?:\/\/([\w.-]+)\/(.*?)(?:\.git)?$/,
	);
	if (httpsMatch) {
		return `${httpsMatch[1]}/${httpsMatch[2]}`;
	}

	// Fallback: return as-is (stripped)
	return normalized;
}

/**
 * Hash a normalized git remote URL to produce a stable project ID.
 */
export function hashProjectId(normalizedRemote: string): string {
	return createHash("sha256")
		.update(normalizedRemote)
		.digest("hex")
		.slice(0, 16);
}

/**
 * Detect the project from the current working directory.
 * Returns the project hash and normalized git remote.
 */
export async function detectProject(
	cwd: string,
): Promise<{ projectId: string; gitRemote: string; normalizedRemote: string }> {
	const gitRemote = await getGitRemote(cwd);
	const normalizedRemote = normalizeGitRemote(gitRemote);
	const projectId = hashProjectId(normalizedRemote);
	return { projectId, gitRemote, normalizedRemote };
}
