export class Bloom {
	bit: boolean[] = [];

	constructor(entries: string[]) {
		for (const hex of entries) {
			this.bit[+`0x${hex}`] = true;
		}
	}

	negative(hex: string): boolean {
		return !this.bit[+`0x${hex}`];
	}
}
