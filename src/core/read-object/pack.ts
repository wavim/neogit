import { open } from "node:fs/promises";

export interface Indexed {
	pack: Pack;

	buffer: Buffer;
	offset: number;
}

export async function getIndexed(packs: Pack[], hash: string): Promise<Indexed | undefined> {
	let buffer: Buffer | undefined;
	let offset: number | undefined;

	for (const pack of packs) {
		const res = await pack.materializeHash(hash);

		if (res === undefined) {
			continue;
		}

		buffer = res.buffer;
		offset = res.offset;

		return { pack, buffer, offset };
	}
}

export class Pack {
	private ofsMap = new Map<string, number>();
	private ofsLink = new Map<number, number>();

	constructor(
		readonly packPath: string,
		idxBuffer: Buffer,
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

		const ofsList: number[] = [];

		for (let i = 0; i < oidCount; i++) {
			const oid = oidLookup.toString("hex", i * 20, i * 20 + 20);
			const ofs = ofsLookup.readUint32BE(i * 4);

			this.ofsMap.set(oid, ofs);
			ofsList.push(ofs);
		}

		ofsList.sort();

		for (let i = 0; i < oidCount; i++) {
			this.ofsLink.set(ofsList[i], ofsList[i + 1] ?? Infinity);
		}
	}

	async materializeOffset(offset: number): Promise<Buffer | undefined> {
		let next = this.ofsLink.get(offset);

		if (next === undefined) {
			return;
		}

		const handle = await open(this.packPath);

		if (next === Infinity) {
			const stats = await handle.stat();
			next = stats.size;
		}

		const buffer = Buffer.alloc(next - offset);
		await handle.read({ buffer, position: offset });

		await handle.close();

		return buffer;
	}

	async materializeHash(
		hash: string,
	): Promise<{ offset: number; buffer: Buffer } | undefined> {
		const offset = this.ofsMap.get(hash);

		if (offset === undefined) {
			return;
		}

		const buffer = await this.materializeOffset(offset);

		if (buffer === undefined) {
			return;
		}

		return { offset, buffer };
	}
}
