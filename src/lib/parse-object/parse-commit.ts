import { body } from "./body";

export interface Commit {
	tree: string;
	parent: string[];
	author: CommitMeta;
	committer: CommitMeta;
	message: string;
}
interface CommitMeta {
	name: string;
	mail: string;
	time: number;
	zone: number;
}

const metaRegEx =
	/^tree (?<tree>[0-9a-f]{40})\n(?<parent>(?:parent [0-9a-f]{40}\n)*)author (?<aname>.+?) <(?<amail>.*?)> (?<atime>\d+) (?<azone>[+-]\d{4})\ncommitter (?<cname>.+?) <(?<cmail>.*?)> (?<ctime>\d+) (?<czone>[+-]\d{4})/;

export function parseCommit(buffer: Buffer): Commit {
	const commit = body(buffer, "commit").toString();
	const parsed = metaRegEx.exec(commit);

	if (!parsed) {
		throw new Error("corrupt commit object");
	}

	const groups = parsed.groups as Record<
		| "tree"
		| "parent"
		| "aname"
		| "amail"
		| "atime"
		| "azone"
		| "cname"
		| "cmail"
		| "ctime"
		| "czone",
		string
	>;

	return {
		tree: groups.tree,
		parent: groups.parent
			.split("\n")
			.slice(0, -1)
			.map((parent) => parent.slice(7)),
		author: {
			name: groups.aname,
			mail: groups.amail,
			time: +groups.atime,
			zone: zone(groups.azone),
		},
		committer: {
			name: groups.cname,
			mail: groups.cmail,
			time: +groups.ctime,
			zone: zone(groups.czone),
		},
		message: commit.slice(parsed[0].length).trimStart(),
	};
}

const zone = (string: string) => {
	const minutes = +string.slice(1, 3) * 60 + +string.slice(3);

	return string.startsWith("+") ? -minutes : minutes;
};
