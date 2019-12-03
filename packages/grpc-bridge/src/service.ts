import { Message } from 'google-protobuf';
import { ServiceOptions, MethodOptions } from 'google-protobuf/google/protobuf/descriptor_pb';
import { Any } from 'google-protobuf/google/protobuf/any_pb';
import { Status } from '../proto/bridge_pb';

export type Metadata = Map<string, string[]>;
export type StatusEvent = CustomEvent<{ status: Status, trailer: Metadata }>;
export type HeaderEvent = CustomEvent<{ header: Metadata }>;
export type MessageEvent<TMsg> = CustomEvent<{ message: TMsg }>;

export interface StreamObserver<TMsg> {
  onHeader(header: Metadata): void;
  onMessage(msg: TMsg): void;
  onEnd(status: Status, trailer: Metadata): void;
}

export interface StreamWriter<TMsg> {
  send(msg: TMsg): void;
  close(): void;
}

export interface UnaryResponse<T> {
  header: Metadata;
  trailer: Metadata;
  message: T;
}

export function mapStreamObserver<TInner, TOuter>(observer: StreamObserver<TOuter>, mapper: (x: TInner) => TOuter): StreamObserver<TInner> {
  return {
    onHeader(header: Metadata): void {
      return observer.onHeader(header);
    },
    onMessage(msg: TInner): void {
      return observer.onMessage(mapper(msg));
    },
    onEnd(status: Status, trailer: Metadata): void {
      return observer.onEnd(status, trailer);
    },
  };
}

export function mapStreamWriter<TInner, TOuter>(writer: StreamWriter<TInner>, mapper: (x: TOuter) => TInner): StreamWriter<TOuter> {
  return {
    send(msg: TOuter): void {
      return writer.send(mapper(msg));
    },
    close(): void {
      return writer.close();
    },
  };
}

export function streamObserverThrow<T>(observer: StreamObserver<T>, err: Error): void {
  const { status, trailer } = StatusError.fromError(err);
  observer.onEnd(status, trailer);
}

export class AsyncStreamObserver<TMsg> implements StreamObserver<TMsg> {
  public header: Metadata;
  public message: TMsg | null;
  public trailer: Metadata;
  public status: Status;

  constructor(private accept: (target: UnaryResponse<TMsg>) => void, private reject: (err: StatusError) => void) {
    this.header = new Map();
    this.message = null;
    this.trailer = new Map();
    this.status = new Status();
  }

  onHeader(header: Metadata): void {
    this.header = header;
  }
  
  onMessage(msg: TMsg): void {
    this.message = msg;
  }

  onEnd(status: Status, trailer: Metadata): void {
    if (status.getCode() != 0) {
      this.reject(StatusError.fromStatus(status, trailer));
    } else {
      this.accept({
        header: this.header,
        trailer,
        message: this.message!,
      });
    }
  }
}

export class StatusError extends Error {
  constructor(public code: number, message: string, public details: Any[] = [], public trailer: Metadata = new Map()) {
    super(message);
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
}

export interface CallOptions extends ExtraCallOptions {
  method: string;
}

export interface Channel {
  createStream(observer: StreamObserver<Uint8Array>, options: CallOptions): Promise<StreamWriter<Uint8Array>>;
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
  options: ExtraCallOptions = {}): Promise<StreamWriter<TIn>> {

  const rawObserver = mapStreamObserver<Uint8Array, TOut>(observer, x => method.outputType.deserializeBinary(x));
  return channel.createStream(rawObserver, { ...options, method: method.path })
    .then(writer => mapStreamWriter(writer, x => x.serializeBinary()));
}

export function invokeClientStreaming<TIn extends Message, TOut extends Message>(
  channel: Channel,
  method: ServiceMethod<TIn, TOut>,
  input: TIn,
  observer: StreamObserver<TOut>,
  options: ExtraCallOptions = {}): void {

  invoke(channel, method, observer, options)
    .then(writer => {
      writer.send(input);
      writer.close();
    })
    .catch(err => streamObserverThrow(observer, err));
}

export function invokeUnary<TIn extends Message, TOut extends Message>(
  channel: Channel,
  method: ServiceMethod<TIn, TOut>,
  input: TIn,
  options: ExtraCallOptions = {}): Promise<UnaryResponse<TOut>> {

  return new Promise((accept, reject) => {
    const observer = new AsyncStreamObserver(accept, reject);
    invokeClientStreaming(channel, method, input, observer, options);
  });
}
