import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function lastCommit(repo: string, head: string): Promise<string> {
	const headRefPath = join(repo, ".git", "refs", "heads", head);

	try {
		const hash = await readFile(headRefPath, "utf8");

		return hash.trimEnd();
	} catch {
		/* empty */
	}

	const packRefs = join(repo, ".git", "packed-refs");
	try {
		const refs = await readFile(packRefs, "utf8");

		for (const line of refs.split("\n")) {
			const [hash, rf = undefined] = line.split(" ");

			if (`refs/heads/${head}` === rf) {
				return hash;
			}
		}
	} catch {
		/* empty */
	}

	throw new Error("cannot get branch info");
}
