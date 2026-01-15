export const createReader = ({
  buffer,
  byteOffset,
  byteLength,
}: Uint8Array) => {
  const view = new DataView(buffer, byteOffset, byteLength);
  let offset = 0;

  const increment = (bytes: number) => {
    const result = offset;
    offset += bytes;
    return result + bytes <= byteLength ? result : undefined;
  };

  return {
    getUint8: () => {
      const offset = increment(1);
      return offset !== undefined ? view.getUint8(offset) : 0;
    },
    getInt8: () => {
      const offset = increment(1);
      return offset !== undefined ? view.getInt8(offset) : 0;
    },
    getUint16: () => {
      const offset = increment(2);
      return offset !== undefined ? view.getUint16(offset, true) : 0;
    },
    getInt16: () => {
      const offset = increment(2);
      return offset !== undefined ? view.getInt16(offset, true) : 0;
    },
    getUint32: () => {
      const offset = increment(4);
      return offset !== undefined ? view.getUint32(offset, true) : 0;
    },
    getInt32: () => {
      const offset = increment(4);
      return offset !== undefined ? view.getInt32(offset, true) : 0;
    },
    getBigUint64: () => {
      const offset = increment(8);
      return offset !== undefined ? view.getBigUint64(offset, true) : 0n;
    },
    getBigInt64: () => {
      const offset = increment(8);
      return offset !== undefined ? view.getBigInt64(offset, true) : 0n;
    },
    getFloat32: () => {
      const offset = increment(4);
      return offset !== undefined ? view.getFloat32(offset, true) : 0;
    },
    getFloat64: () => {
      const offset = increment(8);
      return offset !== undefined ? view.getFloat64(offset, true) : 0;
    },
    getUint8Array: (length: number) => {
      const result = new Uint8Array(length);
      const available = Math.max(0, byteLength - offset);
      const count = Math.min(length, available);
      if (count > 0)
        result.set(new Uint8Array(view.buffer, byteOffset + offset, count));
      offset += length;
      return result;
    },
  };
};
