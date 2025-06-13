import { Buffer } from "node:buffer";
import { FileHandle, open, readdir, readFile } from "node:fs/promises";
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

	return payload;
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

	while (lowerBound <= upperBound) {
		const bisect = Math.floor((lowerBound + upperBound) / 2);
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
	const offset32Index = lowerBound;

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

	const pack = await open(packPath);

	return await readPackedObject(pack, offset);
}

async function readPackedObject(pack: FileHandle, offset: number): Promise<Buffer> {
	const readMSBitEncode = (buffer: Buffer, pointer: { next: number }) => {
		let byte = 0;
		let value = 0;
		let shift = 0;

		do {
			byte = buffer.readUint8(pointer.next++);
			value |= (byte & 0x7f) << shift;
			shift += 7;
		} while (byte & 0x80);

		return value;
	};

	const objectEntry = Buffer.alloc(6);
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

	const objectLength =
		(firstByte & 0b1111) + (readMSBitEncode(objectEntry, objectEntryPointer) << 4);

	if (objectType !== "ofs-delta" && objectType !== "ref-delta") {
		const header = Buffer.from(`${objectType} ${objectLength.toFixed()}\0`, "ascii");

		const contentStream = pack.createReadStream({
			start: offset + objectEntryPointer.next,
		});
		const inflateStream = contentStream.pipe(createInflate());

		const contentChunks = await Array.fromAsync<Buffer>(inflateStream);

		contentStream.destroy();
		inflateStream.destroy();

		const payload = Buffer.concat([header, ...contentChunks]);

		return payload;
	}

	throw new Error("not implemented");
}
