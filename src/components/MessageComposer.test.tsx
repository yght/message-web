import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MessageComposer } from './MessageComposer';

describe('MessageComposer', () => {
  it('sends what was typed', () => {
    const onSend = jest.fn();
    render(<MessageComposer onSend={onSend} />);

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'hello there' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSend).toHaveBeenCalledWith('hello there');
  });

  it('clears the box after sending', () => {
    render(<MessageComposer onSend={jest.fn()} />);
    const input = screen.getByLabelText('Message') as HTMLTextAreaElement;

    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(input.value).toBe('');
  });

  it('will not send an empty message', () => {
    const onSend = jest.fn();
    render(<MessageComposer onSend={onSend} />);

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSend).not.toHaveBeenCalled();
  });

  it('will not send whitespace only', () => {
    const onSend = jest.fn();
    render(<MessageComposer onSend={onSend} />);

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: '   \n  ' } });

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('trims what it sends', () => {
    const onSend = jest.fn();
    render(<MessageComposer onSend={onSend} />);

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: '  hello  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSend).toHaveBeenCalledWith('hello');
  });

  it('sends on Enter', () => {
    const onSend = jest.fn();
    render(<MessageComposer onSend={onSend} />);
    const input = screen.getByLabelText('Message');

    fireEvent.change(input, { target: { value: 'quick one' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    expect(onSend).toHaveBeenCalledWith('quick one');
  });

  it('does not send on Shift+Enter, so multi-line messages are possible', () => {
    const onSend = jest.fn();
    render(<MessageComposer onSend={onSend} />);
    const input = screen.getByLabelText('Message');

    fireEvent.change(input, { target: { value: 'line one' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });
});
