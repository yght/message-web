import { messageReducer, initialState, visibleMessages, MessageEvent } from './messageReducer';
import { ConversationState, Message, ServerMessage } from './types';

const CONV = 'conv_4821';
const ME = 'user_yousof';
const THEM = 'user_dana';

function optimistic(clientMessageId: string, body: string, sentAt: string): Message {
  return {
    id: 'tmp_' + clientMessageId,
    clientMessageId,
    conversationId: CONV,
    senderId: ME,
    body,
    sentAt,
    readAt: null,
    status: 'sending'
  };
}

function fromServer(
  id: string,
  body: string,
  sentAt: string,
  clientMessageId: string | null = null,
  senderId = THEM
): ServerMessage {
  return { id, clientMessageId, conversationId: CONV, senderId, body, sentAt, readAt: null };
}

function run(events: MessageEvent[], from: ConversationState = initialState): ConversationState {
  return events.reduce(messageReducer, from);
}

function bodies(state: ConversationState): string[] {
  return visibleMessages(state).map(m => m.body);
}

describe('sending', () => {
  it('shows the message immediately, marked as sending', () => {
    const state = run([
      { type: 'SEND_STARTED', message: optimistic('c1', 'on my way', '2020-05-14T10:00:00Z') }
    ]);

    expect(bodies(state)).toEqual(['on my way']);
    expect(visibleMessages(state)[0].status).toBe('sending');
  });

  it('swaps the temporary id for the real one without moving the message', () => {
    const state = run([
      { type: 'SEND_STARTED', message: optimistic('c1', 'first', '2020-05-14T10:00:00Z') },
      { type: 'SEND_STARTED', message: optimistic('c2', 'second', '2020-05-14T10:00:05Z') },
      {
        type: 'SEND_SUCCEEDED',
        clientMessageId: 'c1',
        message: fromServer('msg_900', 'first', '2020-05-14T10:00:00Z', 'c1', ME)
      }
    ]);

    expect(bodies(state)).toEqual(['first', 'second']);
    expect(state.order[0]).toBe('msg_900');
    expect(state.entities['tmp_c1']).toBeUndefined();
    expect(visibleMessages(state)[0].status).toBe('sent');
  });

  it('marks a failed send without losing what the user typed', () => {
    const state = run([
      { type: 'SEND_STARTED', message: optimistic('c1', 'important thing', '2020-05-14T10:00:00Z') },
      { type: 'SEND_FAILED', clientMessageId: 'c1', reason: 'Network unreachable' }
    ]);

    const message = visibleMessages(state)[0];
    expect(message.status).toBe('failed');
    expect(message.body).toBe('important thing');
    expect(message.failureReason).toBe('Network unreachable');
  });

  it('clears the failure when the user retries', () => {
    const state = run([
      { type: 'SEND_STARTED', message: optimistic('c1', 'hello', '2020-05-14T10:00:00Z') },
      { type: 'SEND_FAILED', clientMessageId: 'c1', reason: 'Network unreachable' },
      { type: 'RETRY_SEND', clientMessageId: 'c1' }
    ]);

    const message = visibleMessages(state)[0];
    expect(message.status).toBe('sending');
    expect(message.failureReason).toBeUndefined();
  });
});

