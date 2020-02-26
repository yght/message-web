import { ConversationState, ServerMessage } from './types';

export const initialState: ConversationState = {
  entities: {},
  order: [],
  since: null
};

export type MessageEvent =
  | { type: 'MESSAGES_RECEIVED'; messages: ServerMessage[]; until: string | null }
  | { type: 'MARK_READ'; id: string; readAt: string }
  | { type: 'DELETE'; id: string };

/**
 * Where a message belongs in the order.
 *
 * Sorted by sentAt, with the id as a tie-break so the result is stable when
 * two messages share a timestamp - which happens more than you would think,
 * because the API stores whole seconds.
 */
function insertionIndex(state: ConversationState, message: ServerMessage): number {
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

function insert(state: ConversationState, message: ServerMessage): ConversationState {
  const order = state.order.slice();
  order.splice(insertionIndex(state, message), 0, message.id);

  return { ...state, entities: { ...state.entities, [message.id]: message }, order };
}

export function messageReducer(
  state: ConversationState,
  event: MessageEvent
): ConversationState {
  switch (event.type) {
    case 'MESSAGES_RECEIVED': {
      let next = state;

      for (const incoming of event.messages) {
        // The poll is at-least-once, so the same message can arrive twice.
        next = next.entities[incoming.id]
          ? { ...next, entities: { ...next.entities, [incoming.id]: incoming } }
          : insert(next, incoming);
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
      if (!state.entities[event.id]) {
        return state;
      }

      const entities = { ...state.entities };
      delete entities[event.id];

      return { ...state, entities, order: state.order.filter(id => id !== event.id) };
    }

    default:
      return state;
  }
}

export function visibleMessages(state: ConversationState): ServerMessage[] {
  return state.order.map(id => state.entities[id]);
}
