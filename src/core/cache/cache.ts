import { Pack } from "../read-object/pack";
import { ReadObjectCache } from "../read-object/read-object";
import { Bloom } from "./bloom";
import { Memo } from "./memo";

export class Cache implements ReadObjectCache {
	lbloom = new Memo<Bloom>();
	object = new Memo<Buffer>();
	packed = new Memo<Pack[]>();
}
