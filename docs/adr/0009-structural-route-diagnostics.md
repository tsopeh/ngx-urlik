# ADR 0009: Keep cross-route structural diagnostics at definition time

Status: accepted.

## Decision

`defineAppRouter()` continues to validate the complete route tree synchronously at runtime. Parameter
shadowing, duplicate sibling URL patterns, fallback placement, and other relationships between route
definitions are not added to its TypeScript constraint.

TypeScript remains responsible for local route shape, accumulated parameter values, redirect
callbacks, generated route nodes, and reserved route identities. Runtime definition validation owns
relationships that require comparing separate nodes or separate levels of the tree.

Future editor or lint integrations may report the same structural errors before execution, but they
must reuse the definition validator's rules and messages rather than establish another routing
contract. Such tooling is additive and does not replace runtime validation because JavaScript,
widened values, and generated definitions can bypass static analysis.

## Rationale

`defineAppRouter()` is both an inference seam and a validation seam. Its recursive contextual type
infers accumulated path and query state so callbacks receive useful types. A cross-node conditional
constraint must inspect that same inferred tree. During generic argument inference, TypeScript may
widen a conflicting route collection to the `RouteDefinition` constraint or infer through an
intersection. The conditional then sees only the widened shape and accepts a tree that it rejects
once represented as a concrete standalone type.

Returning a branded error type merely moves the failure to later router use. A separate
`validateRoutes()` or route-builder call freezes the tree early enough to compare it reliably, but
callbacks in the separated call lose the accumulated contextual types that make the current
interface valuable. Both alternatives make the module shallower: callers learn more interface while
receiving diagnostics that remain incomplete for widened inputs.

The existing runtime traversal already has the complete tree, deterministic ancestry, and precise
route locations. Keeping these rules there provides one authoritative implementation and preserves
the small `defineAppRouter()` interface.

## Consequences

- Invalid literal trees may pass `tsc` and then throw immediately when `defineAppRouter()` executes.
- The error aggregates every detected structural problem with its full route identity.
- Local mistakes that TypeScript can express reliably remain type errors.
- Compile-time lint or editor diagnostics are a tooling opportunity, not part of the router's type
  interface.
- Any future static analyzer must have parity tests against `validateRouteDefinitions()`.

## Rejected alternatives

### Recursive conditional constraint on `defineAppRouter()`

Rejected because self-contextual generic inference can widen away the exact paths and parameter
names needed by the constraint. A check that is only sometimes enforced is worse than an explicit
runtime contract.

### Poison the generated router type

Rejected because the definition call succeeds and the error appears only when `AppRouter` is later
used or exported. It also produces less direct compiler messages than the runtime validator.

### Introduce a route-tree builder

Rejected for now because it expands the interface and either duplicates the route schema or gives up
contextual typing for accumulated-state callbacks.
