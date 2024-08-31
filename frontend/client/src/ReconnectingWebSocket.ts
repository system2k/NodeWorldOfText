export class ReconnectingWebSocket {
	private binaryType: BinaryType;
	private onopen: Function;
	private onclose: Function;
	private onmessage: Function;
	private onerror: Function;
	private reconnectTimeout: number;
	private socket: WebSocket;
	public send: Function;
	public close: Function;
	public refresh: Function;

	constructor(url: string) {
		this.binaryType = "blob";
		this.onopen = null;
		this.onclose = null;
		this.onmessage = null;
		this.onerror = null;
		this.reconnectTimeout = 1000;
		var closed = false;
		var self = this;
		function connect() {
			self.socket = new WebSocket(url);
			self.socket.onclose = function(r) {
				if(self.onclose) self.onclose(r);
				if(closed) return;
				setTimeout(connect, self.reconnectTimeout);
			};
			self.socket.onopen = function(e) {
				self.socket.binaryType = self.binaryType;
				if(self.onopen) self.onopen(e);
			};
			self.socket.onmessage = function(m) {
				if(self.onmessage) self.onmessage(m);
			};
			self.socket.onerror = function(m) {
				if(self.onerror) self.onerror(m);
			};
		}
		connect();
		this.send = function (data: any) {
			this.socket.send(data);
		};
		this.close = function () {
			closed = true;
			this.socket.close();
		};
		this.refresh = function () {
			this.socket.close();
		};
		return this;
	}
}