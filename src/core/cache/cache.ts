import { ReadObjectCache } from "../read-object/read-object";
import { Bloom } from "./bloom";
import { Memo } from "./memo";

export class Cache implements ReadObjectCache {
	lbloom = new Memo<[string], Bloom>();
	object = new Memo<[string, string], Buffer>();
	offset = new Memo<[string, string], number>();
}
