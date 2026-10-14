# Glossary

These names are used in the code and the reference.

## Routes

**AppRouter**: The injection token returned by `defineAppRouter()`. Inject it to get the flat `routes` object, `activeRoute()`, `globalQueryParams()`, and `escapeHatch`.

**Route names**: The enum or string map passed as the first argument to `defineAppRouter()`. Its members key `AppRouter.routes`.

**Route definition**: An Angular route object with optional ngx-urlik fields: `routeName`, `pathParam`, `queryParams`, and `isEqual`.

**Route name**: A unique `routeName` value on an ordinary route. It adds a node under `AppRouter.routes` and does not change the URL.

**Route node**: The generated object for a named route. It constructs destinations, navigates, and reads or patches state.

**Route chain**: A named route and its ancestors, from the root down. Path and query definitions accumulate along this chain, including unnamed ancestors.

**Unnamed route**: An Angular route without `routeName`. Angular handles it, but it adds no route node.

**Path placeholder**: A dynamic segment written as `:name` in an Angular path.

## Parameters

**Codec**: A pure converter between one decoded string and a non-null value. `null` reports failed conversion.

**Scalar query parameter**: One value from a query key. If the key repeats, the last value wins.

**Repeated query parameter**: An array stored as repeated keys, such as `?tag=a&tag=b`.

**List codec**: A codec that joins item values with a separator, such as `?tag=a,b`. It is used on an ordinary scalar query field.

**Accumulated parameters**: All path and query definitions from a node and its ancestors.

**Default value**: A value, or a synchronous injection-aware factory, used for missing or malformed query input. Values equal to the default are omitted from URLs.

**Required query input**: A field marked `required: true` that callers must supply during construction. It does not require a key in the URL.

## State and writes

**Committed state**: The parameters in the URL of the last completed navigation, as read by `params()`.

**Draft state**: Values held by a form binding that are not yet written to the URL.

**Query patch**: A partial query object, or a function that returns one from committed state. Omitted and `undefined` fields stay unchanged.

**Write queue**: The per-router coordinator that runs route patches and form writes one at a time.

**External navigation**: Any navigation the write queue did not start, including browser history. It cancels waiting writes and form drafts when it starts.

**Deterministic construction**: Building an absolute destination from the node and supplied values, without copying current URL state.

**Activation candidates**: The alias-to-node map passed to `activeRoute()`. The deepest active candidate wins.

## Errors and native operations

**Diagnostic**: An `AppRouterDiagnostic` reported for bad query data or a failed serialization. The operation continues with a default or an omitted key.

**Semantic state error**: Reading an inactive route or an invalid active path. These reads throw because there is no valid state to return.

**Structural validation**: The checks `defineAppRouter()` runs on named route chains. All problems are reported in one error.

**Escape hatch**: `AppRouter.escapeHatch`, which exposes selected native Angular Router methods and observations.

## TasteTrack

**Catalog item**: Readonly metadata for a movie, show, or episode.

**Season**: A numbered set of episodes in a show. Episode addresses include the show ID, season number, and episode number.

**Contributor**: A person or production company credited on a title.

**Credit**: A contributor's role on a title: actor, director, writer, or production.

**Personal state**: An item's collection status, favorite marker, rating, and experience count.

**Journal event**: A dated viewing with an optional rating, separate from the item's overall rating.

**Experience count**: An exact non-negative number or `countless`. Dated events may account for only part of it.
