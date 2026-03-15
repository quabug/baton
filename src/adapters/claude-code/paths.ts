import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Encode a local project path into a Claude Code project directory name.
 * Claude Code replaces `/`, `.`, and `:` with `-`.
 *
 * Examples:
 *   /home/dr_who/baton → -home-dr_who-baton
 *   /Users/dr_who/work/baton → -Users-dr_who-work-baton
 *   C:\Users\dr_who\baton → -C-Users-dr_who-baton
 */
export function encodeProjectDir(projectPath: string): string {
	// Normalize backslashes to forward slashes (Windows support)
	const normalized = projectPath.replace(/\\/g, "/");
	return normalized.replace(/[/.:]/g, "-");
}

/**
 * Get the Claude Code projects base directory.
 */
export function getClaudeProjectsDir(): string {
	return join(homedir(), ".claude", "projects");
}

/**
 * Get the full path to a Claude Code project directory.
 */
export function getClaudeProjectPath(projectPath: string): string {
	return join(getClaudeProjectsDir(), encodeProjectDir(projectPath));
}

/**
 * Get the path to Claude Code's project-config.json.
 */
export function getProjectConfigPath(): string {
	return join(homedir(), ".claude", "project-config.json");
}
