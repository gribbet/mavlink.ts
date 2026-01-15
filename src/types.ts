export type MessageSchema<T extends { type: string }> = {
  id: number;
  name: string;
  crcExtra: number;
  decode: (payload: Uint8Array) => T;
  encode: (_: T) => Uint8Array;
};

export type Channel = {
  receive: (handler: (data: Uint8Array) => void) => () => void;
  send: (data: Uint8Array) => void;
  close: () => void;
};
