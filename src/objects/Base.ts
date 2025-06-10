import { Buffer } from "node:buffer";
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { promisify } from "node:util";
import { inflate } from "node:zlib";

export interface Base {
	repo: string;
	hash: string;
}

export async function read(base: Base): Promise<Buffer> {
	try {
		return await readLoose(base);
	} catch {
		/* empty */
	}

	try {
		return await readPacked(base);
	} catch {
		/* empty */
	}

	throw new Error("could not get object info");
}

async function readLoose(base: Base): Promise<Buffer> {
	const objpath = join(
		base.repo,
		".git",
		"objects",
		base.hash.slice(0, 2),
		base.hash.slice(2),
	);
	const rawdata = await readFile(objpath);
	const payload = await promisify(inflate)(rawdata);

	return payload;
}

async function readPacked(base: Base): Promise<Buffer> {
	const packdir = join(base.repo, ".git", "objects", "pack");

	let packidx!: Buffer;

	let lower = 0;
	let upper = 0;
	let nobjs = 0;

	for (const path of await readdir(packdir)) {
		if (extname(path) !== ".idx") {
			continue;
		}

		const idxpath = join(packdir, path);
		packidx = await readFile(idxpath);

		const fanout = packidx.subarray(2 * 4, 2 * 4 + 256 * 4);
		const fanidx = +`0x${base.hash.slice(0, 2)}`;

		lower = fanout.readUInt32BE((fanidx - 1) * 4);
		upper = fanout.readUInt32BE(fanidx * 4);

		if (lower < upper) {
			nobjs = fanout.readUInt32BE(255 * 4);
			break;
		}
	}

	if (!packidx || lower === upper) {
		throw new Error();
	}

	const objlist = packidx.subarray(
		2 * 4 + 256 * 4,
		2 * 4 + 256 * 4 + nobjs * 20,
	);

	const target = Buffer.from(base.hash, "hex");

	while (lower <= upper) {
		const mid = Math.floor((lower + upper) / 2);

		switch (target.compare(objlist, mid * 20, mid * 20 + 20)) {
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

	const offsetmap = packidx.subarray(
		2 * 4 + 256 * 4 + nobjs * 20 + nobjs * 4,
		2 * 4 + 256 * 4 + nobjs * 20 + nobjs * 4 + nobjs * 4,
	);
	const offsetidx = lower;

	const offset = offsetmap.readUInt32BE(offsetidx * 4);

	console.log(offset);

	throw new Error("not implemented");
}
