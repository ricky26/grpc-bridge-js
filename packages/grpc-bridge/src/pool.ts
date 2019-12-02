interface PendingRequest<TSocket> {
  accept(ws: TSocket): void;
  reject(err: Error): void;
}

export interface SocketLifetime<TSocket> {
  addSocket(s: TSocket): void;
  removeSocket(s: TSocket): void;
}

export type SocketFactory<TSocket> = (l: SocketLifetime<TSocket>) => TSocket;

export class SocketPool<TSocket> implements SocketLifetime<TSocket> {
  private pendingSockets: TSocket[];
  private activeSockets: TSocket[];
  targetSize: number;

  private pendingRequests: PendingRequest<TSocket>[];

  constructor(private factory: SocketFactory<TSocket>) {
    this.activeSockets = [];
    this.pendingSockets = [];
    this.targetSize = 1;

    this.pendingRequests = [];
    this.createSockets();

    this.addSocket = this.addSocket.bind(this);
    this.removeSocket = this.removeSocket.bind(this);
  }

  private removePendingSocket(s: TSocket): void {
    const idx = this.pendingSockets.indexOf(s);
    if (idx >= 0) {
      this.pendingSockets.splice(idx, 1);
    }
  }

  addSocket(s: TSocket): void {
    this.removePendingSocket(s);
    this.activeSockets.push(s);

    const reqs = this.pendingRequests.splice(0, this.pendingRequests.length);

    for (const req of reqs) {
      req.accept(s);
    }
  }

  removeSocket(s: TSocket): void {
    this.removePendingSocket(s);
    const idx = this.activeSockets.indexOf(s);

    if (idx >= 0) {
      this.activeSockets.splice(idx, 1);
    }

    this.createSockets();
  }

  get(): Promise<TSocket> {
    if (this.activeSockets.length > 0) {
      return Promise.resolve(this.activeSockets[0]);
    }

    return new Promise((accept, reject) => {
      this.pendingRequests.push({ accept, reject });
    });
  }

  createSockets(): void {
    while (this.pendingSockets.length + this.activeSockets.length < this.targetSize) {
      this.createSocket();
    }
  }

  createSocket(): TSocket {
    const socket = this.factory(this);
    if (this.activeSockets.indexOf(socket) < 0) {
      this.pendingSockets.push(socket);
    }
    return socket;
  }
}
