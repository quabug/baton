import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

interface ActiveSession {
	pid: number;
	sessionId: string;
	cwd: string;
}

/**
 * Find the active Claude Code session for a given project directory.
 * Returns the session ID if found and the process is still running, null otherwise.
 */
export async function findActiveSessionId(
	projectCwd: string,
): Promise<string | null> {
	const sessionsDir = join(homedir(), ".claude", "sessions");

	let entries: string[];
	try {
		entries = await readdir(sessionsDir);
	} catch {
		return null;
	}

	for (const entry of entries) {
		if (!entry.endsWith(".json")) continue;
		try {
			const raw = await readFile(join(sessionsDir, entry), "utf-8");
			const session: ActiveSession = JSON.parse(raw);
			if (session.cwd === projectCwd && isProcessRunning(session.pid)) {
				return session.sessionId;
			}
		} catch {
			// Skip invalid session files
		}
	}

	return null;
}

function isProcessRunning(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}
