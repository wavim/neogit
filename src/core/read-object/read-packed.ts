import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { Cache } from "../cache/cache";

export function readPacked(
	repo: string,
	hash: string,

	cache: Cache,
): Promise<Buffer> {
	return cache.object.memo(() => read(repo, hash, cache), repo, hash);
}

async function read(
	repo: string,
	hash: string,

	cache: Cache,
): Promise<Buffer> {
	const offset = await cache.offset.memo(() => getOffset(repo, hash, cache), repo, hash);
	console.log("offset", offset);

	return await readFromPack();
}

// MO FIX forgot to get packPath, consider caching repo + pack -> offset{}
async function getOffset(
	repo: string,
	hash: string,

	cache: Cache,
): Promise<number> {
	const packsPath = join(repo, ".git", "objects", "pack");

	for (const path of await readdir(packsPath)) {
		if (extname(path) !== ".idx") {
			continue;
		}

		const idxBuffer = await readFile(join(packsPath, path));

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

		for (let i = 0; i < oidCount; i++) {
			const oid = oidLookup.toString("hex", i * 20, i * 20 + 20);
			const ofs = ofsLookup.readUint32BE(i * 4);

			cache.offset.set(ofs, repo, oid);
		}

		if (cache.offset.has(repo, hash)) break;
	}

	const offset = cache.offset.get(repo, hash);

	if (offset) {
		return offset;
	}

	throw new Error("cannot get object info");
}

// interface BytePointer {
// 	next: number;
// }

async function readFromPack(): Promise<Buffer> {
	await new Promise((res) => {
		res(69);
	});

	return Buffer.alloc(0);

	// const pack = await open(path);

	// const { buffer: head } = await pack.read({ buffer: Buffer.alloc(5), position: offset });
	// const headPointer: BytePointer = { next: 0 };

	// const firstByte = head.readUint8(0);
	// headPointer.next++;

	// const types = [
	// 	"invalid",
	// 	"commit",
	// 	"tree",
	// 	"blob",
	// 	"tag",
	// 	"reserved",
	// 	"ofs-delta",
	// 	"ref-delta",
	// ] as const;
	// const type = types[(firstByte >> 4) & 0b0111];

	// if (type === "invalid" || type === "reserved") {
	// 	throw new Error();
	// }

	// const size = (firstByte & 0b1111) | (decodeSize(head, headPointer) << 4);

	// if (type !== "ofs-delta" && type !== "ref-delta") {
	// 	await pack.close();

	// 	const objectHead = Buffer.from(`${type} ${size.toFixed()}\0`, "ascii");
	// 	const objectBody = await inflateOffset(path, offset + headPointer.next);

	// 	return Buffer.concat([objectHead, objectBody]);
	// }

	// let base: Buffer | undefined;
	// const basePointer: BytePointer = { next: 0 };

	// if (type === "ofs-delta") {
	// 	const { buffer: ofsHead } = await pack.read({
	// 		buffer: Buffer.alloc(8),
	// 		position: offset + headPointer.next,
	// 	});
	// 	const baseOffset = offset - decodeOffset(ofsHead, basePointer);

	// 	base = await readFromPack(repo, path, baseOffset, cache);
	// } else {
	// 	const { buffer: refHead } = await pack.read({
	// 		buffer: Buffer.alloc(20),
	// 		position: offset + headPointer.next,
	// 	});
	// 	const baseHash = refHead.toString("hex");
	// 	basePointer.next += 20;

	// 	base = await readPacked(repo, baseHash, cache);
	// }

	// await pack.close();

	// const delta = await inflateOffset(path, offset + headPointer.next + basePointer.next);
	// const deltaPointer = { next: 0 };

	// decodeSize(delta, deltaPointer);
	// const objectSize = decodeSize(delta, deltaPointer);

	// const instructions = delta.subarray(deltaPointer.next);

	// const baseHeadEnd = base.indexOf(0);
	// const objectBody = buildDelta(base.subarray(baseHeadEnd + 1), instructions);

	// const baseHead = base.subarray(0, baseHeadEnd);
	// const baseType = baseHead.toString("ascii").split(" ")[0];
	// const objectHead = Buffer.from(`${baseType} ${objectSize.toFixed()}\0`, "ascii");

	// return Buffer.concat([objectHead, objectBody]);
}

// function buildDelta(base: Buffer, instructions: Buffer): Buffer {
// 	const deltas = [];

// 	while (instructions.byteLength !== 0) {
// 		const instruction = instructions.readUint8(0);

// 		if ((instruction & 0x80) === 0) {
// 			const size = instruction & 0x7f;
// 			deltas.push(instructions.subarray(1, size + 1));

// 			instructions = instructions.subarray(size + 1);
// 			continue;
// 		}

// 		const byteMask = instruction & 0x7f;
// 		const bytePointer: BytePointer = { next: 1 };

// 		const offset = decodeInstruct("offset", instructions, byteMask, bytePointer);
// 		const size = decodeInstruct("size", instructions, byteMask, bytePointer);

// 		const delta = base.subarray(offset, offset + size);
// 		deltas.push(delta);

// 		instructions = instructions.subarray(bytePointer.next);
// 	}

// 	return Buffer.concat(deltas);
// }

// function decodeSize(buffer: Buffer, pointer: BytePointer): number {
// 	let byte = 0;
// 	let size = 0;
// 	let shift = 0;

// 	do {
// 		byte = buffer.readUint8(pointer.next++);
// 		size |= (byte & 0x7f) << shift;
// 		shift += 7;
// 	} while (byte & 0x80);

// 	return size;
// }

// function decodeOffset(buffer: Buffer, pointer: BytePointer): number {
// 	let byte = buffer.readUint8(pointer.next++);
// 	let offset = byte & 0x7f;

// 	while (byte & 0x80) {
// 		byte = buffer.readUint8(pointer.next++);
// 		offset++;
// 		offset <<= 7;
// 		offset |= byte & 0x7f;
// 	}

// 	return offset;
// }

// function decodeInstruct(
// 	type: "offset" | "size",
// 	buffer: Buffer,
// 	mask: number,
// 	pointer: BytePointer,
// ) {
// 	let value = 0;
// 	let shift = 0;

// 	const fm = type === "offset" ? 0 : 4;
// 	const to = type === "offset" ? 4 : 7;

// 	for (let i = fm; i < to; i++) {
// 		value |= (mask >> i) & 1 ? buffer.readUint8(pointer.next++) << shift : 0;
// 		shift += 8;
// 	}

// 	return value;
// }
