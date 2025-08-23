import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { Cache } from "../cache/cache";
import { inflate } from "../utils/inflate";
import { Pack, Packed } from "./pack";

const ENOOBJ = new Error("could not get object info");

export async function readPacked(
	repo: string,
	hash: string,

	cache: Cache,
): Promise<Buffer> {
	const packs = await cache.packs.memo(async () => {
		const packsPath = join(repo, ".git", "objects", "pack");
		const files = await readdir(packsPath);

		const packs = files
			.filter((path) => extname(path) === ".pack")
			.map((pack) => Pack.build(packsPath, pack));
		return await Promise.all(packs);
	}, repo);

	for (const pack of packs) {
		const packed = await pack.readRef(hash);

		if (packed) {
			return await read(pack, packed);
		}
	}
	throw ENOOBJ;
}

interface Offset {
	_: number;
}

async function read(pack: Pack, packed: Packed): Promise<Buffer> {
	const buffer = packed.buffer;
	const header = buffer.readUint8();
	const offset = { _: 1 } as Offset;

	// ref-delta is not supported, since pack is self-contained
	const type = ([null, "commit", "tree", "blob", "tag", null, "ofs-delta", null] as const)[
		(header >> 4) & 0b0111
	];
	if (type === null) {
		throw ENOOBJ;
	}

	const size = (header & 0b1111) | (decLen(buffer, offset) << 4);

	if (type !== "ofs-delta") {
		const head = Buffer.from(`${type} ${size}\0`, "ascii");
		const body = await inflate(buffer.subarray(offset._));

		return Buffer.concat([head, body]);
	}

	const baseOffset = packed.offset - decOfs(buffer, offset);
	const basePacked = await pack.readOfs(baseOffset);

	if (!basePacked) {
		throw ENOOBJ;
	}
	const base = await read(pack, basePacked);

	const terminator = base.indexOf(0);
	const objectType = base.toString("ascii", 0, terminator).split(" ")[0];

	const delta = await inflate(buffer.subarray(offset._));
	const deltaOffset = { _: 0 } as Offset;

	decLen(delta, deltaOffset);
	const objectSize = decLen(delta, deltaOffset);
	const instructs = delta.subarray(deltaOffset._);

	const objectHead = Buffer.from(`${objectType} ${objectSize}\0`, "ascii");
	const objectBody = buildDeltas(base.subarray(terminator + 1), instructs);

	return Buffer.concat([objectHead, objectBody]);
}

function buildDeltas(base: Buffer, instructs: Buffer): Buffer {
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
		const byteOffset: Offset = { _: 1 };

		const ofs = decCpy(instructs, byteOffset, byteMask);
		const len = decCpy(instructs, byteOffset, byteMask >> 4);

		deltas.push(base.subarray(ofs, ofs + len));
		instructs = instructs.subarray(byteOffset._);
	}

	return Buffer.concat(deltas);
}

function decLen(buf: Buffer, ofs: Offset): number {
	let b = 0;
	let s = 0;
	let x = 0;

	do {
		b = buf.readUint8(ofs._++);
		x |= (b & 0x7f) << s;
		s += 7;
	} while (b & 0x80);

	return x;
}

function decOfs(buf: Buffer, ofs: Offset): number {
	let b = buf.readUint8(ofs._++);
	let x = b & 0x7f;

	while (b & 0x80) {
		b = buf.readUint8(ofs._++);
		x = ((x + 1) << 7) | (b & 0x7f);
	}

	return x;
}

function decCpy(buf: Buffer, ofs: Offset, mask: number): number {
	let s = 0;
	let x = 0;

	for (let i = 0; i < 4; i++) {
		x |= (mask >> i) & 1 && buf.readUint8(ofs._++) << s;
		s += 8;
	}

	return x;
}
