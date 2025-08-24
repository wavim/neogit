import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export function searchRepo(dir: string): string {
	while (!existsSync(join(dir, ".git"))) {
		const next = dirname(dir);

		if (next === dir) {
			throw new Error("no repository found");
		}
		dir = next;
	}

	return dir;
}
