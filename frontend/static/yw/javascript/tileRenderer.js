var TileRenderer = (function() {
	function TileRenderer(container) {
		this.container = container;
		this.worldFragment = document.createDocumentFragment();
	}
	TileRenderer.prototype.renderTiles = function() {
		this.container.appendChild(this.worldFragment);
	};
	return TileRenderer;
}());