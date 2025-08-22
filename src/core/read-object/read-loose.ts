import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { inflate } from "../utils/inflate";

export async function readLoose(repo: string, hash: string): Promise<Buffer> {
	const deflated = await readFile(
		join(repo, ".git", "objects", hash.slice(0, 2), hash.slice(2)),
	);
	return await inflate(deflated);
}
