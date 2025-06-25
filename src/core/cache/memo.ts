export class Memo<T> {
	readonly store = new Map<string, T>();

	async memo(resolve: () => Promise<T>, repo: string): Promise<T> {
		const memoized = this.store.get(repo);

		if (memoized) {
			return memoized;
		}

		const data = await resolve();
		this.store.set(repo, data);

		return data;
	}
}
