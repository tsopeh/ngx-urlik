# Design decisions

Each entry states a problem, the choice that answers it, and what the choice costs. The
[README](../README.md) holds the exact rules. [History](history.md) covers choices
that applied only to the first design. Before reopening a decision, read its rejected alternatives.

## Accept Angular's route array and name routes one at a time

An application that already has Angular routes should be able to adopt typed routing without
rewriting its route declaration. `defineAppRouter()` therefore takes Angular's ordered route array
unchanged. Angular fields stay at the top level, and adding `routeName` to one route adds one node
to a flat `AppRouter.routes`. Unnamed routes, including redirects, wildcards, matchers, and named
outlets, keep Angular's behavior and produce no node.

Angular still decides which route activates. A node only builds URLs and reads the state of the
Angular route it was compiled from. Landing content uses an ordinary empty-path child, so two named
routes can build the same URL and both be active at once.

**Cost:** route order matters again, as it does in Angular. The library cannot reject two named
routes whose patterns overlap; Angular's ordering decides which one matches.

## Take route names from an enum

`defineAppRouter(RouteNames, …)` types `AppRouter.routes` from the members of `RouteNames`. Go to
Definition on `routes.MOVIE_DETAIL` then opens the enum member that the route declaration also
references, instead of stopping at a generated mapped type.

**Cost:** every call site imports the enum, and route names are declared twice: once in the enum
and once on the route.

## Declare named route chains statically

TypeScript can infer a route's accumulated parameters only from literal paths, names, and
`children` arrays that reach `defineAppRouter()` directly. Named routes and their ancestors
therefore cannot use `loadChildren`, and a route array widened to Angular's `Routes` type produces
no typed nodes. Components can still load lazily. The catalog is fixed at definition time, so
`Router.resetConfig()` is outside the contract. The library does not check for it: the check walked
the route configuration on every construction and state read to catch a call almost no application
makes.

**Cost:** a large route tree must be assembled in one expression. A `defineRoutes()` helper for
arrays split across files was considered and not added, because once a value is widened its literal
types are gone.

## Let the Angular path name its placeholders

The path `show/:showId/season/:season` already names its parameters, so `pathParam` only attaches
codecs, and unconfigured placeholders are strings. An application can name routes first and choose
codecs later. Path and query state live in separate objects, so a placeholder and a query field may
share a name.

**Cost:** the library parses paths for both types and URL construction, and must reject a
placeholder name that repeats along a named chain, because `params().path` can hold only one value
per name.

## Keep codecs separate from URL placement

A codec converts one string to one non-null value. `queryParam` and `repeatedQueryParam` decide
how that value sits in the URL, and they own defaults and `required`. One `numberCodec()` therefore
serves a path segment, a scalar field, a repeated field, and a joined list. The
first design had a helper family per type and placement, which duplicated parsing and did not
compose into arrays.

Absence is part of the field definition, not of the codec. A nullable scalar reads as `null` and an
array as `[]`, which matches Angular Signal Forms, where `undefined` means a field does not exist.

Repeated keys are a placement, because each item takes its own key. A joined list such as `a,b` is
one string, so it is a codec: `listCodec(item, ',')` on an ordinary `queryParam`. The earlier
`delimitedQueryParam` placement needed its own separator validation, item encoding, and diagnostic
code, and a comma inside an item appeared as `%252C`. Now a custom codec can define any list format
the same way.

**Cost:** a list field needs `defaultValue: []` to read a missing key as empty. Like any scalar, a
repeated key silently uses its last value, and a bad item fails the whole field without an item
`index`. Codecs cannot use `inject()`; default factories can, so injection-aware behavior belongs
there.

## Build destinations only from explicit values

`createUrlTree()` and `navigate()` never copy the current query, even when Angular's
`defaultQueryParamsHandling` would. A link built in a component, a guard, or a service then depends
only on what the caller supplied. Editing the current URL is a separate operation, `patchQuery()`.
`activeRoute().createUrlTree()` is the one deliberate exception: it is meant for links that keep
the current filters.

