import { Buffer } from "node:buffer";
import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { promisify } from "node:util";
import { inflate } from "node:zlib";

export interface Base {
	repo: string;
	hash: string;
}

export async function readObj(obj: Base): Promise<Buffer> {
	try {
		return await readLoose(obj);
	} catch {
		/* empty */
	}

	try {
		return await readPacked(obj);
	} catch {
		/* empty */
	}

	throw new Error("could not get object info");
}

async function readLoose(obj: Base): Promise<Buffer> {
	const objpath = join(
		obj.repo,
		".git",
		"objects",
		obj.hash.slice(0, 2),
		obj.hash.slice(2),
	);
	const rawdata = await readFile(objpath);
	const payload = await promisify(inflate)(rawdata);

	return payload;
}

async function readPacked(obj: Base): Promise<Buffer> {
	const packdir = join(obj.repo, ".git", "objects", "pack");

	let idx;

	let packpath;

	let lower = 0;
	let upper = 0;
	let nobjs = 0;

	for (const path of await readdir(packdir)) {
		if (extname(path) !== ".idx") {
			continue;
		}

		const idxpath = join(packdir, path);
		idx = await readFile(idxpath);

		const fanidx = +`0x${obj.hash.slice(0, 2)}`;
		const fanout = idx.subarray(2 * 4, 2 * 4 + 256 * 4);

		lower = fanidx > 0 ? fanout.readUInt32BE((fanidx - 1) * 4) : 0;
		upper = fanout.readUInt32BE(fanidx * 4);

		if (lower < upper) {
			packpath = join(packdir, basename(path, ".idx") + ".pack");

			nobjs = fanout.readUInt32BE(255 * 4);

			break;
		}
	}

	if (!idx || !packpath) {
		throw new Error();
	}

	const shalist = idx.subarray(2 * 4 + 256 * 4, 2 * 4 + 256 * 4 + nobjs * 20);

	upper--;
	const target = Buffer.from(obj.hash, "hex");

	while (lower <= upper) {
		const mid = Math.floor((lower + upper) / 2);

		switch (target.compare(shalist, mid * 20, mid * 20 + 20)) {
			case 1: {
				lower = mid + 1;
				continue;
			}
			case 0: {
				break;
			}
			case -1: {
				upper = mid - 1;
				continue;
			}
		}
		break;
	}

	if (lower > upper) {
		throw new Error();
	}

	const ofs32idx = lower;
	const ofs32map = idx.subarray(
		2 * 4 + 256 * 4 + nobjs * 20 + nobjs * 4,
		2 * 4 + 256 * 4 + nobjs * 20 + nobjs * 4 + nobjs * 4,
	);

	let offset = ofs32map.readUInt32BE(ofs32idx * 4);

	if (offset & 0x80_00_00_00) {
		const ofs64idx = offset & 0x7f_ff_ff_ff;
		const ofs64map = idx.subarray(
			2 * 4 + 256 * 4 + nobjs * 20 + nobjs * 4 + nobjs * 4,
			-(20 + 20),
		);

		const offset64 = ofs64map.readBigUInt64BE(ofs64idx * 8);

		if (offset64 > Number.MAX_SAFE_INTEGER) {
			throw new Error();
		}

		offset = Number(offset64);
	}

	const pack = await readFile(packpath);

	let byte = pack.readUint8(offset++);

	const type = [
		"invalid",
		"commit",
		"tree",
		"blob",
		"tag",
		"reserved",
		"ofs-delta",
		"ref-delta",
	][(byte >> 4) & 0b0111];

	let size = byte & 0b1111;
	let shift = 4;

	while (byte & 0x80) {
		byte = pack.readUint8(offset++);

		size |= (byte & 0x7f) << shift;
		shift += 7;
	}

	const header = Buffer.from(`${type} ${size.toFixed()}\0`, "ascii");

	const rawdata = pack.subarray(offset);
	const content = await promisify(inflate)(rawdata);

	const payload = Buffer.concat([header, content]);

	return payload;
}
