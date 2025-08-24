import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export async function getBranches(repo: string): Promise<string[]> {
	const headRefs = await readdir(join(repo, ".git", "refs", "heads"));
	const branches = new Set(headRefs);

	const packRefs = join(repo, ".git", "packed-refs");
	try {
		const refs = await readFile(packRefs, "utf8");

		for (const line of refs.split("\n")) {
			const rf = line.split(" ")[1] as string | undefined;

			if (rf?.startsWith("refs/heads")) {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				branches.add(rf.split("/").pop()!);
			}
		}
	} catch {
		/* empty */
	}

	return [...branches];
}
