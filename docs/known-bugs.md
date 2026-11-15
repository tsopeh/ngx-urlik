# Known bugs

These are bugs we know about and haven't fixed yet, in the library first and then in TasteTrack.
Each entry says where the bug lives, what happens, how to see it, and the fix we have in mind. A fix
removes its entry, in the same commit.

## Library

### A form write cancels a navigation away from the page

`patchQuery()` in `src/lib/route-node.ts`, reached from the form bindings in `forms/query-forms.ts`.

Say the user types `fool` into a search debounced by 20 ms and then clicks a link to a page whose
chunk takes 60 ms to load. The debounce ends while that navigation runs, and `patchQuery()`
navigates anyway, because it cancels any navigation in progress. The user's click resolves `false`,
and the app stays on `/results?search=fool`. A guard that takes 60 ms does the same. In TasteTrack,
typing on History and clicking Library on a slow network leaves you on History.

The fix lets a patch cancel only an earlier patch. When some other navigation runs, like a link, a
typed `navigate()`, or Back, the patch resolves `false` without navigating, which is the "something
else navigated first" case the README already lists.

### `listCodec` loses items when the separator can overlap itself

`listCodec()` in `src/lib/params.ts`.

With the separator `'||'`, the lists `['a|', 'b']` and `['a', '|b']` both write `a|||b`, which
reads back as `['a', '|b']`. With `'--'`, `['x-', 'y']` reads back as `['x', '-y']`. Escaping only
covers the whole separator, so an item that ends with part of it runs into the next one.

The fix accepts only one-character separators, which is what the error message already asks for.

### `form.reset()` restores the starting URL, not the defaults

`createQueryParamsFormGroup()` in `forms/query-forms.ts`.

Each control is created with the URL's value at that moment, and a non-nullable control resets to
the value it was created with. On `/results?search=foo`, a "Clear filters" button that calls
`form.reset()` puts `foo` back instead of `''`.

The fix is still open: the controls could reset to the route's defaults, or the docs could say what
`reset()` does.

## TasteTrack

### Clearing a History date leaves `?from=` in the URL

`history-page.ts`, with the `from` and `to` fields in `app-router.ts`.

A cleared date input gives `''`, not `null`, so the form writes `?from=` instead of removing the
field. The fields also use `stringCodec()`, so any text counts as a date.

The fix writes `null` for an empty date and gives `from` and `to` a codec that reads only dates like
`2026-09-01`.

### Viewings show a day late east of UTC+4

`logViewing()` in `backend/database.ts`, the seed data, and the date in `history-page.ts`.

A viewing logged on `2026-09-09` is stored as `2026-09-09T20:00:00.000Z`, and History formats it in
the browser's timezone. In Tokyo that's `Sep 10, 2026`.

The fix formats journal dates in UTC, the timezone they're stored in.

### The viewing date starts at the UTC date

`viewingDate` in `detail-page.ts`.

The default comes from `new Date().toISOString()`, which is the UTC date. In New York at 23:30 on
November 15, the input shows `2026-11-16`.

The fix builds the default from the local year, month, and day.

### A bad remembered season breaks the show page

`readSeasons()` in `preferences.ts`, used by the "Continue with Season" link in `detail-page.ts`.

Stored seasons are checked only for being an object. With `{ "tv_brambleworth-manor": 0 }` in
storage, building the link throws `SEASON: can't write path parameter 'seasonNumber'`.

The fix keeps only positive whole numbers when it reads the stored seasons.

### The catalog search writes every keystroke

The search box in `catalog-page.ts`.

It calls `patchQuery()` on each input event. The agent skill says text inputs go through a bound
form, and Library and History already do that.

The fix binds the catalog filters to a form with a debounced search.

### History adds its search validator after binding

The constructor in `history-page.ts`.

`addValidators()` runs after the form is bound, and nothing recomputes the control's status, so a
two-letter search from the URL counts as valid until someone edits it. The README says to build the
group yourself when it needs validators.

The fix builds the group with its validator and binds it with `bindQueryParamsToFormGroup()`.

### The theme breaks where storage is blocked

`ThemeService` in `theme.ts`.

`localStorage` throws where the browser blocks storage, and the theme service reads and writes it
without a `try`. The shell injects the service, so the whole app fails to start. `Preferences`
already guards its reads.

The fix guards the theme's reads and writes the same way.
