// MO TODO optimize for performance & clarity

import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { promisify } from "node:util";
import { inflate } from "node:zlib";
import { Cache } from "../cache/cache";
import { getIndexed, Indexed, Pack } from "./pack";

export async function readPacked(
	repo: string,
	hash: string,

	cache: Cache,
): Promise<Buffer> {
	const packed = await cache.packs.memo(async () => {
		const packs = [];
		const packsPath = join(repo, ".git", "objects", "pack");

		const packPaths = await readdir(packsPath);
		const idxPaths = packPaths.filter((path) => extname(path) === ".idx");

		for (const idxPath of idxPaths) {
			const idxBuffer = await readFile(join(packsPath, idxPath));
			const packPath = join(packsPath, idxPath.replace(".idx", ".pack"));

			packs.push(new Pack(packPath, idxBuffer));
		}

		return packs;
	}, repo);

	const indexed = await getIndexed(packed, hash);

	if (indexed === undefined) {
		throw new Error("could not get object info");
	}

	return await parse(repo, indexed, cache);
}

interface BytePointer {
	next: number;
}

async function parse(
	repo: string,
	{
		pack,

		buffer,
		offset,
	}: Indexed,

	cache: Cache,
): Promise<Buffer> {
	const pointer: BytePointer = { next: 0 };

	const firstByte = buffer.readUint8(0);
	pointer.next++;

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

	const size = (firstByte & 0b1111) | (decodeSize(buffer, pointer) << 4);

	if (type !== "ofs-delta" && type !== "ref-delta") {
		const objectHead = Buffer.from(`${type} ${size.toFixed()}\0`, "ascii");
		const objectBody = await promisify(inflate)(buffer.subarray(pointer.next));

		return Buffer.concat([objectHead, objectBody]);
	}

	let base: Buffer | undefined;

	if (type === "ofs-delta") {
		const baseOffset = offset - decodeOffset(buffer, pointer);

		base = await pack.materializeOffset(baseOffset);

		if (base === undefined) {
			throw new Error("could not get object info");
		}
	} else {
		const baseHash = buffer.toString("hex", pointer.next, pointer.next + 20);
		pointer.next += 20;

		base = await readPacked(repo, baseHash, cache);
	}

	const delta = await promisify(inflate)(buffer.subarray(pointer.next));
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

		const offset = decodeInstruct("offset", byteMask, instructions, bytePointer);
		const size = decodeInstruct("size", byteMask, instructions, bytePointer);

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
	type: "offset" | "size",
	mask: number,
	buffer: Buffer,
	pointer: BytePointer,
) {
	let value = 0;
	let shift = 0;

	const fm = type === "offset" ? 0 : 4;
	const to = type === "offset" ? 4 : 7;

	for (let i = fm; i < to; i++) {
		value |= (mask >> i) & 1 ? buffer.readUint8(pointer.next++) << shift : 0;
		shift += 8;
	}

	return value;
}
