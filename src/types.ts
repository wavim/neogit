import { Buffer } from "node:buffer";

export type GitArg<T extends Record<string, unknown>> = { dir: string } & T;

export type RawData = Parameters<typeof Buffer.from>[0];
