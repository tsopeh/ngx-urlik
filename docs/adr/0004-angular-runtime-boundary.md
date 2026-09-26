# 0004: Let Angular run the router

Angular already handles matching, guards, activation, browser history, and URL encoding.
ngx-urlik supplies the typed route definitions and state reads. It uses Angular for navigation.

The `angular` object groups the options that pass through to Angular, such as components,
guards, resolvers, and providers. The extra nesting makes ownership visible: ngx-urlik describes
the address; Angular decides how to activate it.

`provideAppRouter()` registers the generated routes and forwards supported router features.
Router configuration belongs on `defineAppRouter({ routerConfig })`. The library sets
`paramsInheritanceStrategy` to `'always'` so children can read accumulated parent parameters.
It rejects a separate `withRouterConfig()` feature that could override that rule.

The native `Router` remains injectable. Applications use the generated router for typed work and
its `escapeHatch` for the supported native operations.
