export function deepFreeze<TValue>(value: TValue): TValue {
  freezeValue(value, new WeakSet<object>());
  return value;
}

function freezeValue(value: unknown, visited: WeakSet<object>): void {
  if (value === null || typeof value !== 'object' || visited.has(value)) {
    return;
  }

  visited.add(value);
  for (const key of Reflect.ownKeys(value)) {
    freezeValue(Reflect.get(value, key), visited);
  }
  Object.freeze(value);
}
