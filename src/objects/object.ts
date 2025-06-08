import { Buffer } from "node:buffer";
import { hash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { deflate } from "node:zlib";

import { err, errno } from "ts-errno";

import { GitArg, RawData } from "../types";

export enum ObjectType {
	blob,
	tree,
	commit,
	tag,
}

export class GitObject {
	constructor(
		readonly type: ObjectType,
		readonly hash: string,
	) {}

	static async write({
		dir,
		type,
		content,
	}: GitArg<{ type: ObjectType; content: RawData }>): Promise<GitObject> {
		const buffer = Buffer.isBuffer(content)
			? content
			: Buffer.from(content);
		const header = Buffer.from(
			`${ObjectType[type]} ${buffer.byteLength}\0`,
			"ascii",
		);
		const payload = Buffer.concat([header, buffer]);

		const sha1 = hash("sha1", payload, "hex");
		const data = await promisify(deflate)(payload, { level: 1 });

		const loosePath = join(
			dir,
			".git",
			"objects",
			sha1.slice(0, 2),
			sha1.slice(2),
		);
		await mkdir(dirname(loosePath), { recursive: true });
		try {
			await writeFile(loosePath, data, { flag: "wx" });
		} catch (e) {
			throw err(errno.EEXIST, e)`Git object ${sha1} is immutable.`;
		}

		const looseObject = new GitObject(type, sha1);

		return looseObject;
	}
}
