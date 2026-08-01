# ADR 0004: Wrap Angular routing without replacing its runtime

Status: accepted.

## Decision

Angular's Router remains the matching and navigation engine. `provideAppRouter(...features)` supplies generated routes and forwards Angular router features. The native `Router` remains injectable. The typed API owns definition, URL construction, serialization, reactive parameter state, and diagnostics.

## Rationale

Reusing Angular preserves framework integration, directives, guards, resolvers, SSR configuration, and browser behavior. A strict definition subset makes stronger typing possible without reimplementing routing.

## Consequences

Consumers can bypass type safety by injecting Angular's Router. Runtime enforcement is intentionally absent; optional lint rules may be considered later.
