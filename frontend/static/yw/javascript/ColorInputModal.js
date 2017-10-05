var ColorInputModal = (function() {
	function ColorInputModal() {
		var _this = this;
		this.close = function() {
			$("#color_input_cancel").trigger("click");
		};
		this.onSubmit = function() {
			var code = $("#color_input_form_input").val();
			_this.close();
			setTimeout((function() {
				return _this.callback(code);
			}), 0);
			return false;
		};
		this.$el = $("#color_input_modal");
		assert(this.$el.length === 1);
		this.el = this.$el[0];
		this.$el.find("form").submit(this.onSubmit);
	}
	ColorInputModal.prototype.open = function(callback) {
		this.callback = callback;
		return this.$el.modal({
			minHeight: 80,
			minWidth: 160,
			persist: true
		});
	};
	return ColorInputModal;
}());