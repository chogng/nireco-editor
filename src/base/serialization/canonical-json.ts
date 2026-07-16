export type JsonPrimitive = boolean | null | number | string;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | {
      readonly [key: string]: JsonValue;
    };

export type CanonicalJsonErrorReason =
  | 'unsupported-value'
  | 'non-finite-number'
  | 'cyclic-value'
  | 'sparse-array'
  | 'invalid-object-prototype';

export interface CanonicalJsonError {
  readonly reason: CanonicalJsonErrorReason;
  readonly path: string;
}

export type CanonicalJsonResult =
  | {
      readonly type: 'ok';
      readonly value: string;
    }
  | {
      readonly type: 'error';
      readonly error: CanonicalJsonError;
    };

export function serializeCanonicalJson(value: unknown): CanonicalJsonResult {
  const activeObjects = new Set<object>();
  return serializeValue(value, '$', activeObjects);
}

function serializeValue(
  value: unknown,
  path: string,
  activeObjects: Set<object>,
): CanonicalJsonResult {
  if (value === null) {
    return {
      type: 'ok',
      value: 'null',
    };
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return {
      type: 'ok',
      value: JSON.stringify(value),
    };
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return errorResult('non-finite-number', path);
    }

    return {
      type: 'ok',
      value: JSON.stringify(value),
    };
  }

  if (typeof value !== 'object') {
    return errorResult('unsupported-value', path);
  }

  if (activeObjects.has(value)) {
    return errorResult('cyclic-value', path);
  }

  activeObjects.add(value);
  const result = Array.isArray(value)
    ? serializeArray(value, path, activeObjects)
    : serializeObject(value, path, activeObjects);
  activeObjects.delete(value);
  return result;
}

function serializeArray(
  value: readonly unknown[],
  path: string,
  activeObjects: Set<object>,
): CanonicalJsonResult {
  const serializedItems: string[] = [];

  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      return errorResult('sparse-array', `${path}[${index}]`);
    }

    const item = serializeValue(value[index], `${path}[${index}]`, activeObjects);
    if (item.type === 'error') {
      return item;
    }
    serializedItems.push(item.value);
  }

  return {
    type: 'ok',
    value: `[${serializedItems.join(',')}]`,
  };
}

function serializeObject(
  value: object,
  path: string,
  activeObjects: Set<object>,
): CanonicalJsonResult {
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return errorResult('invalid-object-prototype', path);
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort(compareUnicodeCodePoints);
  const serializedEntries: string[] = [];

  for (const key of keys) {
    const property = serializeValue(record[key], `${path}.${key}`, activeObjects);
    if (property.type === 'error') {
      return property;
    }

    serializedEntries.push(`${JSON.stringify(key)}:${property.value}`);
  }

  return {
    type: 'ok',
    value: `{${serializedEntries.join(',')}}`,
  };
}

function compareUnicodeCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return leftPoints.length - rightPoints.length;
}

function errorResult(reason: CanonicalJsonErrorReason, path: string): CanonicalJsonResult {
  return {
    type: 'error',
    error: {
      reason,
      path,
    },
  };
}
