import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { GitApiParam } from "./types/api-param";

export async function getCurrentBranch({ repo }: GitApiParam): Promise<string | undefined> {
	const headPath = join(repo, ".git", "HEAD");
	const head = await readFile(headPath, "utf8");

	return head.startsWith("ref: ") ? head.split("/").at(-1)?.trimEnd() : undefined;
}
