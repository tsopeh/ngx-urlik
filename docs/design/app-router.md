# API Reference

## Definition

`defineAppRouter(RouteNames, { routes, routerConfig, diagnostics })` builds the route catalog.

- `routeName`: Links the route to `RouteNames` and generates a typed node in `AppRouter.routes`. This provides a stable target for your editor's Go to Definition.
- `pathParam`: Codec map for path placeholders (`:id`). Defaults to `stringCodec()`.
- `queryParams`: Defines query fields. Because path and query parameters live in separate namespaces, a path segment and a query field can safely share the same name.
- `isEqual`: Custom comparator for the `params` signal.

## Codecs

Codecs convert between strings and typed values (`serialize`/`deserialize`). Built-in: `stringCodec()`, `numberCodec()`, `booleanCodec()`, `enumCodec(values)`. `enumCodec` accepts readonly string arrays, tuples, or string records.

Query cardinality:

- `queryParam`: Single value. Last occurrence wins.
- `repeatedQueryParam`: Array as repeated keys (`?a=1&a=2`).
- `delimitedQueryParam`: Array joined by a `separator` (`?a=1,2`). Items are URI-encoded.

Defaults and requirements:

- `defaultValue`: Value or synchronous factory (`() => inject(Auth).user()`). Used if missing or malformed.
- `required: true`: Mandates supplying the parameter during construction. Path parameters are inherently required.

## Construction

`node.createUrlTree(inputs)` and `node.navigate(inputs, options)` build absolute destinations from supplied inputs. Unlike native Angular navigation, they never copy query parameters from the active URL, ensuring link generation remains strictly deterministic.

Missing path parameters return `null` or resolve `false`. If a route has no path parameters, `createUrlTree` returns `UrlTree`, and `navigate` can be called without inputs: `navigate({ replaceUrl: true })`. Pass `{ fragment: 'id' }` to set the URL hash.

## State and Writes

`node.params` is a readonly signal of `{ path, query }`. Reading an inactive route throws.

`node.patchQuery(patch, options)` queues a URL update. It accepts a partial object or `(current) => partial`. It preserves unmentioned fields, descendants, and fragments. Passing a field's default, `null`, or `[]` removes it from the URL.

The write queue executes sequentially. If two independent components patch the URL at the same time, the coordinator feeds the latest committed state into each patch function so both edits survive. External navigation (e.g., browser back button) cancels pending writes so users aren't forced back to a page they just left.

## Forms (`ngx-urlik/forms`)

`createQueryParamsFormGroup(node)` and `createQueryParamsSignalForm(node)` bind the URL to an Angular form. The form safely holds user drafts—like partially typed text or debounced inputs—while the URL acts as the committed truth. Form writes use `replaceUrl: true` by default to avoid cluttering browser history.

Use `transformWrites` to debounce fields via RxJS before they enter the queue. External navigation instantly resets the form to the committed URL so users don't get stuck viewing stale edits.

## Shared Components (`activeRoute`)

Select the deepest active candidate to handle shared components:

```ts
const active = router.activeRoute({ A: routes.A, B: routes.B });
```

`active()` returns `{ route, node, params, createUrlTree, patchQuery }`. The `route` alias narrows the types. `createUrlTree` and `patchQuery` operate on the active route directly.

## Global Queries

`router.globalQueryParams(schema)` returns a readonly signal of query parameters independent of the active route. It does not write to the URL.

## Diagnostics

Query parsing failures emit warnings and use defaults. Configure via `diagnostics: { warn }` on `defineAppRouter`. Structural errors throw during initialization.

## Types

- `RouteNode`: The route object.
- `PathParamsOf<Node>`, `QueryParamsOf<Node>`, `RouteStateOf<Node>`: Extract parameter types.
- `RouteQueryPatch<Node>`: The accepted input for `patchQuery`.

## Escape Hatch

`AppRouter.escapeHatch` provides native Angular Router methods (`navigate`, `createUrlTree`, `events`) for untyped operations.
