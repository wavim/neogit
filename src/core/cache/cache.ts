import { Graph } from "../read-graph/graph";
import { ReadGraphCache } from "../read-graph/read-graph";
import { Pack } from "../read-object/pack";
import { ReadObjectCache } from "../read-object/read-object";
import { Bloom } from "./bloom";
import { Memo } from "./memo";

export class Cache implements ReadObjectCache, ReadGraphCache {
	readonly bloom = new Memo<Bloom>();
	readonly packs = new Memo<Pack[]>();
	readonly graph = new Memo<Graph | null>();
}
