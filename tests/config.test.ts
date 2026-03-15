import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock homedir to point to temp directory
let mockHome = "";

vi.mock("node:os", async (importOriginal) => {
	const original = await importOriginal<typeof import("node:os")>();
	return {
		...original,
		homedir: () => mockHome,
	};
});

// Re-import after mock is set up
const { loadConfig, saveConfig, getConfigPath, getRepoDir, getBatonDir } =
	await import("../src/core/config.js");

describe("config", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "baton-config-test-"));
		mockHome = tempDir;
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("loadConfig", () => {
		it("returns null when config file does not exist", async () => {
			const config = await loadConfig();
			expect(config).toBeNull();
		});

		it("returns null when config has no repo field", async () => {
			await mkdir(join(tempDir, ".baton"), { recursive: true });
			await writeFile(
				join(tempDir, ".baton", "config.json"),
				JSON.stringify({ other: "field" }),
				"utf-8",
			);
			const config = await loadConfig();
			expect(config).toBeNull();
		});

		it("returns config when valid", async () => {
			await mkdir(join(tempDir, ".baton"), { recursive: true });
			await writeFile(
				join(tempDir, ".baton", "config.json"),
				JSON.stringify({ repo: "git@github.com:user/repo.git" }),
				"utf-8",
			);
			const config = await loadConfig();
			expect(config).toEqual({
				repo: "git@github.com:user/repo.git",
			});
		});

		it("returns null for invalid JSON", async () => {
			await mkdir(join(tempDir, ".baton"), { recursive: true });
			await writeFile(
				join(tempDir, ".baton", "config.json"),
				"not json",
				"utf-8",
			);
			const config = await loadConfig();
			expect(config).toBeNull();
		});
	});

	describe("saveConfig", () => {
		it("creates config file with repo field", async () => {
			await saveConfig({ repo: "git@github.com:user/repo.git" });
			const raw = await readFile(
				join(tempDir, ".baton", "config.json"),
				"utf-8",
			);
			const config = JSON.parse(raw);
			expect(config.repo).toBe("git@github.com:user/repo.git");
		});

		it("creates .baton directory if it does not exist", async () => {
			await saveConfig({ repo: "https://github.com/user/repo.git" });
			const raw = await readFile(
				join(tempDir, ".baton", "config.json"),
				"utf-8",
			);
			expect(JSON.parse(raw).repo).toBe(
				"https://github.com/user/repo.git",
			);
		});
	});

	describe("path helpers", () => {
		it("getBatonDir returns ~/.baton", () => {
			expect(getBatonDir()).toBe(join(tempDir, ".baton"));
		});

		it("getConfigPath returns ~/.baton/config.json", () => {
			expect(getConfigPath()).toBe(
				join(tempDir, ".baton", "config.json"),
			);
		});

		it("getRepoDir returns ~/.baton/repo", () => {
			expect(getRepoDir()).toBe(join(tempDir, ".baton", "repo"));
		});
	});
});
