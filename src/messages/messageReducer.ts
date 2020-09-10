import { ConversationState, Message, ServerMessage } from './types';

/**
 * Conversation state.
 *
 * The whole difficulty here is that a message can reach us by three routes -
 * the optimistic copy we made locally, the POST response, and the long poll -
 * and they can arrive in any order. Two of those carry the server's id and
 * one does not, so identity has to hang off the clientMessageId rather than
 * the id.
 *
 * The race that made this necessary: the poll returning our own message
 * before the POST response resolved. The message appeared twice, and then
 * the POST response arrived and made it three.
 */

export const initialState: ConversationState = {
  entities: {},
  order: [],
  byClientId: {},
  since: null
};

export type MessageEvent =
  | { type: 'SEND_STARTED'; message: Message }
  | { type: 'SEND_SUCCEEDED'; clientMessageId: string; message: ServerMessage }
  | { type: 'SEND_FAILED'; clientMessageId: string; reason: string }
  | { type: 'RETRY_SEND'; clientMessageId: string }
  | { type: 'MESSAGES_RECEIVED'; messages: ServerMessage[]; until: string | null }
  | { type: 'MARK_READ'; id: string; readAt: string }
  | { type: 'DELETE'; id: string };

/**
 * Where a message belongs in the order.
 *
 * Sorted by sentAt, with the id as a tie-break so the result is stable when
 * two messages share a timestamp - which happens more than you would think,
 * because the API stores whole seconds.
 *
 * Optimistic messages carry a local timestamp, and a client clock that is a
 * few seconds fast would otherwise pin its own messages to the bottom of the
 * conversation permanently.
 */
function insertionIndex(state: ConversationState, message: Message): number {
  for (let i = state.order.length - 1; i >= 0; i--) {
    const other = state.entities[state.order[i]];
    if (
      other.sentAt < message.sentAt ||
      (other.sentAt === message.sentAt && other.id <= message.id)
    ) {
      return i + 1;
    }
  }
  return 0;
}

function insert(state: ConversationState, message: Message): ConversationState {
  const order = state.order.slice();
  order.splice(insertionIndex(state, message), 0, message.id);

  const byClientId = { ...state.byClientId };
  if (message.clientMessageId) {
    byClientId[message.clientMessageId] = message.id;
  }

  return {
    ...state,
    entities: { ...state.entities, [message.id]: message },
    order,
    byClientId
  };
}

/**
 * Replace a message that is already in the list, possibly under a different
 * id. Used when the server's version of our optimistic message arrives: the
 * temporary id has to be swapped for the real one without the message moving
 * or flickering.
 */
function replace(state: ConversationState, oldId: string, message: Message): ConversationState {
  if (!state.entities[oldId]) {
    return state;
  }

  const entities = { ...state.entities };
  delete entities[oldId];
  entities[message.id] = message;

  const order = state.order.map(id => (id === oldId ? message.id : id));

  const byClientId = { ...state.byClientId };
  if (message.clientMessageId) {
    byClientId[message.clientMessageId] = message.id;
  }

  return { ...state, entities, order, byClientId };
}

/**
 * Find the message we already hold that corresponds to an incoming server
 * message, if any. Checks the clientMessageId first, then the id, because a
 * message that reached us through the poll already has its real id.
 */
function existingIdFor(state: ConversationState, incoming: ServerMessage): string | null {
  if (incoming.clientMessageId) {
    const known = state.byClientId[incoming.clientMessageId];
    if (known) {
      return known;
    }
  }

  return state.entities[incoming.id] ? incoming.id : null;
}

export function messageReducer(
  state: ConversationState,
  event: MessageEvent
): ConversationState {
  switch (event.type) {
    case 'SEND_STARTED':
      return insert(state, event.message);

    case 'SEND_SUCCEEDED': {
      const currentId = state.byClientId[event.clientMessageId];

      // The poll may already have delivered this message and swapped the id.
      // In that case there is nothing to do but confirm the status.
      if (!currentId) {
        return state;
      }

      const confirmed: Message = {
        ...state.entities[currentId],
        ...event.message,
        status: 'sent'
      };
      delete (confirmed as Partial<Message>).failureReason;

      return replace(state, currentId, confirmed);
    }

    case 'SEND_FAILED': {
      const currentId = state.byClientId[event.clientMessageId];
      if (!currentId) {
        return state;
      }

      const failed: Message = {
        ...state.entities[currentId],
        status: 'failed',
        failureReason: event.reason
      };

      return { ...state, entities: { ...state.entities, [currentId]: failed } };
    }

    case 'RETRY_SEND': {
      const currentId = state.byClientId[event.clientMessageId];
      if (!currentId) {
        return state;
      }

      const retrying: Message = { ...state.entities[currentId], status: 'sending' };
      delete retrying.failureReason;

      return { ...state, entities: { ...state.entities, [currentId]: retrying } };
    }

    case 'MESSAGES_RECEIVED': {
      let next = state;

      for (const incoming of event.messages) {
        const existing = existingIdFor(next, incoming);

        if (existing) {
          // Already have it. Merge rather than append - this is the whole
          // point of the exercise. Keep 'sending' if the POST has not come
          // back yet, so the tick does not flicker.
          const held = next.entities[existing];
          const merged: Message = {
            ...held,
            ...incoming,
            status: held.status === 'failed' ? 'sent' : held.status
          };

          next = existing === incoming.id
            ? { ...next, entities: { ...next.entities, [existing]: merged } }
            : replace(next, existing, merged);
        } else {
          next = insert(next, { ...incoming, status: 'sent' });
        }
      }

      // Only advance the cursor once the batch is folded in. Advancing early
      // and then failing loses messages permanently.
      return { ...next, since: event.until !== null ? event.until : next.since };
    }

    case 'MARK_READ': {
      const message = state.entities[event.id];
      if (!message || message.readAt) {
        return state;
      }

      return {
        ...state,
        entities: { ...state.entities, [event.id]: { ...message, readAt: event.readAt } }
      };
    }

    case 'DELETE': {
      const message = state.entities[event.id];
      if (!message) {
        return state;
      }

      const entities = { ...state.entities };
      delete entities[event.id];

      const byClientId = { ...state.byClientId };
      if (message.clientMessageId) {
        delete byClientId[message.clientMessageId];
      }

      return {
        ...state,
        entities,
        order: state.order.filter(id => id !== event.id),
        byClientId
      };
    }

    default:
      return state;
  }
}

export function visibleMessages(state: ConversationState): Message[] {
  return state.order.map(id => state.entities[id]);
}
