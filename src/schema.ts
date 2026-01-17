export type MessageSchema<Message> = {
  readonly id: number;
  readonly crcExtra: number;
  readonly decode: (payload: Uint8Array) => Message;
  readonly encode: (data: Message) => Uint8Array;
};

export type Schema = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly [type: string]: MessageSchema<any>;
};
