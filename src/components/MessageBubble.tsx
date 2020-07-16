import * as React from 'react';
import { Message } from '../messages/types';

interface Props {
  message: Message;
  isMine: boolean;
}

/**
 * One message.
 *
 * The delivery state is announced to screen readers as well as shown, because
 * "did that send?" is the single most common thing a user needs to know and a
 * grey tick communicates nothing to anybody not looking at it.
 */
export function MessageBubble({ message, isMine }: Props): JSX.Element {

  return (
    <li className={'bubble' + (isMine ? ' bubble--mine' : '')}>
      <p className="bubble__body">{message.body}</p>

      <span className="bubble__meta">
        <time dateTime={message.sentAt}>{formatTime(message.sentAt)}</time>

        {isMine && (
          <span className="bubble__status">
            {message.status === 'sending' && <span aria-label="Sending">·</span>}
            {message.status === 'sent' && !message.readAt && <span aria-label="Sent">✓</span>}
            {message.status === 'sent' && message.readAt && <span aria-label="Read">✓✓</span>}
          </span>
        )}
      </span>

    </li>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return hours + ':' + minutes;
}
