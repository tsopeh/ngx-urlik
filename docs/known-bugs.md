# Known bugs

These are bugs we know about and haven't fixed yet.
Each entry says where the bug lives, what happens, how to see it, and the fix we have in mind. A fix
removes its entry, in the same commit.

## Library

### `form.reset()` restores the starting URL, not the defaults

`createQueryParamsFormGroup()` in `forms/query-forms.ts`.

Each control is created with the URL's value at that moment, and a non-nullable control resets to
the value it was created with. On `/results?search=foo`, a "Clear filters" button that calls
`form.reset()` puts `foo` back instead of `''`.

The fix is still open: the controls could reset to the route's defaults, or the docs could say what
`reset()` does.
