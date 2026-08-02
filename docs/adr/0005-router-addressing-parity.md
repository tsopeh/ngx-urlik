# ADR 0005: Provide typed route addressing with a bounded escape hatch

Status: accepted.

## Decision

Application code should use `AppRouter` instead of injecting Angular's native `Router`. Angular Router remains the runtime engine, but its untyped route-addressing API is not the normal application API. A future ESLint rule may enforce this boundary; linting is outside the current milestone.

Typed route nodes remain the first-party API for URL construction and navigation. Their construction input gains an optional `fragment?: string | null`. Fragments are construction-only and do not appear in `urlParams().value()`.

Every generated `AppRouter` exposes an `escapeHatch` object. It mirrors these native Angular operations with Angular's parameter and return types:

- `createUrlTree()`;
- `navigate()`;
- `navigateByUrl()`;
- `parseUrl()`;
- `serializeUrl()`;
- `isActive()`.

The escape hatch also exposes readonly access to `url`, `events`, `currentNavigation`, `lastSuccessfulNavigation`, `navigated`, and `componentInputBindingEnabled`. The observational properties are accepted provisionally and must be revisited in a later design review.

The escape hatch does not expose `routerState`, `config`, `resetConfig()`, `initialNavigation()`, `setUpLocationChangeListener()`, `dispose()`, the deprecated `getCurrentNavigation()`, or the deprecated mutable `routeReuseStrategy` and `onSameUrlNavigation` properties.

First-party `navigate()` accepts Angular navigation behavior except `browserUrl`, because displaying a different arbitrary URL would violate deterministic typed construction. Escape-hatch navigation retains native `browserUrl` support. `updateQueryParams()` remains restricted to `replaceUrl`.

No custom declarative-link directive is introduced. Applications construct a typed `UrlTree` and pass it to Angular's existing `RouterLink`; future linting can reject raw strings and command arrays while permitting `UrlTree` inputs. `RouterLinkActive` continues to work with those links.

## Rationale

Most application navigation should name a declared route and supply values checked against its accumulated parameter schema. Some integrations still need arbitrary URLs, relative commands, matrix parameters, outlets, or native URL parsing. A small, conspicuously named escape hatch supports those cases without exposing configuration mutation and framework lifecycle controls.

Reusing Angular's `RouterLink`, `RouterLinkActive`, event types, signals, and URL primitives avoids building parallel abstractions where typed route construction already supplies the safety boundary.

## Consequences

Unsafe routing operations remain possible but become explicit and searchable. The later ESLint design can distinguish first-party route-node calls, approved escape-hatch use, and forbidden direct `Router` injection.

The library intentionally does not promise complete native `Router` mirroring. Configuration mutation, raw router state, and lifecycle controls remain unavailable. Navigation observability is exposed temporarily in native form and carries an explicit review obligation.
