# ADR 0004: Keep a clear Angular runtime boundary

Status: accepted.

## Decision

Angular Router remains the matching and navigation engine. `provideAppRouter(...features)` supplies generated routes and forwards supported Angular router features. The native `Router` remains injectable.

Angular-owned per-route fields are grouped under an `angular` object. ngx-urlik owns `path`, `pathParam`, `queryParams`, `children`, `redirectTo`, fallback semantics, and equality. The supported Angular subset includes components, guards, resolvers, data, title, providers, and guard/resolver rerun behavior. Redirects receive the narrower `canMatch`, `providers`, and `data` subset.

Router configuration belongs on `defineAppRouter({ routerConfig })`. The library forces `paramsInheritanceStrategy: 'always'` and rejects `withRouterConfig()` passed to `provideAppRouter`.

## Rationale

The nested object makes framework ownership visible and lets the compiler forward Angular capabilities as one unit. Reusing Angular preserves directives, SSR behavior, activation, history, location strategy, parsing, and encoding without recreating a second runtime router.

## Consequences

Route definitions have one additional nesting level for component and guard configuration. Consumers can still bypass typed safety by injecting Angular Router; runtime exclusivity is intentionally unenforced.
