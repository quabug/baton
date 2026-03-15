import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { ProjectNotFoundError } from "../errors.js";

const execFileAsync = promisify(execFile);

/**
 * Detect the git remote URL from the current working directory.
 * Uses the "origin" remote by default.
 */
export async function getGitRemote(cwd: string): Promise<string> {
	try {
		const { stdout } = await execFileAsync(
			"git",
			["remote", "get-url", "origin"],
			{ cwd },
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
		throw new ProjectNotFoundError(
			"Not a git repository or no 'origin' remote configured. Run this command from a git repository.",
		);
	}
}

/**
 * Normalize a git remote URL to a canonical form.
 *
 * Handles:
 * - git@github.com:user/repo.git → github.com/user/repo
 * - https://github.com/user/repo.git → github.com/user/repo
 * - https://github.com/user/repo → github.com/user/repo
 * - ssh://git@github.com/user/repo.git → github.com/user/repo
 */
export function normalizeGitRemote(remote: string): string {
	const normalized = remote.trim();

	// SSH shorthand: git@github.com:user/repo.git
	const sshMatch = normalized.match(/^[\w.-]+@([\w.-]+):(.*?)(?:\.git)?$/);
	if (sshMatch) {
		return `${sshMatch[1]}/${sshMatch[2]}`;
	}

	// ssh:// protocol: ssh://git@github.com/user/repo.git
	const sshProtoMatch = normalized.match(
		/^ssh:\/\/[\w.-]+@([\w.-]+)\/(.*?)(?:\.git)?$/,
	);
	if (sshProtoMatch) {
		return `${sshProtoMatch[1]}/${sshProtoMatch[2]}`;
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
