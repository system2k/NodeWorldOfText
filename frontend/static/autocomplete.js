var autocomplete_defaults = {
	inputClass: "ac_input",
	resultsClass: "ac_results",
	loadingClass: "ac_loading",
	minChars: 4,
	delay: 400,
	matchCase: false,
	matchSubset: true,
	matchContains: false,
	cacheLength: 10,
	max: 100,
	mustMatch: false,
	extraParams: {},
	selectFirst: true,
	formatItem: function(row) { return row[0]; },
	formatMatch: null,
	autoFill: false,
	width: 0,
	multiple: false,
	multipleSeparator: ", ",
	multiClickTrigger: true,
	highlight: function(value, term) {
		return value.replace(new RegExp("(?![^&;]+;)(?!<[^<>]*)(" + term.replace(/([\^\$\(\)\[\]\{\}\*\.\+\?\|\\])/gi, "\\$1") + ")(?![^<>]*>)(?![^&;]+;)", "gi"), "<strong>$1</strong>");
	},
	scroll: true,
	scrollHeight: 180
};

function autocomplete(options) {
	var input = options.element;

	// defaults if they don't exist
	for(var i in autocomplete_defaults) {
		if(!options[i]) {
			options[i] = autocomplete_defaults[i];
		}
	}
	
	var KEY = {
		UP: 38,
		DOWN: 40,
		DEL: 46,
		TAB: 9,
		RETURN: 13,
		ESC: 27,
		COMMA: 188,
		PAGEUP: 33,
		PAGEDOWN: 34,
		BACKSPACE: 8
	};

	input.setAttribute("autocomplete", "off");
	input.classList.add(options.inputClass);

	var timeout;
	var previousValue = "";
	var cache = autocomplete_cache(options);

	var hasFocus = 0;
	var lastKeyPressCode;
	var config = {
		mouseDownOnSelect: false
	};
	var select = autocomplete_select(options, input, selectCurrent, config);
	input.addEventListener("keydown", function(event) {
		// a keypress means the input has focus
		// avoids issue where input had focus before the autocomplete was applied
		hasFocus = 1;
		// track last key pressed
		lastKeyPressCode = event.keyCode;
		switch(event.keyCode) {
			case KEY.UP:
				event.preventDefault();
				if ( select.visible() ) {
					select.prev();
				} else {
					onChange(0, true);
				}
				break;
				
			case KEY.DOWN:
				event.preventDefault();
				if ( select.visible() ) {
					select.next();
				} else {
					onChange(0, true);
				}
				break;
				
			case KEY.PAGEUP:
				event.preventDefault();
				if ( select.visible() ) {
					select.pageUp();
				} else {
					onChange(0, true);
				}
				break;
				
			case KEY.PAGEDOWN:
				event.preventDefault();
				if ( select.visible() ) {
					select.pageDown();
				} else {
					onChange(0, true);
				}
				break;
			
			// matches also semicolon
			case options.multiple && options.multipleSeparator.trim() == "," && KEY.COMMA:
			case KEY.TAB:
			case KEY.RETURN:
				if( selectCurrent() ) {
					// stop default to prevent a form submit, Opera needs special handling
					event.preventDefault();
					blockSubmit = true;
					return false;
				}
				break;
				
			case KEY.ESC:
				select.hide();
				break;
				
			default:
				clearTimeout(timeout);
				timeout = setTimeout(onChange, options.delay);
				break;
		}
	})

	input.addEventListener("focus", function(event) {
		// track whether the field has focus, we shouldn't process any
		// results if the field no longer has focus
		hasFocus++;
	})

	input.addEventListener("blur", function(event) {
		hasFocus = 0;
		if (!config.mouseDownOnSelect) {
			hideResults();
		}
	})

	input.addEventListener("click", function(event) {
		// show select when clicking in a focused field
		if ( hasFocus++ > 1 && !select.visible() && options.multiClickTrigger) {
			onChange(0, true);
		}
	})
	
	function selectCurrent() {
		var selected = select.selected();
		if( !selected )
			return false;
		
		var v = selected.result;
		previousValue = v;
		
		if ( options.multiple ) {
			var words = trimWords(input.value);
			if ( words.length > 1 ) {
				var seperator = options.multipleSeparator.length;
				var cursorAt = autocomplete_selection(input);
				var wordAt, progress = 0;

				for(var i in words) {
					var word = words[i];

					progress += word.length;
					if (cursorAt <= progress) {
						wordAt = i;
						return false;
					}
					progress += seperator;
				}

				words[wordAt] = v;
				// TODO this should set the cursor to the right position, but it gets overriden somewhere
				v = words.join( options.multipleSeparator );
			}
			v += options.multipleSeparator;
		}
		
		input.value = v;
		hideResultsNow();
		return true;
	}
	
	function onChange(a, skipPrevCheck) {
		if( lastKeyPressCode == KEY.DEL ) {
			select.hide();
			return;
		}
		
		var currentValue = input.value;
		
		if ( !skipPrevCheck && currentValue == previousValue )
			return;
		
		previousValue = currentValue;
		
		currentValue = lastWord(currentValue);
		if ( currentValue.length >= options.minChars) {
			input.classList.add(options.loadingClass);
			if (!options.matchCase)
				currentValue = currentValue.toLowerCase();
			request(currentValue, receiveData, hideResultsNow);
		} else {
			stopLoading();
			select.hide();
		}
	};
	
	function trimWords(value) {
		if (!value)
			return [""];
		if (!options.multiple)
			return [value.trim()];
		return value.split(options.multipleSeparator).map(function(word) {
			return value.trim().length ? word.trim() : null;
		})
	}
	
	function lastWord(value) {
		if ( !options.multiple )
			return value;
		var words = trimWords(value);
		if (words.length == 1) 
			return words[0];
		var cursorAt = autocomplete_selection(input);
		if (cursorAt == value.length) {
			words = trimWords(value)
		} else {
			words = trimWords(value.replace(value.substring(cursorAt), ""));
		}
		return words[words.length - 1];
	}
	
	// fills in the input box w/the first match (assumed to be the best match)
	// q: the term entered
	// sValue: the first matching result
	function autoFill(q, sValue){
		// autofill in the complete box w/the first match as long as the user hasn't entered in more data
		// if the last user key pressed was backspace, don't autofill
		if( options.autoFill && (lastWord(input.value).toLowerCase() == q.toLowerCase()) && lastKeyPressCode != KEY.BACKSPACE ) {
			// fill in the value (keep the case the user has typed)
			input.value = input.value + sValue.substring(lastWord(previousValue).length)
			// select the portion of the value not typed by the user (so the next character will erase)
			autocomplete_selection(input, previousValue.length, previousValue.length + sValue.length)//$(input).selection(previousValue.length, previousValue.length + sValue.length);
		}
	};

	function hideResults() {
		clearTimeout(timeout);
		timeout = setTimeout(hideResultsNow, 200);
	};

	function hideResultsNow() {
		var wasVisible = select.visible();
		select.hide();
		clearTimeout(timeout);
		stopLoading();
	};

	function receiveData(q, data) {
		if ( data && data.length && hasFocus ) {
			stopLoading();
			select.display(data, q);
			autoFill(q, data[0].value);
			select.show();
		} else {
			hideResultsNow();
		}
	};

	function request(term, success, failure) {
		if (!options.matchCase)
			term = term.toLowerCase();
		var data = cache.load(term);
		// recieve the cached data
		if (data && data.length) {
			success(term, data);
		// if an AJAX url has been supplied, try loading the data now
		} else if( (typeof options.url == "string") && (options.url.length > 0) ){
			var extraParams = {};

			for(var key in options.extraParams) {
				var param = options.extraParams[key];
				extraParams[key] = typeof param == "function" ? param() : param;
			}

			ajaxRequest({
				type: "GET",
				url: options.url,
				data: Object.assign({
					q: lastWord(term)
				}, extraParams),
				done: function(data) {
					var parsed = options.parse && options.parse(data) || parse(data);
					cache.add(term, parsed);
					success(term, parsed);
				}
			});
		} else if (options.dataLoader) {
				options.dataLoader(options, term, success, input, parse);
		} else {
			// if we have a failure, we need to empty the list -- this prevents the the [TAB] key from selecting the last successful match
			select.emptyList();
			failure(term);
		}
	};
	
	function parse(data) {
		var parsed = [];
		var rows = data.split("\n");
		for (var i=0; i < rows.length; i++) {
			var row = rows[i].trim();
			if (row) {
				row = row.split("|");
				parsed[parsed.length] = {
					data: row,
					value: row[0],
					result: options.formatResult && options.formatResult(row, row[0]) || row[0] 
				};
			}
		}
		return parsed;
	};

	function stopLoading() {
		input.classList.remove(options.loadingClass);
	};
}

