import type { Brand } from '../brand.js';

export type ResourceUri = Brand<string, 'ResourceUri'>;

declare const documentUriBrand: unique symbol;
declare const cometResourceUriBrand: unique symbol;

export type DocumentUri = ResourceUri & {
  readonly [documentUriBrand]: 'DocumentUri';
};

export type CometResourceUri = ResourceUri & {
  readonly [cometResourceUriBrand]: 'CometResourceUri';
};

export type ResourceUriParseErrorReason =
  | 'empty'
  | 'too-long'
  | 'contains-whitespace-or-control'
  | 'contains-non-ascii'
  | 'invalid-scheme'
  | 'invalid-percent-encoding'
  | 'invalid-authority'
  | 'invalid-host'
  | 'invalid-port'
  | 'logical-uri-userinfo-forbidden'
  | 'logical-uri-port-forbidden'
  | 'logical-uri-query-forbidden'
  | 'logical-uri-fragment-forbidden'
  | 'logical-uri-path-invalid';

export type ResourceUriParseResult =
  | {
      readonly type: 'valid';
      readonly value: ResourceUri;
    }
  | {
      readonly type: 'invalid';
      readonly reason: ResourceUriParseErrorReason;
    };

interface AuthorityParts {
  readonly userInfo?: string;
  readonly host: string;
  readonly port?: string;
}

interface HierarchicalParts {
  readonly authority: AuthorityParts;
  readonly path: string;
  readonly query?: string;
  readonly fragment?: string;
}

