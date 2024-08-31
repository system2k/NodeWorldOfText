import { ReconnectingWebSocket } from "./ReconnectingWebSocket";
import { ITilePosition } from "./interfaces";

export class Network {
	private latestID: number = 0;
	private callbacks: object = {};


	constructor(private socket: ReconnectingWebSocket | WebSocket) {

	}

	public transmit(data: string) {
		let serialized = JSON.stringify(data);
		try {
			this.socket.send(serialized);
		} catch(e) {
			console.warn("Transmission error");
		}
	}

	public protect(position: ITilePosition) {

	}

	public link() {

	}

	public cmd() {

	}

	public cmd_opt() {

	}

	public write() {

	}

	public chathistory() {

	}

	public fetch() {

	}

	public chat() {

	}

	public ping() {

	}

	public clear_tile() {

	}

	public cursor() {

	}

	public boundary() {

	}

	public stats() {

	}
}