function autocomplete_cache(options) {

	var data = {};
	var length = 0;
	
	function matchSubset(s, sub) {
		if (!options.matchCase) 
			s = s.toLowerCase();
		var i = s.indexOf(sub);
		if (options.matchContains == "word"){
			i = s.toLowerCase().search("\\b" + sub.toLowerCase());
		}
		if (i == -1) return false;
		return i == 0 || options.matchContains;
	};
	
	function add(q, value) {
		if (length > options.cacheLength){
			flush();
		}
		if (!data[q]){ 
			length++;
		}
		data[q] = value;
	}
	
	function populate(){
		if( !options.data ) return false;
		// track the matches
		var stMatchSets = {},
			nullData = 0;

		// no url was specified, we need to adjust the cache length to make sure it fits the local data store
		if( !options.url ) options.cacheLength = 1;
		
		// track all options for minChars = 0
		stMatchSets[""] = [];
		
		// loop through the array and create a lookup structure
		for ( var i = 0, ol = options.data.length; i < ol; i++ ) {
			var rawValue = options.data[i];
			// if rawValue is a string, make an array otherwise just reference the array
			rawValue = (typeof rawValue == "string") ? [rawValue] : rawValue;
			
			var value = options.formatMatch(rawValue, i+1, options.data.length);
			if ( value === false )
				continue;
				
			var firstChar = value.charAt(0).toLowerCase();
			// if no lookup array for this character exists, look it up now
			if( !stMatchSets[firstChar] ) 
				stMatchSets[firstChar] = [];

			// if the match is a string
			var row = {
				value: value,
				data: rawValue,
				result: options.formatResult && options.formatResult(rawValue) || value
			};
			
			// push the current match into the set list
			stMatchSets[firstChar].push(row);

			// keep track of minChars zero items
			if ( nullData++ < options.max ) {
				stMatchSets[""].push(row);
			}
		};

		// add the data items to the cache
		for(var i in stMatchSets) {
			var value = stMatchSets[i];
			// increase the cache size
			options.cacheLength++;
			// add to the cache
			add(i, value);
		}
	}
	
	// populate any existing data
	setTimeout(populate, 25);
	
	function flush(){
		data = {};
		length = 0;
	}
	
	return {
		flush: flush,
		add: add,
		populate: populate,
		load: function(q) {
			if (!options.cacheLength || !length)
				return null;
				// 
				// if dealing w/local data and matchContains than we must make sure
				// to loop through all the data collections looking for matches
				//
			if( !options.url && options.matchContains ){
				// track all matches
				var csub = [];
				// loop through all the data grids for matches
				for( var k in data ){
					// don't search through the stMatchSets[""] (minChars: 0) cache
					// this prevents duplicates
					if( k.length > 0 ){
						var c = data[k];
						for(var i in c) {
							var x = c[i];
							// if we've got a match, add it to the array
							if (matchSubset(x.value, q)) {
								csub.push(x);
							}
						}
					}
				}				
				return csub;
			} else 
			// if the exact item exists, use it
			if (data[q]){
				return data[q];
			} else
			if (options.matchSubset) {
				for (var i = q.length - 1; i >= options.minChars; i--) {
					var c = data[q.substr(0, i)];
					if (c) {
						var csub = [];
						for(var i in c) {
							var x = c[i];
							if (matchSubset(x.value, q)) {
								csub[csub.length] = x;
							}
						}
						return csub;
					}
				}
			}
			return null;
		}
	};
};

