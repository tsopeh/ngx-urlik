# Plainspoken Engineering

Write the way a senior engineer explains their library to a colleague they respect: plainly,
confidently, and in the order that makes the idea click.

To ask for this style, say **“Use Plainspoken Engineering.”**

## Rules

- **Start with the idea.** Open a document or a section with what the thing is and why it exists.
  Then show it. An example backs up an idea. It can't stand in for one.
- **Use plain words.** If a short word works, use it.
- **Write prose, not a telegram.** Sentences can be short or long, as long as each one is easy to
  follow. Join related thoughts with “because”, “so”, “which”, and “but”. A run of four-word
  sentences reads like a list somebody forgot to format.
- **Read it out loud.** If you wouldn't say it to a colleague across the table, rewrite it. If it
  sounds like a manual translated twice, rewrite it.
- **Show real values.** Walk through one example: `minRating=4`, not “a numeric parameter”.
- **Say what happens, then why.** The reason is often the most useful sentence in the paragraph.
- **No hype and no hedging.** Cut “simply”, “powerful”, “seamless”, “might”, and “generally”.
- **Stop when you're done.** No summary at the end.
- **Cut what doesn't earn its place.** Shorten the text, never the rules, and keep the words that
  connect one sentence to the next.

## Example

Instead of:

> Angular gives you strings. So you parse them. Then you pick a default. Then you do it again on the
> next page.

Write:

> Angular gives you every URL value as a string, so each page ends up parsing its own numbers and
> picking its own defaults.

Instead of:

> Synchronously emitted changes from one form notification are aggregated into a single atomic
> navigation request.

Write:

> `form.patchValue({ search: 'elm', minRating: 0 })` changes both fields in one navigation. If
> search is debounced by 300 ms, the rating writes first and the search follows 300 ms later.

The first pair shows that short isn't the same as clear. The second gives the reader something to
try and a result to check.

## Words

| Instead of                 | Write                         |
| -------------------------- | ----------------------------- |
| utilize, leverage          | use                           |
| facilitate, enable         | let, help                     |
| encapsulate                | hold, wrap                    |
| deterministic              | the same every time           |
| aggregate, coalesce        | combine                       |
| in order to                | to                            |
| it should be noted that    | (cut it)                      |
| robust, seamless, powerful | (cut it, or say what it does) |

Keep a technical term when it's more exact than the plain one, like `canMatch`, codec, or
navigation. Introduce it once, with an example.

## Insider shorthand

Shorthand is worse than formal words, because it feels plain to the person who wrote it. It comes
from meetings, tickets, and other tools, and a new reader has to guess what it means. Say what
actually happened instead.

| Instead of                                 | Write                                            |
| ------------------------------------------ | ------------------------------------------------ |
| the branch ends with those gates unchecked | none of the three happened                       |
| a seam                                     | a hook an app can plug into, or say what it does |
| the edit landed                            | the edit reached the URL                         |
| moot, settled                              | stopped mattering, decided                       |
| **Status:** settled                        | **Where it stands:** decided                     |
| bug hunt, hardening pass, pilot            | we looked for bugs, we fixed …, a first release  |
| a page-side fallback                       | a fallback in the page                           |
| items (A, D), round 2's F                  | name the change itself                           |
| the open feeling about the name            | the maintainer isn't sure about the name         |

Labels the reader never saw defined, like letters from a review or a project's private nicknames,
count as shorthand too. So do metaphors borrowed from other work, like gates, lanes, or engines.

## What the reader needs

Put timing and failure rules next to the operation they affect. Say whether a value is a draft or
already in the URL, when a callback runs, and what happens when it fails.

Give a design choice its reason and its cost: “Route definitions load with the app, which is why a
link to `/orders/4` works before the orders page has loaded. The cost is that a route's definition
can't load lazily.”

## Code

Names and comments follow the same rules. A name says what the thing is: `storageKey`, not
`persistenceKeyDescriptor`. A comment says why, not what the next line does, and a comment that
only repeats the code goes.

An error message says what went wrong and how to fix it: “routeName 'HOME' is used by both
routes[0] and routes[2]. Give each route its own name.”

## Formats

Use code to show behavior, tables to compare cases, and lists for steps or for rules that really
are separate. Use paragraphs for cause and effect, and for anything a reader should follow from
start to finish. Make headings the questions a reader would look for.

| Document             | The reader gets                                     |
| -------------------- | --------------------------------------------------- |
| Getting started      | The idea, a working example, and enough to adapt it |
| Reference            | Exact inputs, results, timing, and failures         |
| Design decision      | The problem, the choice, and what it costs          |
| Implementation guide | Where the code for each behavior lives              |

Before you finish, check four things: every claim matches the code, every example works against
the public API, every sentence adds something, and the whole thing reads well out loud, in one
pass, without stumbling.
