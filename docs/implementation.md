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
browser platform. `compileRoutes` appends `restoreQueryCheck` to the `canMatch` guards of each
route whose chain declares a persisted query field, and of every ancestor of such a route. Angular
calls `canMatch` with only the segments left at the route's level, and before the children match.
So each check first records the segments its route consumed, by depth, in the router's
persistence instance for the current navigation. The route that consumes the rest of the URL and
has no empty-path or `**` child then joins the recorded ancestor segments with its own to get the
matched path, reads scope values from it by position, collects the persisted fields whose URL
value is missing or fails to decode, and returns a `RedirectCommand` with those fields filled in.
The path-codec check comes first in `canMatch` and the restore check last, so a route that fails
its codecs or its own `canMatch` guards never redirects. The reader asks the same module for a
stored value before it falls back to a default; stored text that fails to decode is removed there. `route-node.ts` saves the active
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

`patchQuery` in `route-node.ts` reads the committed query, merges the patch, serializes every
declared field into the current URL tree, and calls `router.navigateByUrl()`. There is no
scheduling layer. Angular's rule applies: the newest navigation cancels any that is still running.
Two writes that overlap therefore don't combine; the later one wins.

## Follow a form edit

`projects/ngx-urlik/forms/query-forms.ts` adapts both Angular form systems to the same binding. The
form holds a draft that may be waiting for a debounce or a guard. The URL holds committed state.

The binding remembers each edit as an object. On success, it clears the object that write
submitted. If the user has edited the same field again, the newer object stays. Incoming URL
values are combined with outstanding edits before the form is updated.

One form notification can change several fields; the fields that write at once share one
navigation. A Reactive Forms field with a `debounce` entry waits on its own timer. With
`writeWhen: 'valid'`, an invalid field goes into a held set, and the binding retries the held set
whenever the form's validity changes, which is how a field waits for an async validator. Right
before a write navigates, `beforeWrite` may change its fields; only the edited fields are
acknowledged when the write commits, so fields it adds return to the form from the URL. A write
acknowledges its edits when it succeeds, or when Angular skips it because the URL already holds
them. A cancelled write leaves its edits staged; they are not retried.

Destroying the binding clears the edits, the held set, and the debounce timers. The private
`ɵgetQueryBinding` bridge gives the forms package access to fresh route state and the route's
write function.

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
