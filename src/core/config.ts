import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface BatonConfig {
	repo: string;
}

/**
 * Get the path to the baton config directory.
 */
export function getBatonDir(): string {
	return join(homedir(), ".baton");
}

/**
 * Get the path to the baton config file.
 */
export function getConfigPath(): string {
	return join(getBatonDir(), "config.json");
}

/**
 * Get the path to the local repo clone.
 */
export function getRepoDir(): string {
	return join(getBatonDir(), "repo");
}

/**
 * Load baton config. Returns null if not configured.
 */
export async function loadConfig(): Promise<BatonConfig | null> {
	try {
		const raw = await readFile(getConfigPath(), "utf-8");
		const config = JSON.parse(raw);
		if (!config.repo || typeof config.repo !== "string") {
			return null;
		}
		return config as BatonConfig;
	} catch {
		return null;
	}
}

/**
 * Save baton config.
 */
export async function saveConfig(config: BatonConfig): Promise<void> {
	const configPath = getConfigPath();
	await mkdir(dirname(configPath), { recursive: true });
	await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}
