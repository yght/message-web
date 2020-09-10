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

  it('keeps the sending tick until the POST confirms, even after the poll arrives', () => {
    const state = run([
      { type: 'SEND_STARTED', message: optimistic('c1', 'hello', '2020-05-14T10:00:00Z') },
      {
        type: 'MESSAGES_RECEIVED',
        messages: [fromServer('msg_900', 'hello', '2020-05-14T10:00:00Z', 'c1', ME)],
        until: '2020-05-14T10:00:01Z'
      }
    ]);

    // The message is now under its real id, but we have not heard back from
    // our own request, so it is still in flight as far as we know.
    expect(state.order).toEqual(['msg_900']);
    expect(visibleMessages(state)[0].status).toBe('sending');
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
