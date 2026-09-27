# Implementation

- `app-router.ts`, `app-router-types.ts`: Public API, compilation, and type inference.
- `route-definition.ts`, `compiled-route.ts`: Validates chains and accumulates parameters.
- `route-node.ts`: Generates `AppRouter.routes` and implements URL construction and reads.
- `route-params-runtime.ts`: Codec execution and default resolution.

## Write

If two independent components update different query parameters simultaneously, a naive navigation can cause one update to overwrite the other. `query-write-coordinator.ts` prevents this by running one write at a time. Each patch reads fresh committed state when its execution begins, merges the requested fields, and navigates.

## Follow a form edit

`forms/query-forms.ts` adapts both Reactive Forms and Signal Forms to the same synchronization logic. The binding records each pending field change. If the user edits a field again while a previous write is in flight, the newer edit persists, ensuring that rapid typing isn't interrupted by slower URL updates.

## Tests (`projects/ngx-urlik/src/lib/`)

- `app-router.spec.ts`: Definitions, linking, and state.
- `params.spec.ts`, `parameter-state.spec.ts`: Codecs and decoding.
- `query-updates.spec.ts`: Write coordinator queue.
- `query-forms.spec.ts`: Form bindings.
- `global-query.spec.ts`: Ambient observations.
- `is-equal.spec.ts`: Deep equality.
- `type-tests/`: Validates consumer type inference and Go to Definition.
