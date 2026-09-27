# Glossary

These names are used in the code and reference.

## Routes

**AppRouter** — The injection token returned by `defineAppRouter()`. Inject it to get the flat, identifier-keyed `routes` catalog and router helpers.

**Route definition** — An Angular route object with optional typed-router metadata such as `identifier`, `pathParam`, and `queryParams`.

**Route identifier** — A unique name on an ordinary route. It adds a flat node under `AppRouter.routes`; uppercase is a convention.

**Route identity** — The identifier used to identify a route in code and parameter diagnostics. It is independent of the URL path.

**Route node** — The generated object for an identified route. It constructs destinations, navigates, and reads or patches state.

**Route chain** — An identified route and its ancestors, from the root down. Path and query definitions accumulate along this chain, including unnamed ancestors.

**Anonymous route** — An Angular route without an `identifier`. Angular handles it, but it adds no generated route node.

**Path placeholder** — A dynamic segment written as `:name` in an Angular path. A destination supplies a value for every placeholder in its identified route chain.

**Path parameter configuration** — An optional `{ codec }` or name-keyed map of codec options for placeholders in one route's path. Unconfigured placeholders use strings.

**Angular route options** — Angular `Route` fields declared directly on the route and forwarded to Angular Router.

## Parameters

**URL parameter codec** — A pure converter between one decoded string and a non-null value. `null` reports failed conversion.

**Parameter definition** — A codec on a path placeholder through the route's `pathParam` field, or a query definition made with `queryParam()`, `repeatedQueryParam()`, or `delimitedQueryParam()`.

**Path parameter** — The decoded value for one path placeholder. Construction requires values for all placeholders on the route chain.

**Scalar query parameter** — One value from a query key. If the key repeats, the last value wins.

**Repeated query parameter** — An array stored as repeated keys, such as `?tag=a&tag=b`.

**Delimited query parameter** — An array stored under one key, such as `?tag=a,b`. Items receive their own encoding before joining.

**Accumulated parameters** — All path and query definitions from a node and its ancestors.

**Route query schema** — The accumulated query fields a node can read and patch.

**Required query input** — A field marked `required: true` that callers must supply during construction. It does not require a physical URL key.

**Default value** — A value, or synchronous injection-aware factory, used for missing or malformed query input. Values equal to the default are omitted from constructed URLs.

## State and writes

**URL parameters** — The `{ path, query }` value read from a route's `params` signal.

**Query patch** — A partial query object, or a function returning one from committed state. Omitted and `undefined` fields stay unchanged.

**Query form binding** — Synchronization between an active route's query state and an Angular form. The form holds the draft; the URL holds committed state.

**Query write stream** — Per-field form changes passed through `transformWrites` before submission to the URL write queue.

**External URL update** — Navigation outside the shared query-write coordinator, including browser history. It cancels waiting writes and staged form edits when it starts.

**Typed activation context** — The alias, node, and parameter state selected by `activeRoute()`. The alias narrows the types of the other fields.

**Activation candidate set** — The alias-to-node map supplied to `activeRoute()`. The deepest active named candidate wins.

**Deterministic construction** — Building an absolute destination from the selected node and supplied values, without borrowing current URL state.

**Construction fragment** — The optional string or `null` anchor supplied to construction or navigation. It is not part of `params()`.

## Errors and native operations

**Escape hatch** — The `AppRouter.escapeHatch` object for supported native addressing methods and navigation observations.

**Recoverable parameter failure** — Bad query data or failed query serialization handled with a diagnostic and a default or omitted URL key.

**Semantic state error** — Reading an inactive route or an invalid active path. These reads throw because there is no valid parameter state to return.

**Structural validation** — Checks performed by `defineAppRouter()` on identified route chains, without running codecs or default factories. Errors are reported together.

## TasteTrack

**TasteTrack** — The browser-local movie and TV journal used to demonstrate the library.

**Catalog item** — Readonly metadata for a movie, show, or episode.

**Season** — A numbered set of episodes belonging to a show. Episode addresses include the show ID, season number, and episode number.

**Contributor** — A person or production company credited on a title.

**Credit** — A contributor's role on a title: actor, director, writer, or production.

**Personal state** — An item's editable status, favorite marker, rating, and experience count.

**Journal event** — A dated viewing with an optional rating. Its rating is separate from the item's overall rating.

**Experience count** — An exact non-negative number or `countless`. Dated events may account for only part of it.

**Collection status** — Saved, in progress, or completed.
