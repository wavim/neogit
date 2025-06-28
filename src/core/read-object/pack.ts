import { open } from "node:fs/promises";

export interface Packed {
	offset: number;
	buffer: Buffer;
}

export class Pack {
	readonly ofsMap = new Map<string, number>();
	readonly ofsEnd = new Map<number, number>();

	constructor(
		idxBuffer: Buffer,
		readonly pack: string,
	) {
		const oidFanout = idxBuffer.subarray(2 * 4, 2 * 4 + 256 * 4);
		const oidCount = oidFanout.readUint32BE(255 * 4);

		const oidLookup = idxBuffer.subarray(
			2 * 4 + 256 * 4,
			2 * 4 + 256 * 4 + oidCount * 20,
		);
		const ofsLookup = idxBuffer.subarray(
			2 * 4 + 256 * 4 + oidCount * 20 + oidCount * 4,
			2 * 4 + 256 * 4 + oidCount * 20 + oidCount * 4 + oidCount * 4,
		);

		const ofsList = new Uint32Array(oidCount);

		for (let i = 0; i < oidCount; i++) {
			const oid = oidLookup.toString("hex", i * 20, i * 20 + 20);
			const ofs = ofsLookup.readUint32BE(i * 4);

			if (ofs & 0x80_00_00_00) {
				continue;
			}

			this.ofsMap.set(oid, ofs);
			ofsList[i] = ofs;
		}

		ofsList.sort();

		for (let i = 0; i < oidCount; i++) {
			this.ofsEnd.set(ofsList[i], ofsList[i + 1] ?? Infinity);
		}
	}

	async queryRef(ref: string): Promise<Packed | undefined> {
		const offset = this.ofsMap.get(ref);

		if (offset === undefined) {
			return undefined;
		}

		return await this.queryOfs(offset);
	}

	async queryOfs(ofs: number): Promise<Packed | undefined> {
		let end = this.ofsEnd.get(ofs);

		if (end === undefined) {
			return undefined;
		}

		const handle = await open(this.pack);

		if (end === Infinity) {
			const stats = await handle.stat();
			end = stats.size;
		}

		const buffer = Buffer.alloc(end - ofs);

		await handle.read(buffer, { position: ofs });
		await handle.close();

		return { offset: ofs, buffer };
	}
}
