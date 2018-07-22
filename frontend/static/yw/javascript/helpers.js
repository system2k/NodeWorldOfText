// 95% of the original file removed.

function assert(exp, optMsg) {
	if (!exp) {
		throw new Error(optMsg || "Assertion failed");
	}
}

function intmax(ints) {
	if(typeof ints == "number") ints = [ints];
	for(var i = 0; i < ints.length; i++)
		if(ints[i] > Number.MAX_SAFE_INTEGER || ints[i] < Number.MIN_SAFE_INTEGER) return false;
	return true;
}