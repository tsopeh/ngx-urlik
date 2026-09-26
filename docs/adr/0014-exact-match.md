# 0014: Give a layout and its landing page one route identity

At `/account`, a layout may show an overview. At `/account/settings`, the same layout shows settings.
The overview needs a place to render, but it does not need a separate public address.

`exactMatch` puts that landing content on the named account route. The compiler creates a private
full-match child for Angular's outlet. Navigation, parameters, and equality stay on the named route,
which remains active while its descendants are active.

Exact-match content can have its own Angular guards, providers, resolvers, data, and title. It can
also be a redirect with the narrower redirect options. It cannot add parameters, children, or a
separate state signal. This keeps one identity for one destination.

Only the root may declare an empty path. `exactMatch` works on roots, componentless routes, and
leaves; terminal redirects and wildcards cannot use it.
