function getCookie(name) {
	var cookieValue = null;
	if (document.cookie && document.cookie !== "") {
		var cookies = document.cookie.split(";");
		var i = 0;
		while (i < cookies.length) {
			var cookie = $.trim(cookies[i]);
			if (cookie.substring(0, name.length + 1) === (name + "=")) {
				cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
				break;
			}
			i++;
		}
	}
	return cookieValue;
}
var csrftoken = getCookie("csrftoken");

function csrfSafeMethod(method) {
	return (/^(GET|HEAD|OPTIONS|TRACE)$/.test(method));
}

function sameOrigin(url) {
	var host = document.location.host;
	var protocol = document.location.protocol;
	var srOrigin = "//" + host;
	var origin = protocol + srOrigin;
	return (url === origin || url.slice(0, origin.length + 1) === origin + "/") || (url === srOrigin || url.slice(0, srOrigin.length + 1) === srOrigin + "/") || !(/^(\/\/|http:|https:).*/.test(url));
}

function setUpAjax() {
	$.ajaxSetup({
		beforeSend: function(xhr, settings) {
			if (!csrfSafeMethod(settings.type) && sameOrigin(settings.url)) {
				xhr.setRequestHeader("X-CSRFToken", csrftoken);
			}
		}
	});
}