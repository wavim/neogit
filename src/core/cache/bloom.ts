export class Bloom {
	constructor(
		entries: string[],
		readonly filter = new Set(entries),
	) {}

	negative(hex: string): boolean {
		return !this.filter.has(hex.slice(0, 2));
	}
}
