# Reading the code

Start with `projects/ngx-urlik/src/lib/app-router.ts`. It validates the Angular route array,
compiles Angular's routes, and provides the router. The public node types live in
`app-router-types.ts`; they infer route names and parameter state from the literal route array and
key `AppRouter.routes` by the `RouteNames` members.

Follow the route declaration, state reads, query writes, or form bindings below.

## Define

`route-definition.ts` parses paths and validates every named chain. `compiled-route.ts` keeps the
original Angular route fields, tags each Angular route configuration, and builds the catalog of
named routes. It records path and query definitions from unnamed ancestors as well as the named
route. The catalog is the shared input for URL construction and state reads. If no route uses an
ngx-urlik field, the array goes to Angular untouched.

## Read or construct

`route-node.ts` creates the flat `AppRouter.routes` object and the router-level `activeRoute()`
and `globalQueryParams()`. `createUrlTree` walks a node's compiled segments and encodes the values
supplied by the caller. `params` finds the active Angular snapshot by its tag and decodes its
values. `route-params-runtime.ts` handles codecs, defaults, and malformed input;
`route-diagnostics.ts` turns failures into `AppRouterDiagnostic` values.

Angular performs route matching. `compiled-route.ts` adds a `canMatch` check to routes with
`pathParam` codecs, so a path value its codec rejects makes Angular try the next route. ngx-urlik
uses the matched route to find the declared schema.

Angular commits the new router state and creates routed components before it emits
`NavigationEnd`. Each state signal therefore remembers the router state it was computed from and
decodes again when Angular has committed a newer one. Guards and resolvers run before the commit,
so `paramsFrom()` decodes the snapshot they receive instead.

## Remember values

`persistence.ts` reads and writes browser storage, always inside `try`/`catch`, and only on the
browser platform. `compileRoutes` puts its `canActivate` guard in front of the guards of each route
that declares a persisted query field, and wraps that route's `runGuardsAndResolvers` so the guard
also runs on a reused route. The guard finds the deepest compiled route of the destination's
primary chain, collects the persisted fields whose URL value is missing or fails to decode, and
returns a `RedirectCommand` to the same URL with those fields filled in. The reader asks the same
module for a stored value before it falls back to a default. `route-node.ts` saves the active
chain's persisted values on each `NavigationEnd`.

For a named route with persisted trailing placeholders, `compileRoutes` inserts unnamed routes
right after it, one per count of missing placeholders, each with `restorePathMatcher` and a static
`redirectTo` of the route's own path. Angular calls the matcher with the segments left at this
level and their segment group. The group's earlier segments, and the segments of the groups above
it, are the ones the ancestors consumed, so the matcher reads ancestor values from them by
position. It returns the stored values as positional parameters, which `redirectTo` fills in.

A matcher has no injection context, so it cannot ask for `PLATFORM_ID`. `defineAppRouter()` creates
one `createStorageGate()` per definition, and an environment initializer registers each injector's
platform with it. The matchers read storage only after a browser has registered and while no
server has. A server process registers only servers, so Node's global `localStorage` is never
read and one request cannot turn reads on for another. A process that renders on the server and
also runs a browser injector of the same definition, such as a test, never restores a path value.
`clearPersisted()` on the router removes keys through the same storage wrapper.

## Write

Suppose two controls change different filters before either navigation finishes. If both build a
URL from the same old snapshot, one erases the other's edit.

`query-write-coordinator.ts` prevents this by running one write at a time. A patch reads the
committed query when its turn starts, merges its fields, and navigates. The next patch sees the
result. A rejected write leaves the queue free to continue.

Navigation away needs a separate rule. When an external navigation starts, the coordinator
cancels waiting work before a completed promise can release it, and declines new writes until that
navigation finishes. Otherwise a stale filter edit could navigate the user back to the page they
just left. The coordinator recognizes its own navigations by a token it passes in Angular's
navigation `info`.

## Follow a form edit

`projects/ngx-urlik/forms/query-forms.ts` adapts both Angular form systems to the same binding. The
form holds a draft that may be waiting for a debounce or a guard. The URL holds committed state.

The binding remembers each edit as an object. On success, it clears the object that write
submitted. If the user has edited the same field again, the newer object stays. Incoming URL
values are combined with outstanding edits before the form is updated.

One form notification can change several fields; the fields that write at once share one queued
write. A Reactive Forms field with a `debounce` entry waits on its own timer. With
`writeWhen: 'valid'`, an invalid field goes into a held set, and the binding retries the held set
whenever the form's validity changes, which is how a field waits for an async validator. Right
before a write is queued, `beforeWrite` may change its fields; only the edited fields are
acknowledged when the write commits, so fields it adds return to the form from the URL. All of
these writes go through the router's queue.

External navigation clears the edits, the held set, and the debounce timers, then resets the
form. The private `ɵgetQueryBinding` bridge gives the forms package
access to fresh route state and the coordinator.

## Check a change

Library test paths below are relative to `projects/ngx-urlik`.

| Change                    | Tests                                           |
| ------------------------- | ----------------------------------------------- |
| Definitions, links, state | `src/lib/app-router.spec.ts`                    |
| Adopting an existing app  | `src/lib/migration-cookbook.spec.ts`            |
| Codecs                    | `src/lib/params.spec.ts`                        |
| Parameter decoding        | `src/lib/parameter-state.spec.ts`               |
| Reads during navigation   | `src/lib/navigation-reads.spec.ts`              |
| Server rendering          | `src/lib/server-rendering.spec.ts`              |
| Query write ordering      | `src/lib/query-updates.spec.ts`                 |
| Query form bindings       | `src/lib/query-forms.spec.ts`                   |
| Global query observations | `src/lib/global-query.spec.ts`                  |
| Default equality          | `src/lib/is-equal.spec.ts`                      |
| Storage persistence       | `src/lib/persistence.spec.ts`                   |
| Consumer type inference   | `type-tests/consumer.ts` at the repository root |

Build before running the type tests: `type-tests` and the demo resolve `ngx-urlik` from `dist`.
Test what a caller observes so the checks survive changes to the internal structure.
