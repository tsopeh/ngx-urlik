# Interface history

We call the first design 0.1.0, although it was never published. It used a named object tree with
one static root, kept Angular route fields under an `angular` object, and used `exactMatch` for
landing content. Typed redirect callbacks received accumulated parameters, and the read and write
methods were `urlParams()` and `updateQueryParams()`. Its generated nodes followed the tree, so
adding typed routing meant replacing the application's route declaration.

Version 0.2.0 is the current design. It accepts Angular's ordered route array and adds a flat typed
node only for routes with a `routeName`. Angular fields stay on the route, an empty-path child
supplies landing content, and redirects are ordinary unnamed Angular routes. The methods became
`params` and `patchQuery()`. Later in 0.2.0, `defineAppRouter()` began taking a `RouteNames` enum
as its first argument so Go to Definition reaches the route name. Form bindings then replaced the
`transformWrites` RxJS stream with `writeWhen`, a Reactive Forms `debounce` option, and
`beforeWrite`, which lets a page reset fields such as the page number. Query fields and trailing path placeholders can now persist
their values in browser storage and restore them into the URL.

Several 0.1.0 ideas carried over: codecs separate from placement, deterministic construction, the
shared write queue, form drafts, `activeRoute()`, and read-only global observation.
[Design decisions](decisions.md) records why. The [API reference](design/app-router.md) describes
current behavior. There is no migration path because the library has not been published.
