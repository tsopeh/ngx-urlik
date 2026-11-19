# Documentation

`README.md` holds the user-facing documentation. `projects/ngx-urlik/README.md` is a symlink to it,
so the package ships the same file. The README holds every fact about the library's behavior, so a
developer learns it all in one place.

The agent skill, `skills/ngx-urlik/SKILL.md`, also ships with the package. It holds the order of
work, the rules an agent follows, and the check that ends each step. It points to README sections
for the facts. A rule can appear in both: as an explanation in the README and as an instruction in
the skill. A fact that only explains behavior goes in the README alone.

`docs/` holds contributor notes: design decisions, state machines, a guide to the code, and the
development history.

Docs, comments, and messages describe the library as it is now, in the present tense. A reader
follows every sentence without knowing an earlier design. A sentence with “before”, “used to”, “was
removed”, or “replaced X” belongs in [`docs/development-history.md`](docs/development-history.md).
That file records what we explored, what we chose, why, and where each topic stands. When a
decision changes, record it there and keep every other file in the present.

Before writing or editing documentation, code comments, or error messages, read
[Plainspoken Engineering](docs/writing-style.md). “Use Plainspoken Engineering” refers to that
guide. Keep examples and behavior claims consistent with the implementation.

# Tests

A test fails when the code it covers breaks. If it would still pass with the code deleted or wrong,
fix the test. Watch for:

- an expected value computed by the code under test
- `every()` on a list that may be empty
- a value the test passed in, read back
- an end state that also holds if nothing ran

When unsure, break the code, run the test, and restore the file.

A test gives the same result on every run, however busy the machine is, so it never races a real
clock. A test that sleeps 80 ms to let a 40 ms debounce end passes on a fast machine and fails on a
loaded one. Instead:

- Run timers on Vitest's fake clock, `vi.useFakeTimers()`, and move it by an exact amount, as
  `elapse(200)` does in `query-forms.spec.ts`. To show a 200 ms debounce, check the URL at 199 ms
  and again at 200 ms.
- Wait for a write by awaiting the promise it returns, like `patchQuery()` or `write()`, or by
  moving the fake clock. Don't poll with `vi.waitFor()`, because under fake timers it moves the
  clock itself and can fire a debounce the test didn't ask for.
- Show that a write didn't happen with a `patchQuery` spy or the `NavigationStart` events, checked
  after the work has run. A URL that hasn't changed yet says nothing about a write still on its way.
- Give a timer the test shouldn't fire a delay that outlasts the test, like `10_000`.
