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

const { listLocalSessionIds } = await import(
	"../src/adapters/claude-code/reader.js"
);

describe("pull conflict detection", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "baton-pull-conflict-"));
		mockHome = tempDir;
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("detects conflicting session IDs between local and remote", async () => {
		// Create local sessions
		const projectDir = join(
			tempDir,
			".claude",
			"projects",
			"-test-project",
		);
		await mkdir(projectDir, { recursive: true });
		await writeFile(join(projectDir, "sess-001.jsonl"), "local\n", "utf-8");
		await writeFile(join(projectDir, "sess-002.jsonl"), "local\n", "utf-8");

		const localIds = await listLocalSessionIds("/test/project");

		// Simulate remote sessions
		const remoteIds = new Set(["sess-001", "sess-003"]);
		const conflicts = localIds.filter((id) => remoteIds.has(id));

		// sess-001 exists locally and remotely = conflict
		expect(conflicts).toEqual(["sess-001"]);
	});

	it("returns no conflicts when sessions don't overlap", async () => {
		const projectDir = join(
			tempDir,
			".claude",
			"projects",
			"-test-project",
		);
		await mkdir(projectDir, { recursive: true });
		await writeFile(join(projectDir, "sess-001.jsonl"), "local\n", "utf-8");

		const localIds = await listLocalSessionIds("/test/project");
		const remoteIds = new Set(["sess-002", "sess-003"]);
		const conflicts = localIds.filter((id) => remoteIds.has(id));

		expect(conflicts).toEqual([]);
	});

	it("returns no conflicts when no local sessions exist", async () => {
		const localIds = await listLocalSessionIds("/test/project");
		const remoteIds = new Set(["sess-001"]);
		const conflicts = localIds.filter((id) => remoteIds.has(id));

		expect(conflicts).toEqual([]);
	});
});
