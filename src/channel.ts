import { createCrc } from "./crc";
import { encodePacket } from "./encoder";
import { createMavlinkParser } from "./parser";
import type { MessageSchema, Schema } from "./schema";
import { createSubscriber } from "./subscriber";

export type Channel = {
  receive: (handler: (data: Uint8Array) => void) => () => void;
  send: (data: Uint8Array) => void;
  close: () => void;
};
export type MessageType<S extends Schema, T extends keyof S> =
  S[T] extends MessageSchema<infer M> ? M : never;

export type Packet<
  S extends Schema,
  T extends keyof S & string = keyof S & string,
> = {
  [K in T]: {
    sequence: number;
    systemId: number;
    componentId: number;
    type: K;
    message: MessageType<S, K>;
    bytes: number;
  };
}[T];

export const createMavlinkChannel = <S extends Schema>(
  channel: Channel,
  schema: S,
) => {
  type Type = keyof S & string;

  const { subscribe: receive, emit } = createSubscriber<Packet<S>>();
  let sequence = 0;

  const types = Object.keys(schema) as Type[];
  const messages = new Map(types.map(_ => [schema[_]?.id ?? 0, _]));

  const parser = createMavlinkParser();
  const closeParser = parser.onPacket(
    ({
      messageId,
      calculatedCrc,
      checksum,
      payload,
      sequence,
      systemId,
      componentId,
      bytes,
    }) => {
      const type = messages.get(messageId);
      if (!type) return;
      const { crcExtra, decode } = schema[type] as MessageSchema<
        MessageType<S, Type>
      >;
      const crc = createCrc(calculatedCrc);
      crc.accumulate(crcExtra);
      if (crc.value() !== checksum) return;

      const message = decode(payload);
      emit({
        sequence,
        systemId,
        componentId,
        type,
        message,
        bytes,
      });
    },
  );

  const send = <T extends Type>({
    systemId,
    componentId,
    type,
    message,
  }: {
    systemId: number;
    componentId: number;
    type: T;
    message: MessageType<S, T>;
  }) => {
    const {
      encode,
      id: messageId = 0,
      crcExtra = 0,
    } = schema[type] as MessageSchema<MessageType<S, T>>;

    const payload = encode(message);
    const data = encodePacket({
      magic: 0xfd,
      sequence: sequence++,
      systemId,
      componentId,
      messageId,
      payload,
      crcExtra,
    });
    if (sequence > 255) sequence = 0;
    channel.send(data);
    return data.length;
  };

  const closeChannel = channel.receive(data => parser.parse(data));
  const close = () => {
    closeParser();
    closeChannel();
  };

  return {
    receive,
    send,
    close,
  };
};

export type MavlinkChannel<S extends Schema> = ReturnType<
  typeof createMavlinkChannel<S>
>;
