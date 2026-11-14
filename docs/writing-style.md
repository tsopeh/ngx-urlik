# Plainspoken Engineering

Write the way you'd explain the code to a friend who has to use it tomorrow.

To ask for this style, say **“Use Plainspoken Engineering.”**

## Rules

- Use plain words. If a short word works, use it.
- Say it the way you'd say it out loud. If you wouldn't say a sentence to a friend across the
  table, rewrite it.
- Write short sentences, with one idea each.
- Walk through one concrete example with real values: `minRating=4`, not “a numeric parameter”.
- Say what happens. Then say why.
- No hype and no hedging. Cut “simply”, “powerful”, “seamless”, “might”, and “generally”.
- No summary at the end. Stop when you're done.
- Make it as short as it can be without losing meaning. Shorten the words, never the rules.

## Example

Instead of:

> Synchronously emitted changes from one form notification are aggregated into a single atomic
> navigation request.

Write:

> `form.patchValue({ search: 'elm', minRating: 0 })` changes both fields in one navigation. If
> search is debounced by 300 ms, the rating writes first and the search writes 300 ms later.

The second version gives the reader something to try and a result to check.

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

Give a design choice its reason and its cost. “Route definitions load with the app. That's why a
link to `/orders/4` works before the orders page has loaded. The cost is that you can't load a
route's definition lazily.”

## Code

Names and comments follow the same rules. A name says what the thing is: `storageKey`, not
`persistenceKeyDescriptor`. A comment says why, not what the next line does. Leave out a comment
that only repeats the code.

An error message says what went wrong and how to fix it: “routeName 'HOME' is used by both
routes[0] and routes[2]. Give each route its own name.”

## Formats

Use code to show behavior, tables to compare cases, and lists for steps or separate rules. Use
sentences for cause and effect. Make headings the questions a reader would look for.

| Document             | The reader gets                             |
| -------------------- | ------------------------------------------- |
| Getting started      | A working example and enough to adapt it    |
| Reference            | Exact inputs, results, timing, and failures |
| Design decision      | The problem, the choice, and what it costs  |
| Implementation guide | Where the code for each behavior lives      |

Before you finish, check four things. Every claim matches the code. Every example works against
the public API. Every sentence adds something. Every sentence sounds natural read out loud.
