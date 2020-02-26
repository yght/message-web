/**
 * A message as the API returns it.
 */
export interface ServerMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  sentAt: string;
  readAt: string | null;
}

export interface ConversationState {
  entities: { [id: string]: ServerMessage };
  /** Display order. Kept explicitly rather than sorted on render. */
  order: string[];
  /** The cursor for the next long poll. */
  since: string | null;
}
