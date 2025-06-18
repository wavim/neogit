import { GetParentsCache } from "../get-parents/get-parents";
import { ReadObjectCache } from "../read-object/read-object";
import { Memo } from "./memo";

export class Cache implements ReadObjectCache, GetParentsCache {
	buffers = new Memo<[string, string], Buffer>();
	parents = new Memo<[string, string], string[]>();
}
