import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getGitRemote, detectProject } from "../src/core/project.js";
import { ProjectNotFoundError } from "../src/errors.js";

const execFileAsync = promisify(execFile);

describe("getGitRemote", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "baton-test-"));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("returns the origin remote URL from a git repo", async () => {
		await execFileAsync("git", ["init"], { cwd: tempDir });
		await execFileAsync("git", ["remote", "add", "origin", "git@github.com:test/repo.git"], { cwd: tempDir });

		const remote = await getGitRemote(tempDir);
		expect(remote).toBe("git@github.com:test/repo.git");
	});

	it("throws ProjectNotFoundError for non-git directory", async () => {
		await expect(getGitRemote(tempDir)).rejects.toThrow(ProjectNotFoundError);
	});

	it("throws ProjectNotFoundError for git repo without origin remote", async () => {
		await execFileAsync("git", ["init"], { cwd: tempDir });
		await expect(getGitRemote(tempDir)).rejects.toThrow(ProjectNotFoundError);
	});
});

describe("detectProject", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "baton-test-"));
		await execFileAsync("git", ["init"], { cwd: tempDir });
		await execFileAsync("git", ["remote", "add", "origin", "git@github.com:test/myproject.git"], { cwd: tempDir });
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("returns projectId, gitRemote, and normalizedRemote", async () => {
		const result = await detectProject(tempDir);
		expect(result.gitRemote).toBe("git@github.com:test/myproject.git");
		expect(result.normalizedRemote).toBe("github.com/test/myproject");
		expect(result.projectId).toMatch(/^[a-f0-9]{16}$/);
	});

	it("produces same projectId for SSH and HTTPS remotes of same repo", async () => {
		const result1 = await detectProject(tempDir);

		// Create another temp repo with HTTPS remote
		const tempDir2 = await mkdtemp(join(tmpdir(), "baton-test-"));
		await execFileAsync("git", ["init"], { cwd: tempDir2 });
		await execFileAsync("git", ["remote", "add", "origin", "https://github.com/test/myproject.git"], { cwd: tempDir2 });

		const result2 = await detectProject(tempDir2);
		expect(result1.projectId).toBe(result2.projectId);

		await rm(tempDir2, { recursive: true, force: true });
	});

	it("throws ProjectNotFoundError for non-git directory", async () => {
		const nonGitDir = await mkdtemp(join(tmpdir(), "baton-test-"));
		await expect(detectProject(nonGitDir)).rejects.toThrow(ProjectNotFoundError);
		await rm(nonGitDir, { recursive: true, force: true });
	});
});
