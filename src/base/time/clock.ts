import type { Brand } from '../brand.js';

export type IsoTimestamp = Brand<string, 'IsoTimestamp'>;

export interface IClock {
  now(): IsoTimestamp;
}

export type IsoTimestampParseResult =
  | {
      readonly type: 'valid';
      readonly value: IsoTimestamp;
    }
  | {
      readonly type: 'invalid';
      readonly reason: 'not-rfc3339-utc';
    };

const RFC_3339_UTC_PATTERN =
  /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?Z$/u;

export function parseIsoTimestamp(value: string): IsoTimestampParseResult {
  const match = RFC_3339_UTC_PATTERN.exec(value);
  if (match === null) {
    return {
      type: 'invalid',
      reason: 'not-rfc3339-utc',
    };
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (day > daysInMonth(year, month)) {
    return {
      type: 'invalid',
      reason: 'not-rfc3339-utc',
    };
  }

  return {
    type: 'valid',
    value: value as IsoTimestamp,
  };
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }

  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
