import { Buffer } from "node:buffer";
import { hash } from "node:crypto";
import { open, readdir, readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { promisify } from "node:util";
import { createInflate, inflate } from "node:zlib";
import { GitCache } from "../shared/cache";

export async function readGitObject(
	repo: string,
	hash: string,
	cache: GitCache = new GitCache(),
): Promise<Buffer> {
	try {
		return await readLooseObject(repo, hash, cache);
	} catch {
		/* empty */
	}

	try {
		return await readIndexedObject(repo, hash, cache);
	} catch {
		/* empty */
	}

	throw new Error("could not get object info");
}

async function readLooseObject(repo: string, hash: string, cache: GitCache): Promise<Buffer> {
	const cached = cache.objects.get(GitCache.getKey(repo, hash));
	if (cached) {
		return cached;
	}

	const objectPath = join(repo, ".git", "objects", hash.slice(0, 2), hash.slice(2));

	const deflatedData = await readFile(objectPath);
	const data = await promisify(inflate)(deflatedData);
	cache.objects.set(GitCache.getKey(repo, hash), data);

	return data;
}

async function readIndexedObject(repo: string, hash: string, cache: GitCache): Promise<Buffer> {
	const cached = cache.objects.get(GitCache.getKey(repo, hash));
	if (cached) {
		return cached;
	}

	const packDir = join(repo, ".git", "objects", "pack");

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

		packIndex = cache.packidx.get(packIndexPath) ?? (await readFile(packIndexPath));
		cache.packidx.set(packIndexPath, packIndex);

		const fanoutTable = packIndex.subarray(2 * 4, 2 * 4 + 256 * 4);
		const fanoutIndex = +`0x${hash.slice(0, 2)}`;

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
	const targetHash = Buffer.from(hash, "hex");

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

	const data = await readPackedObject(repo, packPath, offset, cache);
	cache.objects.set(GitCache.getKey(repo, hash), data);

	return data;
}

async function readPackedObject(
	repo: string,
	packPath: string,
	offset: number,
	cache: GitCache,
): Promise<Buffer> {
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

	const objectSize =
		(firstByte & 0b1111) | (parseObjectSize(objectEntry, objectEntryPointer) << 4);

	if (objectType !== "ofs-delta" && objectType !== "ref-delta") {
		await pack.close();

		const head = Buffer.from(`${objectType} ${objectSize.toFixed()}\0`, "ascii");
		const body = await inflateData(packPath, offset + objectEntryPointer.next);

		return Buffer.concat([head, body]);
	}

	let deltaBase;
	const deltaEntryPointer = { next: 0 };

	if (objectType === "ofs-delta") {
		const deltaEntry = await pack.read({
			buffer: Buffer.alloc(8),
			position: offset + objectEntryPointer.next,
		});
		const deltaBaseOffset = parseObjectOffset(deltaEntry.buffer, deltaEntryPointer);

		deltaBase = await readPackedObject(repo, packPath, offset - deltaBaseOffset, cache);

		const sha = hash("sha1", deltaBase, "hex");
		cache.objects.set(GitCache.getKey(repo, sha), deltaBase);
	} else {
		const deltaEntry = await pack.read({
			buffer: Buffer.alloc(20),
			position: offset + objectEntryPointer.next,
		});
		deltaEntryPointer.next += 20;

		deltaBase = await readIndexedObject(repo, deltaEntry.buffer.toString("hex"), cache);
	}

	await pack.close();

	const deltaBaseHeadEnd = deltaBase.indexOf(0);
	const deltaBaseHead = deltaBase.subarray(0, deltaBaseHeadEnd);
	const deltaBaseBody = deltaBase.subarray(deltaBaseHeadEnd + 1);

	const deltaData = await inflateData(
		packPath,
		offset + objectEntryPointer.next + deltaEntryPointer.next,
	);
	const deltaDataPointer = { next: 0 };

	parseObjectSize(deltaData, deltaDataPointer);
	parseObjectSize(deltaData, deltaDataPointer);

	const deltaInstructions = deltaData.subarray(deltaDataPointer.next);
	const body = Buffer.concat(constructDeltas(deltaBaseBody, deltaInstructions));

	const baseObjectType = deltaBaseHead.toString("ascii").split(" ")[0];
	const head = Buffer.from(`${baseObjectType} ${body.byteLength.toFixed()}\0`, "ascii");

	return Buffer.concat([head, body]);
}

function constructDeltas(
	deltaBaseContent: Buffer,
	deltaInstructions: Buffer,
	deltas: Buffer[] = [],
): Buffer[] {
	if (deltaInstructions.byteLength === 0) {
		return deltas;
	}

	const instruction = deltaInstructions.readUInt8(0);

	if ((instruction & 0x80) === 0) {
		const dataSize = instruction & 0x7f;

		const delta = deltaInstructions.subarray(1, dataSize + 1);
		deltas.push(delta);

		return constructDeltas(
			deltaBaseContent,
			deltaInstructions.subarray(dataSize + 1),
			deltas,
		);
	}

	const byteMask = instruction & 0x7f;
	let byteIndex = 1;

	let copyOffset = 0;
	let copyOffsetShift = 0;

	for (let i = 0; i < 4; i++) {
		const notMasked = (byteMask >> i) & 1;
		copyOffset |= notMasked
			? deltaInstructions.readUInt8(byteIndex++) << copyOffsetShift
			: 0;
		copyOffsetShift += 8;
	}

	let copySize = 0;
	let copySizeShift = 0;

	for (let i = 4; i < 7; i++) {
		const notMasked = (byteMask >> i) & 1;
		copySize |= notMasked
			? deltaInstructions.readUInt8(byteIndex++) << copySizeShift
			: 0;
		copySizeShift += 8;
	}

	const delta = deltaBaseContent.subarray(copyOffset, copyOffset + copySize);
	deltas.push(delta);

	return constructDeltas(deltaBaseContent, deltaInstructions.subarray(byteIndex), deltas);
}

function parseObjectSize(buffer: Buffer, pointer: { next: number }): number {
	let value = 0;
	let byte = 0;
	let shift = 0;

	do {
		byte = buffer.readUint8(pointer.next++);
		value |= (byte & 0x7f) << shift;

		shift += 7;
	} while (byte & 0x80);

	return value;
}

function parseObjectOffset(buffer: Buffer, pointer: { next: number }): number {
	let value = 0;
	let byte = 0;
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

async function inflateData(packPath: string, offset: number): Promise<Buffer> {
	const pack = await open(packPath);

	const dataStream = pack.createReadStream({ start: offset });
	const inflateStream = dataStream.pipe(createInflate());

	const dataChunks = await Array.fromAsync<Buffer>(inflateStream);

	dataStream.destroy();
	inflateStream.destroy();

	return Buffer.concat(dataChunks);
}
