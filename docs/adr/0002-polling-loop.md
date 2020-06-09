# 2. Recursive setTimeout, and stop when hidden

Date: 2020-06-09
Status: Accepted

## Context

The long poll is held open by the server for up to thirty seconds. The obvious
implementation is `setInterval`, and it is wrong.

An interval fires on a schedule whether or not the previous request has come
back. When the server was slow we got overlapping polls, responses arriving
out of order, and a `since` cursor that walked backwards — which manifested as
old messages reappearing at the bottom of the conversation.

Separately: users leave tabs open. Twenty open tabs is twenty held-open
connections doing nothing for anybody.

## Decision

A recursive `setTimeout`. The next poll is scheduled only once the previous
one has resolved, so there is never more than one in flight.

The delay is computed by a pure function in `pollingSchedule.ts` — zero after
a successful poll, exponential backoff with jitter after a failure, and `null`
meaning stop entirely for aborts and for a 401.

Polling stops when `document.visibilityState` is `hidden` and resumes
immediately when the tab comes back, resetting the failure count rather than
serving out a backoff that was scheduled while nobody was looking.

## Consequences

Good:

- One request in flight, so the cursor only ever moves forward.
- Backoff is a pure function of the outcome, so the whole retry policy is
  tested in milliseconds with no timers and no waiting.
- Jitter means a server that fell over does not get twenty tabs retrying on
  the same millisecond when it comes back.

Bad:

- Stopping on hidden means a user returning to a tab waits one round trip for
  messages that a WebSocket would have pushed while they were away. Acceptable
  for us; would not be for a trading screen.
- The loop keeps mutable state (`cancelled`, `failures`, `timer`) in the
  effect closure. It is correct and tested, but it is the kind of code that
  gets broken by a well-meaning refactor, and the ref-vs-state dance around
  the cursor is genuinely subtle.
