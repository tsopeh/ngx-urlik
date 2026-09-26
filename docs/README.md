# Documentation

Start with the [README](../README.md) to use the library. Read the [implementation guide](implementation.md)
when you want to change it.

| If you need to…                     | Read…                                           |
| ----------------------------------- | ----------------------------------------------- |
| Look up behavior or an edge case    | [API reference](design/app-router.md)           |
| Compare support with Angular Router | [Angular differences](angular-restrictions.md)  |
| Check what a term means             | [Glossary](glossary.md)                         |
| Explore possible extensions         | [Open questions](deferred-discussions.md)       |
| See a working application           | [TasteTrack](../projects/taste-track/README.md) |
| Write documentation                 | [Plainspoken Engineering](writing-style.md)     |

## Why the design looks this way

Each note explains one choice and its cost.

- [0001: One static route tree](adr/0001-static-route-tree.md)
- [0002: Reusable codecs](adr/0002-parameter-model.md)
- [0003: Destinations and current state](adr/0003-deterministic-routing-and-state.md)
- [0004: Angular runs the router](adr/0004-angular-runtime-boundary.md)
- [0005: Native routing when needed](adr/0005-router-addressing-parity.md)
- [0006: Code organized by responsibility](adr/0006-acyclic-model-modules.md)
- [0007: Shared components choose their routes](adr/0007-typed-activation-context.md)
- [0008: Forms hold drafts](adr/0008-query-form-bindings.md)
- [0009: Validate the tree at definition time](adr/0009-structural-route-diagnostics.md)
- [0010: Learn through TasteTrack](adr/0010-tastetrack-demo.md)
- [0011: One query-write queue](adr/0011-shared-query-write-coordinator.md)
- [0012: Observe queries across pages](adr/0012-global-query-observation.md)
- [0014: Give landing content one route identity](adr/0014-exact-match.md)
