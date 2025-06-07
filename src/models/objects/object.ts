import { Buffer } from "node:buffer";
import { hash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
import { deflate } from "node:zlib";

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
	}: {
		dir: string;
		type: ObjectType;
		content: Buffer;
	}): Promise<GitObject> {
		const header = Buffer.from(
			`${ObjectType[type]} ${content.byteLength}\0`,
		);
		const payload = Buffer.concat([header, content]);

		const sha1 = hash("sha1", payload, "hex");
		const data = await promisify(deflate)(payload);

		const path = `${dir}/.git/objects/${sha1.slice(0, 2)}/${sha1.slice(2)}`;

		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, data, { flag: "wx" });

		const object = new GitObject(type, sha1);

		return object;
	}
}
