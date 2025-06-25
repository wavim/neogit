import { Pack } from "../read-object/pack";
import { ReadObjectCache } from "../read-object/read-object";
import { Bloom } from "./bloom";
import { Memo } from "./memo";

export class Cache implements ReadObjectCache {
	readonly bloom = new Memo<Bloom>();
	readonly packs = new Memo<Pack[]>();
}
