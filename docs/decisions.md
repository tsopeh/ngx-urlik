# Design decisions

Each entry states a problem, the choice that answers it, and what the choice costs. The
[API reference](design/app-router.md) holds the exact rules. [History](history.md) covers choices
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
[configuration](angular-restrictions.md#flag-native-router-use) that warns on `Router` and
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

An earlier design exposed an RxJS stream of field changes. It could express any timing policy, but
the common case took a `groupBy`/`mergeMap` pipeline, and it duplicated native Signal Forms
debounce.

The URL wins after external navigation: pending edits are dropped and the form resets, so a stale
debounced value cannot overwrite a page the user moved to. Writes replace the history entry by
default, because each keystroke is not a place the user wants to return to.

**Cost:** forms bind only query fields, as flat controls; nested groups and `FormArray` are not
supported. Failed writes are reported, not retried. Debounce is configured differently in the two
form systems. Policies beyond a delay and validity, such as throttling, need code around the form.

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
There is no write method; writing global fields is an [open question](deferred-discussions.md).

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