describe('deduplication', () => {
  it.each(['SEND_FAILED', 'RETRY_SEND'] as const)(
    'does not downgrade poll-confirmed delivery after %s', type => {
      const confirmed = run([
        { type: 'SEND_STARTED', message: optimistic('c1', 'hello', '2020-05-14T10:00:00Z') },
        {
          type: 'MESSAGES_RECEIVED',
          messages: [fromServer('msg_900', 'hello', '2020-05-14T10:00:00Z', 'c1', ME)],
          until: '2020-05-14T10:00:01Z'
        }
      ]);
      const state = messageReducer(confirmed, type === 'SEND_FAILED'
        ? { type, clientMessageId: 'c1', reason: 'Timed out' }
        : { type, clientMessageId: 'c1' });
      expect(state).toBe(confirmed);
      expect(state.order).toEqual(['msg_900']);
      expect(state.entities.msg_900.status).toBe('sent');
      expect(state.entities.msg_900.failureReason).toBeUndefined();
    }
  );

  it('does not show our own message twice when the poll returns it', () => {
    const state = run([
      { type: 'SEND_STARTED', message: optimistic('c1', 'hello', '2020-05-14T10:00:00Z') },
      {
        type: 'SEND_SUCCEEDED',
        clientMessageId: 'c1',
        message: fromServer('msg_900', 'hello', '2020-05-14T10:00:00Z', 'c1', ME)
      },
      {
        type: 'MESSAGES_RECEIVED',
        messages: [fromServer('msg_900', 'hello', '2020-05-14T10:00:00Z', 'c1', ME)],
        until: '2020-05-14T10:00:01Z'
      }
    ]);

    expect(bodies(state)).toEqual(['hello']);
    expect(state.order).toHaveLength(1);
  });

  /**
   * The race this whole design exists for: the long poll delivers our own
   * message before the POST response resolves.
   */
  it('survives the poll beating the POST response', () => {
    const state = run([
      { type: 'SEND_STARTED', message: optimistic('c1', 'hello', '2020-05-14T10:00:00Z') },
      {
        type: 'MESSAGES_RECEIVED',
        messages: [fromServer('msg_900', 'hello', '2020-05-14T10:00:00Z', 'c1', ME)],
        until: '2020-05-14T10:00:01Z'
      },
      {
        type: 'SEND_SUCCEEDED',
        clientMessageId: 'c1',
        message: fromServer('msg_900', 'hello', '2020-05-14T10:00:00Z', 'c1', ME)
      }
    ]);

    expect(state.order).toEqual(['msg_900']);
    expect(visibleMessages(state)[0].status).toBe('sent');
  });

  it('confirms delivery immediately when the poll arrives', () => {
    const state = run([
      { type: 'SEND_STARTED', message: optimistic('c1', 'hello', '2020-05-14T10:00:00Z') },
      {
        type: 'MESSAGES_RECEIVED',
        messages: [fromServer('msg_900', 'hello', '2020-05-14T10:00:00Z', 'c1', ME)],
        until: '2020-05-14T10:00:01Z'
      }
    ]);

    // The server copy is evidence of delivery, even before the POST resolves.
    expect(state.order).toEqual(['msg_900']);
    expect(visibleMessages(state)[0].status).toBe('sent');
  });

  it('ignores a redelivery of the same message, since the poll is at-least-once', () => {
    const incoming = fromServer('msg_901', 'are you there', '2020-05-14T10:01:00Z');

    const state = run([
      { type: 'MESSAGES_RECEIVED', messages: [incoming], until: '2020-05-14T10:01:01Z' },
      { type: 'MESSAGES_RECEIVED', messages: [incoming], until: '2020-05-14T10:01:02Z' }
    ]);

    expect(state.order).toEqual(['msg_901']);
  });

  it('recovers a failed send if the message actually got through', () => {
    // The POST timed out but the server had already stored it. The poll
    // brings it back, and the angry red retry button should go away.
    const state = run([
      { type: 'SEND_STARTED', message: optimistic('c1', 'hello', '2020-05-14T10:00:00Z') },
      { type: 'SEND_FAILED', clientMessageId: 'c1', reason: 'Timed out' },
      {
        type: 'MESSAGES_RECEIVED',
        messages: [fromServer('msg_900', 'hello', '2020-05-14T10:00:00Z', 'c1', ME)],
        until: '2020-05-14T10:00:01Z'
      }
    ]);

    expect(visibleMessages(state)[0].status).toBe('sent');
    expect(visibleMessages(state)[0].failureReason).toBeUndefined();
    expect(state.order).toHaveLength(1);
  });
});

describe('ordering', () => {
  it('places incoming messages by timestamp, not arrival order', () => {
    const state = run([
      { type: 'MESSAGES_RECEIVED', messages: [fromServer('m3', 'third', '2020-05-14T10:03:00Z')], until: null },
      {
        type: 'MESSAGES_RECEIVED',
        messages: [
          fromServer('m1', 'first', '2020-05-14T10:01:00Z'),
          fromServer('m2', 'second', '2020-05-14T10:02:00Z')
        ],
        until: null
      }
    ]);

    expect(bodies(state)).toEqual(['first', 'second', 'third']);
  });

  it('is stable when two messages share a timestamp', () => {
    const state = run([
      {
        type: 'MESSAGES_RECEIVED',
        messages: [
          fromServer('m_b', 'b', '2020-05-14T10:01:00Z'),
          fromServer('m_a', 'a', '2020-05-14T10:01:00Z')
        ],
        until: null
      }
    ]);

    // Tie broken by id, so the order does not depend on which arrived first.
    expect(bodies(state)).toEqual(['a', 'b']);
  });

  it('keeps an optimistic message in place when the client clock runs fast', () => {
    // Our clock says 10:05; the server says the message was 10:02.
    const state = run([
      { type: 'MESSAGES_RECEIVED', messages: [fromServer('m1', 'theirs', '2020-05-14T10:03:00Z')], until: null },
      { type: 'SEND_STARTED', message: optimistic('c1', 'mine', '2020-05-14T10:05:00Z') },
      {
        type: 'SEND_SUCCEEDED',
        clientMessageId: 'c1',
        message: fromServer('msg_900', 'mine', '2020-05-14T10:02:00Z', 'c1', ME)
      }
    ]);

    expect(state.order).toHaveLength(2);
    expect(bodies(state)).toContain('mine');
    expect(bodies(state)).toContain('theirs');
  });
});

