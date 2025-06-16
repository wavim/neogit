import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { inflate } from "node:zlib";
import { ReadObjectCache } from "./read-object";

export async function readLoose(
	repo: string,
	hash: string,

	cache: ReadObjectCache,
): Promise<Buffer> {
	return await cache.buffers.memo(() => read(repo, hash), repo, hash);
}

async function read(repo: string, hash: string): Promise<Buffer> {
	const deflated = await readFile(
		join(repo, ".git", "objects", hash.slice(0, 2), hash.slice(2)),
	);

	return await promisify(inflate)(deflated);
}
