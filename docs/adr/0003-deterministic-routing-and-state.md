# ADR 0003: Make construction deterministic and parameter failures recoverable

Status: accepted.

## Decision

`createUrlTree()` and `navigate()` always build absolute targets from explicit accumulated values. They never inherit current query state. `urlParams()` returns readonly signal state, while `updateQueryParams()` performs complete functional query updates scoped to the selected node.

Parameter data failures are recoverable and reported through structured `AppRouterDiagnostic` values. Diagnostics are configurable on `defineAppRouter` and default to `console.warn`.

- Invalid query reads use their current default, `null`, or `[]`.
- Invalid query construction omits the complete property and continues.
- Codec exceptions are caught, warned, and treated as invalid parameter data.
- Invalid path construction makes `createUrlTree()` return `null`; `navigate()` resolves `false` without calling Angular.
- Reading inactive route state or an invalid active path remains a semantic error and throws.
- Exceptions from consumer callbacks such as default factories and redirects remain consumer-owned and propagate.

## Rationale

Pure construction is predictable in components, services, guards, and templates. Malformed external URL data and imperfect construction values should not crash an application when a safe absence behavior exists. Path construction is explicitly nullable because inventing a valid segment would be dishonest.

Structured diagnostics preserve visibility without coupling applications to console text. Redirect callbacks still require a definite `UrlTree`; application code must explicitly choose a fallback when typed construction returns `null`.

## Consequences

Consumers must account for `UrlTree | null` from construction. Angular's `routerLink` accepts the null-like no-target state. Query update remains functional and complete-state only. Concurrent updates are not queued and must be awaited when ordering matters.
