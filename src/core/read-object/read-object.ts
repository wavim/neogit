import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { Bloom } from "../cache/bloom";
import { Cache } from "../cache/cache";
import { Memo } from "../cache/memo";
import { readLoose } from "./read-loose";
import { readPacked } from "./read-packed";

export interface ReadObjectCache {
	lbloom: Memo<[string], Bloom>;
	object: Memo<[string, string], Buffer>;
	offset: Memo<[string, string], number>;
}

export async function readObject(
	repo: string,
	hash: string,

	cache = new Cache(),
): Promise<Buffer> {
	const lbloom = await cache.lbloom.memo(async () => {
		const dirs = await readdir(join(repo, ".git", "objects"));

		return new Bloom(dirs.slice(0, -2));
	}, repo);

	if (lbloom.negative(hash)) {
		return await readPacked(repo, hash, cache);
	}

	try {
		return await readLoose(repo, hash, cache);
	} catch {
		return await readPacked(repo, hash, cache);
	}
}
