import { Cache } from "../cache/cache";
import { Memo } from "../cache/memo";
import { parseCommit } from "../parse-object/parse-commit";
import { readObject } from "../read-object/read-object";
import { Graph } from "./graph";

export interface ReadGraphCache {
	graph: Memo<Graph | null>;
}

export async function getTopology(
	repo: string,
	hash: string,

	cache = new Cache(),
): Promise<number> {
	const graph = await cache.graph.memo(() => Graph.build(repo), repo);

	let gen = graph?.findGen(hash);

	if (gen !== undefined) {
		return gen;
	}

	const commit = await readObject(repo, hash, cache);
	const { parent } = parseCommit(commit);

	if (!parent.length) {
		return 1;
	}
	const lower = await Promise.all(parent.map((hash) => getTopology(repo, hash, cache)));

	gen = Math.max(...lower) + 1;
	graph?.genMap.set(hash, gen);

	return gen;
}

export async function findParents(
	repo: string,
	hash: string,

	cache = new Cache(),
): Promise<string[]> {
	const graph = await cache.graph.memo(() => Graph.build(repo), repo);

	const pts = graph?.findPts(hash);

	if (pts === null) {
		return [];
	}
	if (!pts) {
		const commit = await readObject(repo, hash, cache);

		return parseCommit(commit).parent;
	}
	return [pts];
}
