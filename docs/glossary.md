# Domain glossary

**AppRouter** — The application-specific injection token returned by `defineAppRouter()`, and colloquially the typed route tree obtained by injecting it.

**Route definition** — A plain object in the complete static route tree. Ordinary, redirect, and fallback routes are discriminated by their fields.

**Route identity** — The stable object key used in a chain such as `ROOT.WORKSPACE`. It is independent of the URL path; uppercase is only a convention.

**Complete route identity** — The dot-separated chain of route identities from the generated router root to a node, such as `ROOT.ADMIN.DETAIL`. Diagnostics use the complete identity so repeated leaf identities in different branches remain unambiguous.

**Route node** — One property in the generated typed router tree. Ordinary nodes expose construction, navigation, and state; redirect and fallback nodes expose reduced capabilities.

**Route chain** — The ordered root-to-node ancestry. Parameter definitions and equality configuration accumulate along it.

**Static segment** — The literal URL segment contributed by a route's `path`.

**Fallback route** — A branch-scoped route identified by `path: '**'`. It can observe state but has no canonical URL to construct.

**Angular options** — The supported Angular-owned route fields grouped under a definition's `angular` property and forwarded to Angular Router.

**URL parameter codec** — A pure, reusable `UrlParamCodec<T>` converting between one decoded string and a non-null domain value. `null` signals invalid conversion. Calling Angular `inject()` inside a codec is unsupported.

**Parameter definition** — A placement wrapper combining a codec with path/query policy. The wrappers are `pathParam`, `queryParam`, `repeatedQueryParam`, and `delimitedQueryParam`.

**Path parameter** — The optional single dynamic segment contributed after a route's static segment. It is required for construction and non-null when successfully resolved.

**Scalar query parameter** — A query property defined by `queryParam`. When a physical key repeats, the final value wins.

**Repeated query parameter** — An array parameter represented by repeated physical keys, such as `?tag=a&tag=b`.

**Delimited query parameter** — An array parameter represented by one physical key, such as `?tag=a,b`. Elements receive an inner URI-encoding layer before joining.

**Accumulated parameters** — The union of all path and query definitions from the root through a selected node.

**Owned query schema** — The accumulated query keys visible at a selected node. Updates replace or remove these keys while preserving descendant-only and unknown keys.

**Required query input** — A query property marked `{ required: true }` that construction callers must explicitly provide. It does not require a physical key: `null` and `[]` remain valid explicit decisions.

**Default value** — A value or injection-aware synchronous factory used for missing or malformed query input. Values equal to the current default are omitted from canonical URLs.

**URL parameters** — The combined `{ path, query }` typed state returned by a route node's `urlParams()` reference.

**UrlParamsRef** — A stable, readonly signal-oriented view of one route node's accumulated state plus `updateQueryParams()`.

**Query form binding** — An injection-context-owned synchronization between one active route node's
accumulated query state and an Angular Reactive Form or Signal Form. Path parameters are not part of
the binding.

**Query write stream** — The typed RxJS stream of per-parameter form changes that a query form
binding may transform before values are written to the URL.

**External URL update** — A successful navigation not originated by the current query form binding.
It is authoritative: staged form writes are cancelled and the form is reset to the URL value as a
new pristine baseline.

**Typed activation context** — A signal-oriented discriminated union identifying which member of an explicitly selected set of stateful route nodes is active, together with the exact node and its typed accumulated parameters.

**Activation candidate set** — The alias-to-route-node object supplied to `AppRouter.activeRoute()`. Its aliases become the discriminants of the resulting typed activation context.

**Deterministic construction** — Creating an absolute target solely from the selected route and supplied values, without inheriting the current URL.

**Construction fragment** — An optional typed `string | null` anchor supplied when constructing or navigating to a typed route. It is construction-only: it is not part of declared parameter state and does not appear in `urlParams()`.

**Escape hatch** — The bounded `AppRouter.escapeHatch` object exposing selected native Angular route-addressing operations and readonly observations. It marks an intentional departure from typed route construction without exposing the complete native `Router`.

**Recoverable parameter failure** — Invalid query input, failed query serialization, or a codec exception. It emits an `AppRouterDiagnostic` and uses absence/default semantics rather than throwing.

**Semantic state error** — An attempt to read an inactive route or an invalid active path parameter. These are the only library-owned runtime parameter-state errors that throw.

**Structural validation** — Aggregated synchronous validation performed by `defineAppRouter()` without executing codecs or default factories.

## TasteTrack demo domain

**TasteTrack** — The browser-local demonstration application for organizing screen, music, and
theatre catalog data and recording one anonymous profile's experiences.

**Catalog item** — Readonly seeded metadata for a movie, show, episode, album, song, theatre work,
production, or performance. Each kind remains a first-class entity rather than a generic media-item
subtype.

**Media summary** — A shared projection used when different catalog-item kinds appear together in
search, collection, dashboard, or activity views.

**Person** — A contributor who may receive role-specific credits across screen, music, and theatre.

**Group** — A credited band, orchestra, ensemble, theatre company, or production company.

**Theatre work** — The underlying play or musical independent of any particular staging.

**Production** — One staging of a theatre work by a particular company and creative team.

**Performance** — One dated occurrence of a production at a venue. Theatre attendance records refer
to performances.

**Personal state** — The editable status, favorite marker, rating, notes, experience count, and tags
associated with a catalog item in the local profile.

**Journal event** — A dated movie watch, episode watch, album listen, song listen, or theatre
attendance. Events may include a rating and note and do not replace an item's overall rating.

**Experience count** — Either an exact non-negative number or the reversible `countless` value,
displayed as “More than I can count.” Dated journal events may describe only part of the aggregate
experience history.

**Collection status** — The shared `saved`, `in-progress`, `completed`, `paused`, or `abandoned`
state. TasteTrack presents medium-specific labels such as Watchlist, Listen later, or Want to attend.

**Personal tag** — A reusable browser-local label with a name and color. Unlike seeded genres, it
describes the profile's relationship with catalog items.
