# ADR 0008: Synchronize query forms through one write stream

Status: accepted. The binding-local coalescing policy below is superseded by
[ADR 0011](0011-shared-query-write-coordinator.md), which shares ordered writes across routes and forms.

## Decision

Provide optional Angular forms integration from the `ngx-urlik/forms` secondary entry point. Both
Reactive Forms and Signal Forms bind only a route node's accumulated query state. Path parameters
remain navigation inputs rather than writable form state.

Every binding normalizes form changes into one typed RxJS stream of per-parameter write events.
Consumers may transform that stream with standard RxJS operators for mapping, filtering,
grouping, debouncing, throttling, or other policies. The library does not wrap the RxJS operator
catalog. Writes replace the current history entry by default.

The URL is authoritative at binding time and after external navigation. External URL changes cancel
staged writes and reset the form to a pristine baseline. Navigation origin is tracked internally by
origin token and Angular navigation identity; URL equality alone is not used to classify an update.
Self-originated navigation echoes do not reset form interaction state.

Each binding owns a latest-state coalescing coordinator. It permits one navigation in flight,
merges later parameter emissions into the desired query snapshot, and performs at most one
follow-up navigation. It does not queue every intermediate value. Direct concurrent
`updateQueryParams()` calls remain outside this decision.

Bindings require an Angular injection context and clean up through `DestroyRef`. They expose no
pending, commit, result-history, or manual-destruction API. Form validation metadata is available on
write events but does not suppress URL writes unless the consumer's stream transformation chooses
to do so.

## Rationale

Reactive Forms and Signal Forms differ in state representation but share the same routing problem.
A common typed stream keeps timing and mapping policy independent of either forms implementation.
Per-parameter events prevent an immediate field from flushing another field whose write is delayed.

URL authority prevents stale debounced input from overwriting browser history navigation. Binding-
local coalescing closes the lost-update race without changing the deliberately unqueued primitive
`UrlParamsRef.updateQueryParams()` contract.

## Consequences

Reactive bindings use an exact flat `FormGroup` containing one `FormControl` per accumulated query
property. Array parameters are array-valued controls; structural `FormArray` and nested group
topologies are not supported. Signal Forms retain their model-derived dynamic array fields.

Signal bindings observe the root form model value. Native Signal Forms debounce therefore runs
before the optional model-to-URL write transformation; applying both delays cumulatively.

Automatic rejected writes are reported through an optional failure callback or Angular's
`ErrorHandler`. A declined navigation is reported to the callback when one is supplied. Values stay
in the form and failed writes are not retried automatically.
