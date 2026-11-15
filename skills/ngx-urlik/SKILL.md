---
name: ngx-urlik
description: Use for any task involving Angular routing, URL state, or moving pages off ActivatedRoute.
---

# ngx-urlik

ngx-urlik keeps a page's state in its URL, as typed values. Each value is declared once, on the
route that owns it, with a codec and usually a default. Code then reads it as a signal, changes it
with a patch, and builds links that TypeScript checks. Because the URL holds the state, a reload, a
bookmark, or a shared link shows the same page.

Work in the order below. Each step ends with a check you can run before moving on.

## 1. Declare the route

When you move a component off `ActivatedRoute`, start by declaring everything it reads from the
URL.

- Find the `defineAppRouter()` call. Put path placeholders in `pathParam` and query fields in
  `queryParams`, and give optional fields a `defaultValue`. Never read a value the route doesn't
  declare.
- Remove `ActivatedRoute` and `Router` from the component, and inject `AppRouter` instead.

**Done when** every value the component uses has a codec on its route, and the file no longer
mentions `ActivatedRoute` or `Router`.

**Where routes go**

- Every route goes in the one `defineAppRouter()` call, as a literal array. Don't split routes into
  `Routes`-typed arrays in other files, because an array typed as `Routes` gives no typed routes.
- To name a route, add a member to the route names enum in that file and set
  `routeName: RouteNames.NAME`. The enum stays private to the router file. Everywhere else, use
  `appRouter.routes.NAME`, never the enum.
- Load pages lazily with `loadComponent`, which needs a standalone component. A named route, and
  every route above it, can't use `loadChildren`.
- To convert a lazy feature module, move its routes into the router file, replace its `component`
  entries with `loadComponent`, and move the module's `providers` to the route above its pages.
  Features you haven't converted stay on `loadChildren` and keep working, untyped.
- Convert one feature or page at a time. Code that still uses `ActivatedRoute` reads the same URL,
  and calls through Angular's `Router` reach the same router, so both styles work side by side.

## 2. Read and write

All URL access goes through the typed route, `AppRouter.routes.NAME`.

- **Read** with signals instead of RxJS subscriptions, like `route.params().query.search`, inside a
  `computed()` or a template. Reading an inactive route throws, so read only routes you know are
  active.
- **In guards and resolvers**, read the destination with
  `appRouter.paramsSnapshot(appRouter.routes.NAME, snapshot)`, passing the snapshot Angular gives
  you. It returns plain values, not a signal. `params()` there still shows the page being left.
- **Write** with `route.patchQuery(patch)`, passing only the fields that changed. Each patch is one
  navigation, built from the URL at the moment you call it, and a later navigation cancels it. Put
  fields that change together in one patch. A patch never cancels a navigation it didn't start,
  like a link click or Back: while one runs, the patch resolves `false` and doesn't navigate.
- **Link** with `route.createUrlTree(values)`. A link holds only the values you pass, never the
  current URL's.

**Done when** every read is a signal, and every URL change is a `patchQuery()` or `navigate()`
call.

## 3. Forms

A form holds the draft, which is what the user is typing right now. The URL holds what's been
written.

- Don't write every keystroke to the URL. It fills the Back button with half-typed searches.
- Bind the form with `createQueryParamsSignalForm(route)` or `createQueryParamsFormGroup(route)`.
  When the URL changes a field, for example after Back, the form takes the new value and drops any
  edit of that field still waiting for its debounce. Other unwritten edits stay, like one held by
  `writeWhen: 'valid'`. A write to one field never touches another field the user is typing in.
- **Timing and validity:** delay Signal Forms fields with Angular's `debounce()` schema rule, and
  Reactive Forms fields with the binding's `debounce` option. Pass `writeWhen: 'valid'` to hold back
  invalid input. Keep values exactly as the user typed them. If a request needs a trimmed search,
  trim it where you build the request.
- **Fields that depend on others:** reset fields like `minRating` in the binding's `beforeWrite`:
  `(patch) => ('search' in patch ? { minRating: 0, ...patch } : patch)`. Without a form, set them in
  the same patch: `patchQuery({ search, minRating: 0 })`.

