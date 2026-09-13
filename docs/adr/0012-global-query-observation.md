# ADR 0012: Expose read-only global query observation

Status: accepted; implemented.

## Decision

Expose `router.globalQueryParams(definitions, options?)` directly on the injected application
router as an advanced API. It accepts a named object of existing query parameter definitions
and returns a reference with `value`, a signal of the readonly decoded query object. Values
are accessed directly, for example `reference.value().timeRange`. No update method is included. Parameter diagnostics use `globalQueryParams` as their `route` source,
since a global reference has no owning route.

Definitions do not need to appear in the route tree. Each reference independently applies its
own codecs and defaults, even when other references or routes describe the same physical key.
The existing scalar, repeated, and delimited definitions are reusable unchanged. `required`
remains a construction-only policy and has no effect on these reads.

Observation follows the same snapshot timing and decoding rules as page references, refreshing
on `NavigationEnd`. Before initial navigation completes, a read uses the current snapshot and
normal absent-key behavior rather than a separate loading state. Default factories use the
application injector. Deep equality suppresses unchanged decoded values by default; an optional
`{ isEqual }` argument compares the complete direct query object.

Once the router instance is available, the method is callable outside an injection context.
Navigation subscription ownership remains with the router, without caller-specific cleanup
for individual computed references. `globalQueryParams` is reserved at the application-router
root, while remaining a valid child route identity.

## Rationale

A global service may observe an application convention such as `timeRange` on every page without
owning route state. Components can likewise need ad hoc observation. Declaring a root parameter
remains appropriate when the parameter is part of the static route contract, but is unnecessary
for independent observation.

The explicit `global` name and read-only contract distinguish this API from ordinary page state.
Documentation should recommend route-scoped references for page-owned parameters. Placing the
method under `escapeHatch` would mix a typed library abstraction with that object's native Angular
operations. A standalone or static function would still need a runtime router, supplied explicitly
or acquired through a more restrictive injection-context requirement.

Independent definitions avoid runtime registration conflicts and initialization-order dependence.
Applications that need consistent interpretations can share definition objects. Matching page
timing avoids introducing a second stream of provisional navigation values.

## Consequences

Two observers may resolve different typed values from the same URL if their definitions differ.
A startup service may initially see absent-key fallbacks before the incoming navigation completes.
The API does not carry query values between pages or restore persisted values to the URL.

Writing through global references is deferred. Returning a reference object permits a future
extension without changing the direct shape of the signal's query value. The authoritative
contract is recorded in the global query observation section of the router design.
