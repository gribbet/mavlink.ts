export const createWriter = (size: number) => {
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  let offset = 0;

  return {
    setUint8: (value: number) => {
      view.setUint8(offset, value);
      offset += 1;
    },
    setInt8: (value: number) => {
      view.setInt8(offset, value);
      offset += 1;
    },
    setUint16: (value: number) => {
      view.setUint16(offset, value, true);
      offset += 2;
    },
    setInt16: (value: number) => {
      view.setInt16(offset, value, true);
      offset += 2;
    },
    setUint32: (value: number) => {
      view.setUint32(offset, value, true);
      offset += 4;
    },
    setInt32: (value: number) => {
      view.setInt32(offset, value, true);
      offset += 4;
    },
    setBigUint64: (value: bigint) => {
      view.setBigUint64(offset, value, true);
      offset += 8;
    },
    setBigInt64: (value: bigint) => {
      view.setBigInt64(offset, value, true);
      offset += 8;
    },
    setFloat32: (value: number) => {
      view.setFloat32(offset, value, true);
      offset += 4;
    },
    setFloat64: (value: number) => {
      view.setFloat64(offset, value, true);
      offset += 8;
    },
    setUint8Array: (data: Uint8Array, length: number) => {
      new Uint8Array(buffer, offset, length).set(data.slice(0, length));
      offset += length;
    },
    finish: () => new Uint8Array(buffer),
  };
};
