# Review patterns

Small presentation primitives extracted from the working launch workflow. These are local project resources, not a published package or a claim of upstream adoption.

## RevisionComparison

Source: `src/components/ReviewPatterns.tsx`.

Typed inputs: `current`, `proposed`, and `provenance` strings; optional `base` string and `editor` React node. Current and proposed text are rendered as text, never arbitrary HTML. The optional original base supports a three-way comparison. The optional editor makes a proposed merge editable without changing the saved current value.

The component does not decide whether a change is valid, apply an edit, or grant approval. Its caller owns those commands and supplies the expected document revision. `src/draft-state.ts` prepares a merge that preserves independent changes, while leaving same-field collisions visible for a human decision. The service remains authoritative when a save races another change.

Used in the real source/model proposal review and in the UI-pattern example. Small screens stack the comparison in reading order. Focus stays with explicit controls; motion is not required to understand either version.

## AsyncActivity

Typed inputs: `items: { id: string | number; message: string; at: string }[]`, plus an optional accessible `label`.

Stable event identity allows the caller to append or recover observed events without remounting earlier items. The list announces additions politely. The component does not invent progress, infer successful work from elapsed time, or retry a job itself.

The application polls authoritative state and displays persisted run events with stable sequence IDs. Refreshing state is separate from generating a new attempt. Model prose is presented only after the response passes its structured checks; the activity stream is real job progress, not simulated token streaming.

## Styling and examples

The application applies its charcoal/green theme through shared styles. The components themselves contain no Chess.com marks, player data or course-specific copy. The in-app **How it works → UI patterns** view contains clearly labeled examples. These examples do not modify the user's launch.

The local resource is intentionally small. Packaging neutral CSS/tokens and publishing an independently reusable distribution are a follow-up release step, not something this repository claims has already happened.

## Verification

Run `npm test` for the shared domain and local-draft recovery contracts. The meaningful recovery cases are independent edits, a same-field collision and malformed persisted draft data. The current interaction integration test uses React DOM and SQLite. It is not a substitute for rendered browser review.
