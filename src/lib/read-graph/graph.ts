import { readFile } from "node:fs/promises";
import { join } from "node:path";

export class Graph {
	readonly genMap = new Map<string, number>();
	readonly ptsMap = new Map<string, string | null>();

	static async build(repo: string): Promise<Graph | null> {
		const path = join(repo, ".git", "objects", "info", "commit-graph");

		try {
			return new Graph(await readFile(path));
		} catch {
			return null;
		}
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

		const array = [];

		for (let i = 0; i < oidNumber; i++) {
			const oid = oidLookup.toString("hex", i * 20, i * 20 + 20);
			array.push(oid);
		}

		for (let i = 0; i < oidNumber; i++) {
			const j = i * 36;

			const oid = array[i];
			const pt1 = cdatChunk.readUint32BE(j + 20);
			const gen = cdatChunk.readUint32BE(j + 28) >> 2;

			this.genMap.set(oid, gen);

			if (cdatChunk.readUint8(j + 24) & 0x80) {
				continue;
			}
			this.ptsMap.set(oid, pt1 === 0x70_00_00_00 ? null : array[pt1]);
		}
	}

	findGen(objref: string): number | undefined {
		return this.genMap.get(objref);
	}

	findPts(objref: string): string | undefined | null {
		return this.ptsMap.get(objref);
	}
}
