import { createCrc } from "./crc";
import { createSubscriber } from "./subscriber";

export type RawPacket = {
  sequence: number;
  systemId: number;
  componentId: number;
  messageId: number;
  magic: number;
  payload: Uint8Array;
  incompatibleFlags: number;
  compatibleFlags: number;
  signature?: Uint8Array;
  checksum: number;
  calculatedCrc: number;
  bytes: number;
};

type State =
  | "WAIT_STX"
  | "LENGTH"
  | "INCOMPATIBLE_FLAGS"
  | "COMPATIBLE_FLAGS"
  | "SEQUENCE"
  | "SYSTEM_ID"
  | "COMPONENT_ID"
  | "MESSAGE_ID_V1"
  | "MESSAGE_ID_1"
  | "MESSAGE_ID_2"
  | "MESSAGE_ID_3"
  | "PAYLOAD"
  | "CHECKSUM_1"
  | "CHECKSUM_2"
  | "SIGNATURE";

export const createMavlinkParser = () => {
  const { subscribe: onPacket, emit } = createSubscriber<RawPacket>();
  const payload = new Uint8Array(255);
  const signature = new Uint8Array(13);
  let state: State = "WAIT_STX";
  let magic = 0;
  let length = 0;
  let sequence = 0;
  let systemId = 0;
  let componentId = 0;
  let messageId = 0;
  let incompatibleFlags = 0;
  let compatibleFlags = 0;
  let payloadIndex = 0;
  let crc = createCrc();
  let receivedChecksum = 0;
  let signatureIndex = 0;

  const reset = () => {
    state = "WAIT_STX";
    crc = createCrc();
    payloadIndex = 0;
    signatureIndex = 0;
    messageId = 0;
    incompatibleFlags = 0;
    compatibleFlags = 0;
  };

  const parseByte = (byte: number) => {
    switch (state) {
      case "WAIT_STX":
        if (byte === 0xfe || byte === 0xfd) {
          magic = byte;
          state = "LENGTH";
          crc = createCrc();
        }
        break;
      case "LENGTH":
        length = byte;
        crc.accumulate(byte);
        state = magic === 0xfd ? "INCOMPATIBLE_FLAGS" : "SEQUENCE";
        break;
      case "INCOMPATIBLE_FLAGS":
        incompatibleFlags = byte;
        crc.accumulate(byte);
        state = "COMPATIBLE_FLAGS";
        break;
      case "COMPATIBLE_FLAGS":
        compatibleFlags = byte;
        crc.accumulate(byte);
        state = "SEQUENCE";
        break;
      case "SEQUENCE":
        sequence = byte;
        crc.accumulate(byte);
        state = "SYSTEM_ID";
        break;
      case "SYSTEM_ID":
        systemId = byte;
        crc.accumulate(byte);
        state = "COMPONENT_ID";
        break;
      case "COMPONENT_ID":
        componentId = byte;
        crc.accumulate(byte);
        state = magic === 0xfd ? "MESSAGE_ID_1" : "MESSAGE_ID_V1";
        break;
      case "MESSAGE_ID_V1":
        messageId = byte;
        crc.accumulate(byte);
        state = length === 0 ? "CHECKSUM_1" : "PAYLOAD";
        break;
      case "MESSAGE_ID_1":
        messageId = byte;
        crc.accumulate(byte);
        state = "MESSAGE_ID_2";
        break;
      case "MESSAGE_ID_2":
        messageId |= byte << 8;
        crc.accumulate(byte);
        state = "MESSAGE_ID_3";
        break;
      case "MESSAGE_ID_3":
        messageId |= byte << 16;
        crc.accumulate(byte);
        state = length === 0 ? "CHECKSUM_1" : "PAYLOAD";
        break;
      case "PAYLOAD":
        payload[payloadIndex++] = byte;
        crc.accumulate(byte);
        if (payloadIndex === length) state = "CHECKSUM_1";
        break;
      case "CHECKSUM_1":
        receivedChecksum = byte;
        state = "CHECKSUM_2";
        break;
      case "CHECKSUM_2":
        receivedChecksum |= byte << 8;
        emit({
          magic,
          sequence,
          systemId,
          componentId,
          messageId,
          payload: payload.slice(0, length),
          incompatibleFlags,
          compatibleFlags,
          checksum: receivedChecksum,
          calculatedCrc: crc.value(),
          bytes:
            (magic === 0xfd ? 12 : 8) +
            length +
            (magic === 0xfd && incompatibleFlags & 0x01 ? 13 : 0),
        });
        if (magic === 0xfd && incompatibleFlags & 0x01) state = "SIGNATURE";
        else reset();
        break;
      case "SIGNATURE":
        signature[signatureIndex++] = byte;
        if (signatureIndex === 13) reset();
        break;
    }
  };

  const parse = (data: Uint8Array) => data.forEach(parseByte);

  return {
    onPacket,
    parse,
  };
};
