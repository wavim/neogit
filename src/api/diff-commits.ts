import { Cache } from "../lib/cache/cache";
import { getTopology } from "../lib/read-graph/read-graph";

export async function diffCommits(
	repo: string,
	from: string,
	base: string,

	cache = new Cache(),
): Promise<number> {
	return (await getTopology(repo, from, cache)) - (await getTopology(repo, base, cache));
}
