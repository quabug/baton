import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface ConflictInfo {
	/** Sessions that exist both locally and remotely with different content */
	sessions: string[];
	/** Memory files that exist both locally and remotely with different content */
	memoryFiles: string[];
}

export interface ConflictContext {
	/** Local Claude Code project directory */
	localProjectDir: string;
	/** Remote checkpoint sessions directory in baton repo */
	remoteSessionsDir: string;
	/** Remote checkpoint memory directory in baton repo */
	remoteMemoryDir: string;
}

/**
 * Detect content-based conflicts between local and remote data.
 * Only reports files that actually differ in content.
 * Identical files are not conflicts (safe to overwrite with same data).
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

	const sessions: string[] = [];
	for (const id of overlappingSessionIds) {
		const localPath = join(ctx.localProjectDir, `${id}.jsonl`);
		const remotePath = join(ctx.remoteSessionsDir, `${id}.jsonl`);
		if (await contentDiffers(localPath, remotePath)) {
			sessions.push(id);
		}
	}

	const memoryFiles: string[] = [];
	for (const file of overlappingMemory) {
		const localPath = join(ctx.localProjectDir, "memory", file);
		const remotePath = join(ctx.remoteMemoryDir, file);
		if (await contentDiffers(localPath, remotePath)) {
			memoryFiles.push(file);
		}
	}

	return { sessions, memoryFiles };
}

/**
 * Check if two files have different content.
 * Returns true if content differs, false if identical.
 * Returns false if either file can't be read (treat as no conflict).
 */
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

/**
 * Format conflict info into a human-readable (and Claude Code-readable) message.
 */
export function formatConflictMessage(
	conflicts: ConflictInfo,
	remoteMemoryDir: string,
): string {
	const lines: string[] = [];
	lines.push("Conflicts detected during baton pull.");
	lines.push("");

	if (conflicts.sessions.length > 0) {
		lines.push(`Conflicting sessions (${conflicts.sessions.length}):`);
		for (const id of conflicts.sessions) {
			lines.push(`  - ${id}`);
		}
		lines.push("");
	}

	if (conflicts.memoryFiles.length > 0) {
		lines.push(`Conflicting memory files (${conflicts.memoryFiles.length}):`);
		for (const file of conflicts.memoryFiles) {
			lines.push(`  - ${file}`);
			lines.push(`    remote: ${join(remoteMemoryDir, file)}`);
		}
		lines.push("");
	}

	lines.push("To resolve:");
	lines.push("  baton pull --force    overwrite all local with remote");
	lines.push("  baton pull --skip     only pull non-conflicting files");

	if (conflicts.memoryFiles.length > 0) {
		lines.push("");
		lines.push(
			"Tip: ask Claude Code to merge the conflicting memory files by reading both local and remote versions.",
		);
	}

	return lines.join("\n");
}

/**
 * Check if there are any conflicts.
 */
export function hasConflicts(conflicts: ConflictInfo): boolean {
	return conflicts.sessions.length > 0 || conflicts.memoryFiles.length > 0;
}