**Done when** text inputs and debounced controls go through a bound form, never straight to
`patchQuery()`.

## 4. Reference

**Codecs** turn URL text into a value and back.

- `stringCodec()`, `numberCodec()`, and `booleanCodec()` cover the basics.
- `enumCodec(values)` takes an array, a record, or a string, numeric, or mixed enum. Each value
  writes as its text, so `Status.Archived = 1` writes `1`, not `Archived`. A record whose keys are
  numbers is read like a numeric enum and loses those members, so pass an array of its values.
- `listCodec(item, separator)` joins items into one value, like `?a=1,2`. An array field is a
  `queryParam` with a `listCodec` and `defaultValue: []`.
- For anything else, like dates or "positive integers only", write a `UrlParamCodec` with
  `serialize` and `deserialize`, each returning `null` for a value it can't convert. It must write
  one text per value, lose nothing (reading the text gives back an equal value), and never call
  `inject()`.

**Defaults** are plain values. A fallback that needs a service, like the user's locale, belongs in
the page: declare the field without a default and read `query.locale ?? settings.locale()`.

**Redirects** stay unnamed Angular routes. A `redirectTo` function can return a typed link, such as
`inject(AppRouter).routes.HOME.createUrlTree()`. Give it a `UrlTree` return type, or TypeScript
can't infer `AppRouter`.

**Comparison** is by URL text. `params` fires only when a field's text changes, and an unchanged
field keeps the same value object. A query value that writes the same text as its default leaves
the URL.

**`ifActive`** is a signal on every route. It holds the route itself while that route or one of its
children shows, and `null` otherwise. A component that serves several routes asks each one and
reads through what it returned, never through a different route:

```ts
const { MOVIE, EPISODE } = appRouter.routes;
const id = computed(() => {
  const episode = EPISODE.ifActive();
  return episode ? episode.params().path.episodeId : MOVIE.params().path.movieId;
});
```

In templates, write `@if (routes.EPISODE.ifActive(); as episode) { … episode.params() … }`. Read
and write fields the routes share through their parent, like `BROWSE.patchQuery()`. Check nested
routes deepest first, because a parent's `ifActive()` returns the parent too. For a nav bar, bind
`[class.active]="route.ifActive()"`.

**`globalParams({ path, query })`** reads values on every page. `path` maps placeholder names to
codecs, and `query` takes query fields. A path value is `null` where no active route has that
placeholder. The result is read-only, and nothing throws. In guards and resolvers, use
`globalParamsSnapshot(definitions, snapshot)`, which also works on routes without a `routeName`.

**Remembering values** is the app's job. Save path values from `globalParams()` in an `effect()`.
Give a remembered query field no default, so the URL holds it only when someone set it, save it
from `globalParams()` too, and fall back to the saved value where the page reads it:
`query.view ?? saved() ?? 'grid'`.

## 5. Details that are easy to miss

**Routes**

- A route inherits the path and query fields of every route above it, named or not.
- An empty-path child builds the same URL as its parent, and at that URL both are active.
- A path codec decides whether the route matches. `/seasons/abc` with `numberCodec()` doesn't
  match, so Angular tries the next route. This check runs before the route's own `canMatch` guards.
- An NgModule component still works in `component`, but it loads with the app.
- Putting named routes in front of a `Routes` array, as in `[...named, ...routes]`, compiles, but
  TypeScript can't check those routes, so mistakes only show up when `defineAppRouter()` runs.
- Don't call `Router.resetConfig()`. Typed routes would keep building URLs for routes Angular no
  longer has.

**Codecs and fields**

- `enumCodec()` takes strings and finite numbers. It throws on creation for any other value, or
  when two values write the same text, like `1` and `'1'`. It skips the reverse entries TypeScript
  adds to numeric enums.
- `listCodec()` throws on creation unless the separator is one character other than a backslash,
  because a longer one could run into the item before it. `[]` writes as
  `?tags=`. Items can't be empty, so `['']` can't be written. A backslash escapes the separator and
  itself.
