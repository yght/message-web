# message-web

React client for the MessagePlatform API. TypeScript, hooks, HTTP long-polling.
The backend is the MessagePlatform .NET API.

## The problem

Real-time messaging without WebSockets. The .NET API of that era used HTTP
long-polling — the server holds a request open for up to thirty seconds and
returns the moment something arrives. That works well, and it creates one
genuinely hard problem.

**Your own message comes back to you.** You send a message, you show it
immediately so the app feels instant, the POST returns the stored version, and
the long poll *also* delivers it, because the poll does not know which client
sent what. Three copies of one message, arriving in any order.

The ordering is not theoretical:

| Order | What the user sees without care |
|---|---|
| POST returns, then poll delivers | message appears twice |
| Poll delivers, then POST returns | message appears twice, second copy replaces the first |
| POST times out, poll delivers | red "failed" message next to a successfully delivered copy |

So identity cannot hang off the server's id — at the moment we first render a
message we do not have one. Every message carries a `clientMessageId` that we
generate before sending. The API stores it and echoes it on every copy of that
message we will ever see. That is the whole design.

## What's in here

| Path | What it is |
|---|---|
| `messages/messageReducer.ts` | Reconciliation. The file worth reading. |
| `polling/pollingSchedule.ts` | When to poll again — pure, so backoff is testable without waiting. |
| `polling/usePolling.ts` | The loop itself: aborts, visibility, no overlapping requests. |
| `messages/useConversation.ts` | Ties the reducer to the API. |
| `api/client.ts` | The MessagePlatform endpoints. |
| `components/` | List, bubble, composer. No logic in them. |

## Decisions worth arguing about

1. **[Client-generated message ids](docs/adr/0001-client-message-ids.md)** —
   why the client and not the server owns message identity at send time.
2. **[Recursive setTimeout, not setInterval](docs/adr/0002-polling-loop.md)** —
   and why a backgrounded tab stops polling entirely.
3. **[Optimistic sends stay visible on failure](docs/adr/0003-failed-sends.md)** —
   a failed message is not removed, because the user's words are theirs.

## Running it

```bash
npm install
npm start       # http://localhost:3000
npm test        # 46 tests
```

Point the API base URL at a running
[MessagePlatform](https://github.com/yght/dotnet-showcase).

## What I'd do differently now

- **`insertionIndex` is a linear scan from the end.** Fine for a conversation
  page of fifty and wrong for the ten-thousand-message history the search
  results can produce. It wants a binary search, or the list wants windowing.
- **The reducer is doing reconciliation and ordering.** Two concerns that
  change for different reasons; splitting them would make both easier to
  follow.
- **Long-polling was the constraint, not the choice.** With SignalR available
  the whole `polling/` directory becomes a subscription and the reconciliation
  problem gets smaller — though it does not disappear, because the optimistic
  send is still ahead of the server.
- **`friendly()` maps HTTP statuses to English inside the hook.** That belongs
  at the API boundary, and the strings belong somewhere translatable.
