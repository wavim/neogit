import { Cache } from "../cache/cache";
import { Memo } from "../cache/memo";
import { parseCommit } from "../parse-object/parse-commit";
import { readObject, ReadObjectCache } from "../read-object/read-object";
import { getGraphed } from "./get-graphed";

export interface GetParentsCache extends ReadObjectCache {
	parents: Memo<[string, string], string[]>;
}

export function getParents(
	repo: string,
	hash: string,

	cache = new Cache(),
): Promise<string[]> {
	return cache.parents.memo(() => get(repo, hash, cache), repo, hash);
}

async function get(
	repo: string,
	hash: string,

	cache = new Cache(),
): Promise<string[]> {
	const memoCommit = cache.buffers.get(repo, hash);

	if (memoCommit) {
		return parseCommit(memoCommit).parents;
	}

	try {
		return await getGraphed(repo, hash, cache);
	} catch {
		/* empty */
	}

	const commit = await readObject(repo, hash, cache);
	cache.buffers.set(commit, repo, hash);

	return parseCommit(commit).parents;
}
