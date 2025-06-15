import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { GitApiParam } from "./types/api-param";

export async function getCurrentBranch({ repo }: GitApiParam): Promise<string | null> {
	const headPath = join(repo, ".git", "HEAD");
	const head = await readFile(headPath, "utf8");

	return head.startsWith("ref: ") ? head.slice(5).trimEnd() : null;
}
