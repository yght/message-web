# 1. The client generates message ids

Date: 2020-04-21
Status: Accepted

## Context

We show a message the instant the user hits send, before the server has seen
it. At that moment the message has no server id. Seconds later it may reach us
twice more — once as the POST response, once through the long poll.

Reconciling on the server id cannot work, because at the point we first need
identity there is no server id to reconcile on. Reconciling on `(sender, body,
timestamp)` was tried in the first version and fails the moment somebody sends
the same word twice, which in practice is constantly — "ok", "thanks", "yes".

## Decision

The client generates a `clientMessageId` before sending. The API stores it on
the message and returns it on every representation of that message: the POST
response, the long poll, a conversation fetch, a search result.

The reducer keeps `byClientId` alongside the entity map, so an incoming
message can be matched whether it arrives with our client id, with a server id
we already hold, or as something genuinely new.

## Consequences

Good:

- Reconciliation is exact rather than heuristic, and a message being sent
  twice on purpose stays two messages.
- Retry is free: the same `clientMessageId` goes back up, so a retry after a
  timeout that actually succeeded is recognised as the same message rather
  than duplicated. This turned out to matter more than the original case.
- The whole thing is a pure reducer, so all of it is unit tested, including
  orderings that are almost impossible to reproduce by hand.

Bad:

- The API had to change to store and echo a field it does not otherwise use.
- A hostile client can set a `clientMessageId` that collides with another of
  its own messages. It can only hurt itself, but it is worth knowing.
- Messages that predate the field have `clientMessageId: null` and fall back
  to server-id matching. That branch is exercised by the tests, but it is a
  second path through the same logic and it will be there forever.
