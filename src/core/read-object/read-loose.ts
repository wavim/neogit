import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { inflate } from "node:zlib";
import { Cache } from "../cache/cache";

export function readLoose(
	repo: string,
	hash: string,

	cache: Cache,
): Promise<Buffer> {
	return cache.object.memo(() => read(repo, hash), repo, hash);
}

async function read(repo: string, hash: string): Promise<Buffer> {
	const deflated = await readFile(
		join(repo, ".git", "objects", hash.slice(0, 2), hash.slice(2)),
	);

	return await promisify(inflate)(deflated);
}
