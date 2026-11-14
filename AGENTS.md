# Documentation

User-facing documentation lives in `README.md` only. `projects/ngx-urlik/README.md` is a symlink
to it, so the package ships the same file. `docs/` holds contributor notes: design decisions,
state machines, a guide to the code, and the development history.

Docs, comments, and messages describe the library as it is. Don't tell the story of how it got
there: no “before”, “used to”, “was removed”, or “replaced X”. A reader should never need to know
an earlier design to follow a sentence.

The one exception is [`docs/development-history.md`](docs/development-history.md). It records what
we explored, what we chose, why, and where each topic stands. When a decision changes, add it there
and keep every other file in the present.

When writing or editing documentation, use [Plainspoken Engineering](docs/writing-style.md).
“Use Plainspoken Engineering” refers to that guide. Keep examples and behavior claims consistent
with the implementation.
