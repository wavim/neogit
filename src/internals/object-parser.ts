export interface GitObject {
	repo: string;
	hash: string;

	type: "commit" | "tree" | "blob" | "tag";
	size: number;
	body: Buffer;
}

export function parseGitObject(repo: string, hash: string, data: Buffer): GitObject {
	const headEnd = data.indexOf(0);

	const head = data.toString("ascii", 0, headEnd);
	const [type, size] = head.split(" ");

	const body = data.subarray(headEnd + 1);

	return { repo, hash, type: type as GitObject["type"], size: +size, body };
}
