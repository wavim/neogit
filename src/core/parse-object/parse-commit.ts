import { getBody } from "./get-body";

interface Commit {
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

export function parseCommit(data: Buffer): Commit {
	const payload = getBody("commit", data).toString();

	const regexp = new RegExp(
		"^tree (?<tree>[0-9a-f]{40})\n" +
			"(?<parents>(?:parent [0-9a-f]{40}\n)*)" +
			"author (?<aname>.+?) <(?<aemail>[^>]*)> (?<atimestamp>\\d+) (?<atimezone>[+-]\\d{4})\n" +
			"committer (?<cname>.+?) <(?<cemail>[^>]*)> (?<ctimestamp>\\d+) (?<ctimezone>[+-]\\d{4})" +
			"[\\s\\S]*?\n\n" +
			"(?<message>[\\s\\S]*)$",
	);
	const match = regexp.exec(payload);

	if (!match) {
		throw new Error("corrupt object");
	}

	const groups = match.groups as Record<
		| "tree"
		| "parents"
		| "aname"
		| "aemail"
		| "atimestamp"
		| "atimezone"
		| "cname"
		| "cemail"
		| "ctimestamp"
		| "ctimezone"
		| "message",
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
			timezone: +groups.atimezone,
		},
		committer: {
			name: groups.cname,
			email: groups.cemail,

			timestamp: +groups.ctimestamp,
			timezone: +groups.ctimezone,
		},

		message: groups.message,
	};
}
