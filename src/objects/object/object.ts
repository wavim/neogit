import { GitArg } from "../../types";
import { lookupLooseGitObject } from "./loose";

export enum GitObjectType {
	blob,
	tree,
	commit,
	tag,
}

export interface GitObject {
	hash: string;
	type: GitObjectType;
}

export async function lookupGitObject({
	dir,
	hash,
	cache,
}: GitArg<{ hash: string }>): Promise<null | GitObject> {
	if (cache) {
		cache.objects ??= {};

		if (hash in cache.objects) {
			return cache.objects[hash];
		}
	}

	const loose = await lookupLooseGitObject({ dir, hash });
	if (loose !== null) return loose;

	// MO TODO packed object lookup

	return null;
}
