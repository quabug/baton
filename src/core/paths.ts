import { homedir, tmpdir } from "node:os";
import { sep } from "node:path";

const PLACEHOLDER_PROJECT_ROOT = "$" + "{PROJECT_ROOT}";
const PLACEHOLDER_HOME = "$" + "{HOME}";
const PLACEHOLDER_TMP = "$" + "{TMP}";

const PLACEHOLDERS = {
	PROJECT_ROOT: PLACEHOLDER_PROJECT_ROOT,
	HOME: PLACEHOLDER_HOME,
	TMP: PLACEHOLDER_TMP,
} as const;

interface PathContext {
	projectRoot: string;
	home: string;
	tmp: string;
}

/**
 * Get the current machine's path context.
 */
export function getLocalPathContext(projectRoot: string): PathContext {
	return {
		projectRoot,
		home: homedir(),
		tmp: tmpdir(),
	};
}

/**
 * Virtualize paths in content: replace machine-local absolute paths
 * with portable placeholders.
 *
 * Replaces longest paths first to prevent partial matches.
 * Normalizes path separators to `/` in stored content.
 */
export function virtualizePaths(content: string, ctx: PathContext): string {
	// Normalize backslashes to forward slashes for consistent matching
	const normalizedContent =
		sep === "\\" ? content.replace(/\\/g, "/") : content;

	// Build replacement pairs, sorted by path length (longest first)
	const replacements: [string, string][] = (
		[
			[normalizeSeparators(ctx.projectRoot), PLACEHOLDERS.PROJECT_ROOT],
			[normalizeSeparators(ctx.home), PLACEHOLDERS.HOME],
			[normalizeSeparators(ctx.tmp), PLACEHOLDERS.TMP],
		] as [string, string][]
	).sort((a, b) => b[0].length - a[0].length);

	let result = normalizedContent;
	for (const [path, placeholder] of replacements) {
		if (path) {
			result = replacePathWithBoundary(result, path, placeholder);
		}
	}

	return result;
}

/**
 * Expand placeholders in content: replace portable placeholders
 * with machine-local absolute paths.
 *
 * Expands to OS-native path separators.
 */
export function expandPaths(content: string, ctx: PathContext): string {
	let result = content;

	result = replaceAll(
		result,
		PLACEHOLDERS.PROJECT_ROOT,
		toNativePath(ctx.projectRoot),
	);
	result = replaceAll(result, PLACEHOLDERS.HOME, toNativePath(ctx.home));
	result = replaceAll(result, PLACEHOLDERS.TMP, toNativePath(ctx.tmp));

	return result;
}

/**
 * Normalize path separators to forward slashes.
 */
function normalizeSeparators(path: string): string {
	return path.replace(/\\/g, "/");
}

/**
 * Convert a path to use the OS-native separator.
 */
function toNativePath(path: string): string {
	if (sep === "\\") {
		return path.replace(/\//g, "\\");
	}
	return path;
}

/**
 * Replace all occurrences of a path, but only when followed by a path
 * boundary character (/, \, ", whitespace, end of string, etc.).
 * Prevents matching /home/dr_who inside /home/dr_who_backup.
 */
function replacePathWithBoundary(
	str: string,
	path: string,
	replacement: string,
): string {
	const escaped = escapeRegex(path);
	const regex = new RegExp(`${escaped}(?=[/\\\\"\\s,}\\]]|$)`, "g");
	return str.replace(regex, replacement);
}

/**
 * Replace all occurrences of a substring.
 */
function replaceAll(str: string, search: string, replacement: string): string {
	return str.split(search).join(replacement);
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
