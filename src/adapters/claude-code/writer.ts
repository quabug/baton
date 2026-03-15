import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	encodeProjectDir,
	getClaudeProjectsDir,
	getProjectConfigPath,
} from "./paths.js";
import type { ProjectData } from "./reader.js";

export interface RestoreOptions {
	/** Session IDs to skip (don't overwrite) */
	skipSessions?: Set<string>;
	/** Memory file names to skip (don't overwrite) */
	skipMemory?: Set<string>;
}

/**
 * Restore project data to Claude Code's local storage.
 */
export async function restoreProjectData(
	projectPath: string,
	data: ProjectData,
	options?: RestoreOptions,
): Promise<void> {
	const projectDirName = encodeProjectDir(projectPath);
	const projectDir = join(getClaudeProjectsDir(), projectDirName);

	await mkdir(projectDir, { recursive: true });

	const skipSessions = options?.skipSessions ?? new Set();
	const skipMemory = options?.skipMemory ?? new Set();

	for (const session of data.sessions) {
		if (skipSessions.has(session.sessionId)) continue;

		// Write session JSONL
		await writeFile(
			join(projectDir, `${session.sessionId}.jsonl`),
			session.jsonl,
			"utf-8",
		);

		// Write tool results
		if (session.toolResults.size > 0) {
			const toolResultsDir = join(
				projectDir,
				session.sessionId,
				"tool-results",
			);
			await mkdir(toolResultsDir, { recursive: true });
			for (const [filename, content] of session.toolResults) {
				await writeFile(join(toolResultsDir, filename), content, "utf-8");
			}
		}
	}

	// Write memory files
	if (data.memory.size > 0) {
		const memoryDir = join(projectDir, "memory");
		await mkdir(memoryDir, { recursive: true });
		for (const [filename, content] of data.memory) {
			if (skipMemory.has(filename)) continue;
			await writeFile(join(memoryDir, filename), content, "utf-8");
		}
	}

	// Ensure project-config.json has a mapping
	await ensureProjectConfig(projectPath, projectDirName);
}

async function ensureProjectConfig(
	projectPath: string,
	projectDirName: string,
): Promise<void> {
	const configPath = getProjectConfigPath();

	let config: Record<
		string,
		{ manuallyAdded?: boolean; originalPath: string }
	> = {};
	try {
		const raw = await readFile(configPath, "utf-8");
		config = JSON.parse(raw);
	} catch {
		// File doesn't exist or is invalid, start fresh
	}

	if (!config[projectDirName]) {
		config[projectDirName] = {
			originalPath: projectPath,
		};
		await mkdir(dirname(configPath), { recursive: true });
		await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
	}
}