function recursive_node_search(elm, nodename, array) {
	var ch = elm.children;
	for(var i = 0; i < ch.length; i++) {
		if(ch[i].nodeName == nodename) {
			array.push(ch[i]);
		}
		recursive_node_search(ch[i], nodename, array);
	}
}

var element_data = {};
var element_data_id = 0;
function set_element_data(node, name, data) {
	var id = element_data_id;
	element_data_id++;
	node.elmData = id;
	element_data[id] = {};
	element_data[id][name] = data;
}
function get_element_data(node, name) {
	if(node.elmData == undefined) return;
	return element_data[node.elmData][name];
}

function autocomplete_dom_filter(dom, filter_class) {
	for(var i = 0; i < dom.length; i++) {
		var classes = dom[i].classList;
		for(var c = 0; c < classes.length; c++) {
			var cls = classes[c];
			if(cls == filter_class) {
				return dom[i];
			}
		}
	}
}

function ajaxRequest(settings) {
	var req = new XMLHttpRequest();

	var formData = "";
	var ampAppend = false;
	if(settings.data) {
		for(var i in settings.data) {
			if(ampAppend) formData += "&";
			ampAppend = true;
			formData += encodeURIComponent(i) + "=" + encodeURIComponent(settings.data[i]);
		}
	}
	// append form data to url if this is a GET
	if(settings.type == "GET" && formData) {
		settings.url += "?" + formData;
	}
	req.open(settings.type, settings.url, true);
	req.onload = function() {
		if(req.status >= 200 && req.status < 400) {
			if(settings.done) {
				settings.done(req.responseText, req);
			}
		} else {
			if(settings.error) {
				settings.error(req);
			}
		}
	}
	req.onerror = function() {
		if(settings.error) {
			settings.error(req);
		}
	}
	if(settings.type == "POST") {
		if(formData) req.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
		req.send(formData);
	} else {
		req.send();
	}
}

