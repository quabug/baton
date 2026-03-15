import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: [
				"src/cli.ts",
				"src/commands/push.ts",
				"src/commands/pull.ts",
				"src/commands/status.ts",
				"src/commands/setup.ts",
			],
		},
	},
});
