
export interface TypedEventListenerObject<TEvent> {
  handleEvent(evt: TEvent): void;
}

export interface TypedEventListenerFunction<TEvent> {
  (evt: TEvent): void;
}

export type TypedEventListener<TEvent=Event> = TypedEventListenerObject<TEvent> | TypedEventListenerFunction<TEvent>;

export interface TypedEventTargetTy<Events> {
  addEventListener<E extends keyof Events>(type: E, listener: TypedEventListener<Events[E]> | null, options?: boolean | AddEventListenerOptions): void;
  removeEventListener<E extends keyof Events>(type: E, listener: TypedEventListener<Events[E]> | null, options?: EventListenerOptions | boolean): void;
  dispatchEvent<E extends keyof Events>(event: Events[E]): boolean;
}

interface TypedEventTargetClassTy {
  prototype: EventTarget;
  new<T>(): TypedEventTargetTy<T>;
}

const EventTarget = ((typeof window !== 'undefined') && window.EventTarget) || require('event-target-shim').EventTarget;

const BaseClass = EventTarget as TypedEventTargetClassTy;
export class TypedEventTarget<T> extends BaseClass<T> {};
