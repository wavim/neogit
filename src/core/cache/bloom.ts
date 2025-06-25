export class Bloom {
	readonly mask = 0n;

	constructor(entries: string[]) {
		for (const hex of entries) {
			this.mask |= mask(hex);
		}
	}

	negative(hex: string): boolean {
		return !(this.mask & mask(hex));
	}
}

function mask(hex: string): bigint {
	return 1n << BigInt(`0x${hex.slice(0, 2)}`);
}
