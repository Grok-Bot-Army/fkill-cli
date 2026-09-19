const groupByName = processes => {
	const groups = new Map();

	for (const process_ of processes) {
		const existing = groups.get(process_.name);

		if (existing) {
			existing.push(process_);
		} else {
			groups.set(process_.name, [process_]);
		}
	}

	return [...groups.values()];
};

export default groupByName;
