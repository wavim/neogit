export type Param<T extends Record<string, unknown> = Record<string, unknown>> =
	{ dir: string } & T;
