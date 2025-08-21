import { open } from "node:fs/promises";

export interface Packed {
	offset: number;
	buffer: Buffer;
}

export class Pack {
	readonly ofsMap = new Map<string, number>();
	readonly objLen = new Map<number, number>();

	constructor(
		index: Buffer,
		readonly pack: string,
		packSize: number,
	) {
		const firstFan = index.subarray(8, 1032);
		const oidCount = firstFan.readUint32BE(1020);

		const oidLookup = index.subarray(1032, 1032 + oidCount * 20);
		const ofsLookup = index.subarray(1032 + oidCount * 24, 1032 + oidCount * 28);

		const ofsLinked = new Uint32Array(oidCount);

		for (let i = 0; i < oidCount; i++) {
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

		for (let i = 0; i < oidCount; i++) {
			const ofs = ofsLinked[i];
			const end = ofsLinked[i + 1] ?? packSize;

			this.objLen.set(ofs, end - ofs);
		}
	}

	async readOfs(offset: number): Promise<Packed | undefined> {
		const objLen = this.objLen.get(offset);

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
