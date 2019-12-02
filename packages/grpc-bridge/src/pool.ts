interface PendingRequest {
  accept(ws: WebSocket): void;
  reject(err: Error): void;
}

export class WebSocketPool {
  private pendingSockets: number;
  readonly activeSockets: WebSocket[];
  targetSize: number;

  private pendingRequests: PendingRequest[];

  constructor(private url: string, private protocol?: string | string[]) {
    this.activeSockets = [];
    this.pendingSockets = 0;
    this.targetSize = 1;

    this.pendingRequests = [];

    this.createWebSockets();
  }

  private _onOpen(ev: Event): void {
    const ws = ev.target as WebSocket;
    this.activeSockets.push(ws);

    const reqs = this.pendingRequests.splice(0, this.pendingRequests.length);

    for (const req of reqs) {
      req.accept(ws);
    }
  }

  private _onClose(ev: Event): void {
    const idx = this.activeSockets.indexOf(ev.target as WebSocket);

    if (idx >= 0) {
      this.activeSockets.splice(idx, 1);
    }

    this.createWebSockets();
  }

  get(): Promise<WebSocket> {
    if (this.activeSockets.length > 0) {
      return Promise.resolve(this.activeSockets[0]);
    }

    return new Promise((accept, reject) => {
      this.pendingRequests.push({ accept, reject });
    });
  }

  createWebSockets(): void {
    while (this.pendingSockets + this.activeSockets.length < this.targetSize) {
      this.createWebSocket();
    }
  }

  createWebSocket(): WebSocket {
    this.pendingSockets++;

    const ws = new WebSocket(this.url, this.protocol);
    ws.binaryType = 'arraybuffer';
    ws.onclose = this._onClose.bind(this);
    ws.onopen = this._onOpen.bind(this);

    return ws;
  }
}