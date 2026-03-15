import { describe, it, expect } from "vitest";
import {
	BatonError,
	ProjectNotFoundError,
	NoSessionsError,
	ConflictError,
	GitNotFoundError,
	GhNotFoundError,
	ConfigError,
} from "../src/errors.js";

describe("error classes", () => {
	it("BatonError has correct name and message", () => {
		const error = new BatonError("test message");
		expect(error.name).toBe("BatonError");
		expect(error.message).toBe("test message");
		expect(error).toBeInstanceOf(Error);
	});

	it("ProjectNotFoundError extends BatonError", () => {
		const error = new ProjectNotFoundError("no project");
		expect(error.name).toBe("ProjectNotFoundError");
		expect(error).toBeInstanceOf(BatonError);
		expect(error).toBeInstanceOf(Error);
	});

	it("NoSessionsError extends BatonError", () => {
		const error = new NoSessionsError("no sessions");
		expect(error.name).toBe("NoSessionsError");
		expect(error).toBeInstanceOf(BatonError);
	});

	it("ConflictError extends BatonError", () => {
		const error = new ConflictError("conflict");
		expect(error.name).toBe("ConflictError");
		expect(error).toBeInstanceOf(BatonError);
	});

	it("GitNotFoundError extends BatonError", () => {
		const error = new GitNotFoundError("no git");
		expect(error.name).toBe("GitNotFoundError");
		expect(error).toBeInstanceOf(BatonError);
	});

	it("GhNotFoundError extends BatonError", () => {
		const error = new GhNotFoundError("no gh");
		expect(error.name).toBe("GhNotFoundError");
		expect(error).toBeInstanceOf(BatonError);
	});

	it("ConfigError extends BatonError", () => {
		const error = new ConfigError("bad config");
		expect(error.name).toBe("ConfigError");
		expect(error).toBeInstanceOf(BatonError);
	});
});
