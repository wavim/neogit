import { Cache } from "../cache/cache";
import { Memo } from "../cache/memo";
import { parseCommit } from "../parse-object/parse-commit";
import { readObject } from "../read-object/read-object";
import { Graph } from "./graph";

export interface ReadGraphCache {
	graph: Memo<Graph | null>;
}

export async function getGeneration(
	repo: string,
	hash: string,

	cache = new Cache(),
): Promise<number> {
	const graph = await cache.graph.memo(() => Graph.build(repo), repo);

	const gen = graph?.findGen(hash);

	if (gen !== undefined) {
		return gen;
	}

	const commit = await readObject(repo, hash, cache);
	const { parent } = parseCommit(commit);

	if (!parent.length) {
		return 1;
	}
	const lower = await Promise.all(parent.map((hash) => getGeneration(repo, hash, cache)));

	return Math.max(...lower) + 1;
}
