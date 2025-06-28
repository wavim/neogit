import { parseObject } from "./parse-object";

export interface Commit {
	tree: string;

	parents: string[];

	author: CommitMeta;
	committer: CommitMeta;

	message: string;
}

interface CommitMeta {
	name: string;
	email: string;

	timestamp: number;
	timezone: number;
}

export function parseCommit(buffer: Buffer): Commit {
	const payload = parseObject(buffer, "commit").toString();

	const reTree = "tree (?<tree>[0-9a-f]{40})";

	const reParents = "(?<parents>(?:parent [0-9a-f]{40}\n)*)";

	const reAuthor =
		"author (?<aname>.+?) <(?<aemail>[^>]*)> (?<atimestamp>\\d+) (?<atimezone>[+-]\\d{4})";
	const reCommitter =
		"committer (?<cname>.+?) <(?<cemail>[^>]*)> (?<ctimestamp>\\d+) (?<ctimezone>[+-]\\d{4})";

	const head = new RegExp(`^${reTree}\n${reParents}${reAuthor}\n${reCommitter}`).exec(
		payload,
	);

	if (head === null) {
		throw new Error("corrupt commit object");
	}

	const groups = head.groups as Record<
		| "tree"
		| "parents"
		| "aname"
		| "aemail"
		| "atimestamp"
		| "atimezone"
		| "cname"
		| "cemail"
		| "ctimestamp"
		| "ctimezone",
		string
	>;

	return {
		tree: groups.tree,

		parents: groups.parents
			.split("\n")
			.slice(0, -1)
			.map((line) => line.slice(7)),

		author: {
			name: groups.aname,
			email: groups.aemail,

			timestamp: +groups.atimestamp,
			timezone: timezone(groups.atimezone),
		},
		committer: {
			name: groups.cname,
			email: groups.cemail,

			timestamp: +groups.ctimestamp,
			timezone: timezone(groups.ctimezone),
		},

		message: payload.slice(head[0].length).trimStart(),
	};
}

function timezone(raw: string): number {
	const minutes = +raw.slice(1, 3) * 60 + +raw.slice(3);

	return raw.startsWith("+") ? -minutes : minutes;
}
