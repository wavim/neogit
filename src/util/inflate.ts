import { FileHandle } from "node:fs/promises";
import { createInflate } from "node:zlib";

export async function inflateOffset(handle: FileHandle, offset = 0): Promise<Buffer> {
	const readStream = handle.createReadStream({ start: offset, autoClose: false });

	const inflate = readStream.pipe(createInflate());
	const chunks = await Array.fromAsync<Buffer>(inflate);

	return Buffer.concat(chunks);
}
