import { Cache } from "../cache/cache";
import { Memo } from "../cache/memo";
import { readLoose } from "./read-loose";
import { readPacked } from "./read-packed";

export interface ReadObjectCache {
	buffers: Memo<Buffer>;
}

export async function readObject(
	repo: string,
	hash: string,

	cache = new Cache(),
): Promise<Buffer> {
	try {
		return await readLoose(repo, hash, cache);
	} catch {
		/* empty */
	}

	try {
		return await readPacked(repo, hash, cache);
	} catch {
		/* empty */
	}

	throw new Error("could not get object info");
}
