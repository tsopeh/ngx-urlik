# Restrictions compared with Angular Router

The library intentionally implements a strict subset and wrapper model. Compared with ordinary Angular routing:

- The complete route tree must be declared statically in one global definition. Lazy components are supported; lazy or late route definitions and `loadChildren` are not.
- Exactly one root route is required. Angular normally accepts several top-level routes.
- Children are named object properties rather than a `Routes` array.
- Each route has one static segment and at most one separately declared path parameter. Multi-segment paths and inline `:params` are forbidden.
- Empty paths are root-only. Use `exactMatch` on the named route for exact-path content or redirects; the compiler creates private full-match children. Angular permits public empty child routes.
- Named/auxiliary outlets are unsupported; only the primary outlet is modeled.
- Custom `matcher` functions are unsupported.
- Matrix parameters are unsupported. URL fragments are accepted as untyped, construction-only values and are not exposed through `urlParams()`.
- Navigation construction is always absolute and deterministic; relative navigation and implicit current-query preservation are unsupported.
- Raw string redirects are unsupported. Redirects must be functions returning a definite `UrlTree` and have a restricted property set.
- Wildcards use the literal `path: '**'` and have no navigation-construction API.
- `pathMatch` is selected internally and cannot be configured.
- Duplicate sibling path patterns are rejected; Angular can use ordering and `canMatch` to distinguish same-path alternatives.
- Path/query names cannot shadow one another along a route chain, even though Angular stores these namespaces separately.
- Query aliases are unsupported: configuration keys are physical URL keys.
- Repeated scalar query keys use the final physical value.
- Arrays support either repeated keys or one delimited physical value. The representations are deliberately distinct and cannot be mixed.
- Built-in date and structured-object codecs are not supplied.
- Typed URL state is signal-only and readonly; no built-in observable, writable signal, or Signal Forms adapter is supplied.
- Query mutation has only a complete functional updater, not patch or direct-value overloads.
- No custom typed `RouterLink` directive is supplied; generated `UrlTree` values are used with Angular's directive. Raw strings and command arrays are intended targets for future lint enforcement.
- Native route-addressing methods and selected readonly observations are available only through the explicitly unsafe `AppRouter.escapeHatch` boundary.
- Raw `routerState`, route configuration mutation, and router lifecycle controls are unavailable, including through the escape hatch.
- Generated Angular `Routes` are private.
- Angular-owned route fields live under the `angular` property rather than at the route-definition top level.
- `paramsInheritanceStrategy` is always forced to `'always'` so accumulated ancestor parameters remain available.
- Other `RouterConfigOptions` belong on `defineAppRouter({ routerConfig })`. `withRouterConfig()` is excluded from features forwarded to `provideAppRouter()`.

Angular's native `Router` remains technically injectable because it is the runtime engine, but application code is expected to use `AppRouter`. A future ESLint rule may enforce that policy.
