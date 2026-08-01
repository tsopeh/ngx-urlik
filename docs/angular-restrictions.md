# Restrictions compared with Angular Router

The library intentionally implements a strict subset and wrapper model. Compared with ordinary Angular routing:

- The complete route tree must be declared statically in one global definition. Lazy components are supported; lazy or late route definitions and `loadChildren` are not.
- Exactly one root route is required. Angular normally accepts several top-level routes.
- Children are named object properties rather than a `Routes` array.
- Each route has one static segment and at most one separately declared path parameter. Multi-segment paths and inline `:params` are forbidden.
- Empty paths are root-only. Angular permits empty child routes.
- Named/auxiliary outlets are unsupported; only the primary outlet is modeled.
- Custom `matcher` functions are unsupported.
- Matrix parameters and URL fragments are unsupported.
- Navigation construction is always absolute and deterministic; relative navigation and implicit current-query preservation are unsupported.
- Raw string redirects are unsupported. Redirects must be functions returning `UrlTree` and have a restricted property set.
- Wildcards use `fallbackRoute()` and have no navigation-construction API.
- `pathMatch` is selected internally and cannot be configured.
- Duplicate sibling path patterns are rejected; Angular can use ordering and `canMatch` to distinguish same-path alternatives.
- Path/query names cannot shadow one another along a route chain, even though Angular stores these namespaces separately.
- Query aliases are unsupported: configuration keys are physical URL keys.
- Repeated query keys use `ParamMap.get()`, so the first value wins; first-class array query serialization is unsupported.
- Built-in date and collection parameters are not initially supplied.
- Typed URL state is signal-only and readonly; no built-in observable, writable signal, or Signal Forms adapter is supplied.
- Query mutation has only a complete functional updater, not patch or direct-value overloads.
- No custom typed `RouterLink` directive is supplied; generated `UrlTree` values are used with Angular's directive.
- `AppRouter` does not duplicate Angular's global router events, current URL, active checks, or navigation status.
- Generated Angular `Routes` are private.
- `paramsInheritanceStrategy` is always forced to `'always'` so accumulated ancestor parameters remain available.
- Other `RouterConfigOptions` belong on `defineAppRouter({ routerConfig })`. `withRouterConfig()` is excluded from features forwarded to `provideAppRouter()`.

Angular's native `Router` remains available as an unsupported type-safety escape hatch. The library does not enforce exclusive usage.
