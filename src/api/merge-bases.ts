import { Cache } from "../lib/cache/cache";
import { findParents, getTopology } from "../lib/read-graph/read-graph";

export async function mergeBases(
	repo: string,
	oid1: string,
	oid2: string,

	cache = new Cache(),
): Promise<string[]> {
	const base: string[] = [];
	const gens: number[] = [];

	const walker = [oid1, oid2];
	const visits = new Map<string, number>();

	let best = 0;

	while (walker.length) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const oid = walker.shift()!;
		const cnt = visits.get(oid) ?? 0;

		if (cnt === 1) {
			const gen = await getTopology(repo, oid, cache);

			if (gen > best) {
				best = gen;
			}
			base.push(oid);
			gens.push(gen);
		}
		visits.set(oid, cnt + 1);

		const pts = await findParents(repo, oid, cache);
		const gen = await Promise.all(pts.map((oid) => getTopology(repo, oid, cache)));

		walker.push(...pts.filter((_, i) => gen[i] >= best));
	}

	return base.filter((_, i) => gens[i] === best);
}
