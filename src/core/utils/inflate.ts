import { promisify } from "node:util";
import { inflate as _inflate } from "node:zlib";

export const inflate = promisify(_inflate);
