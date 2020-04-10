import { Message } from 'google-protobuf';
import { ServiceOptions, MethodOptions } from 'google-protobuf/google/protobuf/descriptor_pb';
import { Any } from 'google-protobuf/google/protobuf/any_pb';
import { Status } from '../proto/bridge_pb';
import { StatusCode } from './codes';

export type Metadata = Map<string, string[]>;
export type StatusEvent = CustomEvent<{ status: Status, trailer: Metadata }>;
export type HeaderEvent = CustomEvent<{ header: Metadata }>;
export type MessageEvent<TMsg> = CustomEvent<{ message: TMsg }>;

export interface StreamObserver<TMsg> {
  onHeader(header: Metadata): void;
  onMessage(msg: TMsg): Promise<void> | void;
  onEnd(error?: Error, trailer?: Metadata): void;
}

export interface Cancelable {
  cancel(): void;
}

export interface StreamWriter<TMsg> extends Cancelable {
  send(msg: TMsg): Promise<void>;
  end(): void;
}

export interface UnaryResponse<T> {
  header: Metadata;
  trailer: Metadata;
  message: T;
}

export interface UnaryCall<T> extends Cancelable {
  response: Promise<UnaryResponse<T>>;
}

export class AsyncStreamWriter<T> implements StreamWriter<T> {
  private queue: T[];
  private shouldEnd: boolean;
  private shouldCancel: boolean;
  private inner: StreamWriter<T> | null;

  constructor() {
    this.queue = [];
    this.shouldEnd = false;
    this.shouldCancel = false;
    this.inner = null;
  }

  async onReady(writer: StreamWriter<T>): Promise<void> {
    this.inner = writer;

    const q = this.queue.splice(0, this.queue.length);

    for (const m of q) {
      await writer.send(m);
    }

    if (this.shouldEnd) {
      writer.end();
    }

    if (this.shouldCancel) {
      writer.cancel();
    }
  }

  send(m: T): Promise<void> {
    if (this.inner) {
      return this.inner.send(m);
    }

    this.queue.push(m);
    return Promise.resolve();
  }

  end(): void {
    if (this.inner) {
      return this.inner.end();
    }

    this.shouldEnd = true;
  }

  cancel(): void {
    if (this.inner) {
      return this.inner.cancel();
    }

    this.shouldCancel = true;
  }
}

export function mapStreamObserver<TInner, TOuter>(observer: StreamObserver<TOuter>, mapper: (x: TInner) => TOuter): StreamObserver<TInner> {
  return {
    onHeader(header: Metadata): void {
      return observer.onHeader(header);
    },
    onMessage(msg: TInner): Promise<void> | void {
      return observer.onMessage(mapper(msg));
    },
    onEnd(error?: Error, trailer?: Metadata): void {
      return observer.onEnd(error, trailer);
    },
  };
}

export function mapStreamWriter<TInner, TOuter>(writer: StreamWriter<TInner>, mapper: (x: TOuter) => TInner): StreamWriter<TOuter> {
  return {
    send(msg: TOuter): Promise<void> {
      return writer.send(mapper(msg));
    },
    end(): void {
      return writer.end();
    },
    cancel(): void {
      return writer.cancel();
    },
  };
}

export function streamObserverThrow<T>(observer: StreamObserver<T>, err: Error): void {
  const statusErr = StatusError.fromError(err);
  observer.onEnd(statusErr.ok ? statusErr : undefined, statusErr.trailer);
}

export class AsyncStreamObserver<TMsg> implements StreamObserver<TMsg> {
  public header: Metadata;
  public message: TMsg | null;
  public trailer: Metadata;
  public status: Status;

  constructor(private accept: (target: UnaryResponse<TMsg>) => void, private reject: (err: Error) => void) {
    this.header = new Map();
    this.message = null;
    this.trailer = new Map();
    this.status = new Status();
  }

  onHeader(header: Metadata): void {
    this.header = header;
  }
  
  onMessage(msg: TMsg): Promise<void> | void {
    this.message = msg;
  }

  onEnd(err?: Error, trailer?: Metadata): void {
    if (err) {
      this.reject(err);
    } else {
      this.accept({
        header: this.header,
        trailer: trailer || new Map(),
        message: this.message!,
      });
    }
  }
}

export class StatusError extends Error {
  constructor(public code: number, message: string, public details: Any[] = [], public trailer: Metadata = new Map()) {
    super(message);
  }

  get ok(): boolean {
    return this.code === StatusCode.OK;
  }

  get status(): Status {
    const s = new Status();
    s.setCode(this.code);
    s.setMessage(this.message);
    s.setDetailsList(this.details);
    return s;
  }

  static fromError(err: Error): StatusError {
    if (err instanceof StatusError) {
      return err;
    }

    return new StatusError(2, err.toString());
  }

  static fromStatus(status: Status, trailer: Metadata = new Map()): StatusError {
    return new StatusError(status.getCode(), status.getMessage(), status.getDetailsList(), trailer);
  }

  static fromEvent(evt: StatusEvent): StatusError {
    const { status, trailer } = evt.detail;
    return StatusError.fromStatus(status, trailer);
  }
}

export interface MessageType<T extends Message = Message> {
  new(): T;
  deserializeBinary(data: Uint8Array): T;
}

export interface ServiceMethod<TIn extends Message = Message, TOut extends Message = Message> {
  name: string;
  path: string;
  options: MethodOptions.AsObject,
  inputType: MessageType<TIn>;
  outputType: MessageType<TOut>;
  serverStreaming: boolean;
  clientStreaming: boolean;
}

export interface Service {
  name: string;
  options: ServiceOptions.AsObject,
  methods: ServiceMethod[],
}

export interface ExtraCallOptions {
  metadata?: Metadata;
  initialWindowSize?: number;
}

export interface CallOptions extends ExtraCallOptions {
  method: string;
}

export interface Channel {
  createStream(observer: StreamObserver<Uint8Array>, options: CallOptions): StreamWriter<Uint8Array>;
}

export class ClientBase {
  constructor(private channel: Channel) {}
}

export {
  Status,
};

export function invoke<TIn extends Message, TOut extends Message>(
  channel: Channel,
  method: ServiceMethod<TIn, TOut>,
  observer: StreamObserver<TOut>,
  options: ExtraCallOptions = {}): StreamWriter<TIn> {

  const rawObserver = mapStreamObserver<Uint8Array, TOut>(observer, x => method.outputType.deserializeBinary(x));
  const rawWriter = channel.createStream(rawObserver, { ...options, method: method.path });
  return mapStreamWriter(rawWriter, x => x.serializeBinary());
}

export function invokeServerStreaming<TIn extends Message, TOut extends Message>(
  channel: Channel,
  method: ServiceMethod<TIn, TOut>,
  input: TIn,
  observer: StreamObserver<TOut>,
  options: ExtraCallOptions = {}): Cancelable {

  const writer = invoke(channel, method, observer, options);
  writer.send(input);
  writer.end();
  return writer;
}

export function invokeUnary<TIn extends Message, TOut extends Message>(
  channel: Channel,
  method: ServiceMethod<TIn, TOut>,
  input: TIn,
  options: ExtraCallOptions = {}): UnaryCall<TOut> {
  
  let writer: Cancelable;
  const response = new Promise<UnaryResponse<TOut>>((accept, reject) => {
    const observer = new AsyncStreamObserver(accept, reject);
    writer = invokeServerStreaming(channel, method, input, observer, options);
  });

  return {
    response,
    cancel: () => writer.cancel(),
  };
}
