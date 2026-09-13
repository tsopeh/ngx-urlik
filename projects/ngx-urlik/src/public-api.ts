export { isEqual } from './lib/is-equal';
export {
  booleanCodec,
  delimitedQueryParam,
  enumCodec,
  numberCodec,
  pathParam,
  queryParam,
  repeatedQueryParam,
  stringCodec,
  type DefaultValue,
  type UrlParamCodec,
} from './lib/params';
export {
  defineAppRouter,
  type AngularRedirectOptions,
  type AngularRouteOptions,
  type AppRouterDiagnostic,
  type AppRouterDiagnosticCode,
  type AppRouterDiagnostics,
  type ActiveRouteRef,
  type UrlParamsRef,
  type GlobalQueryParamsRef,
} from './lib/app-router';

// Internal bridge between package entry points.
export { getQueryBinding as ɵgetQueryBinding } from './lib/query-write-coordinator';
