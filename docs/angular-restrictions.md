# Differences from Angular Router

ngx-urlik uses Angular Router for matching, guards, and navigation, but imposes rules on named routes to guarantee type safety.

**Named Routes:** Routes with a `routeName` generate typed nodes. Because TypeScript requires literal types at compile time to infer parameters, named routes must have statically known paths and `children` arrays. They cannot use `loadChildren`, wildcards, or named outlets. Their parameter names must be unique along their route chain. Unnamed routes bypass these rules and behave exactly like standard Angular routes.

**Explicit Construction:** Angular's `router.navigate` can implicitly borrow the current URL's query state, which occasionally leads to unpredictable links. ngx-urlik's `createUrlTree` and `navigate` are strictly deterministic: they build destinations using only the exact parameters you provide.

**Sequential Writes:** Concurrent calls to Angular's `router.navigate` can overwrite each other if they read from the same initial snapshot. ngx-urlik's `patchQuery()` solves this by running all updates through a sequential queue, ensuring every edit survives.

**Configuration:** Pass router options like `paramsInheritanceStrategy` to `defineAppRouter(RouteNames, { routerConfig, routes })`. Calling `withRouterConfig()` in your provider is rejected to keep configuration and typed schemas synchronized.

**Escape Hatch:** For untyped navigation, use `AppRouter.escapeHatch`.
