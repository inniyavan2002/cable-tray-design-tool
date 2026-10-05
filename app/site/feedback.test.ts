import { describe, expect, it, vi } from 'vitest';
import { checkFeedback, sendFeedback, type FeedbackMessage } from './feedback';

const message: FeedbackMessage = { name: 'A. Engineer', email: '', organisation: '', feedback: 'The Oman 4C 6 mm² weight shows as unknown.', version: '1.0.0' };
const reply = (body: string, status = 200) => vi.fn(async () => new Response(body, { status }));

describe('feedback', () => {
  it('asks for a name and at least 25 characters, and an email only in a usable form', () => {
    expect(checkFeedback({ name: ' ', email: '', feedback: 'too short' })).toEqual({ name: true, email: false, feedback: true });
    expect(checkFeedback(message)).toEqual({ name: false, email: false, feedback: false });
    expect(checkFeedback({ ...message, email: 'a.engineer@example' }).email).toBe(true);
    expect(checkFeedback({ ...message, email: ' a.engineer@example.com ' }).email).toBe(false);
  });

  it('is sent only when the script confirms it', async () => {
    const send = reply('{"ok":true}');
    expect(await sendFeedback('https://example.test/exec', message, send, true)).toBe('sent');
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://example.test/exec');
    expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, credentials: 'omit' });
    expect(JSON.parse(init.body as string)).toEqual({ ...message, source: 'website' });
  });

  it('reports a failure the script or server reports', async () => {
    expect(await sendFeedback('x', message, reply('{"ok":false}'), true)).toBe('failed');
    expect(await sendFeedback('x', message, reply('error', 500), true)).toBe('failed');
  });

  it('does not claim success when the reply cannot be read', async () => {
    expect(await sendFeedback('x', message, reply('<html>The script completed</html>'), true)).toBe('unconfirmed');
    const blocked = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await sendFeedback('x', message, blocked, true)).toBe('unconfirmed');
  });

  it('sends nothing while offline', async () => {
    const send = reply('{"ok":true}');
    expect(await sendFeedback('x', message, send, false)).toBe('offline');
    expect(send).not.toHaveBeenCalled();
  });
});
