import WebSocket from 'ws';
import { BridgeChannel } from '@wellplayed/grpc-bridge';

const PROTOCOLS = [
  'grpc-bridge-1',
];

interface WSChannelOptions {
  url: string;
}

export class WSChannel extends BridgeChannel {
  constructor(options: WSChannelOptions) {
    super(observer => {
      const ws = new WebSocket(options.url, PROTOCOLS);
      ws.onopen = () => observer.onReady();
      ws.onclose = evt => observer.onClose(new Error(`WS closed ${evt.code}: ${evt.reason}`));
      ws.onmessage = evt => observer.onMessage(evt.data as Uint8Array);
      return ws;
    });
  }
}
