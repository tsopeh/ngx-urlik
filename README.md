# ngx-urlik

A signal-first, typed application router for Angular 22. Angular Router remains the runtime engine; `ngx-urlik` owns route definition, typed URL construction (including fragments), parameter codecs, reactive parameter state, and diagnostics. A bounded escape hatch covers native addressing needs outside the typed route tree.

## Install

```sh
npm install ngx-urlik
```

Development requires Node 24.15.0, recorded in `.nvmrc`.

## Define and provide the router

```ts
import { defineAppRouter, pathParam, queryParam, repeatedQueryParam, stringCodec } from 'ngx-urlik';

export const { AppRouter, provideAppRouter } = defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      queryParams: {
        locale: queryParam({
          codec: stringCodec(),
          defaultValue: 'en',
        }),
      },
      children: {
        USER: {
          path: 'users',
          pathParam: pathParam({
            name: 'userId',
            codec: stringCodec(),
          }),
          queryParams: {
            search: queryParam({ codec: stringCodec() }),
            roles: repeatedQueryParam({ codec: stringCodec() }),
          },
          angular: {
            loadComponent: () => import('./user.component').then((module) => module.UserComponent),
          },
        },
        NOT_FOUND: {
          path: '**',
          angular: {
            loadComponent: () =>
              import('./not-found.component').then((module) => module.NotFoundComponent),
          },
        },
      },
    },
  },
  routerConfig: { onSameUrlNavigation: 'reload' },
});
```

```ts
bootstrapApplication(AppComponent, {
  providers: [provideAppRouter(withComponentInputBinding())],
});
```

`paramsInheritanceStrategy` is always `always`. Configure other Router options on `defineAppRouter`; `withRouterConfig()` is intentionally rejected by `provideAppRouter`.

## Navigate and link

```ts
const routes = inject(AppRouter);

await routes.ROOT.USER.navigate({
  path: { userId: '42' },
  query: { search: 'active', roles: ['admin', 'editor'] },
  fragment: 'permissions',
});

const userLink = routes.ROOT.USER.createUrlTree({
  path: { userId: '42' },
  fragment: 'profile',
});
```

`fragment` accepts a string or `null` for URL construction and navigation. It is construction-only: fragments never appear in `urlParams()` state. First-party `navigate()` accepts Angular navigation behavior options except `browserUrl`, which could make the displayed URL disagree with typed construction.

`createUrlTree()` returns `null` when a path value cannot be serialized. `navigate()` then resolves `false` without invoking Angular navigation. Invalid query values are diagnosed and omitted while navigation continues. A generated tree works directly with Angular's existing directive; no custom link abstraction is needed:

```html
<a [routerLink]="userLink">View user</a>
```

## Bounded native escape hatch

Use `routes.escapeHatch` when an integration needs native URL commands, matrix parameters, outlets, parsing, or active checks. It forwards Angular's native `createUrlTree`, `navigate`, `navigateByUrl`, `parseUrl`, `serializeUrl`, and `isActive` methods with their native types. Escape-hatch navigation retains `browserUrl` support.

The escape hatch also provides readonly, live access to `url`, `events`, `currentNavigation`, `lastSuccessfulNavigation`, `navigated`, and `componentInputBindingEnabled`. It intentionally excludes router configuration, raw `routerState`, lifecycle controls, disposal, and deprecated mutable or navigation-observation members. Application code should continue to use typed route nodes for normal construction and navigation.

## Reactive URL state

```ts
const params = inject(AppRouter).ROOT.USER.urlParams();
const userId = computed(() => params.value().path.userId);

await params.updateQueryParams((query) => ({ ...query, search: null }), { replaceUrl: true });
```

Every declared query property is present: optional scalars use `null`, while absent arrays use `[]`. Reading an inactive route or an invalid active path parameter throws a contextual semantic error. Query decoding failures recover through defaults and structured diagnostics.

## Reusable codecs and arrays

```ts
const coordinatesCodec = (): UrlParamCodec<{ x: number; y: number }> => ({
  serialize: ({ x, y }) => `${x},${y}`,
  deserialize: (raw) => {
    const [x, y] = raw.split(',').map(Number);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  },
});

pathParam({ name: 'coordinates', codec: coordinatesCodec() });
queryParam({ codec: coordinatesCodec() });
repeatedQueryParam({ codec: coordinatesCodec() });
delimitedQueryParam({ codec: coordinatesCodec(), separator: ',' });
```

Codecs are pure scalar converters; calling Angular `inject()` inside them is unsupported. Injection-aware defaults belong on query wrappers:

```ts
queryParam({
  codec: stringCodec(),
  defaultValue: () => inject(LocaleSettings).defaultLocale(),
});
```

Repeated arrays use `?role=admin&role=editor`. Delimited arrays use one physical key such as `?role=admin,editor`; each element is URI-encoded before joining, so embedded separators are represented with nested percent encoding.

See the accepted [App Router design](docs/design/app-router.md), [Angular restrictions](docs/angular-restrictions.md), and [deferred topics](docs/deferred-discussions.md).
