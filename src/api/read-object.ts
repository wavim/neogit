import { Cache } from "../lib/cache/cache";
import { Commit, parseCommit } from "../lib/parse-object/parse-commit";
import { readObject } from "../lib/read-object/read-object";

export async function readCommit(
	repo: string,
	hash: string,

	cache = new Cache(),
): Promise<Commit> {
	return parseCommit(await readObject(repo, hash, cache));
}
