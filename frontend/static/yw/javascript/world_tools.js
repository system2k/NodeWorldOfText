client_commands.search = function(args) {
	var phrase = args.join(" ");
	if(!phrase) return;
	clientChatResponse("Looking for phrase: \"" + phrase + "\"");
	function doSearch() {
		searchLookup({
			text: phrase
		}, function(val) {
			val = (val * 100).toFixed(2);
			clientChatResponse("Searching... (" + val + "%)");
		}).then(function(coords) {
			var data = "Results:<br>";
			for(var i = 0; i < coords.length; i++) {
				var pos = coords[i];
				var scr = "javascript:searchTeleportTo(" + pos[0] + ", " + pos[1] + ", " + pos[2] + ", " + pos[3] + ", " + phrase.length + ")";
				var sty = "text-decoration: underline; color: blue;";
				data += "<a href=\"" + scr + "\" style=\"" + sty + "\">(" + pos[0] + ", " + pos[1] + ") [" + pos[2] + ", " + pos[3] + "]</a><br>";
			}
			addChat(null, 0, "user", "[ Client ]", data, "Client", true, false, false, null, getDate());
		});
	}
	if(!window.OWOTSearchUtil) {
		w.loadScript("/static/yw/javascript/search_util.js", doSearch);
	} else {
		doSearch();
	}
}
