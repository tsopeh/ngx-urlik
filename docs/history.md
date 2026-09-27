# Interface history

We call the first design 0.1.0, although it was never published. It used a named object tree,
kept Angular route fields under `angular`, and used `exactMatch` for landing content. Its
generated nodes followed the tree, so adding typed routing meant replacing the application's
route declaration.

Version 0.2.0 is the current design. It accepts Angular's ordered route array and adds a flat
typed node only for routes with a `routeName`. Angular fields stay on the route, and an
empty-path child supplies landing content. The [API reference](design/app-router.md) describes
the current behavior. There is no migration path because the library has not been published.