- A query value leaves the URL when its text matches the default's text.
- Every declared field is always present in `params().query`. A field without a default reads as
  `null`.
- A path value can't write as `''`, `.`, or `..`.

**Links**

- `createUrlTree()` throws, and `navigate()` rejects, when a path codec throws or returns a
  non-string, `''`, `.`, or `..`. Check IDs that come from data before you build links with them.
- A query value that won't serialize is dropped with a diagnostic, and the rest of the link is
  still built.
- Parent query fields come first, in declared order.
- The fragment is a string or `null`, with no codec, and it can't be read back.
- `navigate()` and `patchQuery()` don't take `browserUrl`, and passing it is a type error. For
  relative navigation, or URLs outside the typed routes, use `appRouter.escapeHatch`.

**Reading**

- Values keep their identity while their text stays the same, so never change them in place.
- `paramsSnapshot()` throws if the snapshot doesn't contain the route. Any snapshot from the same
  navigation works, so a child's guard can read its parent.
- `ifActive()` notifies only when its answer changes, not on every query change.
- In a component that serves several routes, reading the last route directly throws if the
  component ever shows on a route it doesn't handle.
- `globalParams()` gives `null` for a path value that doesn't decode. Before the first navigation
  finishes, it reads the current snapshot. `required` has no effect there. Two services that read
  one name with different codecs can disagree, so share the definitions. It needs no cleanup, and
  its diagnostics name the route `globalParams` or `globalParamsSnapshot`.

**Writing**

- A field passed as `undefined` stays as it is, and so do fields owned by child routes.
- `patchQuery()` takes the same options as `navigate()`, like `replaceUrl` and `state`.
- A patch that wouldn't change the URL resolves `true` without navigating. If another patch is
  running, it navigates anyway, to cancel that one. While any other navigation runs, a patch
  resolves `false` without navigating. So `false` always means a guard said no or another
  navigation won.
- Patches collide more often when guards or resolvers run on query changes, as with
  `runGuardsAndResolvers: 'paramsOrQueryParamsChange'`.

**Forms**

- Forms are flat. List fields get array-valued controls, and nested groups and `FormArray` aren't
  supported.
- Signal Forms read the model in an effect, so updates made before it runs go out as one write.
- URL changes never mark fields touched or dirty.
- Signal Forms' `debounce()` delays input that comes through `[formField]`, not a direct
  `model.update()`.
- A waiting debounced field survives navigations that change only other fields. It writes on top of
  the URL as it is when the delay ends. Leaving the page drops it.
- With `writeWhen: 'valid'`, a field waiting on an async validator writes once it passes. A held
  field keeps its draft until it's valid, the user edits it, or the form is destroyed. In Reactive
  Forms, the validators go on the controls.
- Fields that `beforeWrite` adds aren't drafts, so the form reads them back from the URL after the
  write. An edit that ends at the URL's value writes nothing, so `beforeWrite` doesn't run.
- Without `onWriteFailure`, declines are silent. Picking the value that's already chosen isn't a
  decline. A write cancelled by the form's own next write isn't reported, because the next write
  reports for itself.
- If `beforeWrite` throws, the error goes to `ErrorHandler`, nothing is written, and the drafts
  stay.
- Destroying the form drops unwritten edits and their delays. A navigation that already started
  still runs.

**Diagnostics and the router**

- A diagnostic's `route` is the route that declares the field, which can be a parent. Unnamed
  parents are named by position, like `routes[0].children[1]`.
- `escapeHatch.isActive(url, matchOptions?)` returns a `Signal<boolean>`. The escape hatch leaves
  out `routerState`, the route config, lifecycle controls, and Angular's deprecated mutable
  properties.
- The ESLint rule in the README warns only on `Router` and `ActivatedRoute`. `RouterLink`,
  `RouterOutlet`, `ResolveFn`, and `ActivatedRouteSnapshot` stay allowed.
- In server rendering, code that touches `localStorage` needs a browser check.
