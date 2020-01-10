// package: games.wellplayed.grpcbridge.v1
// file: proto/bridge.proto

import * as jspb from "google-protobuf";
import * as google_protobuf_any_pb from "google-protobuf/google/protobuf/any_pb";

export class Call extends jspb.Message {
  getMethod(): string;
  setMethod(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): Call.AsObject;
  static toObject(includeInstance: boolean, msg: Call): Call.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: Call, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): Call;
  static deserializeBinaryFromReader(message: Call, reader: jspb.BinaryReader): Call;
}

export namespace Call {
  export type AsObject = {
    method: string,
  }
}

export class Metadata extends jspb.Message {
  clearMetadataList(): void;
  getMetadataList(): Array<Metadata.Item>;
  setMetadataList(value: Array<Metadata.Item>): void;
  addMetadata(value?: Metadata.Item, index?: number): Metadata.Item;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): Metadata.AsObject;
  static toObject(includeInstance: boolean, msg: Metadata): Metadata.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: Metadata, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): Metadata;
  static deserializeBinaryFromReader(message: Metadata, reader: jspb.BinaryReader): Metadata;
}

export namespace Metadata {
  export type AsObject = {
    metadataList: Array<Metadata.Item.AsObject>,
  }

  export class Item extends jspb.Message {
    getKey(): string;
    setKey(value: string): void;

    clearValueList(): void;
    getValueList(): Array<string>;
    setValueList(value: Array<string>): void;
    addValue(value: string, index?: number): string;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): Item.AsObject;
    static toObject(includeInstance: boolean, msg: Item): Item.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: Item, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): Item;
    static deserializeBinaryFromReader(message: Item, reader: jspb.BinaryReader): Item;
  }

  export namespace Item {
    export type AsObject = {
      key: string,
      valueList: Array<string>,
    }
  }
}

export class Ready extends jspb.Message {
  getCount(): number;
  setCount(value: number): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): Ready.AsObject;
  static toObject(includeInstance: boolean, msg: Ready): Ready.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: Ready, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): Ready;
  static deserializeBinaryFromReader(message: Ready, reader: jspb.BinaryReader): Ready;
}

export namespace Ready {
  export type AsObject = {
    count: number,
  }
}

export class Payload extends jspb.Message {
  getPayload(): Uint8Array | string;
  getPayload_asU8(): Uint8Array;
  getPayload_asB64(): string;
  setPayload(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): Payload.AsObject;
  static toObject(includeInstance: boolean, msg: Payload): Payload.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: Payload, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): Payload;
  static deserializeBinaryFromReader(message: Payload, reader: jspb.BinaryReader): Payload;
}

export namespace Payload {
  export type AsObject = {
    payload: Uint8Array | string,
  }
}

export class End extends jspb.Message {
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): End.AsObject;
  static toObject(includeInstance: boolean, msg: End): End.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: End, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): End;
  static deserializeBinaryFromReader(message: End, reader: jspb.BinaryReader): End;
}

export namespace End {
  export type AsObject = {
  }
}

export class Status extends jspb.Message {
  getCode(): number;
  setCode(value: number): void;

  getMessage(): string;
  setMessage(value: string): void;

  clearDetailsList(): void;
  getDetailsList(): Array<google_protobuf_any_pb.Any>;
  setDetailsList(value: Array<google_protobuf_any_pb.Any>): void;
  addDetails(value?: google_protobuf_any_pb.Any, index?: number): google_protobuf_any_pb.Any;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): Status.AsObject;
  static toObject(includeInstance: boolean, msg: Status): Status.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: Status, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): Status;
  static deserializeBinaryFromReader(message: Status, reader: jspb.BinaryReader): Status;
}

export namespace Status {
  export type AsObject = {
    code: number,
    message: string,
    detailsList: Array<google_protobuf_any_pb.Any.AsObject>,
  }
}

export class Close extends jspb.Message {
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): Close.AsObject;
  static toObject(includeInstance: boolean, msg: Close): Close.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: Close, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): Close;
  static deserializeBinaryFromReader(message: Close, reader: jspb.BinaryReader): Close;
}

export namespace Close {
  export type AsObject = {
  }
}

export class Message extends jspb.Message {
  getStreamId(): number;
  setStreamId(value: number): void;

  hasCall(): boolean;
  clearCall(): void;
  getCall(): Call | undefined;
  setCall(value?: Call): void;

  hasMetadata(): boolean;
  clearMetadata(): void;
  getMetadata(): Metadata | undefined;
  setMetadata(value?: Metadata): void;

  hasReady(): boolean;
  clearReady(): void;
  getReady(): Ready | undefined;
  setReady(value?: Ready): void;

  hasPayload(): boolean;
  clearPayload(): void;
  getPayload(): Payload | undefined;
  setPayload(value?: Payload): void;

  hasEnd(): boolean;
  clearEnd(): void;
  getEnd(): End | undefined;
  setEnd(value?: End): void;

  hasStatus(): boolean;
  clearStatus(): void;
  getStatus(): Status | undefined;
  setStatus(value?: Status): void;

  hasClose(): boolean;
  clearClose(): void;
  getClose(): Close | undefined;
  setClose(value?: Close): void;

  getMessageCase(): Message.MessageCase;
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): Message.AsObject;
  static toObject(includeInstance: boolean, msg: Message): Message.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: Message, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): Message;
  static deserializeBinaryFromReader(message: Message, reader: jspb.BinaryReader): Message;
}

export namespace Message {
  export type AsObject = {
    streamId: number,
    call?: Call.AsObject,
    metadata?: Metadata.AsObject,
    ready?: Ready.AsObject,
    payload?: Payload.AsObject,
    end?: End.AsObject,
    status?: Status.AsObject,
    close?: Close.AsObject,
  }

  export enum MessageCase {
    MESSAGE_NOT_SET = 0,
    CALL = 2,
    METADATA = 3,
    READY = 4,
    PAYLOAD = 5,
    END = 6,
    STATUS = 7,
    CLOSE = 8,
  }
}

