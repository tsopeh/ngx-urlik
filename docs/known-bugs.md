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

### `form.reset()` restores the starting URL, not the defaults

`createQueryParamsFormGroup()` in `forms/query-forms.ts`.

Each control is created with the URL's value at that moment, and a non-nullable control resets to
the value it was created with. On `/results?search=foo`, a "Clear filters" button that calls
`form.reset()` puts `foo` back instead of `''`.

The fix is still open: the controls could reset to the route's defaults, or the docs could say what
`reset()` does.

## TasteTrack

### The theme breaks where storage is blocked

`ThemeService` in `theme.ts`.

`localStorage` throws where the browser blocks storage, and the theme service reads and writes it
without a `try`. The shell injects the service, so the whole app fails to start. `Preferences`
already guards its reads.

The fix guards the theme's reads and writes the same way.
