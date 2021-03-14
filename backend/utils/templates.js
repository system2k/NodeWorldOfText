/*
	Template compiler & executer
	Pre-alpha stage
*/



/*
	Template compilation
*/

var whitespaces = [
	"\u0009", "\u000A", "\u000B", "\u000C", "\u000D", "\u0020", "\u00A0", "\u1680",
	"\u2000", "\u2001", "\u2002", "\u2003", "\u2004", "\u2005", "\u2006", "\u2007",
	"\u2008", "\u2009", "\u200A", "\u2028", "\u2029", "\u202F", "\u205F", "\u3000",
	"\uFEFF"
];
function isWhitespace(code) {
	return whitespaces.indexOf(code) > -1;
}

function processAccessor(path) {
	var res = [];
	var respath = [res];
	var parobjmap = [];
	for(var i = 0; i < path.length; i++) {
		if(path[i] == ".") continue;
		if(path[i] == "[") {
			var ar = [];
			respath[respath.length - 1].push(ar);
			respath.push(ar);
			continue;
		}
		if(path[i] == "]") {
			var rem = respath[respath.length - 1];
			var par = respath[respath.length - 2];
			if(rem.length == 1) {
				var idx = par.indexOf(rem);
				if(idx > -1) {
					par[idx] = rem[0];
				} else {
					throw "idxerr";
				}
			}
			respath.pop();
			continue;
		}
		respath[respath.length - 1].push(path[i]);
	}
	return res;
}

function isIncompleteBool(ar) {
	if(!Array.isArray(ar)) return false;
	for(var i = 0; i < ar.length; i++) {
		if(ar[i] == "&&" || ar[i] == "||") return true;
	}
	return false;
}

function isValidAccessor(ar) {
	if(!Array.isArray(ar)) return false;
	for(var i = 0; i < ar.length; i++) {
		if(typeof ar[i] == "object") return false;
	}
	return true;
}

var controlChars = "[]\"\\.|!&{}()%=<>";

