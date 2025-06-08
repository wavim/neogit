import { GitArg } from "../../types";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { inflate } from "node:zlib";

import { err, errno } from "ts-errno";

import { GitObject, GitObjectType } from "./object";

export async function lookupLooseGitObject({
	dir,
	hash,
}: GitArg<{ hash: string }>): Promise<null | GitObject> {
	const path = join(dir, ".git", "objects", hash.slice(0, 2), hash.slice(2));

	let data;
	try {
		data = await readFile(path);
	} catch {
		return null;
	}
	const payload = await promisify(inflate)(data);

	const nullIdx = payload.indexOf(0);
	if (nullIdx === -1) {
		throw err(errno.EINVAL)`Object ${hash} no header.`;
	}
	const header = payload.toString("ascii", 0, nullIdx);

	const [type, size] = header.split(" ");
	if (type === undefined || size === undefined) {
		throw err(errno.EINVAL)`Object ${hash} invalid header.`;
	}
	if (!(type in GitObjectType)) {
		throw err(errno.EINVAL)`Object ${hash} invalid type.`;
	}
	if (+size !== payload.byteLength - header.length - 1) {
		throw err(errno.EINVAL)`Object ${hash} invalid size.`;
	}

	return { hash, type: GitObjectType[type as keyof typeof GitObjectType] };
}
