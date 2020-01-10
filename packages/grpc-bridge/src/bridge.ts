import { Status, Message, Metadata as MetadataPb, Call, Payload, Close, End, Ready } from '../proto/bridge_pb';
import { Metadata, StreamWriter, StreamObserver, StatusError, Channel, CallOptions, AsyncStreamWriter, ExtraCallOptions } from './service';
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

type SemaCallback = (e?: Error) => void;
class Sema {
  private count: number;
  private onChange: SemaCallback[];
  private cancelError?: Error;

  constructor() {
    this.count = 0;
    this.onChange = [];
  }

  addWatch(cb: SemaCallback): void {
    if (this.cancelError) {
      return cb(this.cancelError);
    }

    const idx = this.onChange.indexOf(cb);
    if (idx < 0) {
      this.onChange.push(cb);
    }
  }

  removeWatch(cb: SemaCallback): void {
    const idx = this.onChange.indexOf(cb);
    if (idx >= 0) {
      this.onChange.splice(idx, 1);
    }
  }

  cancel() {
    this.cancelError = new Error('cancelling sema');
    this.onChange.splice(0, this.onChange.length).forEach(v => v(this.cancelError));
  }

  mod(delta: number) {
    this.count += delta;
    this.onChange.slice().forEach(v => v());
  }

  inc(amt: number = 1) {
    return this.mod(amt); 
  }

  dec(amt: number = 1): Promise<void> {
    return new Promise((accept, reject) => {
      if (this.count > 0) {
        this.count -= amt;
        return accept();
      }

      const handle = (err?: Error) => {
        if (err) {
          cleanup();
          return reject(err);
        }

        if (this.count > 0) {
          this.count -= amt;
          cleanup();
          return accept();
        }
      }

      const cleanup = () => this.removeWatch(handle);
      this.onChange.push(handle);
    });
  }
}

const STATUS_ABRUPT = new Status();
STATUS_ABRUPT.setCode(2);
STATUS_ABRUPT.setMessage('Call aborted.');

class BridgeStream implements StreamWriter<Uint8Array> {
  private status: Status;
  private trailer: Metadata;
  private open: boolean;
  private ready: Sema;

  constructor(
    private unlink: () => void,
    private transportWriter: TransportWriter,
    private streamId: number,
    private observer: StreamObserver<Uint8Array>,
    call: Call, options?: ExtraCallOptions)
  {
    this.open = true;
    this.status = STATUS_ABRUPT;
    this.trailer = new Map();
    this.ready = new Sema();

    const m = new Message();
    m.setStreamId(streamId);
    m.setCall(call);
    transportWriter.send(m.serializeBinary());

    if (options && options.metadata) {
      const md = new MetadataPb();

      for (const [k, v] of options.metadata.entries()) {
        const item = new MetadataPb.Item();
        item.setKey(k);
        item.setValueList(v);
        md.addMetadata(item);
      }

      m.setMetadata(md);
      transportWriter.send(m.serializeBinary());
    }

    const initialWindowSize = (options && options.initialWindowSize) || (64 * 1024);

    const r = new Ready()
    r.setCount(initialWindowSize);
    m.setReady(r);
    transportWriter.send(m.serializeBinary());
  }

  onClose(err: Error) {
    const { status, trailer } = StatusError.fromError(err);
    this.status = status;
    this.trailer = trailer;
    this.cancel();
    this.sendStatus();
  }

  sendStatus() {
    const err = StatusError.fromStatus(this.status, this.trailer);
    this.observer.onEnd(err.ok ? undefined : err, err.trailer);
    this.unlink();
    this.ready.cancel();
  }

  onMessage(msg: Message): void {
    switch (msg.getMessageCase()) {
      case Message.MessageCase.END:
        this.sendStatus();
        break;
      
      case Message.MessageCase.METADATA:
        const meta = msg.getMetadata()!;
        const md = new Map<string, string[]>();

        for (const item of meta.getMetadataList()) {
          md.set(item.getKey(), item.getValueList());
        }

        if (this.status === STATUS_ABRUPT) {
          this.observer.onHeader(md);
        } else {
          this.trailer = md;
        }

        break;

      case Message.MessageCase.READY:
        this.ready.inc(msg.getReady()!.getCount());
        break;

      case Message.MessageCase.PAYLOAD:
        const payload = msg.getPayload()!;
        const p = payload.getPayload() as Uint8Array;

        Promise.resolve(this.observer.onMessage(p))
          .catch(err => this.onClose(err))
          .then(() => {
            const m = new Message();
            const r = new Ready()
            r.setCount(p.length);
            m.setStreamId(this.streamId);
            m.setReady(r);
            this.transportWriter.send(m.serializeBinary());
          });
        break;

      case Message.MessageCase.STATUS:
        this.status = msg.getStatus()!;
        break;

      default:
        throw new Error(`unexpected message ${msg}`);
    }
  }

  async send(msg: Uint8Array): Promise<void> {    
    await this.ready.dec(msg.length);

    if (!this.open) {
      return;
    }

    const p = new Payload();
    p.setPayload(msg);

    const m = new Message()
    m.setStreamId(this.streamId);
    m.setPayload(p);
    this.transportWriter.send(m.serializeBinary());
  }

  end(): void {
    this.ready.cancel();

    const e = new End();
    const m = new Message()
    m.setStreamId(this.streamId);
    m.setEnd(e);
    this.transportWriter.send(m.serializeBinary());
  }

  cancel(): void {
    if (!this.open) {
      return;
    }

    this.open = false;
    this.ready.cancel();

    const c = new Close();
    const m = new Message()
    m.setStreamId(this.streamId);
    m.setClose(c);
    this.transportWriter.send(m.serializeBinary());
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
  }

  onClose(err: Error): void {
    this.lifecycle.removeSocket(this);

    const closed = Array.from(this.streams.values());
    this.streams.clear();

    for (const s of closed) {
      s.onClose(err);
    }
  }

  destroy(): void {
    return this.onClose(new Error('shutting down'));
  }

  async createStream(observer: StreamObserver<Uint8Array>, options: CallOptions): Promise<StreamWriter<Uint8Array>> {
    const c = new Call();
    c.setMethod(options.method);

    const streamId = this.nextStream++;
    const unlink = () => this.streams.delete(streamId);
    const stream = new BridgeStream(unlink, this.writer, streamId, observer, c, options);
    this.streams.set(streamId, stream);
    return stream;
  }
}

export class BridgeChannel implements Channel {
  private pool: SocketPool<BridgeTransport>;

  constructor(factory: (observer: TransportObserver) => TransportWriter) {
    this.pool = new SocketPool(lifecycle => new BridgeTransport(lifecycle, factory));
  }

  destroy(): void {
    const transports = this.pool.destroy();
    for (const transport of transports) {
      transport.destroy();
    }
  }

  createStream(observer: StreamObserver<Uint8Array>, options: CallOptions): StreamWriter<Uint8Array> {
    const asyncWriter = new AsyncStreamWriter<Uint8Array>();

    (async() => {
      try {
        const transport = await this.pool.get();
        const stream = await transport.createStream(observer, options);
        await asyncWriter.onReady(stream);
      } catch (err) {
        observer.onEnd(err);
      }
    })();

    return asyncWriter;
  }
}
