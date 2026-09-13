# Design documentation

These documents describe the accepted Typed App Router design on the Angular 22 workspace baseline. Newly accepted decisions may precede their implementation in `projects/ngx-urlik`.

- [Typed App Router design](design/app-router.md) — authoritative product and API contract.
- [Angular Router restrictions](angular-restrictions.md) — deliberate differences from normal Angular routing.
- [Deferred discussions](deferred-discussions.md) — explicitly postponed product, compatibility, and implementation topics.
- [Domain glossary](glossary.md) — canonical terminology.
- [ADR 0001: static route tree](adr/0001-static-route-tree.md)
- [ADR 0002: parameter model](adr/0002-parameter-model.md)
- [ADR 0003: deterministic routing and state](adr/0003-deterministic-routing-and-state.md)
- [ADR 0004: Angular runtime boundary](adr/0004-angular-runtime-boundary.md)
- [ADR 0005: typed route addressing and bounded escape hatch](adr/0005-router-addressing-parity.md)
- [ADR 0006: acyclic model modules](adr/0006-acyclic-model-modules.md)
- [ADR 0007: explicit typed activation context](adr/0007-typed-activation-context.md)
- [ADR 0008: query form bindings](adr/0008-query-form-bindings.md)
- [ADR 0009: structural route diagnostics](adr/0009-structural-route-diagnostics.md)
- [ADR 0010: TasteTrack demo architecture](adr/0010-tastetrack-demo.md)
- [ADR 0011: shared query-write coordinator](adr/0011-shared-query-write-coordinator.md)
- [ADR 0012: read-only global query observation](adr/0012-global-query-observation.md)

## Document authority

The design specification is authoritative for behavior. ADRs preserve rationale. The restrictions and deferred lists are checklists that should be revisited during future planning and release review. If implementation and documentation diverge, reconcile them against the accepted design rather than treating the divergence as a new contract.
