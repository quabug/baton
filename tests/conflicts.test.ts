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

	it("detects session conflict when content differs", async () => {
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
		expect(result.sessions).toEqual(["sess-001"]);
	});

	it("detects memory conflict when content differs", async () => {
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
		expect(result.memoryFiles).toEqual(["MEMORY.md"]);
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
		// sess-001: same content (no conflict)
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
		// sess-002: different content (conflict)
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
		expect(result.sessions).toEqual(["sess-002"]);
	});

	it("treats missing local file as no conflict", async () => {
		// Only remote exists
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
		// File can't be read locally, so contentDiffers returns false
		expect(result.sessions).toEqual([]);
	});
});

describe("hasConflicts", () => {
	it("returns false when no conflicts", () => {
		expect(hasConflicts({ sessions: [], memoryFiles: [] })).toBe(false);
	});

	it("returns true when session conflicts exist", () => {
		expect(
			hasConflicts({ sessions: ["sess-001"], memoryFiles: [] }),
		).toBe(true);
	});

	it("returns true when memory conflicts exist", () => {
		expect(
			hasConflicts({ sessions: [], memoryFiles: ["MEMORY.md"] }),
		).toBe(true);
	});
});

describe("formatConflictMessage", () => {
	const testCtx: ConflictContext = {
		localProjectDir: "/home/user/.claude/projects/-home-user-myproject",
		remoteSessionsDir: "/home/user/.baton/repo/projects/abc123/sessions",
		remoteMemoryDir: "/home/user/.baton/repo/projects/abc123/memory",
	};

	it("includes session conflicts with local and remote paths", () => {
		const msg = formatConflictMessage(
			{ sessions: ["sess-001"], memoryFiles: [] },
			testCtx,
		);
		expect(msg).toContain("Conflicting sessions (1)");
		expect(msg).toContain("sess-001");
		expect(msg).toContain("local:");
		expect(msg).toContain("remote:");
		expect(msg).toContain("sess-001.jsonl");
		expect(msg).toContain("--force");
		expect(msg).toContain("--skip");
	});

	it("includes session agent-hint with resolution options", () => {
		const msg = formatConflictMessage(
			{ sessions: ["sess-001"], memoryFiles: [] },
			testCtx,
		);
		expect(msg).toContain("<agent-hint>");
		expect(msg).toContain("cannot be meaningfully merged");
		expect(msg).toContain("</agent-hint>");
	});

	it("includes memory conflicts with local and remote paths", () => {
		const msg = formatConflictMessage(
			{ sessions: [], memoryFiles: ["MEMORY.md"] },
			testCtx,
		);
		expect(msg).toContain("Conflicting memory files (1)");
		expect(msg).toContain("MEMORY.md");
		expect(msg).toContain("local:");
		expect(msg).toContain(
			"/home/user/.claude/projects/-home-user-myproject/memory/MEMORY.md",
		);
		expect(msg).toContain(
			"/home/user/.baton/repo/projects/abc123/memory/MEMORY.md",
		);
	});

	it("includes memory agent-hint with merge instructions", () => {
		const msg = formatConflictMessage(
			{ sessions: [], memoryFiles: ["MEMORY.md"] },
			testCtx,
		);
		expect(msg).toContain("<agent-hint>");
		expect(msg).toContain("read both the local and remote");
		expect(msg).toContain("deduplicate entries");
		expect(msg).toContain("write the merged result to the");
		expect(msg).toContain("baton pull --force");
		expect(msg).toContain("</agent-hint>");
	});

	it("includes both session and memory conflicts", () => {
		const msg = formatConflictMessage(
			{ sessions: ["s1", "s2"], memoryFiles: ["MEMORY.md"] },
			testCtx,
		);
		expect(msg).toContain("Conflicting sessions (2)");
		expect(msg).toContain("Conflicting memory files (1)");
		// Should have both agent-hints
		const hints = msg.match(/<agent-hint>/g);
		expect(hints).toHaveLength(2);
	});

	it("does not include agent-hint when no conflicts of that type", () => {
		const sessOnly = formatConflictMessage(
			{ sessions: ["s1"], memoryFiles: [] },
			testCtx,
		);
		expect(sessOnly).not.toContain("read both the local and remote");

		const memOnly = formatConflictMessage(
			{ sessions: [], memoryFiles: ["MEMORY.md"] },
			testCtx,
		);
		expect(memOnly).not.toContain("cannot be meaningfully merged");
	});
});
