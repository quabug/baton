import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { NoSessionsError } from "../../errors.js";
import { encodeProjectDir, getClaudeProjectsDir } from "./paths.js";

export interface SessionData {
	sessionId: string;
	jsonl: string;
	toolResults: Map<string, string>;
}

export interface ProjectData {
	sessions: SessionData[];
	memory: Map<string, string>;
	projectDirName: string;
}

/**
 * List local session IDs for a project (lightweight, no content read).
 */
export async function listLocalSessionIds(
	projectPath: string,
): Promise<string[]> {
	const projectDirName = encodeProjectDir(projectPath);
	const projectDir = join(getClaudeProjectsDir(), projectDirName);

	let entries: string[];
	try {
		entries = await readdir(projectDir);
	} catch {
		return [];
	}

	return entries
		.filter((e) => e.endsWith(".jsonl"))
		.map((e) => basename(e, ".jsonl"));
}

/**
 * Collect all session data for a project from Claude Code's local storage.
 */
export async function collectProjectData(
	projectPath: string,
): Promise<ProjectData> {
	const projectDirName = encodeProjectDir(projectPath);
	const projectDir = join(getClaudeProjectsDir(), projectDirName);

	const sessions = await collectSessions(projectDir);
	if (sessions.length === 0) {
		throw new NoSessionsError(
			`No Claude Code sessions found for this project. Start a Claude Code session first.`,
		);
	}

	const memory = await collectMemory(projectDir);

	return { sessions, memory, projectDirName };
}

async function collectSessions(projectDir: string): Promise<SessionData[]> {
	let entries: string[];
	try {
		entries = await readdir(projectDir);
	} catch {
		return [];
	}

	const jsonlFiles = entries.filter((e) => e.endsWith(".jsonl"));
	const sessions: SessionData[] = [];

	for (const jsonlFile of jsonlFiles) {
		const sessionId = basename(jsonlFile, ".jsonl");
		const jsonl = await readFile(join(projectDir, jsonlFile), "utf-8");
		const toolResults = await collectToolResults(projectDir, sessionId);
		sessions.push({ sessionId, jsonl, toolResults });
	}

	return sessions;
}

async function collectToolResults(
	projectDir: string,
	sessionId: string,
): Promise<Map<string, string>> {
	const results = new Map<string, string>();
	const toolResultsDir = join(projectDir, sessionId, "tool-results");

	let entries: string[];
	try {
		entries = await readdir(toolResultsDir);
	} catch {
		return results;
	}

	for (const entry of entries) {
		const filePath = join(toolResultsDir, entry);
		const fileStat = await stat(filePath);
		if (fileStat.isFile()) {
			const content = await readFile(filePath, "utf-8");
			results.set(entry, content);
		}
	}

	return results;
}

async function collectMemory(projectDir: string): Promise<Map<string, string>> {
	const memory = new Map<string, string>();
	const memoryDir = join(projectDir, "memory");

	let entries: string[];
	try {
		entries = await readdir(memoryDir);
	} catch {
		return memory;
	}

	for (const entry of entries) {
		const filePath = join(memoryDir, entry);
		const fileStat = await stat(filePath);
		if (fileStat.isFile()) {
			const content = await readFile(filePath, "utf-8");
			memory.set(entry, content);
		}
	}

	return memory;
}
