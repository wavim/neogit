export function parseObject(buffer: Buffer, type: "commit" | "tree" | "blob" | "tag"): Buffer {
	const headEnd = buffer.indexOf(0);

	const objectType = buffer.toString("ascii", 0, headEnd).split(" ")[0];

	if (objectType !== type) {
		throw new Error(`expected ${type} received ${objectType}`);
	}

	return buffer.subarray(headEnd + 1);
}
