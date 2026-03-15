import { Command } from "commander";
import { BatonError } from "./errors.js";

const program = new Command();

program
	.name("baton")
	.description("Git-backed session handoff for Claude Code")
	.version("0.1.0");

program
	.command("push")
	.description("Push all sessions for the current project to GitHub")
	.option("-f, --force", "Overwrite remote even if ahead")
	.action(async (_options) => {
		console.log("baton push: not yet implemented");
	});

program
	.command("pull")
	.description("Restore sessions for the current project from GitHub")
	.action(async () => {
		console.log("baton pull: not yet implemented");
	});

program
	.command("status")
	.description("Show current project and sync state")
	.action(async () => {
		console.log("baton status: not yet implemented");
	});

try {
	await program.parseAsync(process.argv);
} catch (error) {
	if (error instanceof BatonError) {
		console.error(`Error: ${error.message}`);
	} else {
		console.error(
			`Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	process.exit(1);
}
