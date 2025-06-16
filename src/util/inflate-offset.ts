import { open } from "node:fs/promises";
import { createInflate } from "node:zlib";

export async function inflateOffset(path: string, offset: number): Promise<Buffer> {
	const handle = await open(path);
	try {
		const readStream = handle.createReadStream({ start: offset });
		const inflate = readStream.pipe(createInflate());

		const chunks = await Array.fromAsync<Buffer>(inflate);
		readStream.destroy();

		return Buffer.concat(chunks);
	} finally {
		await handle.close();
	}
}
