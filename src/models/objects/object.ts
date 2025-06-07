import fs from "node:fs/promises";

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

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
		const data = Buffer.concat([header, content]);

		const hash = createHash("sha1").update(data).digest("hex");

		const path = `${dir}/.git/objects/${hash.slice(0, 2)}/${hash.slice(2)}`;
		await fs.writeFile(path, data);

		const object = new GitObject(type, hash);

		return object;
	}
}
