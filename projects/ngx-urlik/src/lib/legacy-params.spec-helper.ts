import { PathParamDefinition, UrlParamCodec } from './params';

type NonNullish<T> = null extends T ? never : undefined extends T ? never : unknown;

/** Test-only helper for the original path parameter declaration. */
export function pathParam<T, const Name extends string>(
  options: { name: Name; codec: UrlParamCodec<T> } & NonNullish<T>,
): PathParamDefinition<T, Name> {
  return { kind: 'path', ...options };
}
