import WebSocket from 'ws';

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

  private _onOpen(ws: WebSocket): void {
    this.activeSockets.push(ws);

    const reqs = this.pendingRequests.splice(0, this.pendingRequests.length);

    for (const req of reqs) {
      req.accept(ws);
    }
  }

  private _onClose(ws: WebSocket, code: number, reason: string): void {
    const idx = this.activeSockets.indexOf(ws);

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
    const self = this;

    this.pendingSockets++;

    const ws = new WebSocket(this.url, this.protocol);
    ws.binaryType = 'arraybuffer';
    ws.on('close', function(code, reason) { return self._onClose(this, code, reason); });
    ws.on('open', function() { return self._onOpen(this); });

    return ws;
  }
}