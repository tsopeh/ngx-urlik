# 0008: Let forms hold a draft

While someone types, the form can be ahead of the URL. Search may be debounced, navigation may
be waiting for a guard, or a write may fail. The form therefore holds a draft while the URL holds
committed state.

Both Angular form systems use the same binding rules. Changes become per-field RxJS events,
which `transformWrites` can map, filter, or delay. Synchronous outputs from one form notification
share a write. A delayed field submits later, so an immediate page change cannot flush a pending search.

A successful write clears the edit it submitted and keeps newer edits. Other coordinated writes
preserve unrelated drafts. External navigation clears drafts and resets the form to the URL;
otherwise an old search could overwrite the page reached by the Back button.

Forms use the router's shared queue, replace history entries by default, and clean up with
`DestroyRef`. Validation is reported in write events; the caller decides whether it should block
writes. The [forms reference](../design/app-router.md#query-form-bindings) covers setup and failure handling.
