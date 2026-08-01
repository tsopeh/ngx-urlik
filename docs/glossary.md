# Domain glossary

**AppRouter** — The application-specific injection token returned by `defineAppRouter()`, and colloquially the typed router object obtained by injecting it.

**Route definition** — A plain object in the static route tree describing one ordinary or redirect route. Fallbacks use `fallbackRoute()`.

**Route identity** — The stable object key used in a chain such as `ROOT.WORKSPACE`. It is independent of the URL path. Uppercase is conventional only.

**Route node** — One property in the generated typed router tree. Ordinary nodes expose navigation construction and reactive URL state; redirect and fallback nodes expose reduced APIs.

**Route chain** — The ordered root-to-node ancestry. Parameter schemas and equality configuration inherit along it.

**Static segment** — The literal URL segment contributed by a route's `path`.

**Path parameter** — The optional single dynamic segment contributed after a route's static segment. It is required for URL construction and non-null when successfully resolved.

**Query parameter** — A serialized URL query key declared in a route's `queryParams` map. Its construction-property presence and value nullability are separate concepts.

**Accumulated parameters** — The union of all path or query definitions from the root through a selected node.

**Owned query schema** — The accumulated query keys visible at a selected node. Updates replace/remove these keys while preserving keys owned only by descendants or unknown to the schema.

**Required query input** — A query property marked `{ required: true }` that callers must explicitly list during deterministic URL construction. It may still accept `null`, meaning the physical key is omitted.

**Serializer** — A synchronous `UrlParamSerializer<T>` converting between decoded URL input and domain values. `null` represents absence; `undefined` is forbidden in `T`.

**Default value** — A value or injection-aware synchronous factory used for missing/malformed query input. Equal values serialize to `null` for canonical omission.

**URL parameters** — The combined `{ path, query }` typed state returned by a route node's `urlParams()` reference.

**UrlParamsRef** — A stable, readonly signal-oriented view of one route node's accumulated URL state plus `updateQueryParams()`.

**Deterministic construction** — Creating a target URL solely from the selected route and supplied values, without inheriting the current URL.

**Fallback route** — A branch-scoped special route compiling to Angular `**`. It can observe state but has no canonical URL to construct.

**Structural validation** — Synchronous validation performed by `defineAppRouter()` without executing serializers. All detected errors are reported together.
