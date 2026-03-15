import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock homedir so Claude Code paths resolve to temp dir
let mockHome = "";

vi.mock("node:os", async (importOriginal) => {
	const original = await importOriginal<typeof import("node:os")>();
	return {
		...original,
		homedir: () => mockHome,
	};
});

const { listLocalSessionIds, listLocalMemoryFiles } = await import(
	"../src/adapters/claude-code/reader.js"
);

describe("listLocalSessionIds", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "baton-pull-conflict-"));
		mockHome = tempDir;
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("returns session IDs from JSONL files", async () => {
		const projectDir = join(
			tempDir,
			".claude",
			"projects",
			"-test-project",
		);
		await mkdir(projectDir, { recursive: true });
		await writeFile(join(projectDir, "sess-001.jsonl"), "local\n", "utf-8");
		await writeFile(join(projectDir, "sess-002.jsonl"), "local\n", "utf-8");

		const ids = await listLocalSessionIds("/test/project");
		expect(ids.sort()).toEqual(["sess-001", "sess-002"]);
	});

	it("returns empty array when no sessions exist", async () => {
		const ids = await listLocalSessionIds("/test/project");
		expect(ids).toEqual([]);
	});
});

describe("listLocalMemoryFiles", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "baton-pull-conflict-"));
		mockHome = tempDir;
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("returns memory file names", async () => {
		const memoryDir = join(
			tempDir,
			".claude",
			"projects",
			"-test-project",
			"memory",
		);
		await mkdir(memoryDir, { recursive: true });
		await writeFile(join(memoryDir, "MEMORY.md"), "notes", "utf-8");
		await writeFile(join(memoryDir, "debug.md"), "debug", "utf-8");

		const files = await listLocalMemoryFiles("/test/project");
		expect(files.sort()).toEqual(["MEMORY.md", "debug.md"]);
	});

	it("returns empty array when no memory directory exists", async () => {
		const files = await listLocalMemoryFiles("/test/project");
		expect(files).toEqual([]);
	});
});
