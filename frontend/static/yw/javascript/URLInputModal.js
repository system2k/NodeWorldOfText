var URLInputModal = (function() {
	function URLInputModal() {
		var _this = this;
		this.close = function() {
			$("#url_input_cancel").trigger("click");
		};
		this.onSubmit = function() {
			var url = $("#url_input_form_input").val();
			_this.close();
			setTimeout((function() {
				return _this.callback(url);
			}), 0);
			return false;
		};
		this.$el = $("#url_input_modal");
		assert(this.$el.length === 1);
		this.el = this.$el[0];
		this.$el.find("form").submit(this.onSubmit);
	}
	URLInputModal.prototype.open = function(callback) {
		this.callback = callback;
		return this.$el.modal({
			minHeight: 80,
			minWidth: 160,
			persist: true
		});
	};
	return URLInputModal;
}());