function compileTemplate(htmldoc) {
	var parts = [];
	var buffer = "";
	var commentMode = false;
	for(var i = 0; i < htmldoc.length; i++) {
		if(htmldoc[i] == "#" && htmldoc[i + 1] == "}") {
			commentMode = false;
			i++;
			continue;
		}
		if(commentMode) continue;
		if(htmldoc[i] == "{" && htmldoc[i + 1] == "%") {
			if(buffer) {
				parts.push(buffer);
				buffer = "";
			}
			parts.push("{%");
			i++;
			continue;
		}
		if(htmldoc[i] == "%" && htmldoc[i + 1] == "}") {
			if(buffer) {
				parts.push(buffer);
				buffer = "";
			}
			parts.push("%}");
			i++;
			continue;
		}
		if(htmldoc[i] == "{" && htmldoc[i + 1] == "{") {
			if(buffer) {
				parts.push(buffer);
				buffer = "";
			}
			parts.push("{{");
			i++;
			continue;
		}
		if(htmldoc[i] == "}" && htmldoc[i + 1] == "}") {
			if(buffer) {
				parts.push(buffer);
				buffer = "";
			}
			parts.push("}}");
			i++;
			continue;
		}
		if(htmldoc[i] == "{" && htmldoc[i + 1] == "#") {
			commentMode = true;
			i++;
			continue;
		}
		buffer += htmldoc[i];
	}
	if(buffer) {
		parts.push(buffer);
	}
	
	
	
	var tokens = [];
	for(var i = 0; i < parts.length; i++) {
		if(parts[i] == "{%" && parts[i + 2] == "%}") {
			tokens.push({
				type: "control",
				value: parts[i + 1]
			});
			i += 2;
			continue;
		}
		if(parts[i] == "{{" && parts[i + 2] == "}}") {
			tokens.push({
				type: "variable",
				value: parts[i + 1]
			});
			i += 2;
			continue;
		}
		tokens.push({
			type: "text",
			value: parts[i]
		});
	}
	
	
	
	for(var i = 0; i < tokens.length; i++) {
		if(tokens[i].type == "control" || tokens[i].type == "variable") {
			var val = tokens[i].value;
			var subtokens = [];
			var x = 0;
			var tokbuffer = "";
			var negate = 0;
			var modifier = false;
			while(true) {
				if(isWhitespace(val[x])) {
					if(tokbuffer) {
						subtokens.push(tokbuffer);
						tokbuffer = "";
					}
					x++;
					if(x >= val.length) break;
					continue;
				}
				if(val[x] == "\"") { // string
					if(tokbuffer) {
						subtokens.push(tokbuffer);
						tokbuffer = "";
					}
					x++;
					var strbuf = "";
					while(true) {
						if(val[x] == "\"") {
							break;
						}
						if(val[x] == "\\") {
							x++;
							strbuf += val[x];
						}
						strbuf += val[x];
						x++;
						if(x >= val.length) throw "oob";
					}
					subtokens.push({
						type: "string",
						value: strbuf
					});
				} else if(controlChars.indexOf(val[x]) > -1) {
					if(tokbuffer) {
						subtokens.push(tokbuffer);
						tokbuffer = "";
					}
					if(val[x] == "=" && val[x + 1] == "=") {
						subtokens.push("==");
						x++;
					} else if(val[x] == "&" && val[x + 1] == "&") {
						subtokens.push("&&");
						x++;
					} else if(val[x] == "|" && val[x + 1] == "|") {
						subtokens.push("||");
						x++;
					} else if(val[x] == "!" && val[x + 1] == "=") {
						subtokens.push("!=");
						x++;
					} else if(val[x] == ">" && val[x + 1] == "=") {
						subtokens.push(">=");
						x++;
					} else if(val[x] == "<" && val[x + 1] == "=") {
						subtokens.push("<=");
						x++;
					} else if(val[x] == "!") {
						negate++;
					} else {
						subtokens.push(val[x]);
					}
				} else {
					if(negate > 0) {
						negate = 0;
						if(negate % 2) {
							tokbuffer += "!";
						} else {
							tokbuffer += "!!";
						}
					}
					tokbuffer += val[x];
				}
				x++;
				if(x >= val.length) break;
			}
			if(tokbuffer) {
				subtokens.push(tokbuffer);
			}
			for(var g = 0; g < subtokens.length; g++) {
				if(subtokens[g] == "|") {
					var t1 = subtokens[g - 1];
					var t2 = subtokens[g + 1];
					subtokens.splice(g - 1, 3);
					subtokens.splice(g - 1, 0, t1 + "|" + t2);
				}
			}
			tokens[i].value = subtokens;
		}
	}
	
	
	
	for(var i = 0; i < tokens.length; i++) {
		if(tokens[i].type == "control") {
			if(tokens[i].value.length) {
				if(tokens[i].value[0] == "block") {
					tokens[i] = {
						type: "block",
						name: tokens[i].value[1]
					};
				} else if(tokens[i].value[0] == "endblock") {
					tokens[i] = {
						type: "endblock"
					};
				} else if(tokens[i].value[0] == "extends") {
					tokens[i] = {
						type: "extends",
						page: tokens[i].value[1]
					};
				} else if(tokens[i].value[0] == "if") {
					tokens[i] = {
						type: "if",
						stmt: tokens[i].value.slice(1)
					};
				} else if(tokens[i].value[0] == "else" && tokens[i].value[1] == "if") {
					tokens[i] = {
						type: "else_if",
						stmt: tokens[i].value.slice(2)
					};
				} else if(tokens[i].value[0] == "else") {
					tokens[i] = {
						type: "else"
					};
				} else if(tokens[i].value[0] == "endif") {
					tokens[i] = {
						type: "endif"
					};
				} else if(tokens[i].value[0] == "endfor") {
					tokens[i] = {
						type: "endfor"
					};
				} else if(tokens[i].value[0] == "for") {
					if(tokens[i].value[2] != "in") throw "forloop err";
					tokens[i] = {
						type: "for",
						key: tokens[i].value[1],
						obj: processAccessor(tokens[i].value.slice(3))
					}
				}
			}
		} else if(tokens[i].type == "variable") {
			tokens[i].value = processAccessor(tokens[i].value);
		}
	}
	
	
	
	for(var i = 0; i < tokens.length; i++) {
		if(tokens[i].type == "if" || tokens[i].type == "else_if") {
			var stmt = tokens[i].stmt;
			var groups = [];
			var levels = [groups]; // current path stack

			for(var x = 0; x < stmt.length; x++) {
				if(stmt[x] == "(") {
					var ar = [];
					levels[levels.length - 1].push(ar);
					levels.push(ar);
					continue;
				}
				if(stmt[x] == ")") {
					levels.pop();
					continue;
				}
				levels[levels.length - 1].push(stmt[x]);
			}
			
			function processComparators(groupObj) {
				var joinedGroups = [];
				var token1 = [];
				var token2 = [];
				var comparator = "";
				var secondPos = false;
				for(var x = 0; x < groupObj.length; x++) {
					var incompleteCompGroup = false;
					if(typeof groupObj[x] == "object" && !groupObj[x].type) {
						incompleteCompGroup = true;
						groupObj[x] = processComparators(groupObj[x]);
					}
					if(!secondPos && (groupObj[x] == "!=" || groupObj[x] == "==" || groupObj[x] == "<=" || groupObj[x] == ">=" || groupObj[x] == "<" || groupObj[x] == ">")) {
						comparator = groupObj[x];
						secondPos = true;
						continue;
					}
					if(groupObj[x] == "&&" || groupObj[x] == "||") {
						if(token1.length == 1 && typeof token1[0] == "object" && token1[0].type == "string") token1 = token1[0];
						if(token2.length == 1 && typeof token2[0] == "object" && token2[0].type == "string") token2 = token2[0];
						if(isValidAccessor(token1)) token1 = processAccessor(token1);
						if(isValidAccessor(token2)) token2 = processAccessor(token2);
						if(secondPos) {
							joinedGroups.push({
								compare: comparator,
								a: token1,
								b: token2
							}, groupObj[x]);
						} else {
							joinedGroups.push({
								compare: "==",
								a: token1,
								b: true
							}, groupObj[x]);
						}
						secondPos = false;
						comparator = "";
						token1 = [];
						token2 = [];
						continue;
					}
					if(!secondPos) {
						if(incompleteCompGroup) {
							token1 = groupObj[x];
						} else {
							token1.push(groupObj[x]);
						}
						continue;
					}
					if(secondPos) {
						if(incompleteCompGroup) {
							token2 = groupObj[x];
						} else {
							token2.push(groupObj[x]);
						}
						continue;
					}
				}
				if(token1.length) {
					if(token1.length == 1 && typeof token1[0] == "object" && token1[0].type == "string") token1 = token1[0];
					if(token2.length == 1 && typeof token2[0] == "object" && token2[0].type == "string") token2 = token2[0];
					if(isValidAccessor(token1)) token1 = processAccessor(token1);
					if(isValidAccessor(token2)) token2 = processAccessor(token2);
					if(secondPos) {
						joinedGroups.push({
							compare: comparator,
							a: token1,
							b: token2
						});
					} else {
						joinedGroups.push({
							compare: "==",
							a: token1,
							b: true
						});
					}
				}
				return joinedGroups;
			}
			var joinedGroups = processComparators(groups);
			
			function processComparisons(groups) {
				if(groups.length == 1) {
					return groups[0];
				}
				for(var g = 0; g < groups.length; g++) {
					for(var z = 0; z < groups.length; z++) {
						if(groups[z] == "&&") {
							var ca = groups[z - 1];
							var cb = groups[z + 1];
							if(isIncompleteBool(ca.a)) ca.a = processComparisons(ca.a)[0];
							if(isIncompleteBool(ca.b)) ca.b = processComparisons(ca.b)[0];
							if(isIncompleteBool(cb.a)) cb.a = processComparisons(cb.a)[0];
							if(isIncompleteBool(cb.b)) cb.b = processComparisons(cb.b)[0];
							groups.splice(z - 1, 3);
							groups.splice(z - 1, 0, {
								compare: "&&",
								a: ca,
								b: cb
							});
							break;
						}
						if(groups[z] == "||") {
							var ca = groups[z - 1];
							var cb = groups[z + 1];
							if(isIncompleteBool(ca.a)) ca.a = processComparisons(ca.a)[0];
							if(isIncompleteBool(ca.b)) ca.b = processComparisons(ca.b)[0];
							if(isIncompleteBool(cb.a)) cb.a = processComparisons(cb.a)[0];
							if(isIncompleteBool(cb.b)) cb.b = processComparisons(cb.b)[0];
							groups.splice(z - 1, 3);
							groups.splice(z - 1, 0, {
								compare: "||",
								a: ca,
								b: cb
							});
							break;
						}
					}
				}
				return groups;
			}
			tokens[i].stmt = processComparisons(joinedGroups);
			if(Array.isArray(tokens[i].stmt)) {
				if(tokens[i].stmt.length != 1) throw "inv ar size";
				tokens[i].stmt = tokens[i].stmt[0];
			}
		}
	}
	
	
	
	var commands = {
		type: "main",
		extends: null,
		exec: []
	};
	var stackflow = [commands];
	for(var i = 0; i < tokens.length; i++) {
		var cmd = tokens[i];
		if(cmd.type == "extends") {
			commands.extends = cmd.page;
			continue;
		}
		if(cmd.type == "text") {
			stackflow[stackflow.length - 1].exec.push(cmd);
			continue;
		}
		if(cmd.type == "variable") {
			stackflow[stackflow.length - 1].exec.push(cmd);
			continue;
		}
		if(cmd.type == "for") {
			var obj = {
				type: "for",
				key: cmd.key,
				obj: cmd.obj,
				exec: []
			};
			stackflow[stackflow.length - 1].exec.push(obj);
			stackflow.push(obj);
			continue;
		}
		if(cmd.type == "endfor") {
			var lb = stackflow[stackflow.length - 1];
			if(lb.type != "for") throw "non-match err";
			stackflow.pop();
			continue;
		}
		if(cmd.type == "block") {
			var obj = {
				type: "block",
				name: cmd.name,
				exec: []
			};
			stackflow[stackflow.length - 1].exec.push(obj);
			stackflow.push(obj);
			continue;
		}
		if(cmd.type == "endblock") {
			var lb = stackflow[stackflow.length - 1];
			if(lb.type != "block") throw "non-match err";
			stackflow.pop();
			continue;
		}
		if(cmd.type == "if") {
			var obj = {
				type: "if",
				stmt: cmd.stmt,
				exec: [],
				elif_chain: [],
				else_exec: []
			};
			stackflow[stackflow.length - 1].exec.push(obj);
			stackflow.push(obj);
			continue;
		}
		if(cmd.type == "else_if") {
			var ifs = stackflow[stackflow.length - 1];
			var obj;
			if(ifs.type == "if") {
				obj = {
					type: "else_if",
					ifobj: ifs,
					stmt: cmd.stmt,
					exec: []
				};
				ifs.elif_chain.push(obj);
				stackflow.push(obj);
			} else if(ifs.type == "else_if") {
				obj = {
					type: "else_if",
					ifobj: ifs.ifobj,
					stmt: cmd.stmt,
					exec: []
				};
				ifs.ifobj.elif_chain.push(obj);
				stackflow.pop();
				stackflow.push(obj);
			} else {
				throw "elif statement outside of if statement";
			}
			continue;
		}
		if(cmd.type == "else") {
			var ifs = stackflow[stackflow.length - 1];
			var obj;
			if(ifs.type == "if") {
				obj = {
					type: "else",
					ifobj: ifs,
					exec: []
				};
				ifs.else_exec.push(obj);
				if(ifs.else_exec.length != 1) throw "else err";
				stackflow.push(obj);
			} else if(ifs.type == "else_if") {
				obj = {
					type: "else",
					ifobj: ifs.ifobj,
					exec: []
				};
				ifs.ifobj.else_exec.push(obj);
				if(ifs.ifobj.else_exec.length != 1) throw "else err";
				stackflow.pop();
				stackflow.push(obj);
			} else {
				throw "else statement in wrong pos";
			}
			continue;
		}
		if(cmd.type == "endif") {
			var ifs = stackflow[stackflow.length - 1];
			if(ifs.type == "if") {
				// cleanup circular "ifobj"
				for(var r = 0; r < ifs.elif_chain.length; r++) delete ifs.elif_chain[r].ifobj;
				for(var r = 0; r < ifs.else_exec.length; r++) delete ifs.else_exec[r].ifobj;
				stackflow.pop();
			} else if(ifs.type == "else_if" || ifs.type == "else") {
				stackflow.pop();
				ifs = stackflow[stackflow.length - 1];
				if(ifs.type != "if") throw "if err";
				for(var r = 0; r < ifs.elif_chain.length; r++) delete ifs.elif_chain[r].ifobj;
				for(var r = 0; r < ifs.else_exec.length; r++) delete ifs.else_exec[r].ifobj;
				stackflow.pop();
			} else {
				throw "non-match err";
			}
			continue;
		}
	}
	if(stackflow.length != 1) throw "stack did not terminate properly";
	
	return commands;
}

