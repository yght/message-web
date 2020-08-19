# 3. A failed message stays on screen

Date: 2020-08-18
Status: Accepted

## Context

When a send fails, the first version removed the optimistic message and showed
a toast. Users typed a paragraph, watched it vanish, and lost it. Two people
reported it as data loss, and they were right.

## Decision

The message stays exactly where it is, styled as failed, with the reason and a
Retry button. Nothing the user typed is ever discarded by us.

Retry reuses the same `clientMessageId`. That matters: the common failure is a
timeout on a request the server actually processed, and reusing the id means
the retry reconciles with the original rather than sending a duplicate.

The poll can also resolve a failed message on its own. If the message did get
through, it comes back through the poll, and the reducer promotes it from
`failed` to `sent` — the red state disappears without the user doing anything.

## Consequences

Good:

- No lost text, which was the actual complaint.
- The self-healing case is common enough to be worth having. A timeout that
  actually succeeded stops looking like a failure within a second or two.
- Retry is idempotent by construction rather than by hoping.

Bad:

- A conversation can accumulate failed messages that the user neither retries
  nor dismisses, and they stay across a reload if we ever persist state. There
  is no way to delete one yet, which is an obvious gap.
- Promoting `failed` to `sent` from a poll means the UI can change under the
  user's finger as they reach for Retry. Rare, and the retry is harmless when
  it happens, but it is a real thing that can occur.
