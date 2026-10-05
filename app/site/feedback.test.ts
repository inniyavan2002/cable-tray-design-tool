import { describe, expect, it, vi } from 'vitest';
import { checkFeedback, resultText, sendFeedback, type FeedbackMessage } from './feedback';

const message: FeedbackMessage = {
  name: 'A. Engineer',
  email: 'a.engineer@example.com',
  organisation: '',
  feedback: 'The Oman 4C 6 mm² weight shows as unknown.',
  version: '1.0.0',
};
const reply = (body: string, status = 200) => vi.fn(async () => new Response(body, { status }));
/** What the team's script replies when it has saved the message and emailed the team. */
const SCRIPT_SENT = '{"success":true,"message":"Feedback submitted successfully."}';

describe('feedback', () => {
  it('asks for a name, an email address to reply to, and at least 25 characters', () => {
    expect(checkFeedback({ name: ' ', email: '', feedback: 'too short' })).toEqual({ name: true, email: true, feedback: true });
    expect(checkFeedback(message)).toEqual({ name: false, email: false, feedback: false });
    expect(checkFeedback({ ...message, email: 'a.engineer@example' }).email).toBe(true);
    expect(checkFeedback({ ...message, email: ' a.engineer@example.com ' }).email).toBe(false);
  });

  it('is sent when Apps Script redirects to its reply, which browsers are not given', async () => {
    // What a browser sees when the page stops at the script's redirect.
    const send = vi.fn(async () => ({ type: 'opaqueredirect', ok: false, status: 0 }) as Response);
    expect(await sendFeedback('https://example.test/exec', message, send, true)).toEqual({ result: 'sent' });
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://example.test/exec');
    expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, credentials: 'omit', redirect: 'manual' });
  });

  it('is sent when a server that replies directly confirms it', async () => {
    const send = reply(SCRIPT_SENT);
    expect(await sendFeedback('https://example.test/exec', message, send, true)).toEqual({ result: 'sent' });
    const [, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ ...message, source: 'website' });
    // The earlier form of the confirmation still counts.
    expect(await sendFeedback('x', message, reply('{"ok":true}'), true)).toEqual({ result: 'sent' });
  });

  it('reports a failure the script or server reports, in the script’s words when it gives them', async () => {
    const refused = await sendFeedback('x', message, reply('{"success":false,"message":"The feedback sheet could not be opened"}'), true);
    expect(refused).toEqual({ result: 'failed', detail: 'The feedback sheet could not be opened' });
    expect(resultText(refused)).toBe('Not sent: The feedback sheet could not be opened. Your message is still in the form.');
    expect(await sendFeedback('x', message, reply('{"ok":false}'), true)).toEqual({ result: 'failed' });
    expect(resultText({ result: 'failed' })).toMatch(/^Not sent: the feedback service reported a problem/);
    expect(await sendFeedback('x', message, reply('error', 500), true)).toEqual({ result: 'failed' });
  });

  it('does not claim success when the reply cannot be read or says nothing either way', async () => {
    expect(await sendFeedback('x', message, reply('<html>The script completed</html>'), true)).toEqual({ result: 'unconfirmed' });
    expect(await sendFeedback('x', message, reply('{"message":"Received"}'), true)).toEqual({ result: 'unconfirmed' });
    const blocked = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await sendFeedback('x', message, blocked, true)).toEqual({ result: 'unconfirmed' });
  });

  it('sends nothing while offline', async () => {
    const send = reply(SCRIPT_SENT);
    expect(await sendFeedback('x', message, send, false)).toEqual({ result: 'offline' });
    expect(send).not.toHaveBeenCalled();
  });

  it('confirms in so many words', () => {
    expect(resultText({ result: 'sent' })).toMatch(/^Message sent successfully\./);
  });
});
