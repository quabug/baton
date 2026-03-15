import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	collectProjectData,
	listLocalSessionIds,
} from "../src/adapters/claude-code/reader.js";
import { NoSessionsError } from "../src/errors.js";

// Mock the Claude projects directory to use our temp dir
vi.mock("../src/adapters/claude-code/paths.js", async (importOriginal) => {
	const original =
		await importOriginal<
			typeof import("../src/adapters/claude-code/paths.js")
		>();
	let mockProjectsDir = "";
	return {
		...original,
		_setMockProjectsDir: (dir: string) => {
			mockProjectsDir = dir;
		},
		getClaudeProjectsDir: () => mockProjectsDir,
	};
});

// Import the mock setter
const { _setMockProjectsDir } = await import(
	"../src/adapters/claude-code/paths.js"
);

describe("collectProjectData", () => {
	let tempDir: string;
	let projectDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "baton-reader-test-"));
		(
			_setMockProjectsDir as (dir: string) => void
		)(tempDir);
		// Create a project directory matching the encoding of /test/project
		projectDir = join(tempDir, "-test-project");
		await mkdir(projectDir, { recursive: true });
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("throws NoSessionsError when no JSONL files exist", async () => {
		await expect(collectProjectData("/test/project")).rejects.toThrow(
			NoSessionsError,
		);
	});

	it("throws NoSessionsError when project directory does not exist", async () => {
		await expect(
			collectProjectData("/nonexistent/project"),
		).rejects.toThrow(NoSessionsError);
	});

	it("collects a single session JSONL", async () => {
		const jsonlContent = '{"type":"user","message":"hello"}\n';
		await writeFile(
			join(projectDir, "sess-001.jsonl"),
			jsonlContent,
			"utf-8",
		);

		const data = await collectProjectData("/test/project");
		expect(data.sessions).toHaveLength(1);
		expect(data.sessions[0].sessionId).toBe("sess-001");
		expect(data.sessions[0].jsonl).toBe(jsonlContent);
		expect(data.sessions[0].toolResults.size).toBe(0);
	});

	it("collects multiple sessions", async () => {
		await writeFile(
			join(projectDir, "sess-001.jsonl"),
			"line1\n",
			"utf-8",
		);
		await writeFile(
			join(projectDir, "sess-002.jsonl"),
			"line2\n",
			"utf-8",
		);
		await writeFile(
			join(projectDir, "sess-003.jsonl"),
			"line3\n",
			"utf-8",
		);

		const data = await collectProjectData("/test/project");
		expect(data.sessions).toHaveLength(3);
		const ids = data.sessions.map((s) => s.sessionId).sort();
		expect(ids).toEqual(["sess-001", "sess-002", "sess-003"]);
	});

	it("collects tool-results for a session", async () => {
		await writeFile(
			join(projectDir, "sess-001.jsonl"),
			"line\n",
			"utf-8",
		);
		const toolResultsDir = join(projectDir, "sess-001", "tool-results");
		await mkdir(toolResultsDir, { recursive: true });
		await writeFile(
			join(toolResultsDir, "abc123.txt"),
			"tool output",
			"utf-8",
		);
		await writeFile(
			join(toolResultsDir, "def456.txt"),
			"more output",
			"utf-8",
		);

		const data = await collectProjectData("/test/project");
		expect(data.sessions[0].toolResults.size).toBe(2);
		expect(data.sessions[0].toolResults.get("abc123.txt")).toBe(
			"tool output",
		);
		expect(data.sessions[0].toolResults.get("def456.txt")).toBe(
			"more output",
		);
	});

	it("collects memory files", async () => {
		await writeFile(
			join(projectDir, "sess-001.jsonl"),
			"line\n",
			"utf-8",
		);
		const memoryDir = join(projectDir, "memory");
		await mkdir(memoryDir, { recursive: true });
		await writeFile(
			join(memoryDir, "MEMORY.md"),
			"# Memory\nSome context",
			"utf-8",
		);
		await writeFile(
			join(memoryDir, "debugging.md"),
			"debug notes",
			"utf-8",
		);

		const data = await collectProjectData("/test/project");
		expect(data.memory.size).toBe(2);
		expect(data.memory.get("MEMORY.md")).toBe("# Memory\nSome context");
		expect(data.memory.get("debugging.md")).toBe("debug notes");
	});

	it("returns empty memory when no memory directory exists", async () => {
		await writeFile(
			join(projectDir, "sess-001.jsonl"),
			"line\n",
			"utf-8",
		);

		const data = await collectProjectData("/test/project");
		expect(data.memory.size).toBe(0);
	});

	it("ignores non-JSONL files in project directory", async () => {
		await writeFile(
			join(projectDir, "sess-001.jsonl"),
			"line\n",
			"utf-8",
		);
		await writeFile(
			join(projectDir, "some-other-file.txt"),
			"irrelevant",
			"utf-8",
		);
		// Create a session subdirectory (should not be treated as a JSONL)
		await mkdir(join(projectDir, "sess-001"), { recursive: true });

		const data = await collectProjectData("/test/project");
		expect(data.sessions).toHaveLength(1);
	});

	it("returns correct projectDirName", async () => {
		await writeFile(
			join(projectDir, "sess-001.jsonl"),
			"line\n",
			"utf-8",
		);

		const data = await collectProjectData("/test/project");
		expect(data.projectDirName).toBe("-test-project");
	});
});

describe("listLocalSessionIds", () => {
	let tempDir: string;
	let projectDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "baton-reader-test-"));
		(_setMockProjectsDir as (dir: string) => void)(tempDir);
		projectDir = join(tempDir, "-test-project");
		await mkdir(projectDir, { recursive: true });
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("returns empty array when no sessions exist", async () => {
		const ids = await listLocalSessionIds("/test/project");
		expect(ids).toEqual([]);
	});

	it("returns empty array when project directory does not exist", async () => {
		const ids = await listLocalSessionIds("/nonexistent/project");
		expect(ids).toEqual([]);
	});

	it("returns session IDs from JSONL files", async () => {
		await writeFile(join(projectDir, "sess-001.jsonl"), "", "utf-8");
		await writeFile(join(projectDir, "sess-002.jsonl"), "", "utf-8");
		await writeFile(join(projectDir, "other.txt"), "", "utf-8");

		const ids = await listLocalSessionIds("/test/project");
		expect(ids.sort()).toEqual(["sess-001", "sess-002"]);
	});
});