module.exports.compile = compileTemplate;

/*
	Template execution
*/

function processStr(obj) {
	if(typeof obj == "string") return obj;
	if(typeof obj == "object" && obj.type == "string") return obj.value;
	return obj;
}

function variableMods(vb) {
	vb = vb.split("|");
	var name = "";
	var modifier = "";
	if(vb.length == 2) {
		modifier = vb[1];
	}
	name = vb[0];
	var negation = "";
	if(name[0] == "!" && name[1] == "!") {
		negation = "!!";
	} else if(name[0] == "!") {
		negation = "!";
	}
	return {
		name,
		modifier,
		negation
	}
}

function resolvePath(path, obj) {
	var ref = obj;
	var modifier = "";
	var negation = "";
	for(var i = 0; i < path.length; i++) {
		var seg = path[i];
		if(Array.isArray(seg)) seg = resolvePath(seg, obj).result;
		if(typeof ref != "object" || seg == void 0) return "";
		var vm = variableMods(seg);
		modifier = vm.modifier;
		negation = vm.negation;
		ref = ref[vm.name];
	}
	if(negation == "!") {
		ref = !ref;
	} else if(negation == "!!") {
		ref = !!ref;
	}
	if(ref === null || ref === undefined) ref = "";
	return {
		result: ref,
		modifier
	};
}

