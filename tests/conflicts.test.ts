import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	detectConflicts,
	formatConflictMessage,
	hasConflicts,
} from "../src/core/conflicts.js";
import type { ConflictContext } from "../src/core/conflicts.js";

describe("detectConflicts", () => {
	let tempDir: string;
	let localDir: string;
	let remoteSessionsDir: string;
	let remoteMemoryDir: string;
	let ctx: ConflictContext;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "baton-conflict-test-"));
		localDir = join(tempDir, "local");
		remoteSessionsDir = join(tempDir, "remote", "sessions");
		remoteMemoryDir = join(tempDir, "remote", "memory");
		await mkdir(localDir, { recursive: true });
		await mkdir(remoteSessionsDir, { recursive: true });
		await mkdir(remoteMemoryDir, { recursive: true });
		await mkdir(join(localDir, "memory"), { recursive: true });
		ctx = {
			localProjectDir: localDir,
			remoteSessionsDir,
			remoteMemoryDir,
		};
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("returns no conflicts when no overlapping files", async () => {
		const result = await detectConflicts(
			["sess-001"],
			["sess-002"],
			["MEMORY.md"],
			["other.md"],
			ctx,
		);
		expect(result.sessions).toEqual([]);
		expect(result.memoryFiles).toEqual([]);
	});

	it("returns no conflicts when overlapping files have same content", async () => {
		await writeFile(
			join(localDir, "sess-001.jsonl"),
			"same content\n",
			"utf-8",
		);
		await writeFile(
			join(remoteSessionsDir, "sess-001.jsonl"),
			"same content\n",
			"utf-8",
		);

		const result = await detectConflicts(
			["sess-001"],
			["sess-001"],
			[],
			[],
			ctx,
		);
		expect(result.sessions).toEqual([]);
	});

	it("detects session conflict with paths and timestamps", async () => {
		await writeFile(
			join(localDir, "sess-001.jsonl"),
			"local content\n",
			"utf-8",
		);
		await writeFile(
			join(remoteSessionsDir, "sess-001.jsonl"),
			"remote content\n",
			"utf-8",
		);

		const result = await detectConflicts(
			["sess-001"],
			["sess-001"],
			[],
			[],
			ctx,
		);
		expect(result.sessions).toHaveLength(1);
		expect(result.sessions[0].name).toBe("sess-001");
		expect(result.sessions[0].localPath).toContain("sess-001.jsonl");
		expect(result.sessions[0].remotePath).toContain("sess-001.jsonl");
		expect(result.sessions[0].localModified).toBeTruthy();
		expect(result.sessions[0].remoteModified).toBe("unknown");
	});

	it("uses remotePushedAt for remote timestamps when provided", async () => {
		await writeFile(
			join(localDir, "sess-001.jsonl"),
			"local content\n",
			"utf-8",
		);
		await writeFile(
			join(remoteSessionsDir, "sess-001.jsonl"),
			"remote content\n",
			"utf-8",
		);

		const ctxWithPushedAt = {
			...ctx,
			remotePushedAt: new Date(
				Date.now() - 3_600_000 * 3,
			).toISOString(),
		};
		const result = await detectConflicts(
			["sess-001"],
			["sess-001"],
			[],
			[],
			ctxWithPushedAt,
		);
		expect(result.sessions[0].remoteModified).toBe("3 hour(s) ago");
	});

	it("detects memory conflict with paths and timestamps", async () => {
		await writeFile(
			join(localDir, "memory", "MEMORY.md"),
			"local notes\n",
			"utf-8",
		);
		await writeFile(
			join(remoteMemoryDir, "MEMORY.md"),
			"remote notes\n",
			"utf-8",
		);

		const result = await detectConflicts(
			[],
			[],
			["MEMORY.md"],
			["MEMORY.md"],
			ctx,
		);
		expect(result.memoryFiles).toHaveLength(1);
		expect(result.memoryFiles[0].name).toBe("MEMORY.md");
		expect(result.memoryFiles[0].localPath).toContain("memory/MEMORY.md");
		expect(result.memoryFiles[0].remotePath).toContain("MEMORY.md");
	});

	it("returns no memory conflict when content is same", async () => {
		await writeFile(
			join(localDir, "memory", "MEMORY.md"),
			"same notes\n",
			"utf-8",
		);
		await writeFile(
			join(remoteMemoryDir, "MEMORY.md"),
			"same notes\n",
			"utf-8",
		);

		const result = await detectConflicts(
			[],
			[],
			["MEMORY.md"],
			["MEMORY.md"],
			ctx,
		);
		expect(result.memoryFiles).toEqual([]);
	});

	it("handles mix of conflicting and non-conflicting files", async () => {
		await writeFile(
			join(localDir, "sess-001.jsonl"),
			"same\n",
			"utf-8",
		);
		await writeFile(
			join(remoteSessionsDir, "sess-001.jsonl"),
			"same\n",
			"utf-8",
		);
		await writeFile(
			join(localDir, "sess-002.jsonl"),
			"local\n",
			"utf-8",
		);
		await writeFile(
			join(remoteSessionsDir, "sess-002.jsonl"),
			"remote\n",
			"utf-8",
		);

		const result = await detectConflicts(
			["sess-001", "sess-002"],
			["sess-001", "sess-002", "sess-003"],
			[],
			[],
			ctx,
		);
		expect(result.sessions).toHaveLength(1);
		expect(result.sessions[0].name).toBe("sess-002");
	});

	it("treats missing local file as no conflict", async () => {
		await writeFile(
			join(remoteSessionsDir, "sess-001.jsonl"),
			"remote\n",
			"utf-8",
		);

		const result = await detectConflicts(
			["sess-001"],
			["sess-001"],
			[],
			[],
			ctx,
		);
		expect(result.sessions).toEqual([]);
	});
});

