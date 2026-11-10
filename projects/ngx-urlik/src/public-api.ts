export { isEqual } from './lib/is-equal';
export {
  booleanCodec,
  enumCodec,
  listCodec,
  numberCodec,
  queryParam,
  repeatedQueryParam,
  stringCodec,
  type DefaultValue,
  type UrlParamCodec,
} from './lib/params';
export {
  defineAppRouter,
  type ActiveRoute,
  type AppRouterDiagnostic,
  type AppRouterDiagnosticCode,
  type AppRouterParameterDiagnostic,
  type AppRouterUnknownKeyDiagnostic,
  type AppRouterDiagnostics,
  type GeneratedAppRouter,
  type PathParamsOf,
  type QueryParamsOf,
  type QueryPatch,
  type RouteDefinition,
  type RouteDefinitions,
  type RouteNode,
  type RouteQueryPatch,
  type RouteStateOf,
  type UrlParamsState,
} from './lib/app-router';

// Keep the internal bridge available to the forms entry point.
export { getQueryBinding as ɵgetQueryBinding } from './lib/query-binding';
