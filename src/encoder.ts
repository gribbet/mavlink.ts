import { createCrc } from "./crc.js";

export const encodePacket = ({
  magic,
  sequence,
  systemId,
  componentId,
  messageId,
  payload,
  crcExtra,
}: {
  magic: number;
  sequence: number;
  systemId: number;
  componentId: number;
  messageId: number;
  payload: Uint8Array;
  crcExtra: number;
}): Uint8Array => {
  const isV2 = magic === 0xfd;
  const payloadLength = payload.length;
  const totalLength = (isV2 ? 10 : 6) + payloadLength + 2;
  const buffer = new Uint8Array(totalLength);

  let i = 0;
  buffer[i++] = magic;
  buffer[i++] = payloadLength;

  if (isV2) {
    buffer[i++] = 0;
    buffer[i++] = 0;
    buffer[i++] = sequence;
    buffer[i++] = systemId;
    buffer[i++] = componentId;
    buffer[i++] = messageId & 0xff;
    buffer[i++] = (messageId >> 8) & 0xff;
    buffer[i++] = (messageId >> 16) & 0xff;
  } else {
    buffer[i++] = sequence;
    buffer[i++] = systemId;
    buffer[i++] = componentId;
    buffer[i++] = messageId & 0xff;
  }

  buffer.set(payload, i);
  i += payloadLength;

  const crc = createCrc();
  crc.accumulate(buffer.subarray(1, i));
  crc.accumulate(crcExtra);
  const crcValue = crc.value();

  buffer[i++] = crcValue & 0xff;
  buffer[i++] = (crcValue >> 8) & 0xff;

  return buffer;
};
