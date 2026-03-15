import { describe, it, expect } from "vitest";
import { normalizeGitRemote, hashProjectId } from "../src/core/project.js";

describe("normalizeGitRemote", () => {
	it("normalizes SSH shorthand with .git suffix", () => {
		expect(normalizeGitRemote("git@github.com:user/repo.git")).toBe("github.com/user/repo");
	});

	it("normalizes SSH shorthand without .git suffix", () => {
		expect(normalizeGitRemote("git@github.com:user/repo")).toBe("github.com/user/repo");
	});

	it("normalizes HTTPS with .git suffix", () => {
		expect(normalizeGitRemote("https://github.com/user/repo.git")).toBe("github.com/user/repo");
	});

	it("normalizes HTTPS without .git suffix", () => {
		expect(normalizeGitRemote("https://github.com/user/repo")).toBe("github.com/user/repo");
	});

	it("normalizes HTTP with .git suffix", () => {
		expect(normalizeGitRemote("http://github.com/user/repo.git")).toBe("github.com/user/repo");
	});

	it("normalizes ssh:// protocol with .git suffix", () => {
		expect(normalizeGitRemote("ssh://git@github.com/user/repo.git")).toBe("github.com/user/repo");
	});

	it("normalizes ssh:// protocol without .git suffix", () => {
		expect(normalizeGitRemote("ssh://git@github.com/user/repo")).toBe("github.com/user/repo");
	});

	it("normalizes git:// protocol with .git suffix", () => {
		expect(normalizeGitRemote("git://github.com/user/repo.git")).toBe("github.com/user/repo");
	});

	it("normalizes git:// protocol without .git suffix", () => {
		expect(normalizeGitRemote("git://github.com/user/repo")).toBe("github.com/user/repo");
	});

	it("produces same result for SSH, HTTPS, ssh://, and git:// variants of same repo", () => {
		const ssh = normalizeGitRemote("git@github.com:me/foo.git");
		const https = normalizeGitRemote("https://github.com/me/foo.git");
		const sshProto = normalizeGitRemote("ssh://git@github.com/me/foo.git");
		const gitProto = normalizeGitRemote("git://github.com/me/foo.git");
		expect(ssh).toBe(https);
		expect(ssh).toBe(sshProto);
		expect(ssh).toBe(gitProto);
	});

	it("handles whitespace around URL", () => {
		expect(normalizeGitRemote("  git@github.com:user/repo.git  ")).toBe("github.com/user/repo");
	});

	it("handles non-github hosts", () => {
		expect(normalizeGitRemote("git@gitlab.com:org/project.git")).toBe("gitlab.com/org/project");
	});

	it("handles nested paths", () => {
		expect(normalizeGitRemote("https://github.com/org/sub/repo.git")).toBe("github.com/org/sub/repo");
	});

	it("returns unknown formats as-is (trimmed)", () => {
		expect(normalizeGitRemote("  some-weird-remote  ")).toBe("some-weird-remote");
	});
});

describe("hashProjectId", () => {
	it("produces a 16-character hex string", () => {
		const hash = hashProjectId("github.com/user/repo");
		expect(hash).toMatch(/^[a-f0-9]{16}$/);
	});

	it("produces stable output for same input", () => {
		const hash1 = hashProjectId("github.com/user/repo");
		const hash2 = hashProjectId("github.com/user/repo");
		expect(hash1).toBe(hash2);
	});

	it("produces different output for different inputs", () => {
		const hash1 = hashProjectId("github.com/user/repo1");
		const hash2 = hashProjectId("github.com/user/repo2");
		expect(hash1).not.toBe(hash2);
	});

	it("same repo via SSH and HTTPS produces same project ID", () => {
		const normalized1 = normalizeGitRemote("git@github.com:me/foo.git");
		const normalized2 = normalizeGitRemote("https://github.com/me/foo.git");
		expect(hashProjectId(normalized1)).toBe(hashProjectId(normalized2));
	});
});
