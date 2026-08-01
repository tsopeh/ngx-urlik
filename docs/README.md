# Design documentation

The implementation in `projects/ngx-urlik` follows the accepted Typed App Router design on the fresh Angular 22 workspace baseline.

- [Typed App Router design](design/app-router.md) — authoritative product and API contract.
- [Angular Router restrictions](angular-restrictions.md) — deliberate differences from normal Angular routing.
- [Deferred discussions](deferred-discussions.md) — explicitly postponed product, compatibility, and implementation topics.
- [Domain glossary](glossary.md) — canonical terminology.
- [ADR 0001: static route tree](adr/0001-static-route-tree.md)
- [ADR 0002: parameter model](adr/0002-parameter-model.md)
- [ADR 0003: deterministic routing and state](adr/0003-deterministic-routing-and-state.md)
- [ADR 0004: Angular runtime boundary](adr/0004-angular-runtime-boundary.md)

## Document authority

The design specification is authoritative for behavior. ADRs preserve rationale. The restrictions and deferred lists are checklists that should be revisited during future planning and release review. If implementation and documentation diverge, reconcile them against the accepted design rather than treating the divergence as a new contract.
