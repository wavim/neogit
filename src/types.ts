import { Buffer } from "node:buffer";

import { GitObject } from "./objects/object";

export type RawData = Parameters<typeof Buffer.from>[0];

export interface Cache {
	objects: Record<string, GitObject>;
}

export type GitArg<T extends Record<string, unknown>> = {
	dir: string;
	cache?: Cache;
} & T;
