import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { GitApiParam } from "./types/api-param";

export async function getLocalBranches({ repo }: GitApiParam): Promise<string[]> {
	const refsHeadsDir = join(repo, ".git", "refs", "heads");
	const branches = await readdir(refsHeadsDir);

	const packedRefsPath = join(repo, ".git", "packed-refs");
	let packedRefs = null;
	try {
		packedRefs = await readFile(packedRefsPath, "utf8");
	} catch {
		/* empty */
	}

	for (const line of packedRefs?.split("\n") ?? []) {
		const [, ref = undefined] = line.split(" ");

		if (ref?.startsWith("refs/heads/")) {
			branches.push(ref);
		}
	}

	return branches;
}
