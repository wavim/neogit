export class Memo<T> {
	private store = new Map<string, T>();

	async memo(resolve: () => Promise<T>, ...keys: string[]): Promise<T> {
		const key = concat(keys);

		const memoized = this.store.get(key);
		if (memoized) {
			return memoized;
		}

		const data = await resolve();
		this.store.set(key, data);

		return data;
	}
}

function concat(keys: string[]): string {
	return keys.join("\0");
}
