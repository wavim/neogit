import { Cache } from "../lib/cache/cache";
import { getGeneration } from "../lib/read-graph/read-graph";

export async function diffCommit(
	repo: string,
	from: string,
	base: string,

	cache = new Cache(),
): Promise<number> {
	return (await getGeneration(repo, from, cache)) - (await getGeneration(repo, base, cache));
}
