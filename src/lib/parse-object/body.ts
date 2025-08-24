export function body(buffer: Buffer, type: "commit" | "tree" | "blob" | "tag"): Buffer {
	const headEnd = buffer.indexOf(0);
	const objType = buffer.toString("ascii", 0, headEnd).split(" ")[0];

	if (objType !== type) {
		throw new Error(`expected ${type} but received ${objType}`);
	}

	return buffer.subarray(headEnd + 1);
}
