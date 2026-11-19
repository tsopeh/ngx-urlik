---
name: ngx-urlik
description: ngx-urlik typed path and query parameters through AppRouter. Use when changing routes, links, guards, resolvers, code that reads or writes path or query parameters, or forms bound to query parameters, and when replacing ActivatedRoute or Router.
---

# ngx-urlik

ngx-urlik types a page's path and query parameters. Each parameter is **declared** once, on its
route, with a codec, and a query parameter usually has a default. Code reaches a parameter through
its **typed route**, `appRouter.routes.NAME`. It reads the parameter as a signal, changes a query
parameter with a **patch**, and builds links that TypeScript checks.

The package README, `node_modules/ngx-urlik/README.md`, describes everything the library does.
**Before you use an API for the first time in this task, read its README section.** Each step names
the sections it needs.

## 1. Declare the route

README: “Routes”, “Nested routes”, “Lazy loading”, “Adopt it one feature at a time”, “Codecs”,
“Write your own codec”, “Defaults and required query parameters”.

In the `defineAppRouter()` call, declare every path and query parameter the page uses. Give path
parameters codecs in `pathParams`, and declare query parameters in `queryParams`. Give each optional
query parameter a `defaultValue`. Then inject `AppRouter` in the component in place of
`ActivatedRoute` and `Router`.

**Done when** every path and query parameter the component uses has a codec on its route, and
`grep -wE 'ActivatedRoute|Router'` on the component file finds only imports marked with an
`eslint-disable-next-line` comment that says why.

**Rules**

- Write every route inline in the one `defineAppRouter()` call, with `path` and `routeName` as
  literals. TypeScript reads types only there. A `Routes`-typed array from another file, passed
  whole or spread in, compiles but loses the type checks.
- Name a route with a new member in the route names enum in the router file, then set
  `routeName: RouteNames.NAME`. The enum stays private to that file. All other code reaches routes
  as `appRouter.routes.NAME`.
- Load pages lazily with `loadComponent`. Route definitions load with the app, so a named route and
  every route above one use `loadComponent`, never `loadChildren`.
- Change routes by editing the `defineAppRouter()` call. The route list is fixed after it runs. A
  `Router.resetConfig()` call would leave typed routes building URLs Angular no longer has.
- Give a parameter with its own format, like a date range, its own codec. Pages then get typed
  values and never parse the parameter's text.
- Keep `defaultValue` a plain value. A fallback that needs a service, like the user's locale, goes
  in the page: `params().query.locale ?? settings.locale()`.
- Give a `redirectTo` function that returns a typed link a `UrlTree` return type.
- Convert one feature or page at a time. Code that still uses `ActivatedRoute` reads the same URL,
  so both styles work side by side.

## 2. Read and write

README: “Build links”, “Read the URL”, “In guards and resolvers”, “One page on several routes”,
“Parameters on every page”, “Remember values yourself”, “Write the query”, “Escape hatch”.

- **Read** with signals, like `route.params().query.search`, inside a `computed()` or a template.
- **In guards and resolvers**, read the destination with
  `appRouter.paramsSnapshot(appRouter.routes.NAME, snapshot)`. There, `params()` still shows the
  page being left.
- **Write** with `route.patchQuery(patch)`, passing only the changed query parameters. When a new
  search should clear the rating, put both in one patch: `patchQuery({ search, minRating: 0 })`.
- **Link** with `route.createUrlTree({ path, query })`. A link contains only the path and query
  parameters you pass. To keep the current query parameters, spread them in.

**Done when** every path or query parameter read in the files you changed is a signal read through a
typed route, and every navigation or query parameter change is a `patchQuery()` or `navigate()` call
on one.

**Rules**

- Read a route only while it's **active**. Reading an inactive route throws. In a component that
  serves several routes, ask each with `ifActive()` and read through the route it returns. Check
  nested routes deepest first, because a parent is active while its child shows.
- Put query parameters that several routes share on their parent, and read them through it.
- Check IDs from data before you build links with them. A path parameter whose value can't be
  written makes `createUrlTree()` throw.
- Treat values from `params()` as read-only, because every reader shares the same object. Copy a
  value before you change it.
- Save path and query parameters between visits in the app, with `globalParams()`. Give a remembered
  query parameter no default, so it's in the URL only when someone set it.
- Reach a URL outside the typed routes, or navigate relatively, through `appRouter.escapeHatch`.

## 3. Forms

Take this step when an input changes a query parameter. README: “Bind a form” and every section
under it.

A form keeps the **draft**: the edits its binding hasn't written yet. The query parameters keep
what's been written. The binding writes the draft to the query parameters.

- Bind with `createQueryParamsSignalForm(route)`, which returns `{ model, form, write }`, or with
  `createQueryParamsFormGroup(route)`, which returns `{ form, write }`. For validators in Reactive
  Forms, build the group yourself and bind it with `bindQueryParamsToFormGroup()`.
- Choose when the draft is written by what a query parameter change costs the page. By default every
  edit is written immediately, which suits a filter over data the page already has. When each query
  parameter change starts a request, delay typing: use Angular's `debounce()` schema rule in Signal
  Forms, or the binding's `debounce` option in Reactive Forms. Or pass `writeOn: 'submit'` to
  write only on submit.
- Keep input that shouldn't reach the URL, like a one-letter search, out with a validator. A field
  is written only once its validators pass.
- Reset dependent query parameters in the binding's `beforeWrite`:
  `(patch) => ('search' in patch ? { minRating: 0, ...patch } : patch)`.

**Done when** every text input that changes a query parameter goes through a bound form.

**Rules**

- The draft reaches the query parameter exactly as typed. Trim where you build the request. Use
  `beforeWrite` only to change other query parameters.
- Put a Reactive form with `writeOn: 'submit'` in a `<form [formGroup]>`. For a Signal Form you
  built yourself, pass `() => binding.write()` as `submission.action`, and type the binding as
  `QueryParamsBinding`.
- Pass `onWriteFailure` when the page should react to a declined write. Without it, a guard's
  decline is silent.
- To wait until the draft is in the query parameters, await `write()`. A Signal Form's
  `submitting()` turns `false` as soon as the write starts.
- Test a bound form on a fake clock, as in “Test a bound form”: move it by the exact delay, and
  type with `{ emitModelToViewChange: false }`. Then the test gives the same result on every run.

## 4. Check your work

README: “Diagnostics and errors”, “Flag direct router use”.

**Done when** all of these hold:

- `RouteNames` appears only in the router file. Every import of `ActivatedRoute` or `Router` has an
  `eslint-disable-next-line` comment that says why.
- The app builds and starts. `defineAppRouter()` checks the routes when it runs and throws one
  error that lists every mistake.
- The pages you changed log no `PARAM_DESERIALIZE_FAILED` or `PARAM_SERIALIZE_FAILED` warning for
  URLs the app builds itself.
