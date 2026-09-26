# 0003: Separate building a destination from editing the URL

A link to a search page should mean the same thing wherever it is rendered. `createUrlTree()`
and `navigate()` therefore use only the values supplied by the caller. They build absolute URLs.

`patchQuery()` edits the current URL. It merges the supplied fields and preserves the path,
fragment, and unrelated query fields. A function can compute its patch from the latest committed
query when its turn in the queue starts.

Both operations live on the route node, beside its readonly `params` signal. Equality controls
when that signal notifies readers. Writes read fresh state even when equality retains an older
signal value.

Malformed query input can fall back to an absent value or default. A malformed path cannot name
a destination, so construction returns `null` and navigation resolves `false`. Reading an inactive
route or an invalid active path throws. These distinctions let the library recover where it can
without inventing a route. The [reference](../design/app-router.md#diagnostics-and-errors) gives the
full error rules.
