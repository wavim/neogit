import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function headBranch(repo: string): Promise<string> {
	const head = await readFile(join(repo, ".git", "HEAD"), "utf8");

	if (!head.startsWith("ref")) {
		throw new Error("head in detached state");
	}
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	return head.split("/").pop()!.trimEnd();
}
