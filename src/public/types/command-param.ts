import { GitCache } from "../../shared/git-cache";

export type CommandParam<T extends Record<string, unknown> = Record<string, unknown>> = {
	repo: string;
	cache?: GitCache;
} & T;
