import { Status, Message, Metadata as MetadataPb, Call, Payload, Close } from '../proto/bridge_pb';
import { StreamEvents, Stream, Channel, CallOptions, Metadata } from './service';
import { TypedEventTarget } from './events';
import { WebSocketPool } from './pool';

const STATUS_ABRUPT = new Status();
STATUS_ABRUPT.setCode(2);
STATUS_ABRUPT.setMessage('Call aborted.');

class WSStream extends TypedEventTarget<StreamEvents> implements Stream {
  private status: Status | null;
  private trailer: Metadata;
  private open: boolean;
  private cleanup: () => void;

  constructor(private transport: WebSocket, private streamId: number, call: Call, metadata?: Metadata) {
    super();

    this.open = true;
    this.status = null;
    this.trailer = new Map();

    const onClose = this.onClose.bind(this);
    const onMessage = this.onMessage.bind(this);

    transport.addEventListener('close', onClose);
    transport.addEventListener('message', onMessage);
    this.cleanup = () => {
      transport.removeEventListener('close', onClose);
      transport.removeEventListener('message', onMessage);
    };

    const m = new Message();
    m.setStreamId(streamId);
    m.setCall(call);
    transport.send(m.serializeBinary());

    if (metadata !== undefined) {
      const md = new MetadataPb();

      for (const [k, v] of metadata.entries()) {
        const item = new MetadataPb.Item();
        item.setKey(k);
        item.setValueList(v);
        md.addMetadata(item);
      }

      m.setMetadata(md);
      transport.send(m.serializeBinary());
    }
  }

  private doClose() {
    this.dispatchEvent(new CustomEvent('end', {
      detail: {
        status: this.status || STATUS_ABRUPT,
        trailer: this.trailer,
      },
    }));
    this.cleanup();
  }

  private onClose(evt: CloseEvent) {
    const s = new Status();
    s.setCode(2);
    s.setMessage(`WS error ${evt.code}: ${evt.reason}`);
    this.status = s;
    this.open = false;
    this.doClose();
  }

  private onMessage(evt: MessageEvent): void {
    const msg = Message.deserializeBinary(evt.data as Uint8Array);

    switch (msg.getMessageCase()) {
      case Message.MessageCase.CLOSE:
        this.doClose();
        break;
      
      case Message.MessageCase.METADATA:
        const meta = msg.getMetadata()!;
        const md = new Map<string, string[]>();

        for (const item of meta.getMetadataList()) {
          md.set(item.getKey(), item.getValueList());
        }

        if (this.status === null) {
          this.dispatchEvent(new CustomEvent('header', {
            detail: { header: md },
          }));
        } else {
          this.trailer = md;
        }

        break;

      case Message.MessageCase.PAYLOAD:
        const payload = msg.getPayload()!;
        const p = payload.getPayload() as Uint8Array;
        this.dispatchEvent(new CustomEvent('message', {
          detail: { message: p },
        }));
        break;

      case Message.MessageCase.STATUS:
        this.status = msg.getStatus()!;
        break;

      default:
        throw new Error(`unexpected message ${msg}`);
    }
  }

  send(msg: Uint8Array): void {
    if (!this.open) {
      throw new Error('send on closed stream');
    }

    const p = new Payload();
    p.setPayload(msg);

    const m = new Message()
    m.setStreamId(this.streamId);
    m.setPayload(p);
    this.transport.send(m.serializeBinary());
  }

  close(): void {
    if (!this.open) {
      throw new Error('close on closed stream');
    }

    const x = new Close();
    const m = new Message()
    m.setStreamId(this.streamId);
    m.setClose(x);
    this.transport.send(m.serializeBinary());
    this.open = false;
  }
}

interface WSChannelOptions {
  url: string;
}

export class WSChannel implements Channel {
  private nextStream: number;
  private pool: WebSocketPool;

  constructor(options: WSChannelOptions) {
    this.nextStream = 7;
    this.pool = new WebSocketPool(options.url);
  }

  async createStream(options: CallOptions): Promise<Stream> {
    const streamId = this.nextStream++;
    const ws = await this.pool.get();

    const c = new Call();
    c.setMethod(options.method);
    return new WSStream(ws, streamId, c, options.metadata);
  }
}