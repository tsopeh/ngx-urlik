# ADR 0014: Keep exact-path behavior on the named route

Status: accepted. Supersedes ADR 0013's public index routes; preserves deepest active selection.

Only the application root may have an empty path. Ordinary routes use `exactMatch` to select
content or a redirect at their own exact path. Angular components on the containing route
retain their usual layout semantics. The compiler generates a private full-match child,
without another public route identity. This preserves simple page rendering while keeping
navigation and state attached to meaningful named routes.

Parameters and equality remain on the named route, whose state stays readable on descendants.
Exact content may have its own Angular guards, resolvers, providers, data and title; exact
redirects retain the existing narrower Angular options and typed accumulated input. Neither
variant introduces parameters, children, or an independently observable node. This deliberately
gives up exact-page-only parameter ownership from public indexes. The same configuration
works at application root, on componentless branches, and on leaves. Existing terminal
redirects and wildcards remain separate kinds and reject `exactMatch`.
