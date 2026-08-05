# Implementation plan: query form bindings

Status: implemented.

Source decision: [ADR 0008](../adr/0008-query-form-bindings.md).

## Objective

Add query-only Reactive Forms and Signal Forms helpers under `ngx-urlik/forms`, backed by one typed
write stream and a binding-local latest-state coordinator.

## Public seam

- `bindQueryParamsToFormGroup(route, form, options?)`;
- `createQueryParamsFormGroup(route, options?)`;
- `bindQueryParamsToSignalForm(route, form, options?)`;
- `createQueryParamsSignalForm(route, options?)`.

All helpers require an active stateful route and an Angular injection context. Bind helpers return
`void`; creators return only the created Angular form state.

## Test-first sequence

Each item is implemented as its own red-green slice. Record that the red assertion fails for the
intended missing or incorrect behavior before adding production behavior.

1. Prove two different immediate parameter changes cannot lose the first value while navigation is
   in flight.
2. Prove synchronous parameter changes coalesce and later changes converge in one follow-up write.
3. Prove a self-originated navigation echo preserves dirty and touched state.
4. Prove browser Back, another binding, redirects, and unrelated external navigation cancel staged
   writes and reset the form to a pristine URL baseline.
5. Prove a delayed transformed write cannot be flushed by an immediate parameter write.
6. Prove destroyed bindings unsubscribe and cancel staged work.
7. Prove `replaceUrl` defaults to true and accepts an explicit false override.
8. Prove stream mapping, filtering, grouping, validation metadata, completion, and failure handling.
9. Prove Reactive creation produces an exact flat group with array-valued controls.
10. Prove Signal Forms creation and binding follow the same URL-authority and write semantics,
    including native-model debounce ordering and dynamic array values.
11. Prove inactive routes fail synchronously and public types reject missing, extra, misspelled,
    path-only, `FormArray`, and nested-control shapes.

## Documentation and verification

- Document the `groupBy` timing pattern and its per-parameter isolation.
- Document that form validation does not gate URL writes automatically.
- Document Reactive `FormArray`/nested-group exclusions and Signal Forms debounce composition.
- Run build, typecheck, runtime tests, formatting, and `git diff --check` under Node 24.15.0.
