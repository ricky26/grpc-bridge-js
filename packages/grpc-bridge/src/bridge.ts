import { Status, Message, Metadata as MetadataPb, Call, Payload, Close } from '../proto/bridge_pb';
import { Metadata, StreamWriter, StreamObserver, StatusError, Channel, CallOptions } from './service';
import { SocketPool, SocketLifetime } from './pool';

export interface TransportObserver {
  onReady(): void;
  onMessage(msg: Uint8Array): void;
  onClose(err: Error): void;
}

export interface TransportWriter {
  send(msg: Uint8Array): void;
  close(): void;
}

const STATUS_ABRUPT = new Status();
STATUS_ABRUPT.setCode(2);
STATUS_ABRUPT.setMessage('Call aborted.');

export class BridgeStream implements StreamWriter<Uint8Array> {
  private status: Status;
  private trailer: Metadata;
  private open: boolean;

  constructor(
    private transportWriter: TransportWriter,
    private streamId: number,
    private observer: StreamObserver<Uint8Array>,
    call: Call, metadata?: Metadata)
  {
    this.open = true;
    this.status = STATUS_ABRUPT;
    this.trailer = new Map();

    const m = new Message();
    m.setStreamId(streamId);
    m.setCall(call);
    transportWriter.send(m.serializeBinary());

    if (metadata !== undefined) {
      const md = new MetadataPb();

      for (const [k, v] of metadata.entries()) {
        const item = new MetadataPb.Item();
        item.setKey(k);
        item.setValueList(v);
        md.addMetadata(item);
      }

      m.setMetadata(md);
      transportWriter.send(m.serializeBinary());
    }
  }

  onClose(err: Error) {
    if (!this.open) {
      return;
    }

    const { status, trailer } = StatusError.fromError(err);
    this.status = status;
    this.trailer = trailer;
    this.doClose();
  }

  doClose() {
    if (!this.open) {
      return;
    }

    this.open = false;
    this.observer.onEnd(this.status, this.trailer);
  }

  onMessage(msg: Message): void {
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
          this.observer.onHeader(md);
        } else {
          this.trailer = md;
        }

        break;

      case Message.MessageCase.PAYLOAD:
        const payload = msg.getPayload()!;
        const p = payload.getPayload() as Uint8Array;
        this.observer.onMessage(p);
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
    this.transportWriter.send(m.serializeBinary());
  }

  close(): void {
    if (!this.open) {
      throw new Error('close on closed stream');
    }

    const x = new Close();
    const m = new Message()
    m.setStreamId(this.streamId);
    m.setClose(x);
    this.transportWriter.send(m.serializeBinary());
    this.open = false;
  }
}

class BridgeTransport implements TransportObserver {
  private nextStream: number;
  private streams: Map<number, BridgeStream>;
  private writer: TransportWriter;

  constructor(private lifecycle: SocketLifetime<BridgeTransport>, factory: (observer: TransportObserver) => TransportWriter) {
    this.nextStream = 7;
    this.streams = new Map();
    this.writer = factory(this);
  }

  onReady(): void {
    this.lifecycle.addSocket(this);
  }

  onMessage(data: Uint8Array): void {
    const msg = Message.deserializeBinary(data);
    const streamId = msg.getStreamId();
    const stream = this.streams.get(streamId);

    if (stream === undefined) {
      this.writer.close();
      return;
    }

    stream.onMessage(msg);

    if (msg.getMessageCase() === Message.MessageCase.CLOSE) {
      this.streams.delete(streamId);
    }
  }

  onClose(err: Error): void {
    this.lifecycle.removeSocket(this);

    const closed = Array.from(this.streams.values());
    this.streams.clear();

    for (const s of closed) {
      s.onClose(err);
    }
  }

  async createStream(observer: StreamObserver<Uint8Array>, options: CallOptions): Promise<StreamWriter<Uint8Array>> {
    const c = new Call();
    c.setMethod(options.method);

    const streamId = this.nextStream++;
    const stream = new BridgeStream(this.writer, streamId, observer, c, options.metadata);
    this.streams.set(streamId, stream);
    return stream;
  }
}

export class BridgeChannel implements Channel {
  private pool: SocketPool<BridgeTransport>;

  constructor(factory: (observer: TransportObserver) => TransportWriter) {
    this.pool = new SocketPool(lifecycle => new BridgeTransport(lifecycle, factory));
  }

  async createStream(observer: StreamObserver<Uint8Array>, options: CallOptions): Promise<StreamWriter<Uint8Array>> {
    const transport = await this.pool.get();
    return transport.createStream(observer, options);
  }
}
