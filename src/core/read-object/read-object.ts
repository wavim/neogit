import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { Bloom } from "../cache/bloom";
import { Cache } from "../cache/cache";
import { Memo } from "../cache/memo";
import { Pack } from "./pack";
import { readLoose } from "./read-loose";
import { readPacked } from "./read-packed";

export interface ReadObjectCache {
	bloom: Memo<Bloom>;
	packs: Memo<Pack[]>;
}

export async function readObject(
	repo: string,
	hash: string,

	cache = new Cache(),
): Promise<Buffer> {
	const bloom = await cache.bloom.memo(async () => {
		const dirs = await readdir(join(repo, ".git", "objects"));

		return new Bloom(dirs.slice(0, -2));
	}, repo);

	if (bloom.negative(hash)) {
		return await readPacked(repo, hash, cache);
	}

	try {
		return await readLoose(repo, hash);
	} catch {
		return await readPacked(repo, hash, cache);
	}
}
