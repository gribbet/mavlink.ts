export type MessageSchema<Nessage extends { type: string }> = {
  id: number;
  name: Nessage["type"];
  crcExtra: number;
  decode: (payload: Uint8Array) => Nessage;
  encode: (_: Nessage) => Uint8Array;
};

export type Schema<Message extends { type: string }> = {
  [Type in Message["type"]]: MessageSchema<Message & { type: Type }>;
};
