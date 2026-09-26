# 0005: Make native routing an explicit choice

Some destinations cannot be described by the typed tree: an integration may supply an arbitrary
URL, a relative command, a matrix parameter, or a named outlet. `AppRouter.escapeHatch` exposes
the native addressing operations for those cases.

The object forwards Angular's methods and selected navigation observations. It leaves out route
configuration, raw router state, and lifecycle controls. Callers can address an unusual destination
without acquiring a second way to change the declared route tree.

Typed navigation excludes `browserUrl` because it could display an address different from the
typed destination. Escape-hatch navigation keeps Angular's native option. The full method list
is in the [reference](../design/app-router.md#angular-runtime-relationship).

Links need no additional directive. A generated `UrlTree` works with Angular's `RouterLink` and
`RouterLinkActive`. Fragments are supplied when constructing the tree; they are not parameter state.
