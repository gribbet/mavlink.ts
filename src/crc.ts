export const createCrc = (initialValue = 0xffff) => {
  let value = initialValue;

  const accumulate = (data: number | Uint8Array) => {
    if (data instanceof Uint8Array) return data.forEach(accumulate);
    let temporary = data ^ (value & 0xff);
    temporary ^= (temporary << 4) & 0xff;
    value =
      ((value >> 8) ^ (temporary << 8) ^ (temporary << 3) ^ (temporary >> 4)) &
      0xffff;
  };

  return {
    accumulate,
    value: () => value & 0xffff,
  };
};
