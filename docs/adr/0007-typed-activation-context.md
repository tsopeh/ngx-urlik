# ADR 0007: Select typed activation context explicitly

Status: accepted.

## Decision

`AppRouter.activeRoute(candidates)` accepts an explicitly named set of generated stateful route nodes. It returns a signal-oriented reference whose value is a discriminated union. Every union member contains the caller-supplied alias as `route`, the exact generated `node`, and the node's typed accumulated `params`.

Navigation between candidates updates the value. [ADR 0013](0013-index-routes-and-active-selection.md) specifies deepest-active-candidate selection, independent of declaration order. Reading the value when no candidate is active throws a semantic state error. Redirect nodes are not candidates because they expose no active parameter state. `activeRoute` is reserved as an application-router-root method name; it remains a valid child route identity.

## Rationale

One component may serve structurally different routes, such as a detail route with a path parameter in one branch and a query parameter in another. Individual `urlParams()` references are typed, but probing several references is ambiguous and inactive references intentionally throw. Inferring identity from URL shape or parameter names would discard the stable identities already present in the complete static route tree.

An explicit candidate set states the component's supported contexts and produces a small local union. An implicit application-wide active-route union would grow with the complete tree and make unrelated routes part of every shared component's type contract.

## Consequences

Angular continues to own route matching and activation. ngx-urlik maps the active Angular snapshot to one of the selected static nodes and applies that node's existing accumulated parameter model. Applications no longer need duplicate route-scoped providers merely to tell a shared component which typed node activated it.

Candidate aliases are component-facing discriminants rather than global route identities. A component may therefore choose concise domain names while the selected node retains its complete structural identity.
