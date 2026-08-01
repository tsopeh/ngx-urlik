# ADR 0003: Make construction deterministic and mutation route-scoped

Status: accepted.

## Decision

`createUrlTree()` and `navigate()` always build absolute targets only from explicit accumulated values. They never inherit current query state. `urlParams()` returns readonly signal state. `updateQueryParams()` accepts only a complete functional updater, preserves path state, merges owned serialized query results, and preserves descendant/unknown keys.

## Rationale

Pure URL construction is predictable in components, services, guards, and templates. Query mutation is intentionally a separate operation on current state. Functional complete-state updates avoid ambiguous omission and patch semantics.

## Consequences

Relative navigation, fragments, patch updates, and direct-value updates are initially absent. Concurrent updates follow Angular navigation behavior and must be awaited when ordering matters.
