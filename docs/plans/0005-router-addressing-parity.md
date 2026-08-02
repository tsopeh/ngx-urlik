# Implementation plan: router-addressing parity

Status: implemented.

Source decision: [ADR 0005](../adr/0005-router-addressing-parity.md).

## Objective

Implement construction-only fragments and an always-present, bounded `AppRouter.escapeHatch` while preserving the static typed route tree as the normal application interface. Do not implement ESLint enforcement or a new navigation-state or declarative-link abstraction.

## Interface changes

All changes belong at the existing `AppRouter` seam in `projects/ngx-urlik/src/lib/app-router.ts`.

1. Extend typed construction values with optional `fragment?: string | null`. This applies to ordinary and redirect route nodes through both `createUrlTree()` and `navigate()`. It must not affect `UrlParamsRef`, query updates, parameter accumulation, required-query inference, or fallback nodes.
2. Replace first-party `NavigationBehaviorOptions` with `Omit<NavigationBehaviorOptions, 'browserUrl'>`. Keep the remaining native navigation behavior fields unchanged.
3. Add a root-level readonly `escapeHatch` property to every generated router. Keep its structural type internal unless implementation constraints require a public exported name; consumers already infer the token value.
4. The escape hatch mirrors these bound native methods, including overloads and return types:
   - `createUrlTree`;
   - `navigate`;
   - `navigateByUrl`;
   - `parseUrl`;
   - `serializeUrl`;
   - `isActive`.
5. It exposes readonly getters for:
   - `url`;
   - `events`;
   - `currentNavigation`;
   - `lastSuccessfulNavigation`;
   - `navigated`;
   - `componentInputBindingEnabled`.
6. It must not expose `routerState`, `config`, `resetConfig`, `initialNavigation`, `setUpLocationChangeListener`, `dispose`, `getCurrentNavigation`, `routeReuseStrategy`, or `onSameUrlNavigation`.

`escapeHatch` is a small adapter over the one injected Angular `Router`, not a second router implementation or a general `Pick<Router, ...>` cast. Use forwarding functions so native methods retain the correct receiver, and getters so observational properties stay live. The adapter is constructed once per `AppRouter` factory instance.

## Implementation sequence

### 1. Lock the type contract with consumer tests

Update `type-tests/consumer.ts` before runtime implementation:

- accept `fragment: 'section'`, `fragment: ''`, and `fragment: null` in typed construction;
- reject non-string fragments;
- demonstrate that fragment is absent from `urlParams().value()`;
- accept all supported typed navigation options;
- add an expected error for `browserUrl` on route-node `navigate()`;
- assert all approved escape-hatch methods and observations with Angular-native types;
- add expected errors for every excluded native member;
- verify escape-hatch navigation still accepts `browserUrl`;
- verify fallback nodes remain non-constructible.

Run `npm run typecheck` and confirm the new positive cases fail before implementation for the intended reasons.

### 2. Extend construction types and runtime fragments

In `app-router.ts`:

- add `fragment?: string | null` to `ConstructionArgs` without making the values object required when path and required query inputs are absent;
- introduce the restricted first-party navigation-options type;
- pass `values.fragment` to Angular `Router.createUrlTree()` alongside serialized query parameters;
- do not read, decode, compare, cache, or update fragments in `urlParams()`;
- preserve existing `null` construction behavior for invalid paths and existing recoverable query diagnostics.

Add runtime tests in `app-router.spec.ts` covering fragment strings, empty strings, explicit `null`, omission, navigation forwarding, and absence from URL parameter state.

### 3. Add the escape-hatch adapter

Define an explicit structural type containing only the approved surface. Prefer native method-property types such as `Router['navigateByUrl']` to preserve overloads, combined with readonly observation types.

Inside the existing provider factory:

- create one object whose methods call the injected `router` directly;
- use property getters for live observations rather than copying their current values;
- attach the object as `tree.escapeHatch` after compiling route nodes;
- update the generated router return type to include this root-level property.

Do not pass the native `Router` through, use object spreading, or expose it under a symbol/private-looking property. Those approaches accidentally expand the interface and make later Angular additions leak through.

Add runtime tests that spy on or compare against the injected native router to prove:

- each method forwards arguments and returns the native result;
- overloaded `isActive` behavior remains native;
- signal and observable observations retain their native object identities;
- scalar getters remain live and readonly at the TypeScript seam;
- excluded members are absent at runtime, not merely hidden by types;
- the same escape-hatch object is returned throughout one injection lifetime.

### 4. Reserve the root identity

Because `escapeHatch` occupies the generated router root, reject it as the one top-level route identity. Do not reserve it for descendants: descendant nodes do not carry this property. Keep the existing global reservations for `navigate`, `createUrlTree`, and `urlParams` unchanged.

Add structural-validation tests for a forbidden root identity and an allowed descendant identity named `escapeHatch`. Ensure the diagnostic explains that the collision is at the router root.

### 5. Align public documentation

After behavior passes:

- update the repository `README.md` examples and feature summary;
- describe safe `[routerLink]="typedUrlTree"` use without adding a custom directive;
- document construction-only fragments and the typed-navigation `browserUrl` exclusion;
- list the escape-hatch surface and its intentional exclusions;
- keep the observation-review item in `docs/deferred-discussions.md`;
- change `docs/plans/0005-router-addressing-parity.md` status to implemented.

The accepted design documents and ADR already describe the target contract. Amend them only if implementation uncovers a genuine contradiction; do not silently widen the escape hatch.

## Verification

Run, in order:

```sh
npm run typecheck
npm test
npm run build
npm run format:check
```

Also run `git diff --check` and inspect the generated public declarations if the build emits them. No ESLint package or rule belongs in this change.

## Completion criteria

- Typed routes construct and navigate with optional fragments.
- Fragments never appear in `urlParams()` state.
- Typed route navigation rejects `browserUrl` at compile time.
- The escape hatch exposes exactly the accepted methods and readonly observations with native Angular behavior.
- Every explicitly forbidden native member is absent in types and at runtime.
- Root identity collision is validated without unnecessarily banning descendant identity names.
- Type tests, runtime tests, build, formatting, and diff checks pass.
- README and plan status reflect the implemented behavior.

## Fresh-session handoff

Implement this plan test-first. Read ADR 0005 and this file completely, inspect the current dirty worktree before editing, and preserve the documentation changes already present. Do not add an ESLint rule, custom router-link directive, typed navigation-state facade, first-party active-state helper, fragment state, or additional native Router members.
