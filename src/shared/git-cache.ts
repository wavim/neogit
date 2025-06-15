export class GitCache {
	objects = new Map<string, Buffer>();
	static objectKey(repo: string, hash: string): string {
		return `${repo}:${hash}`;
	}

	packidx = new Map<string, Buffer>();
}
