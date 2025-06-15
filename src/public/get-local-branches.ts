import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { GitApiParam } from "./types/api-param";

export async function getLocalBranches({ repo }: GitApiParam): Promise<string[]> {
	const refsHeadsDir = join(repo, ".git", "refs", "heads");
	const branches = await readdir(refsHeadsDir);

	const packedRefsPath = join(repo, ".git", "packed-refs");
	try {
		const packedRefBranches = await getPackedRefsBranches(packedRefsPath);
		branches.push(...packedRefBranches);
	} catch {
		/* empty */
	}

	return Array.from(new Set(branches));
}

async function getPackedRefsBranches(packedRefsPath: string): Promise<string[]> {
	const branches: string[] = [];

	const packedRefs = await readFile(packedRefsPath, "utf8");

	for (const line of packedRefs.split("\n")) {
		const [, ref = undefined] = line.split(" ");

		if (ref?.startsWith("refs/heads/")) {
			const branch = ref.split("/").at(-1);

			if (branch) {
				branches.push(branch);
			}
		}
	}

	return branches;
}
