/**
 * A message as the API returns it.
 *
 * `clientMessageId` is the important one. We generate it before sending, the
 * API stores it alongside the message, and it comes back on every copy of
 * that message we ever see again - the POST response, the long poll, a
 * conversation refetch. It is how we recognise our own message coming back
 * to us and avoid showing it twice.
 */
export interface ServerMessage {
  id: string;
  clientMessageId: string | null;
  conversationId: string;
  senderId: string;
  body: string;
  sentAt: string;
  readAt: string | null;
}

export type DeliveryStatus = 'sending' | 'sent' | 'failed';

export interface Message extends ServerMessage {
  /**
   * Local only. The API has no concept of a message that has not arrived
   * yet, so this never round-trips.
   */
  status: DeliveryStatus;
  failureReason?: string;
}

export interface ConversationState {
  entities: { [id: string]: Message };
  /** Display order. Kept explicitly rather than sorted on render. */
  order: string[];
  /** clientMessageId -> the id currently holding that message. */
  byClientId: { [clientMessageId: string]: string };
  /** The cursor for the next long poll. */
  since: string | null;
}
