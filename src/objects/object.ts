import { Buffer } from "node:buffer";
import { open, readdir, readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { promisify } from "node:util";
import { createInflate, inflate } from "node:zlib";

export interface Object {
	repo: string;
	hash: string;
}

export async function readObject(object: Object): Promise<Buffer> {
	try {
		return await readLooseObject(object);
	} catch {
		/* empty */
	}

	try {
		return await readIndexedObject(object);
	} catch {
		/* empty */
	}

	throw new Error("could not get object info");
}

async function readLooseObject(object: Object): Promise<Buffer> {
	const objectPath = join(
		object.repo,
		".git",
		"objects",
		object.hash.slice(0, 2),
		object.hash.slice(2),
	);

	const deflatedPayload = await readFile(objectPath);
	const payload = await promisify(inflate)(deflatedPayload);

	return readObjectBody(payload);
}

async function readIndexedObject(object: Object): Promise<Buffer> {
	const packDir = join(object.repo, ".git", "objects", "pack");

	let packIndex: Buffer | null = null;
	let packPath: string | null = null;

	let lowerBound = 0;
	let upperBound = 0;
	let objectCount = 0;

	for (const filePath of await readdir(packDir)) {
		if (extname(filePath) !== ".idx") {
			continue;
		}

		const packIndexPath = join(packDir, filePath);
		packIndex = await readFile(packIndexPath);

		const fanoutTable = packIndex.subarray(2 * 4, 2 * 4 + 256 * 4);
		const fanoutIndex = +`0x${object.hash.slice(0, 2)}`;

		lowerBound =
			fanoutIndex === 0 ? 0 : fanoutTable.readUInt32BE((fanoutIndex - 1) * 4);
		upperBound = fanoutTable.readUInt32BE(fanoutIndex * 4);

		if (lowerBound < upperBound) {
			packPath = join(packDir, basename(filePath, ".idx") + ".pack");

			objectCount = fanoutTable.readUInt32BE(255 * 4);

			break;
		}
	}

	if (!packIndex || !packPath) {
		throw new Error();
	}

	const hashTable = packIndex.subarray(2 * 4 + 256 * 4, 2 * 4 + 256 * 4 + objectCount * 20);
	const targetHash = Buffer.from(object.hash, "hex");

	upperBound--;
	let bisect = 0;

	while (lowerBound <= upperBound) {
		bisect = Math.floor((lowerBound + upperBound) / 2);
		const compare = targetHash.compare(hashTable, bisect * 20, bisect * 20 + 20);

		if (compare === 0) {
			break;
		}
		if (compare > 0) {
			lowerBound = bisect + 1;
		} else {
			upperBound = bisect - 1;
		}
	}

	if (lowerBound > upperBound) {
		throw new Error();
	}

	const offset32Table = packIndex.subarray(
		2 * 4 + 256 * 4 + objectCount * 20 + objectCount * 4,
		2 * 4 + 256 * 4 + objectCount * 20 + objectCount * 4 + objectCount * 4,
	);
	const offset32Index = bisect;

	let offset = offset32Table.readUInt32BE(offset32Index * 4);

	if (offset & 0x80_00_00_00) {
		const offset64Table = packIndex.subarray(
			2 * 4 + 256 * 4 + objectCount * 20 + objectCount * 4 + objectCount * 4,
			-(20 + 20),
		);
		const offset64Index = offset & 0x7f_ff_ff_ff;
		const offset64 = offset64Table.readBigUInt64BE(offset64Index * 8);

		if (offset64 > Number.MAX_SAFE_INTEGER) {
			throw new Error();
		}

		offset = Number(offset64);
	}

	return await readPackedObject(object.repo, packPath, offset);
}

async function readPackedObject(repo: string, packPath: string, offset: number): Promise<Buffer> {
	const pack = await open(packPath);

	const objectEntry = Buffer.alloc(5);
	const objectEntryPointer = { next: 0 };

	await pack.read({ buffer: objectEntry, position: offset });

	const firstByte = objectEntry.readUInt8(0);
	objectEntryPointer.next++;

	const objectTypes = [
		"invalid",
		"commit",
		"tree",
		"blob",
		"tag",
		"reserved",
		"ofs-delta",
		"ref-delta",
	] as const;
	const objectType = objectTypes[(firstByte >> 4) & 0b0111];

	if (objectType === "invalid" || objectType === "reserved") {
		throw new Error();
	}

	readVariableSize(objectEntry, objectEntryPointer);

	if (objectType !== "ofs-delta" && objectType !== "ref-delta") {
		return await readInflated(packPath, offset + objectEntryPointer.next);
	}

	let deltaBase;
	const deltaEntryPointer = { next: 0 };

	if (objectType === "ofs-delta") {
		const deltaEntry = Buffer.alloc(8);
		await pack.read({ buffer: deltaEntry, position: offset + objectEntryPointer.next });
		const deltaBaseOffset = readVariableOffset(deltaEntry, deltaEntryPointer);

		deltaBase = await readPackedObject(repo, packPath, offset - deltaBaseOffset);
	} else {
		const deltaEntry = await pack.read({
			buffer: Buffer.alloc(20),
			position: offset + objectEntryPointer.next,
		});
		deltaEntryPointer.next += 20;

		deltaBase = await readIndexedObject({
			repo,
			hash: deltaEntry.buffer.toString("hex"),
		});
	}

	const deltaData = await readInflated(
		packPath,
		offset + objectEntryPointer.next + deltaEntryPointer.next,
	);
	const deltaDataPointer = { next: 0 };

	readVariableSize(deltaData, deltaDataPointer);
	readVariableSize(deltaData, deltaDataPointer);

	const deltaCommands = deltaData.subarray(deltaDataPointer.next);

	return Buffer.concat(constructDeltas(deltaBase, deltaCommands));
}

function constructDeltas(deltaBase: Buffer, commands: Buffer, deltas: Buffer[] = []): Buffer[] {
	if (commands.byteLength === 0) {
		return deltas;
	}

	const instruction = commands.readUInt8(0);

	if ((instruction & 0x80) === 0) {
		const dataSize = instruction & 0x7f;

		const delta = commands.subarray(1, dataSize + 1);
		deltas.push(delta);

		return constructDeltas(deltaBase, commands.subarray(dataSize + 1), deltas);
	}

	const byteMask = instruction & 0x7f;
	let byteIndex = 1;

	let copyOffset = 0;
	let copyOffsetShift = 0;

	for (let i = 0; i < 4; i++) {
		const exists = (byteMask >> i) & 1;
		copyOffset |= exists ? commands.readUInt8(byteIndex++) << copyOffsetShift : 0;
		copyOffsetShift += 8;
	}

	let copySize = 0;
	let copySizeShift = 0;

	for (let i = 4; i < 7; i++) {
		const exists = (byteMask >> i) & 1;
		copySize |= exists ? commands.readUInt8(byteIndex++) << copySizeShift : 0;
		copySizeShift += 8;
	}

	const delta = deltaBase.subarray(copyOffset, copyOffset + copySize);
	deltas.push(delta);

	return constructDeltas(deltaBase, commands.subarray(byteIndex), deltas);
}

function readObjectBody(payload: Buffer): Buffer {
	const nullIndex = payload.indexOf(0);

	return payload.subarray(nullIndex + 1);
}

function readVariableSize(buffer: Buffer, pointer: { next: number }): number {
	let byte = 0;
	let value = 0;
	let shift = 0;

	do {
		byte = buffer.readUint8(pointer.next++);
		value |= (byte & 0x7f) << shift;
		shift += 7;
	} while (byte & 0x80);

	return value;
}

function readVariableOffset(buffer: Buffer, pointer: { next: number }): number {
	let byte = 0;
	let value = 0;

	let multiByte = false;

	do {
		if (multiByte) {
			value++;
		}

		byte = buffer.readUint8(pointer.next++);
		value = (value << 7) | (byte & 0x7f);

		multiByte = true;
	} while (byte & 0x80);

	return value;
}

async function readInflated(packPath: string, offset: number): Promise<Buffer> {
	const pack = await open(packPath);

	const contentStream = pack.createReadStream({ start: offset });
	const inflateStream = contentStream.pipe(createInflate());

	const contentChunks = await Array.fromAsync<Buffer>(inflateStream);

	contentStream.destroy();
	inflateStream.destroy();

	return Buffer.concat(contentChunks);
}
