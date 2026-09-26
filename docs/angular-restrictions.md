# Differences from Angular Router

ngx-urlik uses Angular Router, but describes a smaller set of routes. The limits let it infer
parameters and construct a destination from a named node. Check them before choosing it for an app.

## Route definitions

| Area        | Rule                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------- |
| Root        | One named root with children stored as named object properties                                |
| Loading     | Components may load lazily; the full route tree must be declared up front                     |
| Path        | One static segment and at most one separately declared dynamic segment per node               |
| Empty path  | Root only; use `exactMatch` for landing content or a landing redirect                         |
| Matching    | Primary outlet only; no custom matchers, matrix parameters, or same-path sibling alternatives |
| Redirect    | A callback returning a definite `UrlTree`; raw string redirects are unsupported               |
| Wildcard    | `path: '**'`, last in its branch, with no construction methods                                |
| `pathMatch` | Chosen by the compiler                                                                        |

Generated Angular routes stay private. Put Angular-owned fields under `angular`. Set router
configuration on `defineAppRouter({ routerConfig })`; the library forces parameter inheritance
to `'always'` and rejects a separate `withRouterConfig()` feature.

## Parameters

Path and query names share one namespace along a route chain. Children cannot shadow parent
names. Query property names are the URL keys; aliases are unsupported.

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
