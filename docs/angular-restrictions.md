# Differences from Angular Router

ngx-urlik accepts Angular's ordered `Routes` shape. Add an `identifier` when code needs a typed
node; unnamed routes stay available to Angular without adding generated nodes.

## Route definitions

| Area                   | Rule                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Shape                  | `defineAppRouter({ routes: [...] })`; `children` are arrays and Angular fields stay at the top level                    |
| Identifiers            | Unique across the declaration; only ordinary routes with statically known primary paths can have one                    |
| Dynamic paths          | Angular `:name` placeholders; every destination supplies all placeholders in the identified route chain                 |
| Codec options          | Without `pathParam`, values are strings; otherwise use `{ codec }` for one placeholder or a keyed codec map for several |
| Identified descendants | Their ancestor paths and query definitions must be statically declared; an ancestor cannot use `loadChildren`           |
| Empty paths            | An identified empty-path child is allowed and may construct the same URL as its parent                                  |
| Angular-only routes    | Redirects, wildcards, matchers, named outlets, and lazy child branches have no typed node                               |

Angular's route order, matching, guards, redirects, and outlets determine which route activates.
The typed catalog does not select a route or replace Angular's matching rules. Components can load
lazily with `loadComponent`; the route declarations and identified chains must be available when
`defineAppRouter()` runs.

Put router options on `defineAppRouter({ routerConfig })`. ngx-urlik preserves the supplied
`paramsInheritanceStrategy` and reads path values from the activated route chain. Passing
`withRouterConfig()` to `provideAppRouter()` is rejected; use `routerConfig` instead.

## Parameters

Path and query state use separate objects, so a path placeholder and query field can share a name.
Placeholder names cannot repeat along an identified route chain. Query definitions accumulate
through unnamed ancestors, but a query key cannot be defined twice along an identified chain.
Query property names are the URL keys; aliases are unsupported.

Scalar query fields use the last repeated key. Arrays use either repeated keys or one delimited
value; those representations cannot be mixed. Built-in codecs cover strings, numbers, booleans,
and string enums. Supply custom codecs for dates and structured values.

Fragments can be supplied during construction, but have no codec and do not appear in route state.

## Reads and writes

Route state is a readonly signal. There is no writable URL signal or built-in observable interface.
`patchQuery()` changes supplied query fields on the current URL. Reactive and Signal Forms bindings
are available from `ngx-urlik/forms`.

`createUrlTree()` and `navigate()` construct absolute destinations from explicit values. They do
not inherit the current query or perform relative navigation. Generated trees work with Angular's
own `RouterLink`; no extra directive is needed.

## Native operations

Use `AppRouter.escapeHatch` for supported native addressing and navigation observations. It does
not expose router configuration, raw state, or lifecycle controls. The native Angular `Router`
remains injectable, but calls through it do not get the typed route contract.

See the [API reference](design/app-router.md) for exact inputs and failure behavior.
