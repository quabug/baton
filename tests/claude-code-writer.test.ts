import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { restoreProjectData } from "../src/adapters/claude-code/writer.js";
import type { ProjectData } from "../src/adapters/claude-code/reader.js";

let mockProjectsDir = "";
let mockConfigPath = "";

vi.mock("../src/adapters/claude-code/paths.js", async (importOriginal) => {
	const original =
		await importOriginal<
			typeof import("../src/adapters/claude-code/paths.js")
		>();
	return {
		...original,
		getClaudeProjectsDir: () => mockProjectsDir,
		getProjectConfigPath: () => mockConfigPath,
	};
});

describe("restoreProjectData", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "baton-writer-test-"));
		mockProjectsDir = join(tempDir, "projects");
		mockConfigPath = join(tempDir, "project-config.json");
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("writes session JSONL to correct location", async () => {
		const data: ProjectData = {
			sessions: [
				{
					sessionId: "sess-001",
					jsonl: '{"type":"user"}\n',
					toolResults: new Map(),
				},
			],
			memory: new Map(),
			projectDirName: "-test-project",
		};

		await restoreProjectData("/test/project", data);

		const projectDir = join(mockProjectsDir, "-test-project");
		const content = await readFile(
			join(projectDir, "sess-001.jsonl"),
			"utf-8",
		);
		expect(content).toBe('{"type":"user"}\n');
	});

	it("writes multiple sessions", async () => {
		const data: ProjectData = {
			sessions: [
				{
					sessionId: "sess-001",
					jsonl: "line1\n",
					toolResults: new Map(),
				},
				{
					sessionId: "sess-002",
					jsonl: "line2\n",
					toolResults: new Map(),
				},
			],
			memory: new Map(),
			projectDirName: "-test-project",
		};

		await restoreProjectData("/test/project", data);

		const projectDir = join(mockProjectsDir, "-test-project");
		const content1 = await readFile(
			join(projectDir, "sess-001.jsonl"),
			"utf-8",
		);
		const content2 = await readFile(
			join(projectDir, "sess-002.jsonl"),
			"utf-8",
		);
		expect(content1).toBe("line1\n");
		expect(content2).toBe("line2\n");
	});

	it("writes tool-results to correct location", async () => {
		const toolResults = new Map([
			["abc123.txt", "tool output"],
			["def456.txt", "more output"],
		]);
		const data: ProjectData = {
			sessions: [
				{ sessionId: "sess-001", jsonl: "line\n", toolResults },
			],
			memory: new Map(),
			projectDirName: "-test-project",
		};

		await restoreProjectData("/test/project", data);

		const toolDir = join(
			mockProjectsDir,
			"-test-project",
			"sess-001",
			"tool-results",
		);
		const content1 = await readFile(join(toolDir, "abc123.txt"), "utf-8");
		const content2 = await readFile(join(toolDir, "def456.txt"), "utf-8");
		expect(content1).toBe("tool output");
		expect(content2).toBe("more output");
	});

	it("writes memory files to correct location", async () => {
		const memory = new Map([
			["MEMORY.md", "# Memory\nContext here"],
			["debugging.md", "debug notes"],
		]);
		const data: ProjectData = {
			sessions: [
				{
					sessionId: "sess-001",
					jsonl: "line\n",
					toolResults: new Map(),
				},
			],
			memory,
			projectDirName: "-test-project",
		};

		await restoreProjectData("/test/project", data);

		const memoryDir = join(mockProjectsDir, "-test-project", "memory");
		const content1 = await readFile(
			join(memoryDir, "MEMORY.md"),
			"utf-8",
		);
		const content2 = await readFile(
			join(memoryDir, "debugging.md"),
			"utf-8",
		);
		expect(content1).toBe("# Memory\nContext here");
		expect(content2).toBe("debug notes");
	});

	it("skips tool-results dir when session has none", async () => {
		const data: ProjectData = {
			sessions: [
				{
					sessionId: "sess-001",
					jsonl: "line\n",
					toolResults: new Map(),
				},
			],
			memory: new Map(),
			projectDirName: "-test-project",
		};

		await restoreProjectData("/test/project", data);

		const projectDir = join(mockProjectsDir, "-test-project");
		const entries = await readdir(projectDir);
		// Should only have the JSONL file, no session subdirectory
		expect(entries).toEqual(["sess-001.jsonl"]);
	});

	it("skips memory dir when no memory files exist", async () => {
		const data: ProjectData = {
			sessions: [
				{
					sessionId: "sess-001",
					jsonl: "line\n",
					toolResults: new Map(),
				},
			],
			memory: new Map(),
			projectDirName: "-test-project",
		};

		await restoreProjectData("/test/project", data);

		const projectDir = join(mockProjectsDir, "-test-project");
		const entries = await readdir(projectDir);
		expect(entries).not.toContain("memory");
	});

	it("creates project-config.json entry", async () => {
		const data: ProjectData = {
			sessions: [
				{
					sessionId: "sess-001",
					jsonl: "line\n",
					toolResults: new Map(),
				},
			],
			memory: new Map(),
			projectDirName: "-test-project",
		};

		await restoreProjectData("/test/project", data);

		const config = JSON.parse(await readFile(mockConfigPath, "utf-8"));
		expect(config["-test-project"]).toEqual({
			originalPath: "/test/project",
		});
	});

	it("preserves existing project-config.json entries", async () => {
		// Write existing config
		const { writeFile: fsWriteFile, mkdir: fsMkdir } = await import(
			"node:fs/promises"
		);
		await fsMkdir(join(tempDir), { recursive: true });
		await fsWriteFile(
			mockConfigPath,
			JSON.stringify({
				"-existing-project": {
					originalPath: "/existing/project",
					manuallyAdded: true,
				},
			}),
			"utf-8",
		);

		const data: ProjectData = {
			sessions: [
				{
					sessionId: "sess-001",
					jsonl: "line\n",
					toolResults: new Map(),
				},
			],
			memory: new Map(),
			projectDirName: "-test-project",
		};

		await restoreProjectData("/test/project", data);

		const config = JSON.parse(await readFile(mockConfigPath, "utf-8"));
		expect(config["-existing-project"]).toEqual({
			originalPath: "/existing/project",
			manuallyAdded: true,
		});
		expect(config["-test-project"]).toEqual({
			originalPath: "/test/project",
		});
	});

	it("does not overwrite existing project-config entry", async () => {
		const { writeFile: fsWriteFile } = await import("node:fs/promises");
		await fsWriteFile(
			mockConfigPath,
			JSON.stringify({
				"-test-project": {
					originalPath: "/original/path",
					manuallyAdded: true,
				},
			}),
			"utf-8",
		);

		const data: ProjectData = {
			sessions: [
				{
					sessionId: "sess-001",
					jsonl: "line\n",
					toolResults: new Map(),
				},
			],
			memory: new Map(),
			projectDirName: "-test-project",
		};

		await restoreProjectData("/test/project", data);

		const config = JSON.parse(await readFile(mockConfigPath, "utf-8"));
		// Should keep original entry, not overwrite
		expect(config["-test-project"].originalPath).toBe("/original/path");
		expect(config["-test-project"].manuallyAdded).toBe(true);
	});
});
