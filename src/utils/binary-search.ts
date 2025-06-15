export function binarySearch(
	lower: number,
	upper: number,
	compare: (bisect: number) => 1 | 0 | -1,
): number | null {
	while (lower <= upper) {
		const bisect = Math.floor((lower + upper) / 2);
		const result = compare(bisect);

		if (result === 0) {
			return bisect;
		}
		if (result > 0) {
			lower = bisect + 1;
		} else {
			upper = bisect - 1;
		}
	}

	return null;
}
