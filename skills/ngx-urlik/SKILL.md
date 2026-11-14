---
name: ngx-urlik
description: Use for any task involving Angular routing, URL state, or moving pages off ActivatedRoute.
---

# ngx-urlik

ngx-urlik puts typed values in the URL. You declare each value once, on its route, with a codec and
a default. Then you read it as a signal, change it with a patch, and build links that TypeScript
checks. The URL holds the page's state, so a reload, a bookmark, or a shared link shows the same
page.

## 1. Declare the route

When you move a component off `ActivatedRoute`, declare everything it reads from the URL.

- Find the `defineAppRouter()` call. Put path placeholders in `pathParam` and query fields in
  `queryParams`. Give optional fields a `defaultValue`. Don't read a value the route doesn't
  declare.
- Remove `ActivatedRoute` and `Router` from the component. Inject `AppRouter`.

**Done when** every value the component uses has a codec on its route, and the file doesn't
mention `ActivatedRoute` or `Router`.

**Where routes go**

- Declare every route in the one `defineAppRouter()` call, as a literal array. Don't split routes
  into `Routes`-typed arrays in other files. An array typed as `Routes` gives no typed routes.
- Load pages lazily with `loadComponent`, which needs a standalone component. A named route, and
  every route above it, can't use `loadChildren`.
- To convert a lazy feature module, move its routes into the router file. Replace its `component`
  entries with `loadComponent`. Move the module's `providers` to the route above its pages. Leave
  features you haven't converted on `loadChildren`. They keep working, untyped.
- Convert one feature or page at a time. Code that still uses `ActivatedRoute` reads the same URL,
  and calls through Angular's `Router` go to the same router. Both styles work side by side.

## 2. Read and write

Go through the typed route, `AppRouter.routes.NAME`.

- **Read:** replace RxJS subscriptions with signal reads, like `route.params().query.search`. Read
  in a `computed()` or a template. Reading an inactive route throws, so read only routes that are
  active.
- **Guards and resolvers:** read the destination with
  `appRouter.paramsSnapshot(appRouter.routes.NAME, snapshot)`, passing the snapshot Angular gives
  the guard or resolver. It returns plain values, not a signal. There, `params()` still shows the
  page being left.
- **Write:** call `route.patchQuery(patch)` with only the fields that changed. Each patch is one
  navigation, built from the URL at the moment you call it. A later navigation cancels it. So put
  fields that change together in one patch.
- **Links:** call `route.createUrlTree(values)`. The link uses only the values you pass, never the
  current URL.

**Done when** every read is a signal, and every URL change is a `patchQuery()` or `navigate()`
call.

## 3. Forms

A form holds the draft: what the user is typing right now. The URL holds what's been written.

- Don't write every keystroke to the URL. It fills the Back button with half-typed searches.
- Bind the form with `createQueryParamsSignalForm(route)` or `createQueryParamsFormGroup(route)`.
  When the URL changes a field, for example after Back, the form takes the new value, unless that
  field has an edit that hasn't been written yet. A write to one field never touches another field
  the user is typing in.
- **Timing and validity:** delay Signal Forms fields with Angular's `debounce()` schema rule. Delay
  Reactive Forms fields with the binding's `debounce` option. Pass `writeWhen: 'valid'` to hold
  back invalid input. Put value shaping, like trimming, in the codec.
- **Fields that depend on others:** reset fields like `page` in the binding's `beforeWrite`:
  `(patch) => ('search' in patch ? { page: 1, ...patch } : patch)`. Without a form, set them in the
  same patch: `patchQuery({ search, page: 1 })`.

**Done when** text inputs and debounced controls go through a bound form, never straight to
`patchQuery()`.

## 4. Reference

**Codecs** turn a URL string into a value and back.

- `stringCodec()`, `numberCodec()`, `booleanCodec()`.
- `enumCodec(values)` takes a readonly string array, a tuple, or a string record.
- `listCodec(item, separator)` joins items into one value, like `?a=1,2`. An array field is a
  `queryParam` with a `listCodec` and `defaultValue: []`.
- For anything else, like dates or "positive integers only", write a `UrlParamCodec`: `serialize`
  and `deserialize`, each returning `null` for a value it can't convert. Write one text per value,
  and don't call `inject()`.

**Defaults** are plain values. A fallback that needs a service, like the user's locale, goes in the
page: declare the field without a default and read `query.locale ?? settings.locale()`.

**Redirects** stay unnamed Angular routes. A `redirectTo` function can return a typed link, such as
`inject(AppRouter).routes.HOME.createUrlTree()`. Give it a `UrlTree` return type, or TypeScript
can't infer `AppRouter`.

**Comparison** is by URL text. `params` fires only when a field's text changes, and an unchanged
field keeps the same value object. A query value that writes the same text as its default leaves
the URL.

**`ifActive`** is a signal on every route. It holds the route itself while that route or one of
its children shows, and `null` otherwise. A component that serves several routes asks each one and
reads through what it returns, never through another route:

```ts
const { MOVIE, EPISODE } = appRouter.routes;
const id = computed(() => {
  const episode = EPISODE.ifActive();
  return episode ? episode.params().path.episodeId : MOVIE.params().path.movieId;
});
```

In templates: `@if (routes.EPISODE.ifActive(); as episode) { … episode.params() … }`. Read and
write fields the routes share through their parent route, like `BROWSE.patchQuery()`. Check nested
routes deepest first, because a parent's `ifActive()` returns the parent too. For a nav bar, bind
`[class.active]="route.ifActive()"`.

**`globalParams({ path, query })`** reads values on every page: `path` maps placeholder names to
codecs, and `query` takes query fields. A path value is `null` where no active route has that
placeholder. It's read-only, and nothing throws. In guards and resolvers, use
`globalParamsSnapshot(definitions, snapshot)`, which also works on routes without a `routeName`.

**Remembering values** is the app's job. Save path values from `globalParams()` in an `effect()`.
Give a remembered query field no default, so the URL holds it only when someone set it. Save it from
`globalParams()` too, and fall back to the saved value where the page reads it:
`query.pageSize ?? saved() ?? 24`.
