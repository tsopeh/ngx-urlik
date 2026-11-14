# Reading the code

Start with `projects/ngx-urlik/src/lib/app-router.ts`. `defineAppRouter()` checks the route array,
compiles it for Angular, and returns the `AppRouter` token and its provider. The public types are
in `app-router-types.ts`. They read route names and values from the literal route array, and use
the `RouteNames` members as the keys of `AppRouter.routes`.

`RouteArrayInput` types the `routes` option. It does two jobs in one walk of the literal: it lets
TypeScript infer each route, and it checks each field where it's written. The checks sit in
`NoInfer`, so they never change what TypeScript infers. Each route array is one mapped type, so
TypeScript compares the literal element by element. `RouteEntries` then collects one entry per
named route, as a union, and `NamedRoutes` turns the union into `AppRouter.routes`. Both recurse
only as deep as the routes nest, however many siblings each level has.

The sections below follow one job each: defining routes, reading, writing, and forms.

## Define

`route-definition.ts` parses paths and checks every named route and every route above one, in one
walk down the tree. Each level passes on the path and query names the routes above it declared.
`compiled-route.ts` copies each route's Angular fields into a plain Angular route. It marks that
route with `compiledRouteKey`, which points back to the compiled route. It also builds
`namedRoutes`, a map from route name to compiled route. A compiled route holds the path and query
fields of every route above it, named or not. Building links and reading values both start from
it.

## Read and build links

`route-node.ts` builds `AppRouter.routes` and `globalParams()`. `createUrlTree` writes each value
the caller passed into the route's segments, and builds the `UrlTree` directly. A typed link is
absolute, so it needs none of Angular's command parsing. A test checks that the tree matches
Angular's `createUrlTree(['/', ...segments])`. `params` finds the active Angular snapshot by its
`compiledRouteKey` and decodes its values. `ifActive` looks for that snapshot the same way, and
returns the node or `null`. `compiled-route.ts` walks a router state's snapshot tree once, and every
signal that reads that state shares the result. `route-params-runtime.ts` runs codecs and defaults,
and handles broken input. `route-diagnostics.ts` turns failures into `AppRouterDiagnostic` values.

Each signal keeps a `ValueCache`: every field's last value and the URL text it came from. If the
text is the same on the next read, the field keeps its old value, so the signal compares fields
with `Object.is`. A query value leaves the URL when it serializes to the same text as its default.

Angular does the matching. For a route with `pathParam` codecs, `compiled-route.ts` adds a
`canMatch` check. A path value its codec rejects makes Angular try the next route.

Angular switches to the new router state, and creates the new page, before it emits
`NavigationEnd`. So each signal remembers which router state it read. When Angular has switched
to a newer one, the signal reads again. Guards and resolvers run before the switch, so
`paramsSnapshot()` and `globalParamsSnapshot()` read the snapshot they get instead.

## Write

`patchQuery` in `route-node.ts` reads the current query and merges the patch in. It writes every
declared field into the current URL, then calls `router.navigateByUrl()` with the caller's options.
Angular's rule applies: the newest navigation cancels any that's still running. If the URL wouldn't
change and nothing is navigating, it resolves `true` without calling Angular, which would resolve
`false` as if a guard said no.

## Follow a form edit

`projects/ngx-urlik/forms/query-forms.ts` connects both Angular form systems to the same binding.
The form holds a draft that may be waiting for a debounce or a guard. The URL holds what's been
written. The binding uses only the public route: `params()` to read and `patchQuery()` to write.

Each edit goes into `pending` as its own object, keyed by field. When a write settles, whatever the
result, the binding removes the objects that write sent. If the user edited the field again in the
meantime, the newer object stays. Either way, the form keeps showing what the user typed. A write
that resolves `false` reports a decline only if one of its objects is still pending.
[State machines](state-machines.md) has the full table.

`lastUrl` holds the URL values the form last took in. When `params()` changes, a field follows the
URL only if its URL value differs from `lastUrl` and the field has no pending edit. So a write to
one field never touches another field the user is typing in.

One form change can touch several fields. The fields that write right away share one navigation. A
Reactive Forms field with a `debounce` entry waits on its own timer. With `writeWhen: 'valid'`, an
invalid field goes into `held`. The binding tries the held fields again whenever the form's
validity changes. That's how a field waits for an async validator.

Before a write navigates, the binding drops each edit that equals the URL's value, unless
`sending` shows a write of that field still running. If nothing is left, nothing writes. Then
`beforeWrite` can change the fields. Fields it adds aren't pending, so they come back into the form
from the URL. Destroying the binding clears its timers.

## Check a change

Library test paths below are relative to `projects/ngx-urlik`.

| Change                     | Tests                                     |
| -------------------------- | ----------------------------------------- |
| Definitions, links, values | `src/lib/app-router.spec.ts`              |
| Startup checks             | `src/lib/route-checks.spec.ts`            |
| Path values and failures   | `src/lib/path-values.spec.ts`             |
| Escape hatch               | `src/lib/escape-hatch.spec.ts`            |
| Moving an existing app     | `src/lib/migration-cookbook.spec.ts`      |
| Codecs                     | `src/lib/params.spec.ts`                  |
| Decoding values            | `src/lib/parameter-state.spec.ts`         |
| Reads during navigation    | `src/lib/navigation-reads.spec.ts`        |
| Server rendering           | `src/lib/server-rendering.spec.ts`        |
| Query writes               | `src/lib/query-updates.spec.ts`           |
| Form bindings              | `src/lib/query-forms.spec.ts`             |
| Global reads               | `src/lib/global-params.spec.ts`           |
| Public types               | `type-tests/*.test-d.ts` at the repo root |
| Type-check speed           | `type-tests/generate-large-app.mjs`       |

Build before you run the type tests. `type-tests` and the demo load `ngx-urlik` from `dist`. Test
what a caller can see, so the tests keep passing when the internals change. Each spec reads as a
reference for its part of the library: a test name says what happens, and its body shows it.

Type tests run in Vitest's typecheck mode. The compiler checks each `*.test-d.ts` file, and Vitest
reports each `it()` as a test, but never runs the code. `expectTypeOf(x).toEqualTypeOf<T>()` checks
the exact type, so a type that quietly widens or narrows fails. A line marked `@ts-expect-error` is
code that must not compile, and the test fails if it starts compiling. `fixtures.ts` holds the
routers the type tests share.

To see which library lines no test reaches, run `npx ng test ngx-urlik --watch=false --coverage`.

`npm run typecheck` also writes and checks a 201-route app, as one literal. It takes about a second.
If a type change makes it slow, or it fails with TS2589, "excessively deep", that change made big
route trees cost more than they should.
