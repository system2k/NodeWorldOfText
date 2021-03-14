var is_nsfw = state.worldModel.nsfw;
function redir() {
	window.location.pathname = "/accounts/nsfw/" + state.worldModel.name;
}
if(is_nsfw) {
	var check = localStorage.getItem("nsfw_yes")
	if(check) {
		check = JSON.parse(check);
		if(!check[state.worldModel.name.toUpperCase()]) {
			redir();
		}
	} else {
		redir();
	}
}