function autocomplete_select(options, input, select, config) {
	var CLASSES = {
		ACTIVE: "ac_over"
	};
	
	var listItems,
		active = -1,
		data,
		term = "",
		needsInit = true,
		element,
		list;
	
	// Create results
	function init() {
		if (!needsInit)
			return;
		element = document.createElement("div");
		element.style.display = "none";
		element.classList.add(options.resultsClass);
		element.style.position = "absolute";
		document.body.appendChild(element);
	
		list = document.createElement("ul");
		element.appendChild(list);

		list.onmouseover = function(event) {
			if(target(event).nodeName && target(event).nodeName.toUpperCase() == "LI") { 
				var EList = list.getElementsByTagName("li");
				for(var i = 0; i < EList.length; i++) {
					EList[i].classList.remove(CLASSES.ACTIVE);
				}
				var tgt = target(event);
				// find index
				for(var i = 0; i < EList.length; i++) {
					if(EList[i] == tgt) {
						active = i;
						break;
					}
				}
				target(event).classList.add(CLASSES.ACTIVE);
			}
		}
		list.onclick = function(event) {
			var tgt = target(event);
			if(tgt) tgt.classList.add(CLASSES.ACTIVE);
			select();
			// TODO provide option to avoid setting focus again after selection? useful for cleanup-on-focus
			input.focus();
			return false;
		}
		list.onmousedown = function() {
			config.mouseDownOnSelect = true;
		}
		list.onmouseup = function() {
			config.mouseDownOnSelect = false;
		}
		
		if( options.width > 0 )
			element.css("width", options.width);
			
		needsInit = false;
	} 
	
	function target(event) {
		var element = event.target;
		while(element && element.tagName != "LI")
			element = element.parentNode;
		// more fun with IE, sometimes event.target is empty, just ignore it then
		if(!element)
			return [];
		return element;
	}

	function moveSelect(step) {
		var liSlice1 = listItems.slice(active, active + 1);
		for(var i = 0; i < liSlice1.length; i++) {
			liSlice1[i].classList.remove(CLASSES.ACTIVE);
		}
		movePosition(step);
		var activeItem = listItems.slice(active, active + 1);
		for(var i = 0; i < activeItem.length; i++) {
			activeItem[i].classList.add(CLASSES.ACTIVE);
		}
		if(options.scroll) {
			var offset = 0;
			var liGroup1 = listItems.slice(0, active);
			for(var i = 0; i < liGroup1.length; i++) {
				offset += liGroup1[i].offsetHeight;
			}
			if((offset + activeItem[0].offsetHeight - list.scrollTop) > list.clientHeight) {
				list.scrollTop = offset + activeItem[0].offsetHeight - (list.offsetHeight - parseInt(getComputedStyle(list).padding.split("px")[0]))/*list.innerHeight()*/;
			} else if(offset < list.scrollTop) {
				list.scrollTop = offset;
			}
		}
	};
	
	function movePosition(step) {
		active += step;
		if (active < 0) {
			active = listItems.length - 1;
		} else if (active >= listItems.length) {
			active = 0;
		}
	}
	
	function limitNumberOfItems(available) {
		return options.max && options.max < available
			? options.max
			: available;
	}
	
	function fillList() {
		while(list.firstChild) list.removeChild(list.firstChild); // empty the element
		var max = limitNumberOfItems(data.length);
		for (var i=0; i < max; i++) {
			if (!data[i])
				continue;
			var formatted = options.formatItem(data[i].data, i+1, max, data[i].value, term);
			if ( formatted === false )
				continue;
			var li = document.createElement("li");
			li.innerHTML = options.highlight(formatted, term);
			li.classList.add(i%2 == 0 ? "ac_even" : "ac_odd");
			list.appendChild(li);

			set_element_data(li, "ac_data", data[i]);
		}



		listItems = [];
		recursive_node_search(list, "LI", listItems);

		if ( options.selectFirst ) {
			var liSlice = listItems.slice(0, 1);
			for(var i = 0; i < liSlice.length; i++) {
				liSlice[i].classList.add(CLASSES.ACTIVE);
			}
			active = 0;
		}
	}
	
	return {
		display: function(d, q) {
			init();
			data = d;
			term = q;
			fillList();
		},
		next: function() {
			moveSelect(1);
		},
		prev: function() {
			moveSelect(-1);
		},
		pageUp: function() {
			if (active != 0 && active - 8 < 0) {
				moveSelect( -active );
			} else {
				moveSelect(-8);
			}
		},
		pageDown: function() {
			if (active != listItems.size() - 1 && active + 8 > listItems.size()) {
				moveSelect( listItems.size() - 1 - active );
			} else {
				moveSelect(8);
			}
		},
		hide: function() {
			element && (element.style.display = "none");

			if(listItems) {
				for(var i = 0; i < listItems.length; i++) {
					listItems[i].classList.remove(CLASSES.ACTIVE)
				}
			}

			active = -1;
		},
		visible : function() {
			if(element) {
				if(element.style.display == "") return true;
			}
			return false;
		},
		current: function() {
			if(this.visible()) {
				var item = autocomplete_dom_filter(listItems, CLASSES.ACTIVE);
				if(item) {
					return (item || options.selectFirst && item);
				}
			}
		},
		show: function() {
			var offset = input.getBoundingClientRect();

			element.style.width = (typeof options.width == "string" || options.width > 0 ? options.width : input.offsetWidth) + "px";
			element.style.top = (input.offsetTop + input.offsetHeight) + "px";
			element.style.left = offset.left + "px";
			element.style.display = "";

			if(options.scroll) {
				list.scrollTop = 0;
				list.style.maxHeight = options.scrollHeight + "px";
				list.style.overflow = "auto";
			}
		},
		selected: function() {
			var item = autocomplete_dom_filter(listItems, CLASSES.ACTIVE);
			if(item) {
				item.classList.remove(CLASSES.ACTIVE);
				return get_element_data(item, "ac_data");
			}
			return false;
		},
		emptyList: function (){
			list && list.empty();
		},
		unbind: function() {
			element && element.remove();
		}
	};
};

function autocomplete_selection(element, start, end) {
	if (start !== undefined) {
		return this.each(function() {
			if( element.createTextRange ){
				var selRange = element.createTextRange();
				if (end === undefined || start == end) {
					selRange.move("character", start);
					selRange.select();
				} else {
					selRange.collapse(true);
					selRange.moveStart("character", start);
					selRange.moveEnd("character", end);
					selRange.select();
				}
			} else if( element.setSelectionRange ){
				element.setSelectionRange(start, end);
			} else if( element.selectionStart ){
				element.selectionStart = start;
				element.selectionEnd = end;
			}
		});
	}
	var field = element;
	if ( field.createTextRange ) {
		var range = document.selection.createRange(),
			orig = field.value,
			teststring = "<->",
			textLength = range.text.length;
		range.text = teststring;
		var caretAt = field.value.indexOf(teststring);
		field.value = orig;
		element.selection(caretAt, caretAt + textLength);
		return {
			start: caretAt,
			end: caretAt + textLength
		}
	} else if( field.selectionStart !== undefined ){
		return {
			start: field.selectionStart,
			end: field.selectionEnd
		}
	}
};