Bad URL data should not crash an application when a safe reading exists. Malformed query values
read as their default and emit a diagnostic. A path value that cannot be serialized has no honest
substitute and comes from the caller, not the URL, so construction throws instead of inventing a
segment. Reading an inactive route throws, because no state exists.

The first design returned `UrlTree | null` for routes with path parameters. Every link, redirect,
and template then handled a `null` that almost always meant a programming error.

**Cost:** an empty or invalid ID from data throws where the link is built, for example while a
template renders. Check such values before building the link.

## Let Angular run the router, behind a small escape hatch

Reusing Angular Router keeps its directives, guards, resolvers, SSR, history, and URL parsing. The
library adds typing on top of it and does not run a second router. Most navigation should name a
declared route. Integrations that need arbitrary URLs, relative commands, or outlets use
`AppRouter.escapeHatch`, which mirrors a chosen set of native operations with Angular's types. It
leaves out configuration mutation, raw router state, and lifecycle controls.

Typed `navigate()` rejects `browserUrl`, which could show an address the typed destination did not
produce. There is no custom link directive: a typed `UrlTree` goes to Angular's `RouterLink`.
Router options go on `defineAppRouter()`, so the configuration and the typed catalog are declared
together.

**Cost:** Angular's `Router` stays injectable, and calls through it bypass both the types and the
write queue. The library discourages that path instead of blocking it: the docs give an ESLint
[configuration](../README.md#flag-direct-router-use) that warns on `Router` and
`ActivatedRoute` imports. Nothing enforces the boundary at runtime.

## Check route relationships at definition time, not in the types

TypeScript checks local route shape, literal names, codec maps, and query keys repeated from an
ancestor. `defineAppRouter()` checks rules that compare routes with each other, such as repeated
names and repeated placeholders, and throws one error listing every problem.

Rejected alternatives:

- **A recursive conditional constraint on `defineAppRouter()`.** During generic inference,
  TypeScript can widen the inferred tree to its constraint and accept a tree it would reject as a
  standalone type. A check that holds only sometimes is worse than a runtime check that always
  holds.
- **Making the generated router type an error type.** The definition call succeeds and the error
  appears later, wherever `AppRouter` is used, with a less direct message.
- **A separate route builder or `validateRoutes()` call.** It can see the whole tree early, but
  the callbacks it receives lose their contextual parameter types.

**Cost:** some invalid trees pass `tsc` and throw as soon as `defineAppRouter()` runs. Any future
editor or lint diagnostics must reuse the runtime rules, not define a second set.

## Send every query write through one queue

Two callers that build URLs from the same committed state overwrite each other, even when they
change different fields. An investigation reproduced this with writes started in the same turn,
with a parent and child route writing at once, and with one write waiting on a guard. Each router
therefore owns one coordinator. Route patches and both form systems submit to it. Each write reads
fresh committed state when its turn starts and keeps its own `replaceUrl` choice.

Rejected alternatives:

- **A queue per form binding.** The first forms design used one. It cannot order writes from two
  bindings, or from a parent and a child route.
- **A plain promise chain.** When external navigation cancels the active write, the chain releases
  the next one, which then cancels the user's navigation away. The coordinator cancels waiting work
  when external navigation starts, before any promise can release it.

**Cost:** function patches run asynchronously, and callers must handle a rejected promise. Writes
are not merged, so high-frequency inputs need an explicit debounce or throttle. The forms package
reaches the coordinator through the internal `ɵgetQueryBinding` export.

## Let forms hold drafts while the URL holds committed state

A typed character or a debounced field is not yet a URL value. Form bindings keep these drafts and
decide when each field commits. Each concern has one place. A codec shapes the value, so links,
patches, and forms write the same URL. Validators and `writeWhen: 'valid'` hold back input that
should not commit, such as a one-letter search. Timing follows each form system: Signal Forms use
Angular's `debounce()` rule, and Reactive Forms, which have none, take a `debounce` option on the
binding.

The page decides which fields reset when another one changes, through the binding's `beforeWrite`
hook, such as setting `page: 1` whenever the search writes. Code that calls `patchQuery()` sets
the same fields in its patch. A `resetWhen` option on the route's query fields was tried and
removed: it applied one rule to every writer on the route, while resets differ from page to page,
and the rule was hard to see from the component whose edit triggered it.

An earlier design exposed an RxJS stream of field changes. It could express any timing policy, but
the common case took a `groupBy`/`mergeMap` pipeline, it duplicated native Signal Forms debounce,
and it could not reset another field, such as the page.

The URL wins after external navigation: pending edits are dropped and the form resets, so a stale
debounced value cannot overwrite a page the user moved to. Writes replace the history entry by
default, because each keystroke is not a place the user wants to return to.

**Cost:** forms bind only query fields, as flat controls; nested groups and `FormArray` are not
supported. Failed writes are reported, not retried. Debounce is configured differently in the two
form systems. Policies beyond a delay and validity, such as throttling, need code around the form.
Each page writes its own resets.

## Write remembered values into the URL

A user who picks 48 items per page expects the next visit to the list to show 48, even when the
link they followed carries no page size. The value has to live somewhere outside the URL, so a
persisted field saves its committed value in browser storage after each navigation.

The stored value could have been read silently whenever the URL lacks one. Then two people with
the same link would see different pages, and a copied URL would not reproduce what its sender
saw. Instead, a navigation that arrives without a usable value redirects to the same URL with the
value filled in. The URL stays the full description of the page, which is the premise of the
library.

For the same reason a persisted field always appears in the URL, even at its default. If
`?pageSize=24` were omitted like other defaults, a missing key would mean both "use the default"
and "restore the stored value", and the second reading would win, so the user could never get back
to 24 through the URL. With the field always written, a missing key has one meaning: restore,
else default.

A path value follows the same rule. A URL without the remembered season, such as
`/shows/tv_1/seasons`, redirects to the season's own URL instead of rendering it under the shorter
address. The redirect happens while Angular matches routes, so it is a single navigation. With nothing stored, the shorter URL keeps its old meaning, so persistence never turns a
not-found page into a different page by accident, and an app route declared earlier at that path
still wins.

A persisted field therefore needs URL text for every value. A scalar without a default reads
missing as `null`, which has no URL text, so `persist` requires `defaultValue`. A repeated field
writes `[]` as no keys at all, so it cannot persist; a `listCodec` field writes `[]` as `?tags=`
and can.

**Cost:** URLs grow by the persisted fields, including defaults that were omitted before. The
first navigation to a page without a query value is cancelled and replaced by one with the value
filled in. A path value is restored inside the same navigation. The server cannot see browser storage, so a server-rendered page shows the
default and changes after hydration.

### Which stored values the library forgets

A stored value that fails to decode, such as `"many"` for a page size, can never be used, so
ngx-urlik removes it when it reads it and reports it once. A value that decodes can still be wrong
for the app: season 9 of a show with three seasons decodes as a number, and only the backend knows
it does not exist. ngx-urlik does not try to detect that and offers no special API for it. The app
already decides what a missing title looks like, and it can call `clearPersisted()` and navigate
elsewhere.

**Cost:** until the app handles it, a remembered value that the backend rejects keeps opening the
same not-found page. `clearPersisted()` forgets a key for every scope, such as every show's
season, not one show's.

### Where a missing query value is restored

The restore has to happen before user code reads the URL, or that code sees a page without its
remembered values and then sees it again with them. A guard that runs twice with different inputs
is hard to reason about, which defeats the point of remembering the value. Three places were
tried.

**A `canMatch` check (current).** ngx-urlik appends a check to the `canMatch` guards of each route
in a chain with a persisted query field. It redirects while Angular is still matching, so the
guard phase of the first navigation never starts: `canActivate`, `canActivateChild`, resolvers,
and `canDeactivate` run once, with the complete URL. `canMatch` guards on the route and its
ancestors still run twice. An ancestor's check runs before its children match, so each check
records the segments its route consumed for the current navigation, and only the route that ends
the match redirects.

**Cost:** the bookkeeping, about 50 lines in `persistence.ts`, depends on the order in which
Angular calls `canMatch` while it matches. The tests in `persistence.spec.ts` cover unmatched
URLs, earlier redirects, named outlets, and combined path and query restores; a change in Angular's
matching order would show up there first.

**A `canActivate` guard (replaced).** Commit `9d6b5d4` put the restore in a `canActivate` guard in
front of the route's own guards. The code was simpler: the guard sees the activated route
snapshot, so it needs no bookkeeping. Angular skips guards on a reused route when only the query
changes, so the library wrapped each persisting route's `runGuardsAndResolvers` with a copy of
Angular's rules (about 15 lines) to run them when a value needs restoring. The incomplete URL
reached more user code: `canActivate` and `canActivateChild` ran with it and then again, the
`canDeactivate` of the page being left ran twice, and the route's own guards ran on navigations
where Angular would normally skip them. Commit `d479ccb` replaced it with the `canMatch` check. To
return to it, start from `restoreQueryGuard` and `runGuardsWhenRestoring` in `git show
9d6b5d4:projects/ngx-urlik/src/lib/persistence.ts`.

**`UrlHandlingStrategy.extract()` (prototyped, rejected).** Angular hands every new navigation's
URL to `extract()` before matching. Filling remembered values there meant no user code, not even
`canMatch`, ever saw an incomplete URL, and every restore was one navigation. But `extract()`
runs before Angular knows which route matches, so the library had to predict the route by
copying Angular's matching rules (about 340 lines), assume user `canMatch` guards pass, and accept
that function and absolute redirects drop the filled query. It was too much logic to maintain
alongside Angular's own. The prototype is on the branch `prototype/extract-restore`, commit
`8d1a9c7`.

## Let shared components name the routes they serve

One component may serve routes with different parameters, such as a movie detail and an episode
detail. Reading several nodes is awkward, because inactive ones throw. Inferring the route from
URL shape would ignore the names the application already declared. `activeRoute(candidates)`
takes an explicit alias-to-node map and returns a union narrowed by alias.

**Cost:** the component lists its candidates. In return its type covers only the routes it
understands, not every route in the application.

## Observe query conventions across pages, read-only

A service may follow a convention such as `?source=` on every page without owning any route.
`globalQueryParams(definitions)` reads such fields with the same codecs and timing as route state.
Each observer applies its own definitions, which avoids registration order and conflicts. It lives
on the router rather than on `escapeHatch`, because it is a typed library feature, not a native one.

**Cost:** two observers with different definitions can read different values from the same URL.
There is no write method; the README lists writing global fields under [Not supported](../README.md#not-supported).

## Organize internals as an acyclic module graph

`app-router.ts` composes the public API. Each other module owns one model: definitions and
validation, compiled routes, parameter runtime, diagnostics, route nodes, the write coordinator,
and the escape hatch. Lower modules do not import `app-router.ts`, and sibling modules do not import
each other in a cycle. Internal types stay private unless the public barrel exports them.

**Cost:** acyclicity is checked in review, not by a tool.

## Demonstrate every capability in TasteTrack

TasteTrack is a browser-local movie and TV journal that uses only the public entry points. Each
router feature appears in at least one screen, and product features that repeat an example were
removed. It has no backend or external API, so the demo runs offline from a deterministic seed.

**Cost:** TasteTrack is an integration example, not a product. A library change found during demo
work still needs its own decision.
