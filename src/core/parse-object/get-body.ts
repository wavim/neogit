export function getBody(type: "commit" | "tree" | "blob" | "tag", data: Buffer): Buffer {
	const headEnd = data.indexOf(0);
	const head = data.toString("ascii", 0, headEnd);

	const objectType = head.split(" ")[0];

	if (objectType !== type) {
		throw new Error("invalid object type");
	}

	return data.subarray(headEnd + 1);
}
