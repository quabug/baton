import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
	ProjectData,
	SessionData,
} from "../adapters/claude-code/reader.js";

interface ProjectMeta {
	project_id: string;
	git_remote: string;
	pushed_at: string;
}

/**
 * Write project data as a checkpoint to the baton repo.
 */
export async function writeCheckpoint(
	projectDir: string,
	project: { projectId: string; gitRemote: string },
	data: ProjectData,
): Promise<void> {
	// Clean existing sessions directory to remove stale sessions
	const sessionsDir = join(projectDir, "sessions");
	await rm(sessionsDir, { recursive: true, force: true });
	await mkdir(sessionsDir, { recursive: true });

	// Write meta
	const meta: ProjectMeta = {
		project_id: project.projectId,
		git_remote: project.gitRemote,
		pushed_at: new Date().toISOString(),
	};
	await writeFile(
		join(projectDir, "meta.json"),
		JSON.stringify(meta, null, 2),
		"utf-8",
	);

	// Write sessions
	for (const session of data.sessions) {
		await writeFile(
			join(sessionsDir, `${session.sessionId}.jsonl`),
			session.jsonl,
			"utf-8",
		);

		// Write tool results
		if (session.toolResults.size > 0) {
			const toolResultsDir = join(
				sessionsDir,
				session.sessionId,
				"tool-results",
			);
			await mkdir(toolResultsDir, { recursive: true });
			for (const [filename, content] of session.toolResults) {
				await writeFile(join(toolResultsDir, filename), content, "utf-8");
			}
		}
	}

	// Write memory
	if (data.memory.size > 0) {
		const memoryDir = join(projectDir, "memory");
		await mkdir(memoryDir, { recursive: true });
		for (const [filename, content] of data.memory) {
			await writeFile(join(memoryDir, filename), content, "utf-8");
		}
	}
}

/**
 * Read a checkpoint from the baton repo. Returns null if not found.
 */
export async function readCheckpoint(
	projectDir: string,
): Promise<ProjectData | null> {
	const sessionsDir = join(projectDir, "sessions");

	let sessionFiles: string[];
	try {
		const entries = await readdir(sessionsDir);
		sessionFiles = entries.filter((e) => e.endsWith(".jsonl"));
	} catch {
		return null;
	}

	if (sessionFiles.length === 0) {
		return null;
	}

	const sessions: SessionData[] = [];
	for (const file of sessionFiles) {
		const sessionId = file.replace(".jsonl", "");
		const jsonl = await readFile(join(sessionsDir, file), "utf-8");
		const toolResults = await readToolResults(sessionsDir, sessionId);
		sessions.push({ sessionId, jsonl, toolResults });
	}

	const memory = await readMemory(projectDir);

	return {
		sessions,
		memory,
		projectDirName: "",
	};
}

async function readToolResults(
	sessionsDir: string,
	sessionId: string,
): Promise<Map<string, string>> {
	const results = new Map<string, string>();
	const toolResultsDir = join(sessionsDir, sessionId, "tool-results");

	let entries: string[];
	try {
		entries = await readdir(toolResultsDir);
	} catch {
		return results;
	}

	for (const entry of entries) {
		const content = await readFile(join(toolResultsDir, entry), "utf-8");
		results.set(entry, content);
	}

	return results;
}

async function readMemory(projectDir: string): Promise<Map<string, string>> {
	const memory = new Map<string, string>();
	const memoryDir = join(projectDir, "memory");

	let entries: string[];
	try {
		entries = await readdir(memoryDir);
	} catch {
		return memory;
	}

	for (const entry of entries) {
		const content = await readFile(join(memoryDir, entry), "utf-8");
		memory.set(entry, content);
	}

	return memory;
}
