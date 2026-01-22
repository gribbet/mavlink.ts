export const createReader = (payload: Uint8Array, length?: number) => {
  if (length !== undefined && payload.length < length) {
    const padded = new Uint8Array(length);
    padded.set(payload);
    payload = padded;
  }
  const { buffer, byteOffset, byteLength } = payload;
  const view = new DataView(buffer, byteOffset, byteLength);
  let offset = 0;

  const increment = (bytes: number) => {
    const result = offset;
    offset += bytes;
    return result;
  };

  return {
    getUint8: () => view.getUint8(increment(1)),
    getInt8: () => view.getInt8(increment(1)),
    getUint16: () => view.getUint16(increment(2), true),
    getInt16: () => view.getInt16(increment(2), true),
    getUint32: () => view.getUint32(increment(4), true),
    getInt32: () => view.getInt32(increment(4), true),
    getBigUint64: () => view.getBigUint64(increment(8), true),
    getBigInt64: () => view.getBigInt64(increment(8), true),
    getFloat32: () => view.getFloat32(increment(4), true),
    getFloat64: () => view.getFloat64(increment(8), true),
    getUint8Array: (length: number) => {
      const result = new Uint8Array(length);
      result.set(new Uint8Array(buffer, byteOffset + offset, length));
      increment(length);
      return result;
    },
  };
};
