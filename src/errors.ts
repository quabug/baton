export class BatonError extends Error {
	constructor(message: string) {
		super(message);
		this.name = this.constructor.name;
		Error.captureStackTrace?.(this, this.constructor);
	}
}

export class ProjectNotFoundError extends BatonError {}

export class NoSessionsError extends BatonError {}

export class ConflictError extends BatonError {}

export class GitNotFoundError extends BatonError {}

export class GhNotFoundError extends BatonError {}

export class ConfigError extends BatonError {}
