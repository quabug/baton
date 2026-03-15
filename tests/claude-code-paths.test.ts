import { describe, it, expect } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	encodeProjectDir,
	getClaudeProjectsDir,
	getClaudeProjectPath,
	getProjectConfigPath,
} from "../src/adapters/claude-code/paths.js";

describe("encodeProjectDir", () => {
	it("encodes Linux path", () => {
		expect(encodeProjectDir("/home/dr_who/baton")).toBe(
			"-home-dr_who-baton",
		);
	});

	it("encodes macOS path", () => {
		expect(encodeProjectDir("/Users/dr_who/work/baton")).toBe(
			"-Users-dr_who-work-baton",
		);
	});

	it("encodes Windows path with backslashes", () => {
		expect(encodeProjectDir("C:\\Users\\dr_who\\baton")).toBe(
			"C--Users-dr_who-baton",
		);
	});

	it("replaces dots with dashes", () => {
		expect(encodeProjectDir("/home/dr_who/.cc-connect/discord")).toBe(
			"-home-dr_who--cc-connect-discord",
		);
	});

	it("handles paths with .claude directory", () => {
		expect(
			encodeProjectDir(
				"/home/dr_who/levy/.claude/worktrees/issue-57",
			),
		).toBe("-home-dr_who-levy--claude-worktrees-issue-57");
	});

	it("handles root-level paths", () => {
		expect(encodeProjectDir("/root/projects/foo")).toBe(
			"-root-projects-foo",
		);
	});

	it("handles single directory", () => {
		expect(encodeProjectDir("/foo")).toBe("-foo");
	});
});

describe("getClaudeProjectsDir", () => {
	it("returns ~/.claude/projects", () => {
		expect(getClaudeProjectsDir()).toBe(
			join(homedir(), ".claude", "projects"),
		);
	});
});

describe("getClaudeProjectPath", () => {
	it("returns full path to encoded project directory", () => {
		expect(getClaudeProjectPath("/home/dr_who/baton")).toBe(
			join(homedir(), ".claude", "projects", "-home-dr_who-baton"),
		);
	});
});

describe("getProjectConfigPath", () => {
	it("returns ~/.claude/project-config.json", () => {
		expect(getProjectConfigPath()).toBe(
			join(homedir(), ".claude", "project-config.json"),
		);
	});
});