var digits = "0123456789";
function isDigit(x) {
	return digits.indexOf(x) > -1;
}

function processNumber(x) {
	if(typeof x == "number") return x;
	if(Array.isArray(x)) {
		if(!x.length) return x;
		if(isDigit(x[0][0])) {
			if(x.length == 1) {
				return parseInt(x[0]);
			} else if(x.length == 2) {
				return parseFloat(x[0] + "." + x[1]);
			} else {
				throw "runtime - invalid decimal number";
			}
		}
	}
	return x;
}

function resolveIfStmt(stmt, obj) {
	var cmp = stmt.compare;
	var a = stmt.a;
	var b = stmt.b;
	
	a = processNumber(a);
	b = processNumber(b);
	
	if(Array.isArray(a)) a = resolvePath(a, obj).result;
	if(Array.isArray(b)) b = resolvePath(b, obj).result;
	if(typeof a == "object" && a.compare) a = resolveIfStmt(a, obj);
	if(typeof b == "object" && b.compare) b = resolveIfStmt(b, obj);
	
	a = processStr(a);
	b = processStr(b);

	if(typeof a != "boolean" && typeof b == "boolean") {
		a = !!a;
	} else if(typeof b != "boolean" && typeof a == "boolean") {
		b = !!b;
	}
	
	if(cmp == "==") {
		return a == b;
	} else if(cmp == "!=") {
		return a != b;
	} else if(cmp == ">=") {
		return a >= b;
	} else if(cmp == "<=") {
		return a <= b;
	} else if(cmp == ">") {
		return a > b;
	} else if(cmp == "<") {
		return a < b;
	} else if(cmp == "&&") {
		return a && b;
	} else if(cmp == "||") {
		return a || b;
	} else {
		throw "runtime - invalid comparator";
	}
}

