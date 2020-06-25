import * as React from 'react';

interface Props {
  onSend: (body: string) => void;
  disabled?: boolean;
}

/**
 * The composer.
 *
 * Enter sends, Shift+Enter makes a new line. Whitespace-only messages are
 * refused rather than sent and quietly dropped by the API.
 */
export function MessageComposer({ onSend, disabled }: Props): JSX.Element {
  const [body, setBody] = React.useState('');
  const canSend = body.trim().length > 0 && !disabled;

  function submit(): void {
    if (!canSend) {
      return;
    }

    onSend(body.trim());
    setBody('');
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form
      className="composer"
      onSubmit={event => {
        event.preventDefault();
        submit();
      }}
    >
      <label htmlFor="composer-body" className="visually-hidden">
        Message
      </label>
      <textarea
        id="composer-body"
        className="composer__input"
        value={body}
        rows={2}
        placeholder="Write a message"
        disabled={disabled}
        onChange={event => setBody(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <button type="submit" className="composer__send" disabled={!canSend}>
        Send
      </button>
    </form>
  );
}
