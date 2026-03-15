import { describe, it, expect } from "vitest";
import { virtualizePaths, expandPaths, getLocalPathContext } from "../src/core/paths.js";

const linuxCtx = {
	projectRoot: "/home/dr_who/baton",
	home: "/home/dr_who",
	tmp: "/tmp",
};

const macCtx = {
	projectRoot: "/Users/dr_who/work/baton",
	home: "/Users/dr_who",
	tmp: "/var/folders/xx/yy/T",
};

describe("virtualizePaths", () => {
	it("replaces project root path with placeholder", () => {
		const content = '{"cwd":"/home/dr_who/baton"}';
		const result = virtualizePaths(content, linuxCtx);
		expect(result).toBe('{"cwd":"${PROJECT_ROOT}"}');
	});

	it("replaces home path with placeholder", () => {
		const content = '{"path":"/home/dr_who/.config/something"}';
		const result = virtualizePaths(content, linuxCtx);
		expect(result).toBe('{"path":"${HOME}/.config/something"}');
	});

	it("replaces tmp path with placeholder", () => {
		const content = '{"path":"/tmp/some-file.txt"}';
		const result = virtualizePaths(content, linuxCtx);
		expect(result).toBe('{"path":"${TMP}/some-file.txt"}');
	});

	it("replaces longest path first to avoid partial matches", () => {
		// /home/dr_who/baton should match PROJECT_ROOT, not HOME
		const content = '"file_path":"/home/dr_who/baton/src/main.ts"';
		const result = virtualizePaths(content, linuxCtx);
		expect(result).toBe('"file_path":"${PROJECT_ROOT}/src/main.ts"');
		expect(result).not.toContain("${HOME}");
	});

	it("replaces multiple occurrences in same content", () => {
		const content =
			'{"cwd":"/home/dr_who/baton","file":"/home/dr_who/baton/README.md"}';
		const result = virtualizePaths(content, linuxCtx);
		expect(result).toBe(
			'{"cwd":"${PROJECT_ROOT}","file":"${PROJECT_ROOT}/README.md"}',
		);
	});

	it("replaces mixed path types in same content", () => {
		const content =
			'{"cwd":"/home/dr_who/baton","config":"/home/dr_who/.config","tmp":"/tmp/cache"}';
		const result = virtualizePaths(content, linuxCtx);
		expect(result).toBe(
			'{"cwd":"${PROJECT_ROOT}","config":"${HOME}/.config","tmp":"${TMP}/cache"}',
		);
	});

	it("handles macOS paths", () => {
		const content = '{"cwd":"/Users/dr_who/work/baton"}';
		const result = virtualizePaths(content, macCtx);
		expect(result).toBe('{"cwd":"${PROJECT_ROOT}"}');
	});

	it("leaves content without matching paths unchanged", () => {
		const content = '{"message":"hello world","count":42}';
		const result = virtualizePaths(content, linuxCtx);
		expect(result).toBe(content);
	});

	it("handles multiline content", () => {
		const content = [
			'{"cwd":"/home/dr_who/baton"}',
			'{"file":"/home/dr_who/.bashrc"}',
			'{"tmp":"/tmp/output.log"}',
		].join("\n");
		const result = virtualizePaths(content, linuxCtx);
		expect(result).toBe(
			[
				'{"cwd":"${PROJECT_ROOT}"}',
				'{"file":"${HOME}/.bashrc"}',
				'{"tmp":"${TMP}/output.log"}',
			].join("\n"),
		);
	});

	it("handles paths in free text (assistant messages)", () => {
		const content =
			'I found the bug in /home/dr_who/baton/src/main.ts at line 42';
		const result = virtualizePaths(content, linuxCtx);
		expect(result).toBe(
			"I found the bug in ${PROJECT_ROOT}/src/main.ts at line 42",
		);
	});

	it("does not replace path that is a prefix of another word", () => {
		const content = '{"path":"/home/dr_who_backup/config.json"}';
		const result = virtualizePaths(content, linuxCtx);
		// Should NOT replace /home/dr_who inside /home/dr_who_backup
		expect(result).toBe('{"path":"/home/dr_who_backup/config.json"}');
	});

	it("replaces path followed by quote boundary", () => {
		const content = '{"cwd":"/home/dr_who"}';
		const result = virtualizePaths(content, linuxCtx);
		expect(result).toBe('{"cwd":"${HOME}"}');
	});

	it("replaces path at end of string", () => {
		const content = "cwd: /home/dr_who/baton";
		const result = virtualizePaths(content, linuxCtx);
		expect(result).toBe("cwd: ${PROJECT_ROOT}");
	});

	it("skips empty path values", () => {
		const ctx = { projectRoot: "/test", home: "", tmp: "/tmp" };
		const content = '{"path":"/test/file"}';
		const result = virtualizePaths(content, ctx);
		expect(result).toBe('{"path":"${PROJECT_ROOT}/file"}');
	});
});

describe("expandPaths", () => {
	it("expands PROJECT_ROOT placeholder", () => {
		const content = '{"cwd":"${PROJECT_ROOT}"}';
		const result = expandPaths(content, linuxCtx);
		expect(result).toBe('{"cwd":"/home/dr_who/baton"}');
	});

	it("expands HOME placeholder", () => {
		const content = '{"path":"${HOME}/.config"}';
		const result = expandPaths(content, linuxCtx);
		expect(result).toBe('{"path":"/home/dr_who/.config"}');
	});

	it("expands TMP placeholder", () => {
		const content = '{"path":"${TMP}/cache"}';
		const result = expandPaths(content, linuxCtx);
		expect(result).toBe('{"path":"/tmp/cache"}');
	});

	it("expands all placeholders in mixed content", () => {
		const content =
			'{"cwd":"${PROJECT_ROOT}","config":"${HOME}/.config","tmp":"${TMP}/cache"}';
		const result = expandPaths(content, linuxCtx);
		expect(result).toBe(
			'{"cwd":"/home/dr_who/baton","config":"/home/dr_who/.config","tmp":"/tmp/cache"}',
		);
	});

	it("leaves content without placeholders unchanged", () => {
		const content = '{"message":"hello world"}';
		const result = expandPaths(content, linuxCtx);
		expect(result).toBe(content);
	});

	it("round-trips correctly: virtualize then expand on same machine", () => {
		const original =
			'{"cwd":"/home/dr_who/baton","file":"/home/dr_who/.bashrc"}';
		const virtualized = virtualizePaths(original, linuxCtx);
		const expanded = expandPaths(virtualized, linuxCtx);
		expect(expanded).toBe(original);
	});

	it("cross-machine: virtualize on Linux, expand on macOS", () => {
		const original = '{"cwd":"/home/dr_who/baton","file":"/home/dr_who/baton/src/main.ts"}';
		const virtualized = virtualizePaths(original, linuxCtx);
		expect(virtualized).toBe(
			'{"cwd":"${PROJECT_ROOT}","file":"${PROJECT_ROOT}/src/main.ts"}',
		);

		const expanded = expandPaths(virtualized, macCtx);
		expect(expanded).toBe(
			'{"cwd":"/Users/dr_who/work/baton","file":"/Users/dr_who/work/baton/src/main.ts"}',
		);
	});
});

describe("getLocalPathContext", () => {
	it("returns context with project root and system paths", () => {
		const ctx = getLocalPathContext("/test/project");
		expect(ctx.projectRoot).toBe("/test/project");
		expect(ctx.home).toBeTruthy();
		expect(ctx.tmp).toBeTruthy();
	});
});
