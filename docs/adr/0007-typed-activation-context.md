# 0007: Let shared components name their supported routes

A detail component may serve several routes with different parameters. Guessing which route
is active from a URL string throws away information the route tree already contains.

`activeRoute({ movie: movieRoute, episode: episodeRoute })` returns a signal with `route`, `node`,
and `params`. Checking the alias narrows the parameter types. The component declares only the
routes it understands, so its type does not grow when unrelated routes are added to the app.

The deepest active named candidate wins. If two aliases name the same node, the first alias wins.
Reading with no active candidate throws. Redirects and private exact-match children cannot be
candidates. Angular still does the matching; the library maps the result to a named route.
