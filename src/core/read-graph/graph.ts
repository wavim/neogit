import { readFile } from "node:fs/promises";
import { join } from "node:path";

export class Graph {
	readonly genMap = new Map<string, number>();

	static async build(repo: string): Promise<Graph> {
		const path = join(repo, ".git", "objects", "info", "commit-graph");

		return new Graph(await readFile(path));
	}

	constructor(graph: Buffer) {
		const c = graph.readUint8(6);
		const i = c * 12 + 20;
		const oidNumber = graph.readUint32BE(i + 1020);
		const oidLookup = graph.subarray(i + 1024, i + 1024 + oidNumber * 20);
		const cdatChunk = graph.subarray(
			i + 1024 + oidNumber * 20,
			i + 1024 + oidNumber * 56,
		);

		for (let i = 0; i < oidNumber; i++) {
			const oid = oidLookup.toString("hex", i * 20, i * 20 + 20);
			const gen = cdatChunk.readUint32BE(i * 36 + 28) >> 2;

			this.genMap.set(oid, gen);
		}
	}

	findGen(objref: string): number | undefined {
		return this.genMap.get(objref);
	}
}
