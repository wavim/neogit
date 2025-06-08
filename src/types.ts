import { type GitObject } from "./objects/object/object";

export interface Cache {
	objects?: Record<string, GitObject>;
}

export type GitArg<T extends Record<string, unknown>> = {
	dir: string;
	cache?: Cache;
} & T;
