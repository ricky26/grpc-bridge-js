import { Message } from 'google-protobuf';
import { ServiceOptions, MethodOptions } from 'google-protobuf/google/protobuf/descriptor_pb';
import { Any } from 'google-protobuf/google/protobuf/any_pb';
import { TypedEventTarget } from './events';
import { Status } from '../proto/bridge_pb';

export type Metadata = Map<string, string[]>;
export type StatusEvent = CustomEvent<{ status: Status, trailer: Metadata }>;
export type HeaderEvent = CustomEvent<{ header: Metadata }>;
export type MessageEvent<TMsg> = CustomEvent<{ message: TMsg }>;

export interface StreamEvents<TMsg = Uint8Array> {
  header: HeaderEvent;
  message: MessageEvent<TMsg>;
  end: StatusEvent;
}

export interface Stream<TSend = Uint8Array, TRecv = Uint8Array> extends TypedEventTarget<StreamEvents<TRecv>> {
  send(msg: TSend): void;
  close(): void;
}

interface MappedStream<TMsgOut> extends TypedEventTarget<TMsgOut> {
  destroy(): void;
}

class MapStreamEvents<TOuter, TInner> extends TypedEventTarget<StreamEvents<TOuter>> implements MappedStream<TOuter> {
  constructor(inner: TypedEventTarget<StreamEvents<TInner>>, mapper: (msg: TInner) => TOuter) {
    super();

    const onHeader = (evt: HeaderEvent) => this.dispatchEvent(evt);
    const onMessage = (evt: MessageEvent<TInner>) => this.dispatchEvent(new CustomEvent('message', {
      detail: {
        message: mapper(evt.detail.message),
      },
    }));
    const onEnd = (evt: StatusEvent) => this.dispatchEvent(evt);
  
    inner.addEventListener('header', onHeader);
    inner.addEventListener('message', onMessage);
    inner.addEventListener('end', onEnd);

    this.destroy = () => {
      inner.removeEventListener('header', onHeader);
      inner.removeEventListener('message', onMessage);
      inner.removeEventListener('end', onEnd);
    };
  }

  destroy() {}
}

class MapStream<TOuterIn, TOuterOut, TInnerIn, TInnerOut> extends MapStreamEvents<TOuterOut, TInnerOut> implements Stream<TOuterIn, TOuterOut> {
  constructor(private innerStream: Stream<TInnerIn, TInnerOut>, private inputMapper: (msg: TOuterIn) => TInnerIn, outputMapper: (msg: TInnerOut) => TOuterOut) {
    super(innerStream, outputMapper);
  }

  send(msg: TOuterIn): void {
    return this.innerStream.send(this.inputMapper(msg));
  }

  close(): void {
    return this.innerStream.close();
  }
}

export function mapStreamEvents<TMsgIn, TMsgOut>(events: TypedEventTarget<StreamEvents<TMsgIn>>, mapper: (msg: TMsgIn) => TMsgOut): MappedStream<TMsgOut> {
  return new MapStreamEvents(events, mapper);
}

export function mapStream<TOuterIn, TOuterOut, TInnerIn, TInnerOut>(inner: Stream<TInnerIn, TInnerOut>, inputMapper: (msg: TOuterIn) => TInnerIn, outputMapper: (msg: TInnerOut) => TOuterOut): Stream<TOuterIn, TOuterOut> {
  return new MapStream(inner, inputMapper, outputMapper);
}

export class StatusError extends Error {
  constructor(public code: number, message: string, public details: Any[] = [], public trailer: Metadata = new Map()) {
    super(message);
  }

  static fromEvent(evt: StatusEvent): StatusError {
    const { status, trailer } = evt.detail;
    return new StatusError(status.getCode(), status.getMessage(), status.getDetailsList(), trailer);
  }
}

export interface ServiceMethod {
  name: string;
  path: string;
  options: MethodOptions.AsObject,
  inputType: Message;
  outputType: Message;
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
  createStream(options: CallOptions): Promise<Stream>;
}

export class ClientBase {
  constructor(private channel: Channel) {}
}

export interface UnaryResponse<T> {
  header: Metadata;
  response: T;
}
