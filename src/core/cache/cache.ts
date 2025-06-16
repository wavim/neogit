import { ReadObjectCache } from "../read-object/read-object";
import { Memo } from "./memo";

export class Cache implements ReadObjectCache {
	buffers = new Memo<Buffer>();
}
