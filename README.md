# ngx-urlik

A signal-first, typed application router for Angular 22. Angular Router remains the runtime engine; `ngx-urlik` owns the route definition, URL serialization, typed construction, and reactive parameter state.

## Install

```sh
npm install ngx-urlik
```

Node 24.15 or newer is required for development.

## Define and provide the router

```ts
import { defineAppRouter, fallbackRoute, stringPathParam, stringQueryParam } from 'ngx-urlik';

export const { AppRouter, provideAppRouter } = defineAppRouter({
  routes: {
    ROOT: {
      path: '',
      queryParams: { locale: stringQueryParam({ defaultValue: 'en' }) },
      children: {
        USER: {
          path: 'users',
          pathParam: stringPathParam({ name: 'userId' }),
          queryParams: { search: stringQueryParam() },
          loadComponent: () => import('./user.component').then((m) => m.UserComponent),
        },
        NOT_FOUND: fallbackRoute({
          loadComponent: () => import('./not-found.component').then((m) => m.NotFoundComponent),
        }),
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

`paramsInheritanceStrategy` is always `always`; configure other Router options on `defineAppRouter`. `withRouterConfig()` is intentionally not accepted by `provideAppRouter`.

## Inject, navigate, and link

```ts
const appRouter = inject(AppRouter);

await appRouter.ROOT.USER.navigate({
  path: { userId: '42' },
  query: { search: 'active' },
});

const userLink = appRouter.ROOT.USER.createUrlTree({
  path: { userId: '42' },
});
```

Use `userLink` directly with Angular's `[routerLink]`.

## Reactive URL state

```ts
const params = inject(AppRouter).ROOT.USER.urlParams();
const userId = computed(() => params.value().path.userId);

await params.updateQueryParams((query) => ({ ...query, search: null }), { replaceUrl: true });
```

Reading state for an inactive route, or a path value that cannot be deserialized, throws a contextual error.

## Custom serializer

```ts
const coordinates = pathParam({
  name: 'coordinates',
  serializer: {
    serialize: ({ x, y }: { x: number; y: number }) => `${x},${y}`,
    deserialize: (raw) => {
      if (typeof raw !== 'string') return null;
      const [x, y] = raw.split(',').map(Number);
      return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    },
  },
});
```

See the accepted [App Router design](docs/design/app-router.md), [Angular restrictions](docs/angular-restrictions.md), and [deferred topics](docs/deferred-discussions.md).