describe('the polling cursor', () => {
  it('advances only after the batch has been folded in', () => {
    const state = run([
      {
        type: 'MESSAGES_RECEIVED',
        messages: [fromServer('m1', 'hi', '2020-05-14T10:01:00Z')],
        until: '2020-05-14T10:01:30Z'
      }
    ]);

    expect(state.since).toBe('2020-05-14T10:01:30Z');
  });

  it('leaves the cursor alone when the server does not send one', () => {
    const state = run([
      { type: 'MESSAGES_RECEIVED', messages: [], until: '2020-05-14T10:01:30Z' },
      { type: 'MESSAGES_RECEIVED', messages: [], until: null }
    ]);

    expect(state.since).toBe('2020-05-14T10:01:30Z');
  });
});

describe('read receipts and deletion', () => {
  const withOne = run([
    { type: 'MESSAGES_RECEIVED', messages: [fromServer('m1', 'hi', '2020-05-14T10:01:00Z')], until: null }
  ]);

  it('records a read timestamp', () => {
    const state = messageReducer(withOne, { type: 'MARK_READ', id: 'm1', readAt: '2020-05-14T10:05:00Z' });
    expect(state.entities['m1'].readAt).toBe('2020-05-14T10:05:00Z');
  });

  it('does not move the read timestamp once it is set', () => {
    const once = messageReducer(withOne, { type: 'MARK_READ', id: 'm1', readAt: '2020-05-14T10:05:00Z' });
    const twice = messageReducer(once, { type: 'MARK_READ', id: 'm1', readAt: '2020-05-14T11:00:00Z' });

    expect(twice).toBe(once);
  });

  it('ignores a read receipt for a message we do not have', () => {
    expect(messageReducer(withOne, { type: 'MARK_READ', id: 'nope', readAt: 'x' })).toBe(withOne);
  });

  it('removes a deleted message from the order and both indexes', () => {
    const sent = run([
      { type: 'SEND_STARTED', message: optimistic('c1', 'oops', '2020-05-14T10:00:00Z') }
    ]);
    const state = messageReducer(sent, { type: 'DELETE', id: 'tmp_c1' });

    expect(state.order).toEqual([]);
    expect(state.byClientId['c1']).toBeUndefined();
  });

  it('ignores a delete for something already gone', () => {
    expect(messageReducer(withOne, { type: 'DELETE', id: 'nope' })).toBe(withOne);
  });
});

describe('immutability', () => {
  it('does not mutate the state it was given', () => {
    const before = run([
      { type: 'MESSAGES_RECEIVED', messages: [fromServer('m1', 'hi', '2020-05-14T10:01:00Z')], until: null }
    ]);
    const snapshot = JSON.stringify(before);

    messageReducer(before, { type: 'SEND_STARTED', message: optimistic('c9', 'new', '2020-05-14T10:09:00Z') });

    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('read receipt reconciliation', () => {
  const sentAt = '2020-05-14T10:00:00Z';
  const readAt = '2020-05-14T10:01:00Z';
  const server = fromServer('msg_read', 'hello', sentAt, 'read-client', ME);

  it.each(['poll', 'post'])('preserves a receipt across a stale %s response', route => {
    const state = run([
      { type: 'SEND_STARTED', message: optimistic('read-client', 'hello', sentAt) },
      { type: 'MESSAGES_RECEIVED', messages: [server], until: null },
      { type: 'MARK_READ', id: server.id, readAt }
    ]);
    const next = messageReducer(state, route === 'poll'
      ? { type: 'MESSAGES_RECEIVED', messages: [server], until: null }
      : { type: 'SEND_SUCCEEDED', clientMessageId: 'read-client', message: server });
    expect(next.entities[server.id].readAt).toBe(readAt);
    expect(next.order).toEqual([server.id]);
    expect(state.entities[server.id].readAt).toBe(readAt);
  });

  it('preserves a receipt when confirmation replaces the temporary ID', () => {
    const state = run([
      { type: 'SEND_STARTED', message: optimistic('read-client', 'hello', sentAt) },
      { type: 'MARK_READ', id: 'tmp_read-client', readAt },
      { type: 'SEND_SUCCEEDED', clientMessageId: 'read-client', message: server }
    ]);
    expect(state.entities[server.id].readAt).toBe(readAt);
    expect(state.entities['tmp_read-client']).toBeUndefined();
  });

  it('accepts an incoming receipt for an unread message', () => {
    const state = run([
      { type: 'MESSAGES_RECEIVED', messages: [server], until: null },
      { type: 'MESSAGES_RECEIVED', messages: [{ ...server, readAt }], until: null }
    ]);
    expect(state.entities[server.id].readAt).toBe(readAt);
  });
});
