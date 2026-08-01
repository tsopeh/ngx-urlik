# Design documentation

The implementation currently in `projects/ngx-urlik` predates the accepted design. These documents describe the intended replacement.

- [Typed App Router design](design/app-router.md) — authoritative product and API contract.
- [Angular Router restrictions](angular-restrictions.md) — deliberate differences from normal Angular routing.
- [Deferred discussions](deferred-discussions.md) — explicitly postponed design and implementation topics.
- [Domain glossary](glossary.md) — canonical terminology.
- [ADR 0001: static route tree](adr/0001-static-route-tree.md)
- [ADR 0002: parameter model](adr/0002-parameter-model.md)
- [ADR 0003: deterministic routing and state](adr/0003-deterministic-routing-and-state.md)
- [ADR 0004: Angular runtime boundary](adr/0004-angular-runtime-boundary.md)

## Document authority

The design specification is authoritative for behavior. ADRs preserve rationale. The restrictions and deferred lists are checklists that should be revisited during planning and release review. Existing source code is not evidence of intended behavior when it conflicts with these documents.
