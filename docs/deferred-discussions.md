# Deferred discussions

These topics were deliberately left for later rather than implicitly rejected forever:

- Supported Angular version range beyond the current Angular 22 target.
- Migration and release compatibility policy for future releases.
- Comparator-specific `urlParams()` reference caching.
- Expanding `isEqual()` for cycles, `Map`, `Set`, and other specialized values.
- Broader runtime validation of custom codec domain values beyond checking serialized output.
- Built-in date and other structured codecs beyond repeated and delimited arrays.
- Query-key aliases distinct from logical TypeScript property names.
- A writable signal or explicit Angular Signal Forms synchronization adapter.
- Revisit whether `escapeHatch.events`, `currentNavigation`, `lastSuccessfulNavigation`, `navigated`, and related observations should remain native-shaped or receive a smaller first-party model.
- Relative navigation remains confined to the escape hatch; fragments are supported only as typed, construction-only values unless concrete state-modeling needs emerge.
- Named outlets, custom matchers, matrix parameters, empty child routes, and lazy route definitions.
- More navigation/update behavior options if concrete use cases require them.
- Managed queuing or conflict semantics for concurrent query updates.
- Compile-time diagnostics for parameter shadowing and structural conflicts beyond runtime aggregation.
- Development diagnostic and tracing facilities beyond the current validation errors.
- Optional ESLint rules warning when application code bypasses the typed API through Angular `Router` or raw route constructs.
- Whether route-level equality callbacks can receive perfectly inferred accumulated state in all recursive TypeScript contexts; the desired public contract remains fully typed.
