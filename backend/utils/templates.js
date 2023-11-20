/*
	HTML Templating Engine
*/

var set_num = "0123456789";
var set_fnum = set_num + ".-";
var set_var = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_";
var set_fvar = set_var + set_num;
var set_space = ["\u0009", "\u000A", "\u000D", "\u0020", "\u00A0"];
var set_sym1 = "<>=|&!";
var set_sym2 = "[],.";

function isNumChar(chr) {
	return set_num.includes(chr);
}

function isFullNumChar(chr) {
	return set_fnum.includes(chr);
}

function isFullVarChar(chr) {
	return set_fvar.includes(chr);
}

function isVarChar(chr) {
	return set_var.includes(chr);
}

function isCmpChar(chr) {
	return set_sym1.includes(chr);
}

function isSymChar(chr) {
	return set_sym2.includes(chr);
}

function isSpaceChar(chr) {
	return set_space.includes(chr);
}

function checkNotChain(str) {
	var count = 0;
	if(!str.length) return null;
	for(var i = 0; i < str.length; i++) {
		if(str[i] == "!") {
			count++;
		} else {
			return null;
		}
	}
	return count;
}

function escapeHTML(h) {
	h += "";
	h = h.replace(/\&/g, "&amp;");
	h = h.replace(/\</g, "&lt;");
	h = h.replace(/\>/g, "&gt;");
	h = h.replace(/\0/g, " ");
	h = h.replace(/\"/g, "&quot;");
	h = h.replace(/\'/g, "&#39;");
	h = h.replace(/\\/g, "&#x5C;");
	return h;
}

function SyntaxError(row, col) {
    return Error("Unexpected token at row " + (row + 1) + ", column " + (col + 1));
}

function tokenizeControl(input, row, col) {
	var chr;
	var idx = 0;
	row = row || 0;
	col = col || 0;
	var prevPos = [idx, row, col];
	function next() {
		prevPos[0] = idx;
		prevPos[1] = row;
		prevPos[2] = col;
		var nc = input[idx++];
		col++;
		if(nc == "\n") {
			row++;
			col = 0;
		}
		return nc;
	}
	function back() {
		idx = prevPos[0];
		row = prevPos[1];
		col = prevPos[2];
		chr = input[idx];
	}
	function peek() {
		return input[idx];
	}
	function getPos() {
		return [row, col];
	}
	function consumeText() {
		var res = "";
		while(true) {
			chr = next();
			if(!chr) break;
			if(!isFullVarChar(chr)) {
				back();
				break;
			}
			res += chr;
		}
		return res;
	}
	function consumeSymCmp() {
		var res = "";
		while(true) {
			chr = next();
			if(!chr) break;
			if(!isCmpChar(chr)) {
				back();
				break;
			}
			res += chr;
		}
		return res;
	}
	function consumeNumber() {
		var intval = "";
		var decval = "";
		var negative = false;
		var number = false;
		var decimal = false;
		while(true) {
			chr = next();
			if(!chr) break;
			if(!isFullNumChar(chr)) {
				back();
				break;
			}
			if(chr == "-") {
				if(number || decimal || negative) {
					throw SyntaxError(row, col);
				}
				negative = true;
				continue;
			}
			if(chr == ".") {
				if(negative || decimal) {
					throw SyntaxError(row, col);
				}
				decimal = true;
				continue;
			}
			if(decimal) {
				decval += chr;
			} else {
				intval += chr;
				number = true;
			}
		}
		if(!intval && !decval) {
			return null;
		}
		var num = Number(intval + "." + decval);
		if(negative) num = -num;
		return num;
	}
	function consumeString(quoteMarker) {
		var res = "";
		while(true) {
			chr = next();
			if(!chr) break;
			if(chr == quoteMarker) {
				break;
			}
			if(chr == "\\") {
				chr = next();
				if(chr == "r") {
					res += "\r";
				} else if(chr == "n") {
					res += "\n";
				} else if(chr == "t") {
					res += "\t";
				} else {
					res += chr;
				}
				continue;
			}
			res += chr;
		}
		return res;
	}
	function consumeGroup() {
		var str = "";
		var level = 1;
		while(true) {
			chr = next();
			if(!chr) {
				// mismatched parenthesis
				throw SyntaxError(row, col);
			}
			if(chr == ")") {
				level--;
				if(level <= 0) {
					break;
				}
			} else if(chr == "(") {
				level++;
			}
			str += chr;
		}
		return str;
	}
	var tokens = [];
	while(true) {
		chr = next();
		if(!chr) break;
		if(isSpaceChar(chr)) continue;
		if(isVarChar(chr)) {
			back();
			var pos = getPos();
			var text = consumeText();
			tokens.push({
				type: "text",
				pos: pos,
				value: text
			});
			continue;
		}
		if(chr == ".") {
			var numNext = isNumChar(peek());
			if(numNext) {
				back();
				var num = consumeNumber();
				tokens.push({
					type: "num",
					pos: pos,
					value: num
				});
			} else {
				tokens.push({
					type: "sym",
					pos: pos,
					value: "."
				});
			}
			continue;
		}
		if(isFullNumChar(chr)) {
			back();
			var pos = getPos();
			var num = consumeNumber();
			tokens.push({
				type: "num",
				pos: pos,
				value: num
			});
			continue;
		}
		if(isCmpChar(chr)) {
			back();
			var pos = getPos();
			var sym = consumeSymCmp();
			var type = "";
			if(sym == "<") {
				type = "lt";
			} else if(sym == ">") {
				type = "gt";
			} else if(sym == "<=") {
				type = "lte";
			} else if(sym == ">=") {
				type = "gte";
			} else if(sym == "==") {
				type = "eq";
			} else if(sym == "!=") {
				type = "neq";
			} else if(sym == "&&") {
				type = "and";
			} else if(sym == "||") {
				type = "or";
			} else if(sym == "|") {
				type = "filter";
			} else {
				var not = checkNotChain(sym);
				if(not) {
					tokens.push({
						type: "not",
						pos: pos,
						count: not
					});
					continue;
				}
				throw SyntaxError(row, col);
			}
			tokens.push({
				type: type,
				pos: pos
			});
			continue;
		}
		if(isSymChar(chr)) {
			var pos = getPos();
			tokens.push({
				type: "sym",
				pos: pos,
				value: chr
			});
			continue;
		}
		if(chr == "\"" || chr == "'") {
			var pos = getPos();
			var str = consumeString(chr);
			tokens.push({
				type: "str",
				pos: pos,
				value: str
			});
			continue;
		}
		if(chr == "(") {
			var pos = getPos();
			var group = consumeGroup();
			tokens.push({
				type: "group",
				pos: pos,
				value: tokenizeControl(group)
			});
			continue;
		}
		// unrecognized symbol
		throw SyntaxError(row, col);
	}
	return tokens;
}

function sharedConsumeVariablePath(next, back) {
	var part;
	var path = [];
	var stack = [];
	var head = path;
	var varModeType = {
		none: 0,
		variable: 1,
		dot: 2,
		startbracket: 3
	};
	var mode = varModeType.none;
	while(true) {
		part = next();
		if(!part) break;
		if(part.type == "text") {
			if(mode == varModeType.none || mode == varModeType.dot || mode == varModeType.startbracket) {
				mode = varModeType.variable;
				head.push(part.value);
				continue;
			}
			throw "Invalid token";
		}
		if(part.type == "sym" && part.value == ".") {
			if(mode == varModeType.variable) {
				mode = varModeType.dot;
				continue;
			}
			throw "Invalid token";
		}
		// square bracket accessor
		// if a string is contained within square brackets, it's a property accessor
		// otherwise, it's a sub-query for a value
		if(part.type == "sym" && part.value == "[") {
			if(mode != varModeType.variable) {
				throw "Invalid token";
			}
			part = next(true);
			if(part.type == "str" || part.type == "num") {
				var prop = part.value;
				part = next(true);
				if(part.type == "sym" && part.value == "]") {
					head.push(prop);
					continue;
				}
				throw "Unexpected token";
			}
			back();
			var container = [];
			head.push(container);
			stack.push(head);
			head = container;
			mode = varModeType.startbracket;
			continue;
		}
		if(part.type == "sym" && part.value == "]") {
			head = stack.pop();
			continue;
		}
		// unrecognized token - stop there
		back();
		break;
	}
	if(mode == varModeType.dot || mode == varModeType.startbracket) {
		throw "Unexpected token";
	}
	return path;
}

function organizeIfStmt(tokens) {
	// the main goal of this function is to validate an if-statement
	var part;
	var result = [];
	var part;
	var idx = 0;
	var row = 0;
	var col = 0;
	var prevPos = [0, 0, 0];
	function next(assertNonempty) {
		prevPos[0] = idx;
		prevPos[1] = row;
		prevPos[2] = col;
		var nc = tokens[idx++];
		if(assertNonempty) {
			if(!nc) {
				throw "Missing token";
			}
		}
		return nc;
	}
	function back() {
		idx = prevPos[0];
		row = prevPos[1];
		col = prevPos[2];
		part = tokens[idx];
	}
	
	var modeType = {
		none: 0,
		object: 1,
		compare: 2,
		not: 3
	};
	var mode = modeType.none;
	
	while(true) {
		part = next();
		if(!part) break;
		if(part.type == "text") {
			if(mode == modeType.object) {
				throw "Unexpected token";
			}
			back();
			var variable = sharedConsumeVariablePath(next, back);
			result.push({
				type: "variable",
				value: variable
			});
			mode = modeType.object;
			continue;
		}
		if(part.type == "num") {
			if(mode == modeType.object) {
				throw "Unexpected token";
			}
			result.push({
				type: "num",
				value: part.value
			});
			mode = modeType.object;
			continue;
		}
		if(part.type == "str") {
			if(mode == modeType.object) {
				throw "Unexpected token";
			}
			result.push({
				type: "str",
				value: part.value
			});
			mode = modeType.object;
			continue;
		}
		if(part.type == "not") {
			if(mode == modeType.object || mode == modeType.not) {
				throw "Unexpected token";
			}
			result.push({
				type: "not",
				count: part.count
			});
			mode = modeType.not;
			continue;
		}
		switch(part.type) {
			case "lt":
			case "gt":
			case "lte":
			case "gte":
			case "eq":
			case "neq":
			case "and":
			case "or":
				if(mode != modeType.object) {
					throw "Unexpected token";
				}
				result.push({
					type: part.type
				});
				mode = modeType.compare;
				continue;
		}
		if(part.type == "group") {
			if(mode == modeType.object) {
				throw "Unexpected token";
			}
			var subtokens = part.value;
			result.push({
				type: "exec",
				exec: organizeIfStmt(subtokens)
			});
			mode = modeType.object;
			continue;
		}
		throw "Unexpected token";
	}
	return result;
}

function combineIfStmt(tokens) {
	// guarantee: there is a token before and after a comparison operator
	// combine all NOT statements
	for(var i = 0; i < tokens.length; i++) {
		var part = tokens[i];
		if(part.type == "not") {
			var t2 = tokens[i + 1];
			tokens[i] = {
				type: "not",
				count: part.count,
				x: t2
			};
			tokens.splice(i + 1, 1);
			// ensure that we do not go over the same 'not' operator again
		}
	}
	// process all sub-groups
	for(var i = 0; i < tokens.length; i++) {
		var part = tokens[i];
		if(part.type == "exec") {
			part.exec = combineIfStmt(part.exec);
		}
	}
	// combine in order: comparisons, AND, OR
	for(var i = 0; i < 3; i++) {
		for(var j = 0; j < tokens.length; j++) {
			var part = tokens[j];
			var type = part.type;
			var check = false;
			switch(i) {
				case 0:
					switch(type) {
						case "eq":
						case "neq":
						case "lt":
						case "gt":
						case "lte":
						case "gte":
							check = true;
					}
					break;
				case 1:
					check = (type == "and");
					break;
				case 2:
					check = (type == "or");
					break;
			}
			if(check) {
				var t1 = tokens[j - 1];
				var t2 = tokens[j + 1];
				tokens[j - 1] = {
					type: type,
					x: t1,
					y: t2
				};
				tokens.splice(j, 2);
				j--;
			}
		}
	}
	return tokens;
}

function organizeForStmt(tokens) {
	var part;
	var idx = 0;
	var row = 0;
	var col = 0;
	var prevPos = [0, 0, 0];
	function next(assertNonempty) {
		prevPos[0] = idx;
		prevPos[1] = row;
		prevPos[2] = col;
		var nc = tokens[idx++];
		if(assertNonempty) {
			if(!nc) {
				throw "Missing token";
			}
		}
		return nc;
	}
	function back() {
		idx = prevPos[0];
		row = prevPos[1];
		col = prevPos[2];
		part = tokens[idx];
	}
	var modeType = {
		none: 0,
		variable: 1,
		comma: 2,
		inliteral: 3,
		righthand: 4
	};
	var mode = modeType.none;
	var varList = [];
	var destPath = null;
	while(true) {
		part = next();
		if(!part) {
			if(mode != modeType.righthand) {
				throw "Missing token";
			}
			break;
		}
		if(mode == modeType.righthand) {
			throw "Unexpected token";
		}
		if(part.type == "text") {
			if(part.value == "in") {
				if(mode != modeType.variable) {
					throw "Unexpected token";
				}
				mode = modeType.inliteral;
				continue;
			}
			if(mode == modeType.none || mode == modeType.comma) {
				varList.push(part.value);
				mode = modeType.variable;
				continue;
			} else if(mode == modeType.inliteral) {
				back();
				destPath = sharedConsumeVariablePath(next, back);
				mode = modeType.righthand;
				continue;
			}
			throw "Unexpected token";
		}
		if(part.type == "sym" && part.value == ",") {
			if(mode != modeType.variable) {
				throw "Unexpected token";
			}
			mode = modeType.comma;
			continue;
		}
	}
	return {
		iterators: varList,
		destination: destPath
	};
}

function scanControlBlock(tokens) {
	var part;
	var idx = 0;
	var row = 0;
	var col = 0;
	var prevPos = [0, 0, 0];
	function next() {
		prevPos[0] = idx;
		prevPos[1] = row;
		prevPos[2] = col;
		var nc = tokens[idx++];
		return nc;
	}
	function back() {
		idx = prevPos[0];
		row = prevPos[1];
		col = prevPos[2];
		part = tokens[idx];
	}
	part = next();
	var blockType = null;
	if(part.type == "text") {
		if(part.value == "else") {
			part = next();
			if(!part) {
				blockType = "else";
			} else {
				if(part.type == "text" && part.value == "if") {
					blockType = "elseif";
				}
			}
		} else {
			blockType = part.value;
		}
	} else {
		throw "Unexpected token";
	}
	if(blockType == "if") {
		tokens.splice(0, 1);
		var cond = combineIfStmt(organizeIfStmt(tokens));
		if(!cond.length) {
			throw "Empty If block";
		} else if(cond.length == 1) {
			cond = cond[0];
		} else {
			throw "Unexpected token";
		}
		return {
			type: "if",
			cond: cond
		};
	} else if(blockType == "elseif") {
		tokens.splice(0, 2);
		var cond = combineIfStmt(organizeIfStmt(tokens));
		if(!cond.length) {
			throw "Empty ElseIf block";
		} else if(cond.length == 1) {
			cond = cond[0];
		} else {
			throw "Unexpected token";
		}
		return {
			type: "elseif",
			cond: cond
		};
	} else if(blockType == "for") {
		tokens.splice(0, 1);
		var forStmt = organizeForStmt(tokens);
		return {
			type: "for",
			iterators: forStmt.iterators,
			destination: forStmt.destination
		};
	} else if(blockType == "block") {
		part = next();
		if(!part) {
			throw "Missing token";
		}
		var blockname = null;
		if(part.type == "text" || part.type == "str") {
			blockname = part.value;
		} else {
			throw "Unexpected token";
		}
		return {
			type: "block",
			name: blockname
		}
	} else if(blockType == "extends") {
		part = next();
		if(!part) {
			throw "Missing token";
		}
		var pathname = null;
		if(part.type == "str") {
			pathname = part.value;
		} else {
			throw "Unexpected token";
		}
		return {
			type: "extends",
			path: pathname
		};
	} else if(blockType == "endif" || blockType == "else" || blockType == "endfor" || blockType == "endblock") {
		if(next()) {
			throw "Unexpected token";
		}
		return {
			type: blockType
		};
	} else {
		throw "Unrecognized block type";
	}
}

function scanVariableBlock(tokens) {
	var part;
	var idx = 0;
	var row = 0;
	var col = 0;
	var prevPos = [0, 0, 0];
	function next() {
		prevPos[0] = idx;
		prevPos[1] = row;
		prevPos[2] = col;
		var nc = tokens[idx++];
		return nc;
	}
	function back() {
		idx = prevPos[0];
		row = prevPos[1];
		col = prevPos[2];
		part = tokens[idx];
	}
	var path = null;
	var filter = null;
	var filterArg = null;
	part = next();
	if(!part) {
		throw "Missing token";
	}
	if(part.type == "text") {
		back();
		path = sharedConsumeVariablePath(next, back);
	} else {
		throw "Unexpected token";
	}
	
	part = next();
	if(part) {
		if(part.type == "filter") {
			part = next();
			if(!part) {
				throw "Missing token";
			}
			if(part.type == "text") {
				filter = part.value;
			} else {
				throw "Unexpected token";
			}
			part = next();
			if(part) { // argument modifier
				if(part.type == "group") {
					var args = part.value;
					if(args.length == 1) {
						var arg = args[0];
						if(arg.type == "str" || arg.type == "num") {
							filterArg = arg.value;
						} else {
							throw "Unexpected token";
						}
					} else if(args.length > 1) {
						throw "Too many arguments";
					}
				} else {
					throw "Unexpected token";
				}
			}
			if(next()) {
				throw "Unexpected token";
			}
		} else {
			throw "Unexpected token";
		}
	}
	return {
		type: "variable",
		path: path,
		filter: filter,
		filterArg: filterArg
	};
}

function parseTemplate(input) {
	var tokens = [];
	var chr;
	var idx = 0;
	var row = 0;
	var col = 0;
	var prevPos = [idx, row, col];
	var prevCtx = [0, 0, 0];
	function next() {
		prevPos[0] = idx;
		prevPos[1] = row;
		prevPos[2] = col;
		var nc = input[idx++];
		return nc;
	}
	function back() {
		idx = prevPos[0];
		row = prevPos[1];
		col = prevPos[2];
		chr = input[idx];
	}
	function peek() {
		return input[idx];
	}
	function consumeGeneralBlock(term) {
		var str = "";
		while(true) {
			chr = next();
			if(!chr) throw "Invalid termination";
			if(chr == term) {
				chr = next();
				if(chr == "}") break;
				back();
			}
			str += chr;
		}
		return str;
	}
	function consumeRawText() {
		var str = "";
		while(true) {
			chr = next();
			if(!chr) break;
			if(chr == "{") {
				var testchr = peek();
				if(testchr == "{" || testchr == "%" || testchr == "#") {
					back();
					break;
				}
			}
			str += chr;
		}
		return str;
	}
	function back() {
		idx = prevPos[0];
		row = prevPos[1];
		col = prevPos[2];
		chr = input[idx];
	}
	while(true) {
		chr = next();
		if(!chr) break;
		if(chr == "{") {
			var nextchar = peek();
			if(nextchar == "{") {
				next();
				var subtokens = tokenizeControl(consumeGeneralBlock("}"))
				tokens.push(scanVariableBlock(subtokens));
				continue;
			} else if(nextchar == "%") {
				next();
				var subtokens = tokenizeControl(consumeGeneralBlock("%"))
				tokens.push(scanControlBlock(subtokens));
				continue;
			} else if(nextchar == "#") {
				next();
				consumeGeneralBlock("#"); // do nothing with it
				continue;
			}
			// fall-through
		}
		back();
		var text = consumeRawText();
		tokens.push({
			type: "raw",
			value: text
		});
	}
	return tokens;
}

function organizeTemplate(input) {
	var tokens = [];
	var parentPath = null;
	var part;
	var idx = 0;
	var row = 0;
	var col = 0;
	var prevPos = [idx, row, col];
	var prevCtx = [0, 0, 0];
	function next() {
		prevPos[0] = idx;
		prevPos[1] = row;
		prevPos[2] = col;
		var nc = input[idx++];
		return nc;
	}
	function back() {
		idx = prevPos[0];
		row = prevPos[1];
		col = prevPos[2];
		part = input[idx];
	}
	
	function consumeIfBlock() {
		var if_tokens = [];
		var mid_tokens = [];
		var else_tokens = [];
		var stage = 0; // [if, elseif, else]
		var level = 1;
		while(true) {
			part = next();
			if(!part) {
				throw "Mismatched 'if' block";
			}

			if(part.type == "if") {
				level++;
			} else if(part.type == "else") {
				if(level == 1) {
					if(stage == 0 || stage == 1) {
						stage = 2;
						continue;
					}
					throw "Unexpected 'else' block";
				}
			} else if(part.type == "elseif") {
				if(level == 1) {
					if(stage == 0 || stage == 1) {
						mid_tokens.push([part.cond, []]);
						stage = 1;
						continue;
					}
					throw "Unexpected 'else if' block";
				}
			} else if(part.type == "endif") {
				level--;
				if(level <= 0) {
					break;
				}
			}
			switch(stage) {
				case 0: if_tokens.push(part); break;
				case 1: mid_tokens.at(-1)[1].push(part); break;
				case 2: else_tokens.push(part); break;
			}
		}
		return {
			main: if_tokens,
			mid: mid_tokens,
			end: else_tokens
		};
	}
	function consumeSimpleBlock(starter, terminator) {
		var tokens = [];
		var level = 1;
		while(true) {
			part = next();
			if(!part) {
				throw "Mismatched '" + starter + "' block";
			}
			if(part.type == starter) {
				level++;
			} else if(part.type == terminator) {
				level--;
				if(level <= 0) {
					break;
				}
			}
			tokens.push(part);
		}
		return tokens;
	}
	
	while(true) {
		part = next();
		if(!part) break;
		if(part.type == "if") {
			var mainCond = part.cond;
			var ctokens = consumeIfBlock();
			var elseifBlocks = [];
			for(var i = 0; i < ctokens.mid.length; i++) {
				var elseif = ctokens.mid[i];
				elseifBlocks.push({
					cond: elseif[0],
					exec: organizeTemplate(elseif[1]).exec
				});
			}
			tokens.push({
				type: "if",
				mainBlock: {
					cond: mainCond,
					exec: organizeTemplate(ctokens.main).exec
				},
				elseifBlocks: elseifBlocks,
				elseBlock: {
					exec: organizeTemplate(ctokens.end).exec
				}
			});
		} else if(part.type == "for") {
			var iterators = part.iterators;
			var destination = part.destination;
			var ctokens = consumeSimpleBlock("for", "endfor");
			tokens.push({
				type: "for",
				iterators: iterators,
				destination: destination,
				exec: organizeTemplate(ctokens).exec
			});
		} else if(part.type == "block") {
			var name = part.name;
			var ctokens = consumeSimpleBlock("block", "endblock");
			tokens.push({
				type: "block",
				name: name,
				exec: organizeTemplate(ctokens).exec
			});
		} else if(part.type == "extends") {
			parentPath = part.path;
		} else {
			if(part.type == "endfor" || part.type == "endblock" || part.type == "endif") {
				throw "Unexpected token";
			}
			tokens.push(part);
		}
	}
	return {
		parentPath: parentPath,
		exec: tokens
	}
}

function compileTemplate(input) {
	input = input.toString();
	input = input.replace(/\r\n/g, "\n");
	var template = parseTemplate(input);
	template = organizeTemplate(template);
	return template;
}

// Execution engine

function resolvePath(path, container) {
	if(!path.length) return null;
	var res = container;
	for(var i = 0; i < path.length; i++) {
		var segment = path[i];
		if(Array.isArray(segment)) {
			segment = resolvePath(segment, container);
			if(segment == null) return null;
		}
		if(res == null || !res.hasOwnProperty(segment)) return null;
		res = res[segment];
	}
	return res;
}

function executeCond(cond, container) {
	var x, y;
	if(cond.type == "str" || cond.type == "num") {
		return cond.value;
	}
	if(cond.type == "exec") {
		return exec(cond.exec, container);
	}
	if(cond.type == "variable") {
		return resolvePath(cond.value, container);
	}
	if(cond.type == "not") {
		x = cond.x;
		var count = (cond.count - 1 % 2) + 1;
		if(count == 1) {
			return !executeCond(x, container);
		} else if(count == 2) {
			return !!executeCond(x, container);
		}
	}
	x = cond.x;
	y = cond.y;
	if(cond.type == "eq") {
		return executeCond(x, container) == executeCond(y, container);
	}
	if(cond.type == "neq") {
		return executeCond(x, container) != executeCond(y, container);
	}
	if(cond.type == "and") {
		return executeCond(x, container) && executeCond(y, container);
	}
	if(cond.type == "or") {
		return executeCond(x, container) || executeCond(y, container);
	}
	if(cond.type == "lt") {
		return executeCond(x, container) < executeCond(y, container);
	}
	if(cond.type == "lte") {
		return executeCond(x, container) <= executeCond(y, container);
	}
	if(cond.type == "gt") {
		return executeCond(x, container) > executeCond(y, container);
	}
	if(cond.type == "gte") {
		return executeCond(x, container) >= executeCond(y, container);
	}
}

function executeBlock(exec, params, blockPresets) {
	var str = "";
	for(var i = 0; i < exec.length; i++) {
		var token = exec[i];
		if(token.type == "raw") {
			str += token.value;
		}
		if(token.type == "variable") {
			var filter = token.filter;
			var arg = token.filterArg;
			var value = resolvePath(token.path, params);
			if(typeof value == "string" || typeof value == "number" || typeof value == "bigint" || typeof value == "boolean") {
				value = value.toString();
			} else {
				value = "";
			}
			if(customFilters.hasOwnProperty(filter)) {
				value = customFilters[filter](value, arg);
			}
			if(filter != "safe") {
				value = escapeHTML(value);
			}
			str += value;
		}
		if(token.type == "if") {
			var ifBlock = token.mainBlock;
			var elifChain = token.elseifBlocks;
			var elseBlock = token.elseBlock;
			if(executeCond(ifBlock.cond, params)) {
				str += executeBlock(ifBlock.exec, params, blockPresets);
			} else {
				var elifSuccess = false;
				for(var e = 0; e < elifChain.length; e++) {
					var elifBlock = elifChain[e];
					if(executeCond(elifBlock.cond, params)) {
						elifSuccess = true;
						str += executeBlock(elifBlock.exec, params, blockPresets);
						break;
					}
				}
				if(!elifSuccess) {
					str += executeBlock(elseBlock.exec, params, blockPresets);
				}
			}
		}
		if(token.type == "for") {
			var container = resolvePath(token.destination, params);
			var iterators = token.iterators;
			if(typeof container != "object" || container == null) continue;
			if(iterators.length > 1) {
				if(!Array.isArray(container)) {
					continue;
				}
				for(var c = 0; c < container.length; c++) {
					var cValue = container[c];
					for(var t = 0; t < iterators.length; t++) {
						var vName = iterators[t];
						params[vName] = cValue[t];
					}
					str += executeBlock(token.exec, params, blockPresets);
				}
			}
			for(var c in container) {
				var vName = iterators[0];
				var cValue = container[c];
				params[vName] = cValue;
				str += executeBlock(token.exec, params, blockPresets);
			}
		}
		if(token.type == "block") {
			var name = token.name;
			var blkexec = token.exec;
			if(blockPresets && blockPresets[name]) {
				blkexec = blockPresets[name];
			}
			str += executeBlock(blkexec, params, blockPresets);
		}
	}
	return str;
}

function executeTemplate(template, parameters) {
	if(!parameters) parameters = {};
	var extended = template.parentPath;
	var exec = template.exec;
	if(extended) {
		var blocks = {};
		for(var i = 0; i < exec.length; i++) {
			var part = exec[i];
			if(part.type == "block") {
				var name = part.name;
				blocks[name] = part.exec;
			}
		}
		var parentTemplate = vfsGetFile(extended);
		return executeBlock(parentTemplate.exec, parameters, blocks);
	}
	return executeBlock(exec, parameters, null);
}

// Custom filter

var customFilters = {};

function registerFilter(name, func) {
	customFilters[name] = func;
}

// Virtual File System

var vfsData = {};

function vfsNormalizePath(path) {
	path = path.replace(/\\/g, "/");
	if(path.at(0) == "/") path = path.slice(1);
	if(path.at(-1) == "/") path = path.slice(0, -1);
	return path;
}

function vfsGetFile(path) {
	var rawpath = path;
	path = vfsNormalizePath(path);
	if(!vfsData.hasOwnProperty(path)) {
		throw "File '" + rawpath + "' not found";
	}
	return vfsData[path];
}

function vfsSetFile(path, data) {
	path = vfsNormalizePath(path);
	vfsData[path] = data;
}

module.exports = {
	compile: compileTemplate,
	execute: executeTemplate,
	addFile: vfsSetFile,
	getFile: vfsGetFile,
	registerFilter
};
