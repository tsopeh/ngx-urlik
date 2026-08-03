# ADR 0006: Organize router internals as acyclic model modules

Status: accepted.

## Decision

Router implementation files remain flat in `projects/ngx-urlik/src/lib`, but their imports form a directed acyclic graph. `app-router.ts` is the composition root: it assembles the public typed API, compiled routes, parameter runtime, generated route nodes, provider factory, and bounded native escape hatch.

An implementation concern moves into its own private module when it has an independent model, invariants, or lifecycle. The current boundaries are route definitions and validation, compiled routes, diagnostics, parameter runtime, generated route nodes, and the native escape-hatch adapter. Lower-level modules must not import the composition root, and cycles between sibling models are forbidden.

Extracted implementation types and functions remain package-private. Moving a model does not by itself add a public package export. The public barrel and test files are consumers of the graph rather than implementation layers.

## Rationale

The router coordinates definition-time validation, Angular route compilation, parameter conversion, reactive state, typed construction, and native adaptation. Keeping all of those lifecycles in one file makes unrelated changes converge on the same module. Model-oriented files make ownership and dependencies visible while permitting genuinely shared lower-level models.

A directed acyclic graph is less restrictive than forcing every file into a single-parent tree. It permits reuse without allowing circular ownership or initialization dependencies.

## Consequences

`app-router.ts` stays small enough to describe the product seam rather than every implementation detail. Internal imports require deliberate downward direction, and acyclicity is inspected during review. No dependency-analysis or lint package is added at this stage; automated enforcement can be introduced if cycles become a recurring problem.
