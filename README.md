# message-web

React client for the MessagePlatform API. TypeScript, hooks, HTTP long-polling.
Related API sample: [dotnet-showcase](https://github.com/yght/dotnet-showcase).

*A note on this repository: it's a cleaned-up rebuild of a client I wrote in
2020. The original points at a live API with real conversations in it, so I
can't put it up. The reconciliation logic and the polling behaviour are the
real ones — I rewrote the code against a stub so it could be shared. Ask me to
screen-share the original if you want to see it running.*

## What I want to demonstrate

I want to show how I design frontend state around asynchronous messaging and the experience of the person sending a message.

- **React and TypeScript:** hooks, an API boundary and a reducer that can be reviewed independently.
- **Asynchronous behaviour:** reconciliation of optimistic messages, POST responses and polled messages using client-generated IDs.
- **Customer experience:** immediate feedback, visible failures and retry behaviour that preserves what the user wrote.
- **Testing:** explicit event sequences and polling schedules.

**Start here:** [message reducer](src/messages/messageReducer.ts), [reducer tests](src/messages/messageReducer.test.ts), and [polling loop](src/polling/usePolling.ts).

**Scope:** a client source and test sample with no bundled browser demo. The related public .NET API is a different snapshot: request fields, response shapes and client-message IDs need alignment before the two can run together. The long-polling discussion describes the intended client contract; the public API currently returns immediately.

## Recent improvements — Yousof

- A message received from the server is now marked delivered immediately, even while the POST is pending.
- Late timeouts and stale retry actions cannot downgrade confirmed delivery; confirmation clears the previous failure reason.
- Added regression tests for these event orderings, a TypeScript check command and [GitHub Actions checks](.github/workflows/ci.yml) for Node 22 and 24.

Local validation: all 48 tests and TypeScript checking passed. The workflow runs the same checks on both configured Node versions.

## Why this is harder than it looks

The client is designed around a long-polling contract: a server holds a request
open until a message arrives or the timeout expires. The public .NET snapshot
needs changes to provide that contract. This design creates an important
client-state problem.

Your own message comes back to you.

You send something. You render it immediately, because waiting on a round trip
feels broken. The POST returns the stored copy. And then the long poll hands
you the same message again, because the poll has no idea which client sent
what. Three copies of one message, and no guarantee about the order they show
up in.

I hit all three orderings in production:

* POST comes back, then the poll delivers → message shown twice
* Poll delivers, then the POST comes back → shown twice, second copy stomps the first
* POST times out but the server stored it anyway → a red "failed" message sitting next to a delivered copy of itself

The fix has to start earlier than it feels like it should. You can't key off
the server's id, because at the moment you first put the message on screen you
don't have one. So the client makes an id before sending, the API stores it
and echoes it back on every copy of that message you'll ever see. Everything
else follows from that.

## Getting around the code

`messages/messageReducer.ts` is the file to read. It holds the entity map, the
display order, and a `byClientId` index, and it's where the three-way
reconciliation happens. Everything in it is a pure function, so all of the
awkward orderings above are unit tests rather than things you have to
reproduce by hand.

`polling/pollingSchedule.ts` decides when to poll again and nothing else — no
timers, no fetch. That separation is why the backoff tests finish in
milliseconds. `polling/usePolling.ts` is the loop that does the waiting,
aborting and visibility handling.

`api/client.ts` covers the endpoints. `messages/useConversation.ts` ties the
reducer to the API. The components under `components/` hold no logic worth
testing on its own — they render what they're given.

## Decisions I wrote down at the time

* [Client-generated message ids](docs/adr/0001-client-message-ids.md) — why identity starts on the client
* [Recursive setTimeout over setInterval](docs/adr/0002-polling-loop.md) — and why a hidden tab stops entirely
* [Failed sends stay on screen](docs/adr/0003-failed-sends.md) — deleting what someone typed is data loss

## Running it

```bash
npm ci
npm run typecheck
npm run test:ci
```

48 tests. The reducer, the polling schedule, and the components through
Testing Library against React 17. The reconciliation ones are the interesting
part, including the race where the poll wins.

What isn't here: bundler config, dev server, routing, sign-in screens. The
original was Create React App with the usual pile around it. None of that is
worth reading and it's where the environment-specific values lived. No
credentials in this repo, and none of the endpoints are real.

## Rough edges I'd fix

`insertionIndex` scans backwards from the end of the list. Fine for a page of
fifty messages, wrong for the ten thousand a search can return — wants a
binary search, or the list wants windowing.

The reducer does reconciliation *and* ordering. Two jobs that change for
different reasons and would be easier to follow apart.

`friendly()` maps HTTP statuses to English inside the hook. That belongs at
the API boundary, and the strings belong somewhere they can be translated.

Long-polling was the constraint, not a preference. With SignalR the whole
`polling/` directory collapses into a subscription — though the reconciliation
doesn't go away, because an optimistic send is still ahead of the server.

## About the rebuild

Written the way I'd have written it in 2020: function components and hooks
throughout, no `React.FC`, `AbortController` rather than a cancellation
library, nothing from React 18. The test runner is current — a repo you can't
clone and run isn't much use to anyone reading it.

## Engineering practices

[Contribution and verification guide](CONTRIBUTING.md) · [Review template](.github/pull_request_template.md)

The backend payloads still need alignment before an end-to-end browser demo is possible.

## Read receipt reconciliation

Once the client observes a read receipt, delayed POST responses and poll batches
cannot clear it. Confirmation also preserves the receipt when replacing a
temporary message ID. The first observed non-null receipt is retained; this is
a monotonic read/unread policy, not a guarantee of the earliest read timestamp.
There is no mark-unread operation in this sample.

The reducer regression tests exercise stale responses from both delivery paths,
temporary-ID replacement and receipt arrival for an unread message.
Run `npm test -- --runInBand` and `npm run typecheck`.

## Poll lifecycle safety

The polling hook admits only one in-flight request per effect, including when
visibility events arrive before the current request completes. A 401 latches
that effect into a stopped state; visibility changes cannot restart it.
Authentication recovery requires the effect to restart with updated dependencies.
Unmount aborts the active request and ignores a late result.

Hook tests use deferred promises, fake timers and real React mounting to cover
overlap prevention, authentication failure and cleanup. This does not add a
network timeout: a transport that never settles still needs its own deadline.
Run `npm test -- --runInBand` and `npm run typecheck`.
