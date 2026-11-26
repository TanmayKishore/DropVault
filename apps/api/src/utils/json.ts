/**
 * Recursively converts BigInt values to string for safe JSON serialization.
 */
export const serializeBigInt = <T>(obj: T): T => {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'bigint') {
    return obj.toString() as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => serializeBigInt(item)) as unknown as T;
  }

  if (typeof obj === 'object') {
    const newObj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      newObj[key] = serializeBigInt(value);
    }
    return newObj as T;
  }

  return obj;
};
