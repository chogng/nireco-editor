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
  | 'invalid-object-prototype'
  | 'invalid-property-descriptor'
  | 'maximum-depth-exceeded'
  | 'inspection-failed'
  | 'invalid-unicode-string';

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

export const MAX_CANONICAL_JSON_DEPTH = 1_024;

export function serializeCanonicalJson(value: unknown): CanonicalJsonResult {
  try {
    const activeObjects = new Set<object>();
    return serializeValue(value, '$', activeObjects, 0);
  } catch {
    return errorResult('inspection-failed', '$');
  }
}

function serializeValue(
  value: unknown,
  path: string,
  activeObjects: Set<object>,
  depth: number,
): CanonicalJsonResult {
  if (value === null) {
    return {
      type: 'ok',
      value: 'null',
    };
  }

  if (typeof value === 'string') {
    if (!isWellFormedUnicodeString(value)) {
      return errorResult('invalid-unicode-string', path);
    }
    return {
      type: 'ok',
      value: JSON.stringify(value),
    };
  }

  if (typeof value === 'boolean') {
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

  if (depth > MAX_CANONICAL_JSON_DEPTH) {
    return errorResult('maximum-depth-exceeded', path);
  }

  if (activeObjects.has(value)) {
    return errorResult('cyclic-value', path);
  }

  activeObjects.add(value);
  const result = Array.isArray(value)
    ? serializeArray(value, path, activeObjects, depth)
    : serializeObject(value, path, activeObjects, depth);
  activeObjects.delete(value);
  return result;
}

function serializeArray(
  value: readonly unknown[],
  path: string,
  activeObjects: Set<object>,
  depth: number,
): CanonicalJsonResult {
  if (Reflect.getPrototypeOf(value) !== Array.prototype) {
    return errorResult('invalid-object-prototype', path);
  }
  const descriptors: PropertyDescriptor[] = [];
  const allowedKeys = new Set<string>(['length']);
  for (let index = 0; index < value.length; index += 1) {
    allowedKeys.add(String(index));
    const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined) {
      return errorResult('sparse-array', `${path}[${index}]`);
    }
    if (!descriptor.enumerable || !('value' in descriptor)) {
      return errorResult('invalid-property-descriptor', `${path}[${index}]`);
    }
    descriptors.push(descriptor);
  }
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string' || !allowedKeys.has(key))) {
    return errorResult('invalid-property-descriptor', path);
  }

  const serializedItems: string[] = [];

  for (let index = 0; index < descriptors.length; index += 1) {
    const descriptor = descriptors[index];
    const item = serializeValue(descriptor?.value, `${path}[${index}]`, activeObjects, depth + 1);
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
  depth: number,
): CanonicalJsonResult {
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return errorResult('invalid-object-prototype', path);
  }

  const ownKeys = Reflect.ownKeys(value);
  const stringKeys: string[] = [];
  for (const key of ownKeys) {
    const validated = validateCanonicalObjectKey(key, path);
    if (validated.type === 'error') {
      return validated;
    }
    stringKeys.push(validated.value);
  }
  const descriptors = new Map<string, PropertyDescriptor>();
  for (const key of stringKeys) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return errorResult('invalid-property-descriptor', `${path}.${key}`);
    }
    descriptors.set(key, descriptor);
  }
  const keys = stringKeys.sort(compareUnicodeCodePoints);
  const serializedEntries: string[] = [];

  for (const key of keys) {
    const property = serializeValue(
      descriptors.get(key)?.value,
      `${path}.${key}`,
      activeObjects,
      depth + 1,
    );
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

type CanonicalObjectKeyResult =
  | {
      readonly type: 'ok';
      readonly value: string;
    }
  | Extract<CanonicalJsonResult, { readonly type: 'error' }>;

function validateCanonicalObjectKey(key: PropertyKey, path: string): CanonicalObjectKeyResult {
  if (typeof key !== 'string') {
    return errorResult('invalid-property-descriptor', path);
  }
  return isWellFormedUnicodeString(key)
    ? {
        type: 'ok',
        value: key,
      }
    : errorResult('invalid-unicode-string', path);
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

export function isWellFormedUnicodeString(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const current = value.charCodeAt(index);
    if (current >= 0xd800 && current <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (index + 1 >= value.length || next < 0xdc00 || next > 0xdfff) {
        return false;
      }
      index += 1;
    } else if (current >= 0xdc00 && current <= 0xdfff) {
      return false;
    }
  }
  return true;
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
