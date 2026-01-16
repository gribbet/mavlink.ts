import { createCrc } from "./crc";
import { encodePacket } from "./encoder";
import { createMavlinkParser } from "./parser";
import type { Schema } from "./schema";
import { createSubscriber } from "./subscriber";

export type Channel = {
  receive: (handler: (data: Uint8Array) => void) => () => void;
  send: (data: Uint8Array) => void;
  close: () => void;
};

export type MavlinkPacket<T> = {
  sequence: number;
  systemId: number;
  componentId: number;
  message: T;
  bytes: number;
};

export const createMavlinkChannel = <Message extends { type: string }>(
  channel: Channel,
  schema: Schema<Message>,
) => {
  const { subscribe: receive, emit } =
    createSubscriber<MavlinkPacket<Message>>();
  let sequence = 0;

  const types = Object.keys(schema) as Message["type"][];
  const messageMap = new Map(types.map(_ => [schema[_].id, schema[_]]));

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

      const message = decode(payload);
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
    const type = message.type as Message["type"];
    if (typeof type !== "string" || !(type in schema))
      throw new Error(`Message type missing in schema: ${type}`);
    const { encode, id: messageId = 0, crcExtra = 0 } = schema[type];

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

export type MavlinkChannel<Message extends { type: string }> = ReturnType<
  typeof createMavlinkChannel<Message>
>;
