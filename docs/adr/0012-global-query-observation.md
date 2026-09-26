# 0012: Read query conventions across pages

A service may follow a query field such as `campaign` on every page. It should not have to declare
that field on every route just to read it.

`globalQueryParams(definitions)` returns a readonly signal of the decoded fields. It reads the
current snapshot and updates on `NavigationEnd`, like route state. Before initial navigation,
missing fields use their normal defaults. The router owns the subscription, so each observer
needs no cleanup.

Observers apply their own definitions. Two observers can read the same key differently; share a
definition when they should agree. Creating an observer does not register a route parameter,
preserve a query during navigation, or write a stored value back to the URL.

Page-owned fields belong on route declarations. Global observation serves code that needs a read
without owning a destination. Its optional equality function compares the decoded query object.
