# Plainspoken Engineering

Write so every sentence is clear on the _first read_ to someone who doesn't know the code. This
applies to docs, code comments, and error messages. To ask for it, say **“Use Plainspoken
Engineering.”**

## Writing

- **Start with the idea**, then show it.
- **Put one idea in each sentence**, and link related sentences with “because”, “so”, or “but”.
  Write “Angular returns every query parameter as a string, so each page parses its own numbers and
  picks its own defaults”, not “Angular returns strings. So you parse them. Then you pick a
  default.”
- **Use plain words, active voice, and the present tense:** “use”, not “utilize”. Keep a technical
  term like codec when it's more exact, and explain it once.
- **Give each thing one name.** A “query parameter” stays a “query parameter” everywhere. Write the
  noun wherever “it” could mean two things.
- **Be exact:** “after 300 ms”, not “soon”.
- **Describe the mechanism with real values:** “`write()` doesn't change the URL while the form
  has errors”, not “makes forms reliable”.
- **Name the operation in the verb:** “returns”, “parses”, “writes”, “removes”. Write “the router
  returns every parameter as `string | null`”, not “the router gives you strings”. “Gives”,
  “holds”, “keeps”, “reaches”, and “follows” name no operation, so the reader has to guess one.
- **Say what happens, then why.** A design choice also gets its cost.
- **Use words a newcomer knows.** Write “none of the three checks ran”, not “the gates are
  unchecked”.

## Code

- **A comment gives the reason, an edge case, or a cost.** The code already says what it does.
- **An error says what went wrong and how to fix it:** “routeName 'HOME' is used twice. Give each
  route its own name.”

## Format

Code shows behavior, tables compare cases, lists hold steps or separate rules, and paragraphs
explain cause and effect. Keep paragraphs short. Put timing and failure rules next to the operation
they affect. End on the last fact the reader needs.

## Rewriting

Keep every fact, at the same strength, and add none. Then list each ambiguity you found and each
judgment call you made.

## Done when

1. Every claim matches the code, and every example works.
2. Each thing has one name throughout.
3. Every sentence adds something.
4. Read out loud, every sentence is clear on the _first read_.
