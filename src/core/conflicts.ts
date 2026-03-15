import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export interface FileConflict {
	name: string;
	localPath: string;
	remotePath: string;
	localModified: string;
	remoteModified: string;
}

export interface ConflictInfo {
	sessions: FileConflict[];
	memoryFiles: FileConflict[];
}

export interface ConflictContext {
	localProjectDir: string;
	remoteSessionsDir: string;
	remoteMemoryDir: string;
}

/**
 * Detect content-based conflicts between local and remote data.
 * Only reports files that actually differ in content.
 * Includes modification timestamps for each conflicting file.
 */
export async function detectConflicts(
	localSessionIds: string[],
	remoteSessionIds: string[],
	localMemoryFiles: string[],
	remoteMemoryFiles: string[],
	ctx: ConflictContext,
): Promise<ConflictInfo> {
	const remoteIdSet = new Set(remoteSessionIds);
	const overlappingSessionIds = localSessionIds.filter((id) =>
		remoteIdSet.has(id),
	);

	const remoteMemSet = new Set(remoteMemoryFiles);
	const overlappingMemory = localMemoryFiles.filter((f) => remoteMemSet.has(f));

	const sessions: FileConflict[] = [];
	for (const id of overlappingSessionIds) {
		const localPath = join(ctx.localProjectDir, `${id}.jsonl`);
		const remotePath = join(ctx.remoteSessionsDir, `${id}.jsonl`);
		if (await contentDiffers(localPath, remotePath)) {
			sessions.push({
				name: id,
				localPath,
				remotePath,
				localModified: await getModifiedTime(localPath),
				remoteModified: await getModifiedTime(remotePath),
			});
		}
	}

	const memoryFiles: FileConflict[] = [];
	for (const file of overlappingMemory) {
		const localPath = join(ctx.localProjectDir, "memory", file);
		const remotePath = join(ctx.remoteMemoryDir, file);
		if (await contentDiffers(localPath, remotePath)) {
			memoryFiles.push({
				name: file,
				localPath,
				remotePath,
				localModified: await getModifiedTime(localPath),
				remoteModified: await getModifiedTime(remotePath),
			});
		}
	}

	return { sessions, memoryFiles };
}

async function contentDiffers(pathA: string, pathB: string): Promise<boolean> {
	try {
		const [contentA, contentB] = await Promise.all([
			readFile(pathA, "utf-8"),
			readFile(pathB, "utf-8"),
		]);
		return contentA !== contentB;
	} catch {
		return false;
	}
}

async function getModifiedTime(filePath: string): Promise<string> {
	try {
		const s = await stat(filePath);
		return formatRelativeTime(s.mtime);
	} catch {
		return "unknown";
	}
}

function formatRelativeTime(date: Date): string {
	const now = Date.now();
	const diffMs = now - date.getTime();
	const diffMins = Math.floor(diffMs / 60_000);
	const diffHours = Math.floor(diffMs / 3_600_000);
	const diffDays = Math.floor(diffMs / 86_400_000);

	if (diffMins < 1) return "just now";
	if (diffMins < 60) return `${diffMins} minute(s) ago`;
	if (diffHours < 24) return `${diffHours} hour(s) ago`;
	return `${diffDays} day(s) ago`;
}

/**
 * Format conflict info into a message readable by both humans and AI agents.
 */
export function formatConflictMessage(conflicts: ConflictInfo): string {
	const lines: string[] = [];
	lines.push("Conflicts detected during baton pull.");
	lines.push("");

	if (conflicts.sessions.length > 0) {
		lines.push(`Conflicting sessions (${conflicts.sessions.length}):`);
		for (const c of conflicts.sessions) {
			lines.push(`  - ${c.name}`);
			lines.push(`    local:  ${c.localPath} (modified ${c.localModified})`);
			lines.push(`    remote: ${c.remotePath} (modified ${c.remoteModified})`);
		}
		lines.push("");
	}

	if (conflicts.memoryFiles.length > 0) {
		lines.push(`Conflicting memory files (${conflicts.memoryFiles.length}):`);
		for (const c of conflicts.memoryFiles) {
			lines.push(`  - ${c.name}`);
			lines.push(`    local:  ${c.localPath} (modified ${c.localModified})`);
			lines.push(`    remote: ${c.remotePath} (modified ${c.remoteModified})`);
		}
		lines.push("");
	}

	lines.push("Choose how to resolve:");
	lines.push("  1. Overwrite local with remote (lose local changes)");
	lines.push(
		"  2. Keep local, skip remote (local will overwrite remote on next push)",
	);
	if (conflicts.memoryFiles.length > 0) {
		lines.push(
			"  3. Merge memory files (agent reads both versions and combines them)",
		);
	}
	lines.push("");

	lines.push("Or use flags directly:");
	lines.push(
		"  baton pull --force    option 1: overwrite all local with remote",
	);
	lines.push(
		"  baton pull --skip     option 2: only pull non-conflicting files",
	);

	lines.push("");
	lines.push("<agent-hint>");
	lines.push("Ask the user which option they prefer. Then follow through:");
	lines.push("");
	if (conflicts.sessions.length > 0) {
		lines.push("For sessions (cannot be merged — pick one version):");
		lines.push("  Option 1: run `baton pull --force`, then `baton push`");
		lines.push("  Option 2: run `baton pull --skip`, then `baton push`");
		lines.push("");
	}
	if (conflicts.memoryFiles.length > 0) {
		lines.push("For memory files (can be merged):");
		lines.push("  Option 1: run `baton pull --force`, then `baton push`");
		lines.push("  Option 2: run `baton pull --skip`, then `baton push`");
		lines.push("  Option 3: read both local and remote files listed above,");
		lines.push("    merge their content (deduplicate, keep most recent info),");
		lines.push("    write merged result to local path,");
		lines.push("    then run `baton pull --skip` and `baton push`");
		lines.push("");
	}
	lines.push("</agent-hint>");

	return lines.join("\n");
}

/**
 * Check if there are any conflicts.
 */
export function hasConflicts(conflicts: ConflictInfo): boolean {
	return conflicts.sessions.length > 0 || conflicts.memoryFiles.length > 0;
}
