---
status: accepted
---

# 0015: Identify routes within an Angular-shaped declaration

An existing app should be able to pass its Angular-shaped route declaration to
`defineAppRouter({ routes: [...] })` before identifying any routes. Angular `Route` fields stay at
the top level. Adding a unique `identifier` to one ordinary route adds one flat node under
`AppRouter.routes`; unnamed routes continue to use Angular's routing behavior. Redirects and
wildcards remain unnamed in the initial design.
Callers keep `createUrlTree()` and `navigate()` on the generated node. An unnamed branch may
retain `loadChildren`, but routes loaded through it have no generated nodes. Identified routes
use statically declared `children` along their route chain. An identified empty-path child is
allowed; it can construct the same URL as its parent. V2 uses that Angular route shape for landing
content instead of a separate `exactMatch` property.

The route's `path` remains the source of its placeholder names. A path such as
`show/:showId/season/:season` requires both values when constructing its destination. Without
`pathParam`, placeholders are strings. With one placeholder, `pathParam` may be `{ codec }` or a
map keyed by its name, such as `{ showId: { codec: numberCodec() } }`. With several placeholders,
it must be a map containing exactly one `{ codec }` entry for each placeholder in that route's path. Descendant
destinations also require placeholders declared by their ancestors, including placeholders and
codecs on unnamed ancestors. Path parameter definitions initially have only a `codec` option;
path values are always required. A path and query field may share a name because they appear in
separate `path` and `query` state objects. Query definitions on an unnamed ancestor also
contribute to an identified descendant's query state.

This lets an app identify routes before choosing codecs, while preserving Angular's familiar path
syntax. It requires the library to parse paths for both types and URL construction and to reject
duplicate placeholder names along an identified route chain. A named node constructs a URL;
Angular's ordered matching and guards determine which route activates. After navigation, the
library associates the matched Angular route configuration with its identifier to report which
identified routes are active. Several identified ancestors and descendants can be active at once;
an observer that selects one route from a candidate set reports the deepest active candidate. The
complete declaration must retain literal path and identifier types for TypeScript to infer the
generated nodes. The initial design expects route literals to reach `defineAppRouter()` directly.
It does not add a separate `defineRoutes()` helper for route arrays split across files. A value
already widened to Angular's `Routes` type cannot recover literal identifiers or placeholder
names for generated types.

An identified route cannot have two path placeholders with the same name along its route chain.
An unnamed Angular-only branch may retain repeated names. For example, an identified `MEMBER`
under `teams/:id` and `members/:id` reports:

```text
MEMBER: path parameter 'id' appears in both 'teams/:id' and 'members/:id'. Rename one so params().path can hold both values.
```

The library preserves the application's Angular router configuration, including an explicit
`paramsInheritanceStrategy`. It reads ancestor path values from the activated route chain rather
than requiring one inheritance setting. Constructing a typed destination replaces the current
query parameters unless the caller supplies declared query values, even when Angular's
`defaultQueryParamsHandling` is set to merge or preserve. Replacing the route configuration at
runtime with `Router.resetConfig()` is outside the typed catalog's contract; generated operations
must fail clearly if their identified configurations have been replaced.

Typed construction accepts only declared query fields. A query field marked `required` must be
supplied by the caller, but its value may still serialize to no physical URL key. A query patch
preserves undeclared keys already in the current URL. Query definitions accumulate along the
route chain; a named descendant cannot inherit two definitions for the same query key. Sibling
branches may define that key differently. The existing `queryParam()`,
`repeatedQueryParam()`, and `delimitedQueryParam()` helpers remain the query definition
interface in this proposal.

If a supplied query value fails serialization, construction omits that query key and reports a
parameter diagnostic. Other query fields still appear in the destination. If a supplied path
value fails serialization, `createUrlTree()` returns `null`; `navigate()` resolves `false` without starting
navigation. When reading an existing URL, a malformed query field still uses its default or absent
value, while an invalid active path still throws when its typed state is read.
