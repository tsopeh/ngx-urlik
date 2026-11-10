# Plainspoken Engineering

Explain a system so the reader can use it, predict it, and change it. Write as an engineer
explaining a design to another engineer who has work to do.

To request this style, say: **“Use Plainspoken Engineering.”**

## How to write it

Start with the reader's task or the behavior they need to understand. Show a small example.
Then explain what happens and why. Introduce a term when it gives a useful name to something
the example already shows.

Use concrete subjects and verbs: “A patch is one navigation.” Give each paragraph one
idea, and make the next paragraph answer the question that idea raises. Prefer familiar words;
keep technical terms when they make the explanation more exact.

State a design choice with its reason and cost. “The route tree is static, so TypeScript can
infer each destination's parameters. Components can load lazily; route definitions cannot.”
Let that explanation do the persuading.

Put timing and failure rules beside the operation they affect. Specify whether a value is a
draft or committed state, when a callback runs, and what happens when it fails. Shorten the
prose without shortening the contract.

Use code to show behavior, tables to compare cases, and lists for steps or independent rules.
Use ordinary prose to explain cause and effect. Choose headings that help a reader find an
answer. End when the document has done its job.

## Example

Instead of:

> Synchronously emitted changes from one form notification are aggregated into a single atomic
> navigation request.

Write:

> `form.patchValue({ search: 'elm', page: 1 })` changes both fields in one navigation. If you
> debounce search, the page change writes first and search writes when its delay ends.

The second version gives the reader an operation they can try and a result they can check.

## Match the document to the task

| Document             | What the reader should get                           |
| -------------------- | ---------------------------------------------------- |
| Getting started      | A working example and enough explanation to adapt it |
| Reference            | Exact inputs, results, timing, and failure behavior  |
| Design decision      | The problem, the choice, and the tradeoff            |
| Implementation guide | Where behavior lives and how data moves              |
| Glossary             | One short definition per term                        |

Before finishing, check that each claim has support in the code or a cited source, each example
matches the public interface, and each paragraph adds information. Put full rules in the reference
and link to them from shorter explanations.
