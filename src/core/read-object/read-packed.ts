import { open, readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { binarySearch } from "../../util/binary-search";
import { inflateOffset } from "../../util/inflate-offset";
import { ReadObjectCache } from "./read-object";

export async function readPacked(
	repo: string,
	hash: string,

	cache: ReadObjectCache,
): Promise<Buffer> {
	return await cache.buffers.memo(() => read(repo, hash, cache), repo, hash);
}

async function read(
	repo: string,
	hash: string,

	cache: ReadObjectCache,
): Promise<Buffer> {
	const folderPath = join(repo, ".git", "objects", "pack");

	let idxPath: string | undefined;
	let idxBuffer: Buffer | undefined;

	let lowerBound = 0;
	let upperBound = 0;
	let objectN = 0;

	for (const path of await readdir(folderPath)) {
		if (extname(path) !== ".idx") {
			continue;
		}

		idxPath = join(folderPath, path);
		idxBuffer = await readFile(idxPath);

		const oidFanout = idxBuffer.subarray(2 * 4, 2 * 4 + 256 * 4);
		const i = +`0x${hash.slice(0, 2)}`;

		lowerBound = i === 0 ? 0 : oidFanout.readUint32BE((i - 1) * 4);
		upperBound = oidFanout.readUint32BE(i * 4);

		if (lowerBound === upperBound) {
			continue;
		}

		objectN = oidFanout.readUint32BE(255 * 4);
		break;
	}

	if (!idxPath || !idxBuffer) {
		throw new Error();
	}

	const oidLookup = idxBuffer.subarray(2 * 4 + 256 * 4, 2 * 4 + 256 * 4 + objectN * 20);
	const target = Buffer.from(hash, "hex");

	const i = binarySearch(lowerBound, upperBound - 1, (bisect) => {
		return target.compare(oidLookup, bisect * 20, bisect * 20 + 20);
	});
	if (!i) {
		throw new Error();
	}

	const ofs32Lookup = idxBuffer.subarray(
		2 * 4 + 256 * 4 + objectN * 20 + objectN * 4,
		2 * 4 + 256 * 4 + objectN * 20 + objectN * 4 + objectN * 4,
	);

	let offset = ofs32Lookup.readUint32BE(i * 4);

	if (offset & 0x80_00_00_00) {
		const ofs64Lookup = idxBuffer.subarray(
			2 * 4 + 256 * 4 + objectN * 20 + objectN * 4 + objectN * 4,
			-(20 + 20),
		);
		const offset64 = ofs64Lookup.readBigUint64BE((offset & 0x7f_ff_ff_ff) * 8);

		if (offset64 > Number.MAX_SAFE_INTEGER) {
			throw new Error();
		}
		offset = Number(offset64);
	}

	return await readFromPack(repo, idxPath.replace(".idx", ".pack"), offset, cache);
}

interface BytePointer {
	next: number;
}

async function readFromPack(
	repo: string,
	path: string,
	offset: number,

	cache: ReadObjectCache,
): Promise<Buffer> {
	const pack = await open(path);

	const { buffer: head } = await pack.read({ buffer: Buffer.alloc(5), position: offset });
	const headPointer: BytePointer = { next: 0 };

	const firstByte = head.readUint8(0);
	headPointer.next++;

	const types = [
		"invalid",
		"commit",
		"tree",
		"blob",
		"tag",
		"reserved",
		"ofs-delta",
		"ref-delta",
	] as const;
	const type = types[(firstByte >> 4) & 0b0111];

	if (type === "invalid" || type === "reserved") {
		throw new Error();
	}

	const size = (firstByte & 0b1111) | (decodeSize(head, headPointer) << 4);

	if (type !== "ofs-delta" && type !== "ref-delta") {
		await pack.close();

		const objectHead = Buffer.from(`${type} ${size.toFixed()}\0`, "ascii");
		const objectBody = await inflateOffset(path, offset + headPointer.next);

		return Buffer.concat([objectHead, objectBody]);
	}

	let base: Buffer | undefined;
	const basePointer: BytePointer = { next: 0 };

	if (type === "ofs-delta") {
		const { buffer: ofsHead } = await pack.read({
			buffer: Buffer.alloc(8),
			position: offset + headPointer.next,
		});
		const baseOffset = offset - decodeOffset(ofsHead, basePointer);

		base = await readFromPack(repo, path, baseOffset, cache);
	} else {
		const { buffer: refHead } = await pack.read({
			buffer: Buffer.alloc(20),
			position: offset + headPointer.next,
		});
		const baseHash = refHead.toString("hex");
		basePointer.next += 20;

		base = await readPacked(repo, baseHash, cache);
	}

	await pack.close();

	const delta = await inflateOffset(path, offset + headPointer.next + basePointer.next);
	const deltaPointer = { next: 0 };

	decodeSize(delta, deltaPointer);
	const objectSize = decodeSize(delta, deltaPointer);

	const instructions = delta.subarray(deltaPointer.next);

	const baseHeadEnd = base.indexOf(0);
	const objectBody = buildDelta(base.subarray(baseHeadEnd + 1), instructions);

	const baseHead = base.subarray(0, baseHeadEnd);
	const baseType = baseHead.toString("ascii").split(" ")[0];
	const objectHead = Buffer.from(`${baseType} ${objectSize.toFixed()}\0`, "ascii");

	return Buffer.concat([objectHead, objectBody]);
}

function buildDelta(base: Buffer, instructions: Buffer): Buffer {
	const deltas = [];

	while (instructions.byteLength !== 0) {
		const instruction = instructions.readUint8(0);

		if ((instruction & 0x80) === 0) {
			const size = instruction & 0x7f;
			deltas.push(instructions.subarray(1, size + 1));

			instructions = instructions.subarray(size + 1);
			continue;
		}

		const byteMask = instruction & 0x7f;
		const bytePointer: BytePointer = { next: 1 };

		const offset = decodeInstruct(
			instructions,
			byteMask,
			{ from: 0, to: 4 },
			bytePointer,
		);
		const size = decodeInstruct(
			instructions,
			byteMask,
			{ from: 4, to: 7 },
			bytePointer,
		);

		const delta = base.subarray(offset, offset + size);
		deltas.push(delta);

		instructions = instructions.subarray(bytePointer.next);
	}

	return Buffer.concat(deltas);
}

function decodeSize(buffer: Buffer, pointer: BytePointer): number {
	let byte = 0;
	let size = 0;
	let shift = 0;

	do {
		byte = buffer.readUint8(pointer.next++);
		size |= (byte & 0x7f) << shift;
		shift += 7;
	} while (byte & 0x80);

	return size;
}

function decodeOffset(buffer: Buffer, pointer: BytePointer): number {
	let byte = buffer.readUint8(pointer.next++);
	let offset = byte & 0x7f;

	while (byte & 0x80) {
		byte = buffer.readUint8(pointer.next++);
		offset++;
		offset <<= 7;
		offset |= byte & 0x7f;
	}

	return offset;
}

function decodeInstruct(
	buffer: Buffer,
	mask: number,
	range: { from: number; to: number },
	pointer: BytePointer,
) {
	let value = 0;
	let shift = 0;

	for (let i = range.from; i < range.to; i++) {
		value |= (mask >> i) & 1 ? buffer.readUint8(pointer.next++) << shift : 0;
		shift += 8;
	}

	return value;
}
