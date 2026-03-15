import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeCheckpoint, readCheckpoint } from "../src/commands/checkpoint.js";
import type { ProjectData } from "../src/adapters/claude-code/reader.js";

describe("writeCheckpoint", () => {
	let tempDir: string;
	let projectDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "baton-checkpoint-test-"));
		projectDir = join(tempDir, "project");
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("writes meta.json with project info", async () => {
		const data: ProjectData = {
			sessions: [
				{ sessionId: "s1", jsonl: "line\n", toolResults: new Map() },
			],
			memory: new Map(),
			projectDirName: "",
		};

		await writeCheckpoint(
			projectDir,
			{ projectId: "abc123", gitRemote: "git@github.com:me/repo.git" },
			data,
		);

		const meta = JSON.parse(
			await readFile(join(projectDir, "meta.json"), "utf-8"),
		);
		expect(meta.project_id).toBe("abc123");
		expect(meta.git_remote).toBe("git@github.com:me/repo.git");
		expect(meta.pushed_at).toBeTruthy();
	});

	it("writes session JSONL files", async () => {
		const data: ProjectData = {
			sessions: [
				{ sessionId: "s1", jsonl: "line1\n", toolResults: new Map() },
				{ sessionId: "s2", jsonl: "line2\n", toolResults: new Map() },
			],
			memory: new Map(),
			projectDirName: "",
		};

		await writeCheckpoint(
			projectDir,
			{ projectId: "abc", gitRemote: "url" },
			data,
		);

		const sessionsDir = join(projectDir, "sessions");
		const content1 = await readFile(join(sessionsDir, "s1.jsonl"), "utf-8");
		const content2 = await readFile(join(sessionsDir, "s2.jsonl"), "utf-8");
		expect(content1).toBe("line1\n");
		expect(content2).toBe("line2\n");
	});

	it("writes tool results", async () => {
		const toolResults = new Map([["out.txt", "output data"]]);
		const data: ProjectData = {
			sessions: [{ sessionId: "s1", jsonl: "line\n", toolResults }],
			memory: new Map(),
			projectDirName: "",
		};

		await writeCheckpoint(
			projectDir,
			{ projectId: "abc", gitRemote: "url" },
			data,
		);

		const content = await readFile(
			join(projectDir, "sessions", "s1", "tool-results", "out.txt"),
			"utf-8",
		);
		expect(content).toBe("output data");
	});

	it("writes memory files", async () => {
		const memory = new Map([["MEMORY.md", "# Memories"]]);
		const data: ProjectData = {
			sessions: [
				{ sessionId: "s1", jsonl: "line\n", toolResults: new Map() },
			],
			memory,
			projectDirName: "",
		};

		await writeCheckpoint(
			projectDir,
			{ projectId: "abc", gitRemote: "url" },
			data,
		);

		const content = await readFile(
			join(projectDir, "memory", "MEMORY.md"),
			"utf-8",
		);
		expect(content).toBe("# Memories");
	});

	it("cleans stale sessions on re-push", async () => {
		// First push with session s1
		const data1: ProjectData = {
			sessions: [
				{ sessionId: "s1", jsonl: "old\n", toolResults: new Map() },
			],
			memory: new Map(),
			projectDirName: "",
		};
		await writeCheckpoint(
			projectDir,
			{ projectId: "abc", gitRemote: "url" },
			data1,
		);

		// Second push with session s2 only (s1 is gone)
		const data2: ProjectData = {
			sessions: [
				{ sessionId: "s2", jsonl: "new\n", toolResults: new Map() },
			],
			memory: new Map(),
			projectDirName: "",
		};
		await writeCheckpoint(
			projectDir,
			{ projectId: "abc", gitRemote: "url" },
			data2,
		);

		const sessionsDir = join(projectDir, "sessions");
		const entries = await readdir(sessionsDir);
		expect(entries).toEqual(["s2.jsonl"]);
	});
});

describe("readCheckpoint", () => {
	let tempDir: string;
	let projectDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "baton-checkpoint-test-"));
		projectDir = join(tempDir, "project");
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("returns null when project directory does not exist", async () => {
		const result = await readCheckpoint(projectDir);
		expect(result).toBeNull();
	});

	it("returns null when sessions directory is empty", async () => {
		await mkdir(join(projectDir, "sessions"), { recursive: true });
		const result = await readCheckpoint(projectDir);
		expect(result).toBeNull();
	});

	it("reads session JSONL files", async () => {
		const sessionsDir = join(projectDir, "sessions");
		await mkdir(sessionsDir, { recursive: true });
		await writeFile(join(sessionsDir, "s1.jsonl"), "line1\n", "utf-8");
		await writeFile(join(sessionsDir, "s2.jsonl"), "line2\n", "utf-8");

		const result = await readCheckpoint(projectDir);
		expect(result).not.toBeNull();
		expect(result!.sessions).toHaveLength(2);
		const ids = result!.sessions.map((s) => s.sessionId).sort();
		expect(ids).toEqual(["s1", "s2"]);
	});

	it("reads tool results", async () => {
		const sessionsDir = join(projectDir, "sessions");
		await mkdir(sessionsDir, { recursive: true });
		await writeFile(join(sessionsDir, "s1.jsonl"), "line\n", "utf-8");
		const toolDir = join(sessionsDir, "s1", "tool-results");
		await mkdir(toolDir, { recursive: true });
		await writeFile(join(toolDir, "out.txt"), "data", "utf-8");

		const result = await readCheckpoint(projectDir);
		expect(result!.sessions[0].toolResults.get("out.txt")).toBe("data");
	});

	it("reads memory files", async () => {
		const sessionsDir = join(projectDir, "sessions");
		await mkdir(sessionsDir, { recursive: true });
		await writeFile(join(sessionsDir, "s1.jsonl"), "line\n", "utf-8");
		const memoryDir = join(projectDir, "memory");
		await mkdir(memoryDir, { recursive: true });
		await writeFile(join(memoryDir, "MEMORY.md"), "notes", "utf-8");

		const result = await readCheckpoint(projectDir);
		expect(result!.memory.get("MEMORY.md")).toBe("notes");
	});

	it("round-trips through write and read", async () => {
		const toolResults = new Map([["out.txt", "tool data"]]);
		const memory = new Map([["MEMORY.md", "# Mem"]]);
		const data: ProjectData = {
			sessions: [
				{ sessionId: "s1", jsonl: '{"type":"user"}\n', toolResults },
				{
					sessionId: "s2",
					jsonl: '{"type":"assistant"}\n',
					toolResults: new Map(),
				},
			],
			memory,
			projectDirName: "",
		};

		await writeCheckpoint(
			projectDir,
			{ projectId: "abc", gitRemote: "url" },
			data,
		);
		const result = await readCheckpoint(projectDir);

		expect(result).not.toBeNull();
		expect(result!.sessions).toHaveLength(2);
		expect(result!.memory.get("MEMORY.md")).toBe("# Mem");

		const s1 = result!.sessions.find((s) => s.sessionId === "s1");
		expect(s1!.jsonl).toBe('{"type":"user"}\n');
		expect(s1!.toolResults.get("out.txt")).toBe("tool data");
	});
});
