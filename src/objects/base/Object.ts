import { Param } from "../../types/Param";

export type ObjectType = null | "blob" | "tree" | "commit" | "tag";

export class Object {
	dir: string;
	hash: string;

	type: ObjectType = null;

	constructor({ dir, hash }: Param<{ hash: string }>) {
		this.dir = dir;
		this.hash = hash;
	}
}
