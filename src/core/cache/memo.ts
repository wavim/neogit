export class Memo<T> extends Map<string, T> {
	async memo(resolve: () => Promise<T>, ...keys: string[]): Promise<T> {
		const memoized = this.get(concat(keys));
		if (memoized) {
			return memoized;
		}

		const data = await resolve();
		this.set(concat(keys), data);

		return data;
	}
}

function concat(keys: string[]): string {
	return keys.map(encodeURIComponent).join("/");
}
