# ADR 0001: Use one complete static route tree

Status: accepted.

## Decision

`defineAppRouter({ routes })` is the only route-definition source. It accepts exactly one root whose named children form the entire statically known tree. Components may be lazy, but route definitions may not be lazy or contributed later. Generated Angular routes are private. A literal `path: '**'` identifies a branch-scoped fallback; no branded fallback factory is needed.

## Rationale

The full tree is necessary to infer global route chains, accumulated parameters, and deterministic construction at compile time. Explicit object keys provide stable identities and better TypeScript inference than deriving property names from URL strings.

## Consequences

This deliberately gives up Angular's multiple top-level arrays, lazy route definitions, empty child paths, and same-path ordered alternatives. It enables a globally injectable, application-specific typed router.
