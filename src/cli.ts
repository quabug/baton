import { Command } from "commander";
import { pull } from "./commands/pull.js";
import { push } from "./commands/push.js";
import { status } from "./commands/status.js";
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
	.action(async (options) => {
		await push({ force: options.force });
	});

program
	.command("pull")
	.description("Restore sessions for the current project from GitHub")
	.option("-f, --force", "Overwrite local sessions without confirmation")
	.action(async (options) => {
		await pull({ force: options.force });
	});

program
	.command("status")
	.description("Show current project and sync state")
	.action(async () => {
		await status();
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
