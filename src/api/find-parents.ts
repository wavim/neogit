import { Cache } from "../lib/cache/cache";
import { getParents } from "../lib/read-graph/read-graph";

export async function findParents(
	repo: string,
	hash: string,

	cache = new Cache(),
): Promise<string[]> {
	return await getParents(repo, hash, cache);
}
