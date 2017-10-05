var CoordinateInputModal = (function() {
	function CoordinateInputModal() {
		var _this = this;
		this.close = function() {
			$("#coord_input_cancel").trigger("click");
		};
		this.onSubmit = function() {
			var f = _this.$el.find("form")[0];
			var y = parseInt(f.coord_input_Y.value, 10);
			var x = parseInt(f.coord_input_X.value, 10);
			var fail = false;
			if (isNaN(y)) {
				fail = true;
				$(f.coord_input_Y).css("border", "1px solid red");
			} else {
				$(f.coord_input_Y).css("border", "");
				f.coord_input_Y.value = y;
			}
			if (isNaN(x)) {
				fail = true;
				$(f.coord_input_X).css("border", "1px solid red");
			} else {
				$(f.coord_input_X).css("border", "");
				f.coord_input_X.value = x;
			}
			if (!fail) {
				_this.close();
				setTimeout((function() {
					return _this.callback(y, x);
				}), 0);
			}
			return false;
		};
		this.$el = $("#coordinate_input_modal");
		assert(this.$el.length === 1);
		this.el = this.$el[0];
		this.$el.find("form").submit(this.onSubmit);
	}
	CoordinateInputModal.prototype.open = function(title, callback) {
		$("#coord_input_title").text(title);
		this.callback = callback;
		return this.$el.modal({
			minHeight: 80,
			minWidth: 160,
			persist: true
		});
	};
	return CoordinateInputModal;
}());