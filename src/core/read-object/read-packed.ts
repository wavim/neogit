import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { promisify } from "node:util";
import { inflate } from "node:zlib";
import { Cache } from "../cache/cache";
import { Pack, Packed } from "./pack";

export async function readPacked(
	repo: string,
	hash: string,

	cache: Cache,
): Promise<Buffer> {
	const packs = await cache.packs.memo(async () => {
		const packs: Pack[] = [];
		const packsPath = join(repo, ".git", "objects", "pack");

		const packPaths = await readdir(packsPath);
		const idxPaths = packPaths.filter((path) => extname(path) === ".idx");

		for (const idxPath of idxPaths) {
			const idxBuffer = await readFile(join(packsPath, idxPath));
			const packPath = join(packsPath, idxPath.replace(".idx", ".pack"));

			packs.push(new Pack(idxBuffer, packPath));
		}

		return packs;
	}, repo);

	let pack: Pack | undefined;
	let packed: Packed | undefined;

	for (pack of packs) {
		packed = await pack.queryRef(hash);

		if (packed !== undefined) {
			break;
		}
	}

	if (pack === undefined || packed === undefined) {
		throw new Error("could not get object info");
	}

	return await parse(repo, pack, packed, cache);
}

interface Pointer {
	next: number;
}

async function parse(
	repo: string,
	pack: Pack,
	packed: Packed,

	cache: Cache,
): Promise<Buffer> {
	const { offset, buffer } = packed;
	const pointer: Pointer = { next: 0 };

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
		throw new Error("unsupported object type");
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

		const packed = await pack.queryOfs(baseOffset);
		base = packed?.buffer;

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

	const instructs = delta.subarray(deltaPointer.next);

	const headEnd = base.indexOf(0);
	const baseType = base.toString("ascii", 0, headEnd).split(" ")[0];

	const objectHead = Buffer.from(`${baseType} ${objectSize.toFixed()}\0`, "ascii");
	const objectBody = buildDelta(base.subarray(headEnd + 1), instructs);

	return Buffer.concat([objectHead, objectBody]);
}

function buildDelta(base: Buffer, instructs: Buffer): Buffer {
	const deltas = [];

	while (instructs.byteLength !== 0) {
		const instruction = instructs.readUint8(0);

		if ((instruction & 0x80) === 0) {
			const size = instruction & 0x7f;
			deltas.push(instructs.subarray(1, size + 1));

			instructs = instructs.subarray(size + 1);
			continue;
		}

		const byteMask = instruction & 0x7f;
		const bytePointer: Pointer = { next: 1 };

		const offset = decodeInstruct(instructs, bytePointer, byteMask, "offset");
		const size = decodeInstruct(instructs, bytePointer, byteMask, "size");

		const delta = base.subarray(offset, offset + size);
		deltas.push(delta);

		instructs = instructs.subarray(bytePointer.next);
	}

	return Buffer.concat(deltas);
}

function decodeSize(buffer: Buffer, pointer: Pointer): number {
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

function decodeOffset(buffer: Buffer, pointer: Pointer): number {
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
	pointer: Pointer,

	mask: number,
	type: "offset" | "size",
): number {
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
