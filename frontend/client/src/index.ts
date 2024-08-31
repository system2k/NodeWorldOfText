declare const IS_DEV : string | undefined;

import { ReconnectingWebSocket } from "./ReconnectingWebSocket";

/*

HTTP api:
	Have it exposed but with functions having different parameters.
	i.e.:
		public api: fetch(tileX1, tileY1, tileX2, tileY2)
		private api: fetch(range: CoordRange)

the renderer should be a class that can be instantiated multiple times to provide for
multiplexing support.

*/

class Renderer {
	constructor(mainCanvas: HTMLCanvasElement) {

	}
}

class OWOT {
	public socket: ReconnectingWebSocket | WebSocket = null;
	public renderer: Renderer = null;

	constructor() {

	}
}

function begin() {
	(window as any).w = new OWOT();
}
begin();