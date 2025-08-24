export class Memo<T> {
	store = new Map<string, T>();

	async memo(f: () => Promise<T>, repo: string): Promise<T> {
		const memoized = this.store.get(repo);

		if (memoized !== undefined) {
			return memoized;
		}

		const data = await f();
		this.store.set(repo, data);

		return data;
	}
}
