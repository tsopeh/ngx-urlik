# ngx-urlik

ngx-urlik gives Angular routes names and typed parameters. Read the current URL through a
signal, change a filter with a patch, and build links from the same route object. Angular Router
handles navigation.

```ts
const results = inject(AppRouter).routes.RESULTS;

results.params().query.search;
await results.patchQuery({ search: 'elm', page: 1 });
```

The patch changes search and resets the page in one navigation. Other query fields stay as they are.

## Define a route

```ts
import { defineAppRouter, numberCodec, queryParam, stringCodec } from 'ngx-urlik';

export const { AppRouter, provideAppRouter } = defineAppRouter({
  routes: [
    {
      path: 'results',
      routeName: 'RESULTS',
      queryParams: {
        search: queryParam({ codec: stringCodec(), defaultValue: '' }),
        page: queryParam({ codec: numberCodec(), defaultValue: 1 }),
      },
      loadComponent: () => import('./results-page').then((m) => m.ResultsPage),
    },
  ],
});
```

`RESULTS` is the route name you use in code. `results` is the URL path. Route names must be unique;
`defineAppRouter()` throws if two routes use the same name. Angular fields such as `loadComponent`
stay at the top level. Unnamed routes keep Angular's routing behavior and do not add nodes to
`AppRouter.routes`. See the [route field reference](docs/design/app-router.md#fields-added-to-angular-routes)
for the other fields ngx-urlik adds.

Provide the router at bootstrap:

```ts
bootstrapApplication(App, { providers: [provideAppRouter()] });
```

## Read and write

`params` is a readonly Angular signal containing `{ path, query }`:

```ts
const search = computed(() => results.params().query.search);
await results.patchQuery((query) => ({ page: query.page + 1 }));
```

A functional patch reads the latest committed query when its turn in the write queue starts.
You only return the fields to change. Omitted and `undefined` fields stay unchanged. To remove
a field from the URL, use its default, `null` for a nullable scalar, or `[]` for an array.

Reading an inactive route throws. Use `activeRoute()` when one component serves several routes.
See the [state reference](docs/design/app-router.md#reactive-state-and-updates) for ordering,
cancellation, and failure rules.

## Build a link

```ts
const link = results.createUrlTree({ query: { search: 'elm' } });
await results.navigate({ query: { search: 'elm' } });
```

```html
<a [routerLink]="link">Search for elm</a>
```

Both calls build a destination from the values you supply. They do not copy filters from the
current URL. Use `patchQuery` when you want to edit the current URL.

## Bind a form

```ts
import { createQueryParamsFormGroup } from 'ngx-urlik/forms';

const filters = createQueryParamsFormGroup(results);
filters.patchValue({ search: 'elm', page: 1 });
```

For Signal Forms:

```ts
import { createQueryParamsSignalForm } from 'ngx-urlik/forms';

const { model, form } = createQueryParamsSignalForm(results);
model.update((query) => ({ ...query, search: 'elm', page: 1 }));
```

The form holds the draft. The URL holds the committed value. A multi-field edit writes together;
fields you explicitly debounce write later. Forms replace the current history entry by default.
Browser navigation cancels pending edits and resets the form.

See the [forms reference](docs/design/app-router.md#query-form-bindings) for validation, existing
forms, and debounce examples.

## Run the project

The library targets Angular 22 and is not published. Use the Node version in `.nvmrc`:

```sh
npm ci
npm run build
npm test
npm run typecheck
npm run e2e
```

`npm start` builds the library and opens a development server for [TasteTrack](projects/taste-track/README.md).
The demo uses the public package entry points.

## Read further

- [API reference](docs/design/app-router.md): routes, codecs, state, forms, and errors.
- [Angular differences](docs/angular-restrictions.md): what the library supports.
- [Implementation guide](docs/implementation.md): where the code lives and how writes work.
- [Documentation index](docs/README.md): design decisions, terms, and writing style.
