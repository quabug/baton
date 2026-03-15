import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
	git,
	repoExists,
	cloneRepo,
	fetchRepo,
	pullRepo,
	isRemoteAhead,
	commitAndPush,
	initRepo,
} from "../src/core/git.js";
import { GitNotFoundError } from "../src/errors.js";

const execFileAsync = promisify(execFile);

describe("git helper", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "baton-git-test-"));
		await execFileAsync("git", ["init", "-b", "main"], { cwd: tempDir });
		await execFileAsync(
			"git",
			["-c", "user.name=test", "-c", "user.email=test@test.com", "commit", "--allow-empty", "-m", "init"],
			{ cwd: tempDir },
		);
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("runs git commands and returns stdout", async () => {
		const result = await git(["rev-parse", "HEAD"], tempDir);
		expect(result).toMatch(/^[a-f0-9]{40}$/);
	});

	it("throws GitNotFoundError when git is not in PATH", async () => {
		const originalPath = process.env.PATH;
		process.env.PATH = "";
		try {
			await expect(git(["status"], tempDir)).rejects.toThrow(
				GitNotFoundError,
			);
		} finally {
			process.env.PATH = originalPath;
		}
	});
});

describe("repoExists", () => {
	it("returns true for existing directory", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "baton-git-test-"));
		try {
			expect(await repoExists(tempDir)).toBe(true);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("returns false for non-existing directory", async () => {
		expect(await repoExists("/nonexistent/path")).toBe(false);
	});
});

describe("initRepo", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "baton-git-test-"));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("initializes a git repo with main branch and initial commit", async () => {
		const repoDir = join(tempDir, "new-repo");
		await mkdir(repoDir);
		await initRepo(repoDir);

		const branch = await git(["branch", "--show-current"], repoDir);
		expect(branch).toBe("main");

		const log = await git(["log", "--oneline"], repoDir);
		expect(log).toContain("init baton repo");
	});
});

describe("clone, fetch, pull, isRemoteAhead, commitAndPush", () => {
	let originDir: string;
	let cloneDir: string;

	beforeEach(async () => {
		// Create a bare "remote" repo
		originDir = await mkdtemp(join(tmpdir(), "baton-origin-"));
		await execFileAsync("git", ["init", "--bare", "-b", "main"], {
			cwd: originDir,
		});

		// Create a working clone and push initial commit
		const setupDir = await mkdtemp(join(tmpdir(), "baton-setup-"));
		await execFileAsync("git", ["clone", originDir, setupDir + "/work"]);
		const workDir = setupDir + "/work";
		await execFileAsync(
			"git",
			["-c", "user.name=test", "-c", "user.email=test@test.com", "commit", "--allow-empty", "-m", "initial"],
			{ cwd: workDir },
		);
		await execFileAsync("git", ["push", "origin", "main"], {
			cwd: workDir,
		});
		await rm(setupDir, { recursive: true, force: true });

		// Clone for our tests
		cloneDir = await mkdtemp(join(tmpdir(), "baton-clone-"));
		await cloneRepo(originDir, join(cloneDir, "repo"));
	});

	afterEach(async () => {
		await rm(originDir, { recursive: true, force: true });
		await rm(cloneDir, { recursive: true, force: true });
	});

	it("cloneRepo clones a repo successfully", async () => {
		const repoDir = join(cloneDir, "repo");
		const branch = await git(["branch", "--show-current"], repoDir);
		expect(branch).toBe("main");
	});

	it("fetchRepo fetches without error", async () => {
		const repoDir = join(cloneDir, "repo");
		await expect(fetchRepo(repoDir)).resolves.toBeUndefined();
	});

	it("pullRepo pulls without error", async () => {
		const repoDir = join(cloneDir, "repo");
		await expect(pullRepo(repoDir)).resolves.toBeUndefined();
	});

	it("isRemoteAhead returns false when in sync", async () => {
		const repoDir = join(cloneDir, "repo");
		expect(await isRemoteAhead(repoDir)).toBe(false);
	});

	it("isRemoteAhead returns true when remote has new commits", async () => {
		// Push a new commit from another clone
		const otherClone = await mkdtemp(join(tmpdir(), "baton-other-"));
		try {
			await cloneRepo(originDir, join(otherClone, "work"));
			const otherWorkDir = join(otherClone, "work");
			await writeFile(
				join(otherWorkDir, "new-file.txt"),
				"content",
				"utf-8",
			);
			await git(["add", "-A"], otherWorkDir);
			await execFileAsync(
				"git",
				["-c", "user.name=test", "-c", "user.email=test@test.com", "commit", "-m", "new commit"],
				{ cwd: otherWorkDir },
			);
			await git(["push", "origin", "main"], otherWorkDir);
		} finally {
			await rm(otherClone, { recursive: true, force: true });
		}

		// Now our clone should see remote is ahead
		const repoDir = join(cloneDir, "repo");
		expect(await isRemoteAhead(repoDir)).toBe(true);
	});

	it("commitAndPush commits and pushes changes", async () => {
		const repoDir = join(cloneDir, "repo");

		// Set git identity for the test repo
		await execFileAsync("git", ["config", "user.name", "test"], { cwd: repoDir });
		await execFileAsync("git", ["config", "user.email", "test@test.com"], { cwd: repoDir });

		await writeFile(join(repoDir, "test.txt"), "hello", "utf-8");
		await commitAndPush(repoDir, "test commit", false);

		// Verify commit exists on origin
		const otherClone = await mkdtemp(join(tmpdir(), "baton-verify-"));
		try {
			await cloneRepo(originDir, join(otherClone, "work"));
			const log = await git(
				["log", "--oneline"],
				join(otherClone, "work"),
			);
			expect(log).toContain("test commit");
		} finally {
			await rm(otherClone, { recursive: true, force: true });
		}
	});

	it("commitAndPush skips when no changes", async () => {
		const repoDir = join(cloneDir, "repo");
		// Should not throw
		await expect(
			commitAndPush(repoDir, "empty commit", false),
		).resolves.toBeUndefined();
	});
});
