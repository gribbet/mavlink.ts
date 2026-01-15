import { createCrc } from "./crc";
import { encodePacket } from "./encoder";
import { createMavlinkParser } from "./parser";
import { createSubscriber } from "./subscriber";
import type { Channel, MessageSchema } from "./types";

export type MavlinkPacket<T> = {
  sequence: number;
  systemId: number;
  componentId: number;
  message: T;
  bytes: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createMavlinkChannel = <S extends readonly MessageSchema<any>[]>(
  channel: Channel,
  schema: S,
) => {
  type ExtractMessage<S> = S extends MessageSchema<infer U> ? U : never;
  type Message = ExtractMessage<S[number]>;

  const { subscribe: receive, emit } =
    createSubscriber<MavlinkPacket<Message>>();
  let sequence = 0;

  const messageMap = new Map(schema.map(_ => [_.id, _]));
  const typeToIdMap = new Map(schema.map(_ => [_.name, _.id]));

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
      const { decode, crcExtra = 0 } = messageMap.get(messageId) ?? {};
      if (!decode) return;
      const crc = createCrc(calculatedCrc);
      crc.accumulate(crcExtra);
      if (crc.value() !== checksum) return;

      const message = decode(payload) as Message;
      emit({
        sequence,
        systemId,
        componentId,
        message,
        bytes,
      });
    },
  );

  const send = ({
    systemId,
    componentId,
    message,
  }: {
    systemId: number;
    componentId: number;
    message: Message;
  }) => {
    const { type } = message;
    const messageId =
      typeof type === "string" ? typeToIdMap.get(type) : undefined;
    if (messageId === undefined)
      throw new Error(`Unknown message type: ${type}`);
    const { encode, crcExtra = 0 } = messageMap.get(messageId) ?? {};
    if (!encode) throw new Error(`No schema for message ID: ${messageId}`);

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MavlinkChannel<S extends readonly MessageSchema<any>[]> =
  ReturnType<typeof createMavlinkChannel<S>>;