describe("hasConflicts", () => {
	it("returns false when no conflicts", () => {
		expect(hasConflicts({ sessions: [], memoryFiles: [] })).toBe(false);
	});

	it("returns true when session conflicts exist", () => {
		const conflict = {
			name: "s1",
			localPath: "",
			remotePath: "",
			localModified: "",
			remoteModified: "",
		};
		expect(hasConflicts({ sessions: [conflict], memoryFiles: [] })).toBe(
			true,
		);
	});

	it("returns true when memory conflicts exist", () => {
		const conflict = {
			name: "MEMORY.md",
			localPath: "",
			remotePath: "",
			localModified: "",
			remoteModified: "",
		};
		expect(hasConflicts({ sessions: [], memoryFiles: [conflict] })).toBe(
			true,
		);
	});
});

describe("formatConflictMessage", () => {
	it("includes session conflicts with timestamps", () => {
		const msg = formatConflictMessage({
			sessions: [
				{
					name: "sess-001",
					localPath: "/local/sess-001.jsonl",
					remotePath: "/remote/sess-001.jsonl",
					localModified: "2 hour(s) ago",
					remoteModified: "5 hour(s) ago",
				},
			],
			memoryFiles: [],
		});
		expect(msg).toContain("Conflicting sessions (1)");
		expect(msg).toContain("sess-001");
		expect(msg).toContain("local:");
		expect(msg).toContain("2 hour(s) ago");
		expect(msg).toContain("remote:");
		expect(msg).toContain("5 hour(s) ago");
	});

	it("includes resolution options for user", () => {
		const msg = formatConflictMessage({
			sessions: [
				{
					name: "s1",
					localPath: "",
					remotePath: "",
					localModified: "",
					remoteModified: "",
				},
			],
			memoryFiles: [],
		});
		expect(msg).toContain("1. Overwrite local with remote");
		expect(msg).toContain("2. Keep local, skip remote");
		expect(msg).toContain("--force");
		expect(msg).toContain("--skip");
	});

	it("includes merge option when memory files conflict", () => {
		const msg = formatConflictMessage({
			sessions: [],
			memoryFiles: [
				{
					name: "MEMORY.md",
					localPath: "/local/memory/MEMORY.md",
					remotePath: "/remote/memory/MEMORY.md",
					localModified: "1 hour(s) ago",
					remoteModified: "3 hour(s) ago",
				},
			],
		});
		expect(msg).toContain("3. Merge memory files");
	});

	it("includes agent-hint with step-by-step instructions", () => {
		const msg = formatConflictMessage({
			sessions: [
				{
					name: "s1",
					localPath: "",
					remotePath: "",
					localModified: "",
					remoteModified: "",
				},
			],
			memoryFiles: [
				{
					name: "MEMORY.md",
					localPath: "/local/MEMORY.md",
					remotePath: "/remote/MEMORY.md",
					localModified: "",
					remoteModified: "",
				},
			],
		});
		expect(msg).toContain("<agent-hint>");
		expect(msg).toContain("Ask the user which option they prefer");
		expect(msg).toContain("baton pull --force");
		expect(msg).toContain("baton pull --skip");
		expect(msg).toContain("baton push");
		expect(msg).toContain("merge their content");
		expect(msg).toContain("</agent-hint>");
	});

	it("agent-hint for sessions only mentions force/skip", () => {
		const msg = formatConflictMessage({
			sessions: [
				{
					name: "s1",
					localPath: "",
					remotePath: "",
					localModified: "",
					remoteModified: "",
				},
			],
			memoryFiles: [],
		});
		expect(msg).toContain("cannot be merged");
		expect(msg).not.toContain("merge their content");
	});

	it("agent-hint for memory only mentions merge option", () => {
		const msg = formatConflictMessage({
			sessions: [],
			memoryFiles: [
				{
					name: "MEMORY.md",
					localPath: "",
					remotePath: "",
					localModified: "",
					remoteModified: "",
				},
			],
		});
		expect(msg).toContain("merge their content");
		expect(msg).not.toContain("cannot be merged");
	});
});