function escapeHTML(h) {
	h += "";
	h = h.replace(/\&/g, "&amp;");
	h = h.replace(/\</g, "&lt;");
	h = h.replace(/\>/g, "&gt;");
	h = h.replace(/\0/g, " ");
	h = h.replace(/\"/g, "&quot;");
	h = h.replace(/\'/g, "&#39;");
	h = h.replace(/\`/g, "&#96;");
	h = h.replace(/\//g, "&#x2F;");
	h = h.replace(/\\/g, "&#x5C;");
	h = h.replace(/\=/g, "&#61;");
	return h;
}

function executeTemplate(code, vars, currentpath, filesystem) {
	var page = "";
	
	var blockNames = {};
	var isExtended = false;
	if(code.extends) {
		isExtended = true;
		var path = processStr(code.extends);
		var template = filesystem(path, currentpath);
		if(!template) throw "Extended template not found";
		for(var i = 0; i < code.exec.length; i++) {
			var part = code.exec[i];
			if(part.type == "block") {
				blockNames[part.name] = part.exec;
			}
		}
		code = template;
	}
	
	// codes, position, local variables
	var stack = [[code.exec, 0]];
	
	var lc = 0;
	while(true) {
		lc++;
		if(lc >= 100000) {
			return "runtime - possible infinite loop detected";
		}
		if(!stack.length) break;
		var ctx = stack[stack.length - 1];
		var exec = ctx[0];
		var pc = ctx[1];
		var local = ctx[2];
		var code = exec[pc];
		
		if(!local) local = {};
		for(var i in vars) {
			if(!local[i]) local[i] = vars[i];
		}
		
		if(ctx[1] >= exec.length) {
			stack.pop();
			continue;
		}
		if(code.type == "text") {
			page += code.value;
		} else if(code.type == "variable") {
			var val = resolvePath(code.value, local);
			if(val.modifier == "safe") {
				val = val.result;
			} else {
				val = escapeHTML(val.result);
			}
			page += val;
		} else if(code.type == "if") {
			var stmt = code.stmt;
			var ifexec = code.exec;
			var elif_chain = code.elif_chain;
			var else_exec = code.else_exec;
			
			if(!code.stage) {
				code.stage = 1;
				code.eif = false;
				if(resolveIfStmt(stmt, local)) {
					stack.push([ifexec, 0, local]);
					delete code.stage;
					delete code.eif;
				} else {
					if(elif_chain) {
						stack.push([elif_chain, 0, local]);
						continue;
					}
				}
			} else if(code.stage == 1) {
				code.stage = 2;
				if(!code.eif) {
					// all else-if statements are false, execute else statement
					if(else_exec.length) {
						stack.push([else_exec[0].exec, 0, local]);
						continue;
					} else {
						delete code.stage;
						delete code.eif;
					}
				} else {
					delete code.stage;
					delete code.eif;
				}
			} else {
				delete code.stage;
				delete code.eif;
			}
		} else if(code.type == "else_if") {
			var stmt = code.stmt;
			var ifexec = code.exec;
			if(resolveIfStmt(stmt, local)) {
				stack.pop(); // exit out of else-if chain
				var end = stack[stack.length - 1];
				var ifobj = end[0][end[1]];
				ifobj.eif = true;
				stack.push([ifexec, 0, local]);
				continue;
			}
		} else if(code.type == "else") {
			stack.push([code.exec, 0, local]);
			continue;
		} else if(code.type == "for") {
			var key = code.key;
			var loopexec = code.exec;
			
			if(!code.loop) code.loop = 0;
			if(!code.init) {
				code.init = true;
				code.obj = resolvePath(code.obj, local).result;
				if(typeof code.obj == "object") {
					if(Array.isArray(code.obj)) {
						code.array = true;
						code.keys = null;
						code.len = code.obj.length;
					} else {
						code.array = false;
						code.keys = Object.keys(code.obj);
						code.len = code.keys.length;
					}
				} else {
					code.len = 0; // terminate loop
				}
			}
			
			if(code.loop < code.len) {
				var item;
				var localvars = {};
				for(var i in local) localvars[i] = local[i];
				if(code.array) {
					localvars.key = code.loop;
					localvars[key] = code.obj[code.loop];
				} else {
					localvars.key = code.keys[code.loop];
					localvars[key] = code.obj[localvars.key];
				}
				code.loop++;
				stack.push([loopexec, 0, localvars]);
				continue;
			} else {
				// loop is reusable, so reset when done
				code.loop = 0;
			}
		} else if(code.type == "block") {
			var name = code.name;
			if(isExtended && blockNames[name]) {
				stack.push([blockNames[name], 0, local]);
			}
		}
		ctx[1]++;
		if(ctx[1] >= exec.length) {
			stack.pop();
		}
	}
	
	return page;
}

module.exports.execute = executeTemplate;