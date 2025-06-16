export class Memo<T> extends Map<string, T> {
	async memo(resolve: () => Promise<T>, ...keys: string[]): Promise<T> {
		const key = keys.join("\0");

		const memoized = this.get(key);
		if (memoized) {
			return memoized;
		}

		const data = await resolve();
		this.set(key, data);

		return data;
	}
}
