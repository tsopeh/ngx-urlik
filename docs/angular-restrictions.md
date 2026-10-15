# Differences from Angular Router

ngx-urlik accepts Angular's ordered `Routes` shape. Add `routeName` when code needs a typed node;
unnamed routes stay available to Angular without adding generated nodes.

## Route definitions

| Area                | Rule                                                                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Shape               | `defineAppRouter(RouteNames, { routes: [...] })`; `children` are arrays and Angular fields stay at the top level              |
| Route names         | Unique across the declaration, taken from `RouteNames`; only ordinary routes with statically known primary paths can have one |
| Dynamic paths       | Angular `:name` placeholders; every destination supplies all placeholders in the named route chain                            |
| Codec options       | Without `pathParam`, values are strings; otherwise use `{ codec }` for one placeholder or a keyed codec map for several       |
| Named descendants   | Their ancestor paths and query definitions must be statically declared; an ancestor cannot use `loadChildren`                 |
| Empty paths         | A named empty-path child is allowed and may construct the same URL as its parent                                              |
| Angular-only routes | Redirects, wildcards, matchers, named outlets, and lazy child branches have no typed node                                     |

Angular's route order, matching, guards, redirects, and outlets determine which route activates.
The typed catalog adds one rule: a route whose `pathParam` codec rejects a path value does not
match, and Angular tries the next route. Components can load
lazily with `loadComponent`; the route declarations and named chains must be available when
`defineAppRouter()` runs. Replacing them later with `Router.resetConfig()` is unsupported and not
detected.

A route that declares a [persisted](design/app-router.md#remember-values-in-storage) query field
gets a `canActivate` guard in front of its own guards. When the URL lacks a usable value, the guard
redirects to the URL with the value filled in. Its `runGuardsAndResolvers` is wrapped so the
guards also run on a reused route when a value needs restoring.

A named route whose trailing placeholders persist gets unnamed sibling routes right after it, one
for each count of missing placeholders. Each has a `matcher` that accepts exactly the shorter path
when the missing values are stored, and a `redirectTo` with the full path. Angular forbids
`canMatch` next to `redirectTo` but allows a `matcher`, and a matcher runs outside an injection
context, so it reads storage without `inject()`. When a value is missing, the matcher returns
`null`, and Angular keeps matching.

Put router options on `defineAppRouter(RouteNames, { routerConfig })`. ngx-urlik keeps the
supplied `paramsInheritanceStrategy` and reads path values from the activated route chain.
Passing `withRouterConfig()` to `provideAppRouter()` throws.

## Parameters

Path and query state use separate objects, so a path placeholder and a query field can share a name.
Placeholder names cannot repeat along a named route chain. Query definitions accumulate through
unnamed ancestors, but a query key cannot be defined twice along a named chain. Query property
names are the URL keys; aliases are unsupported.

Scalar query fields use the last repeated key. Arrays use either repeated keys or one value joined
by `listCodec`; the two forms cannot be mixed. Built-in codecs cover strings, numbers, booleans,
string enums, and joined lists. Supply custom codecs for dates and structured values.

Fragments can be supplied during construction, but have no codec and do not appear in route state.

## Reads and writes

Route state is a readonly signal. There is no writable URL signal or observable interface.
`patchQuery()` changes supplied query fields on the current URL, and also normalizes the route's
other declared fields. Reactive Forms and Signal Forms bindings come from `ngx-urlik/forms`.

A plain `router.navigate()` call builds its URL from the snapshot it reads, so two overlapping
calls can overwrite each other's query changes. `patchQuery()` and form writes run one at a time
instead, each against the URL the previous write committed.

`createUrlTree()` and `navigate()` on a route node construct absolute destinations from explicit
values. They do not inherit the current query, follow `defaultQueryParamsHandling`, or perform
relative navigation. Generated trees work with Angular's own `RouterLink`; no extra directive is
needed.

## Native operations

Use `AppRouter.escapeHatch` for supported native addressing and navigation observations. It does
not expose router configuration, raw state, or lifecycle controls. Angular's `Router` remains
injectable, but calls through it bypass the typed route contract and the write queue.

### Flag native router use

The library does not forbid Angular's router, but code that injects it loses the typed contract
quietly. ESLint's core `no-restricted-imports` rule makes each such import visible:

```js
// eslint.config.js
export default [
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          paths: [
            {
              name: '@angular/router',
              importNames: ['ActivatedRoute', 'Router'],
              message:
                'Read and write the URL through AppRouter routes. Use AppRouter.escapeHatch for native operations.',
            },
          ],
        },
      ],
    },
  },
];
```

The rule warns rather than fails, so a deliberate native call can stay with an
`eslint-disable-next-line` comment that explains it. Other router imports, such as `RouterLink`,
`RouterOutlet`, `ResolveFn`, and `ActivatedRouteSnapshot`, stay allowed: templates and guards
still need them.

See the [API reference](design/app-router.md) for exact inputs and failure behavior.
