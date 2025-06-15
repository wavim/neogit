export class GitCache {
	static getKey(...components: string[]): string {
		return components.map(encodeURIComponent).join(":");
	}

	objects = new Map<string, Buffer>();

	packidx = new Map<string, Buffer>();
}
