import { GitCache } from "../../shared/cache";

export type GitApiParam<T extends Record<string, unknown> = Record<string, unknown>> = {
	repo: string;
	cache: GitCache;
} & T;
