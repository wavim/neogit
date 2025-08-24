import { open, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export interface Packed {
	offset: number;
	buffer: Buffer;
}

export class Pack {
	readonly ofsMap = new Map<string, number>();
	readonly lenMap = new Map<number, number>();

	static async build(base: string, pack: string): Promise<Pack> {
		const _pack = join(base, pack);
		const index = join(base, pack.replace(".pack", ".idx"));
		const stats = await stat(join(base, pack));

		return new Pack(await readFile(index), _pack, stats.size);
	}

	constructor(
		index: Buffer,
		readonly pack: string,
		packSize: number,
	) {
		const oidNumber = index.readUint32BE(1028);
		const oidLookup = index.subarray(1032, 1032 + oidNumber * 20);
		const ofsLookup = index.subarray(1032 + oidNumber * 24, 1032 + oidNumber * 28);

		const ofsLinked = new Uint32Array(oidNumber);

		for (let i = 0; i < oidNumber; i++) {
			const oid = oidLookup.toString("hex", i * 20, i * 20 + 20);
			const ofs = ofsLookup.readUint32BE(i * 4);

			if (ofs & 0x80_00_00_00) {
				// skips >2GiB pack indices
				continue;
			}

			ofsLinked[i] = ofs;
			this.ofsMap.set(oid, ofs);
		}
		ofsLinked.sort();

		for (let i = 0; i < oidNumber; i++) {
			const ofs = ofsLinked[i];
			const end = ofsLinked[i + 1] ?? packSize;

			this.lenMap.set(ofs, end - ofs);
		}
	}

	async readOfs(offset: number): Promise<Packed | undefined> {
		const objLen = this.lenMap.get(offset);

		if (objLen === undefined) {
			return undefined;
		}
		const buffer = Buffer.allocUnsafe(objLen);

		const pack = await open(this.pack);
		await pack.read({ buffer, position: offset });
		await pack.close();

		return { offset, buffer };
	}

	async readRef(objref: string): Promise<Packed | undefined> {
		const offset = this.ofsMap.get(objref);

		if (offset === undefined) {
			return undefined;
		}
		return await this.readOfs(offset);
	}
}