const MAX_RESOURCE_URI_LENGTH = 2_048;
const SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*$/u;
const ASCII_PATTERN = /^[\x00-\x7F]*$/u;
const WHITESPACE_OR_CONTROL_PATTERN = /[\u0000-\u0020\u007F]/u;
const HOST_PATTERN = /^[A-Za-z0-9.-]+$/u;
const LOGICAL_HOST_PATTERN = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u;
const LOGICAL_PATH_SEGMENT_PATTERN = /^(?:[A-Za-z0-9._~!$&'()*+,;=:@-]|%[0-9A-F]{2})+$/u;
const HEX_PATTERN = /^[0-9A-Fa-f]{2}$/u;
const UNRESERVED_PATTERN = /^[A-Za-z0-9._~-]$/u;

export function canonicalizeResourceUri(input: string): ResourceUriParseResult {
  const commonValidation = validateCommonInput(input);
  if (commonValidation !== undefined) {
    return {
      type: 'invalid',
      reason: commonValidation,
    };
  }

  const colonIndex = input.indexOf(':');
  if (colonIndex <= 0) {
    return {
      type: 'invalid',
      reason: 'invalid-scheme',
    };
  }

  const rawScheme = input.slice(0, colonIndex);
  if (!SCHEME_PATTERN.test(rawScheme)) {
    return {
      type: 'invalid',
      reason: 'invalid-scheme',
    };
  }

  const scheme = rawScheme.toLowerCase();
  const remainder = input.slice(colonIndex + 1);

  if (!remainder.startsWith('//')) {
    const normalizedOpaque = normalizePercentEncoding(remainder);
    if (normalizedOpaque.type === 'invalid') {
      return normalizedOpaque;
    }

    return {
      type: 'valid',
      value: `${scheme}:${normalizedOpaque.value}` as ResourceUri,
    };
  }

  const hierarchical = parseHierarchicalRemainder(remainder);
  if (hierarchical.type === 'invalid') {
    return hierarchical;
  }

  const normalized = normalizeHierarchicalUri(scheme, hierarchical.value);
  if (normalized.type === 'invalid') {
    return normalized;
  }

  return {
    type: 'valid',
    value: normalized.value as ResourceUri,
  };
}

export function isCanonicalResourceUri(input: string): input is ResourceUri {
  const parsed = canonicalizeResourceUri(input);
  return parsed.type === 'valid' && parsed.value === input;
}

export function isDocumentUri(input: string): input is DocumentUri {
  return isCanonicalResourceUri(input) && input.startsWith('nireco://');
}

export function isCometResourceUri(input: string): input is CometResourceUri {
  return isCanonicalResourceUri(input) && input.startsWith('comet://');
}

function validateCommonInput(input: string): ResourceUriParseErrorReason | undefined {
  if (input.length === 0) {
    return 'empty';
  }

  if (input.length > MAX_RESOURCE_URI_LENGTH) {
    return 'too-long';
  }

  if (WHITESPACE_OR_CONTROL_PATTERN.test(input)) {
    return 'contains-whitespace-or-control';
  }

  if (!ASCII_PATTERN.test(input)) {
    return 'contains-non-ascii';
  }

  return undefined;
}

function parseHierarchicalRemainder(remainder: string):
  | {
      readonly type: 'valid';
      readonly value: HierarchicalParts;
    }
  | {
      readonly type: 'invalid';
      readonly reason: ResourceUriParseErrorReason;
    } {
  const content = remainder.slice(2);
  const authorityEnd = findFirstDelimiter(content);
  const rawAuthority = authorityEnd === -1 ? content : content.slice(0, authorityEnd);
  const rawSuffix = authorityEnd === -1 ? '' : content.slice(authorityEnd);
  const authority = parseAuthority(rawAuthority);
  if (authority.type === 'invalid') {
    return authority;
  }

  const suffix = parsePathQueryAndFragment(rawSuffix);
  if (suffix.type === 'invalid') {
    return suffix;
  }

  return {
    type: 'valid',
    value: {
      authority: authority.value,
      ...suffix.value,
    },
  };
}

function findFirstDelimiter(value: string): number {
  const slashIndex = value.indexOf('/');
  const queryIndex = value.indexOf('?');
  const fragmentIndex = value.indexOf('#');
  const candidates = [slashIndex, queryIndex, fragmentIndex].filter((index) => index >= 0);
  return candidates.length === 0 ? -1 : Math.min(...candidates);
}

function parseAuthority(rawAuthority: string):
  | {
      readonly type: 'valid';
      readonly value: AuthorityParts;
    }
  | {
      readonly type: 'invalid';
      readonly reason: ResourceUriParseErrorReason;
    } {
  const atIndex = rawAuthority.lastIndexOf('@');
  const rawUserInfo = atIndex >= 0 ? rawAuthority.slice(0, atIndex) : undefined;
  const rawHostAndPort = atIndex >= 0 ? rawAuthority.slice(atIndex + 1) : rawAuthority;

  const normalizedUserInfo =
    rawUserInfo === undefined ? undefined : normalizePercentEncoding(rawUserInfo);
  if (normalizedUserInfo?.type === 'invalid') {
    return normalizedUserInfo;
  }

  const hostAndPort = parseHostAndPort(rawHostAndPort);
  if (hostAndPort.type === 'invalid') {
    return hostAndPort;
  }

  return {
    type: 'valid',
    value: {
      ...(normalizedUserInfo === undefined ? {} : { userInfo: normalizedUserInfo.value }),
      ...hostAndPort.value,
    },
  };
}

function parseHostAndPort(rawHostAndPort: string):
  | {
      readonly type: 'valid';
      readonly value: Pick<AuthorityParts, 'host' | 'port'>;
    }
  | {
      readonly type: 'invalid';
      readonly reason: ResourceUriParseErrorReason;
    } {
  if (rawHostAndPort.startsWith('[')) {
    return parseBracketedHostAndPort(rawHostAndPort);
  }

  return parseNamedHostAndPort(rawHostAndPort);
}

function parseBracketedHostAndPort(rawHostAndPort: string):
  | {
      readonly type: 'valid';
      readonly value: Pick<AuthorityParts, 'host' | 'port'>;
    }
  | {
      readonly type: 'invalid';
      readonly reason: ResourceUriParseErrorReason;
    } {
  const closingBracketIndex = rawHostAndPort.indexOf(']');
  if (closingBracketIndex < 0) {
    return {
      type: 'invalid',
      reason: 'invalid-host',
    };
  }

  const host = rawHostAndPort.slice(0, closingBracketIndex + 1).toLowerCase();
  const suffix = rawHostAndPort.slice(closingBracketIndex + 1);
  const port = parsePortSuffix(suffix);
  if (port.type === 'invalid') {
    return port;
  }

  return {
    type: 'valid',
    value: {
      host,
      ...(port.value === undefined ? {} : { port: port.value }),
    },
  };
}

function parseNamedHostAndPort(rawHostAndPort: string):
  | {
      readonly type: 'valid';
      readonly value: Pick<AuthorityParts, 'host' | 'port'>;
    }
  | {
      readonly type: 'invalid';
      readonly reason: ResourceUriParseErrorReason;
    } {
  const lastColonIndex = rawHostAndPort.lastIndexOf(':');
  const hasSingleColon = lastColonIndex >= 0 && rawHostAndPort.indexOf(':') === lastColonIndex;
  const rawHost = hasSingleColon ? rawHostAndPort.slice(0, lastColonIndex) : rawHostAndPort;
  const rawPort = hasSingleColon ? rawHostAndPort.slice(lastColonIndex + 1) : undefined;

  if (rawHost.length > 0 && !HOST_PATTERN.test(rawHost)) {
    return {
      type: 'invalid',
      reason: 'invalid-host',
    };
  }

  if (rawPort !== undefined && !isValidPort(rawPort)) {
    return {
      type: 'invalid',
      reason: 'invalid-port',
    };
  }

  return {
    type: 'valid',
    value: {
      host: rawHost.toLowerCase(),
      ...(rawPort === undefined ? {} : { port: normalizePort(rawPort) }),
    },
  };
}

function parsePortSuffix(suffix: string):
  | {
      readonly type: 'valid';
      readonly value?: string;
    }
  | {
      readonly type: 'invalid';
      readonly reason: ResourceUriParseErrorReason;
    } {
  if (suffix.length === 0) {
    return {
      type: 'valid',
    };
  }

  if (!suffix.startsWith(':')) {
    return {
      type: 'invalid',
      reason: 'invalid-authority',
    };
  }

  const rawPort = suffix.slice(1);
  if (!isValidPort(rawPort)) {
    return {
      type: 'invalid',
      reason: 'invalid-port',
    };
  }

  return {
    type: 'valid',
    value: normalizePort(rawPort),
  };
}

function isValidPort(value: string): boolean {
  if (!/^\d+$/u.test(value)) {
    return false;
  }

  const numericPort = Number(value);
  return numericPort >= 0 && numericPort <= 65_535;
}

function normalizePort(value: string): string {
  return String(Number(value));
}

function parsePathQueryAndFragment(suffix: string):
  | {
      readonly type: 'valid';
      readonly value: Pick<HierarchicalParts, 'path' | 'query' | 'fragment'>;
    }
  | {
      readonly type: 'invalid';
      readonly reason: ResourceUriParseErrorReason;
    } {
  const rawParts = splitPathQueryAndFragment(suffix);
  const normalized = normalizePathQueryAndFragment(rawParts);
  if (normalized.type === 'invalid') {
    return normalized;
  }

  return {
    type: 'valid',
    value: {
      path: removeDotSegments(normalized.value.path),
      ...(normalized.value.query === undefined ? {} : { query: normalized.value.query }),
      ...(normalized.value.fragment === undefined ? {} : { fragment: normalized.value.fragment }),
    },
  };
}

interface RawPathQueryAndFragment {
  readonly path: string;
  readonly query?: string;
  readonly fragment?: string;
}

function splitPathQueryAndFragment(suffix: string): RawPathQueryAndFragment {
  const fragmentIndex = suffix.indexOf('#');
  const beforeFragment = fragmentIndex >= 0 ? suffix.slice(0, fragmentIndex) : suffix;
  const rawFragment = fragmentIndex >= 0 ? suffix.slice(fragmentIndex + 1) : undefined;
  const queryIndex = beforeFragment.indexOf('?');
  const rawPath = queryIndex >= 0 ? beforeFragment.slice(0, queryIndex) : beforeFragment;
  const rawQuery = queryIndex >= 0 ? beforeFragment.slice(queryIndex + 1) : undefined;

  return {
    path: rawPath,
    ...(rawQuery === undefined ? {} : { query: rawQuery }),
    ...(rawFragment === undefined ? {} : { fragment: rawFragment }),
  };
}

function normalizePathQueryAndFragment(rawParts: RawPathQueryAndFragment):
  | {
      readonly type: 'valid';
      readonly value: RawPathQueryAndFragment;
    }
  | {
      readonly type: 'invalid';
      readonly reason: 'invalid-percent-encoding';
    } {
  const path = normalizePercentEncoding(rawParts.path);
  if (path.type === 'invalid') {
    return path;
  }

  const query = normalizeOptionalPercentEncoding(rawParts.query);
  if (query.type === 'invalid') {
    return query;
  }

  const fragment = normalizeOptionalPercentEncoding(rawParts.fragment);
  if (fragment.type === 'invalid') {
    return fragment;
  }

  return {
    type: 'valid',
    value: {
      path: path.value,
      ...(query.value === undefined ? {} : { query: query.value }),
      ...(fragment.value === undefined ? {} : { fragment: fragment.value }),
    },
  };
}

function normalizeOptionalPercentEncoding(value: string | undefined):
  | {
      readonly type: 'valid';
      readonly value?: string;
    }
  | {
      readonly type: 'invalid';
      readonly reason: 'invalid-percent-encoding';
    } {
  if (value === undefined) {
    return {
      type: 'valid',
    };
  }

  return normalizePercentEncoding(value);
}

function normalizeHierarchicalUri(
  scheme: string,
  parts: HierarchicalParts,
):
  | {
      readonly type: 'valid';
      readonly value: string;
    }
  | {
      readonly type: 'invalid';
      readonly reason: ResourceUriParseErrorReason;
    } {
  const validationError = validateHierarchicalUri(scheme, parts);
  if (validationError !== undefined) {
    return {
      type: 'invalid',
      reason: validationError,
    };
  }

  const isLogicalUri = isLogicalScheme(scheme);
  const port = normalizeDefaultPort(scheme, parts.authority.port);
  const authority = formatAuthority(parts.authority, port);
  const path = normalizeHierarchicalPath(parts.path, isLogicalUri);
  const query = parts.query === undefined ? '' : `?${parts.query}`;
  const fragment = parts.fragment === undefined ? '' : `#${parts.fragment}`;

  return {
    type: 'valid',
    value: `${scheme}://${authority}${path}${query}${fragment}`,
  };
}

function validateHierarchicalUri(
  scheme: string,
  parts: HierarchicalParts,
): ResourceUriParseErrorReason | undefined {
  if (parts.authority.host.length === 0 && scheme !== 'file') {
    return 'invalid-authority';
  }

  return isLogicalScheme(scheme) ? validateLogicalUri(parts) : undefined;
}

function isLogicalScheme(scheme: string): boolean {
  return scheme === 'nireco' || scheme === 'comet';
}

function formatAuthority(authority: AuthorityParts, port: string | undefined): string {
  const userInfo = authority.userInfo === undefined ? '' : `${authority.userInfo}@`;
  const portSuffix = port === undefined ? '' : `:${port}`;
  return `${userInfo}${authority.host}${portSuffix}`;
}

function normalizeHierarchicalPath(path: string, isLogicalUri: boolean): string {
  if (isLogicalUri && path.length > 1 && path.endsWith('/')) {
    return path.slice(0, -1);
  }

  return path;
}

function validateLogicalUri(parts: HierarchicalParts): ResourceUriParseErrorReason | undefined {
  if (parts.authority.userInfo !== undefined) {
    return 'logical-uri-userinfo-forbidden';
  }

  if (parts.authority.port !== undefined) {
    return 'logical-uri-port-forbidden';
  }

  if (parts.query !== undefined) {
    return 'logical-uri-query-forbidden';
  }

  if (parts.fragment !== undefined) {
    return 'logical-uri-fragment-forbidden';
  }

  if (!LOGICAL_HOST_PATTERN.test(parts.authority.host)) {
    return 'invalid-host';
  }

  const rawPathSegments = parts.path.split('/').slice(1);
  const pathSegments =
    rawPathSegments[rawPathSegments.length - 1] === ''
      ? rawPathSegments.slice(0, -1)
      : rawPathSegments;
  if (
    !parts.path.startsWith('/') ||
    pathSegments.length < 2 ||
    pathSegments.some(
      (segment) =>
        segment.length === 0 ||
        segment === '.' ||
        segment === '..' ||
        !LOGICAL_PATH_SEGMENT_PATTERN.test(segment),
    )
  ) {
    return 'logical-uri-path-invalid';
  }

  return undefined;
}

function normalizeDefaultPort(scheme: string, port: string | undefined): string | undefined {
  if ((scheme === 'http' && port === '80') || (scheme === 'https' && port === '443')) {
    return undefined;
  }

  return port;
}

function normalizePercentEncoding(value: string):
  | {
      readonly type: 'valid';
      readonly value: string;
    }
  | {
      readonly type: 'invalid';
      readonly reason: 'invalid-percent-encoding';
    } {
  let normalized = '';

  for (let index = 0; index < value.length; index += 1) {
    const current = value.charAt(index);
    if (current !== '%') {
      normalized += current;
      continue;
    }

    const encoded = value.slice(index + 1, index + 3);
    if (!HEX_PATTERN.test(encoded)) {
      return {
        type: 'invalid',
        reason: 'invalid-percent-encoding',
      };
    }

    const decoded = String.fromCharCode(Number.parseInt(encoded, 16));
    normalized += UNRESERVED_PATTERN.test(decoded) ? decoded : `%${encoded.toUpperCase()}`;
    index += 2;
  }

  return {
    type: 'valid',
    value: normalized,
  };
}

function removeDotSegments(path: string): string {
  const hasLeadingSlash = path.startsWith('/');
  const hasTrailingSlash = path.endsWith('/') || path.endsWith('/.') || path.endsWith('/..');
  const output: string[] = [];

  for (const segment of path.split('/')) {
    applyPathSegment(output, segment);
  }

  return formatNormalizedPath(output, hasLeadingSlash, hasTrailingSlash);
}

function applyPathSegment(output: string[], segment: string): void {
  if (segment === '' || segment === '.') {
    preserveEmptyPathSegment(output, segment);
    return;
  }

  if (segment === '..') {
    removePreviousPathSegment(output);
    return;
  }

  output.push(segment);
}

function preserveEmptyPathSegment(output: string[], segment: string): void {
  const previous = output[output.length - 1];
  if (segment === '' && output.length > 0 && previous !== '') {
    output.push('');
  }
}

function removePreviousPathSegment(output: string[]): void {
  while (output[output.length - 1] === '') {
    output.pop();
  }
  output.pop();
}

function formatNormalizedPath(
  output: readonly string[],
  hasLeadingSlash: boolean,
  hasTrailingSlash: boolean,
): string {
  let normalized = output.join('/');
  if (hasLeadingSlash) {
    normalized = `/${normalized}`;
  }
  if (hasTrailingSlash && normalized !== '/' && !normalized.endsWith('/')) {
    normalized = `${normalized}/`;
  }

  return normalized;
}
