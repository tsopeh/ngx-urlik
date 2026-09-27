# ngx-urlik

ngx-urlik adds typed route parameters and coordinated URL writes to Angular Router. It separates path and query parameters into strict schemas, enabling precise IDE navigation and preventing concurrent URL updates from overwriting each other.

## Quickstart

```ts
import { defineAppRouter, stringCodec, queryParam } from 'ngx-urlik';

export enum RouteNames {
  RESULTS = 'RESULTS',
}

export const { AppRouter, provideAppRouter } = defineAppRouter(RouteNames, {
  routes: [
    {
      path: 'results',
      routeName: RouteNames.RESULTS,
      queryParams: { search: queryParam({ codec: stringCodec() }) },
      loadComponent: () => import('./results').then((m) => m.Results),
    },
  ],
});

// Provide at bootstrap
bootstrapApplication(App, { providers: [provideAppRouter()] });
```

Inject the router to read state, patch the URL, or build links:

```ts
const results = inject(AppRouter).routes.RESULTS;

// Read (updates on NavigationEnd)
const search = computed(() => results.params().query.search);

// Patch (queues sequentially, preserves unmentioned fields)
await results.patchQuery({ search: 'elm' });

// Build links (deterministic, ignores current URL)
const link = results.createUrlTree({ query: { search: 'oak' } });
```

Bind Angular forms directly to the URL. The form safely holds user drafts while the URL holds the committed state, allowing you to debounce inputs without breaking browser history.

```ts
import { createQueryParamsSignalForm } from 'ngx-urlik/forms';

const { model } = createQueryParamsSignalForm(results);
model.update((q) => ({ ...q, search: 'elm' }));
```

## Documentation

- [API Reference](docs/design/app-router.md)
- [Angular Differences](docs/angular-restrictions.md)
- [Implementation](docs/implementation.md)
- [Glossary](docs/glossary.md)
- [TasteTrack Demo](projects/taste-track/README.md)
