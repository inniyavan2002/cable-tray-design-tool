/**
 * Sends feedback to the team's Google Apps Script and says what really
 * happened. The script confirms by replying {"ok": true}; a script that does
 * not reply that way cannot be confirmed, and the page says so instead of
 * claiming success (the previous page always said "sent").
 */

export interface FeedbackMessage {
  name: string;
  /** Optional: where to reply. */
  email: string;
  /** The form's "Company" field; the script has always called it organisation. */
  organisation: string;
  feedback: string;
  version: string;
}

export type FeedbackResult = 'sent' | 'failed' | 'unconfirmed' | 'offline';

export const MIN_FEEDBACK_LENGTH = 25;

export const RESULT_TEXT: Record<FeedbackResult, { tone: 'pass' | 'warn' | 'fail'; text: string }> = {
  sent: { tone: 'pass', text: 'Sent. Thank you: your message reached the Cable Tray Design team.' },
  failed: { tone: 'fail', text: 'Not sent: the feedback service reported a problem. Your message is still in the form; try again in a few minutes.' },
  unconfirmed: {
    tone: 'warn',
    text: 'The feedback service did not confirm that your message arrived. It is still in the form: if you do not hear back, send it again.',
  },
  offline: { tone: 'fail', text: 'You are offline, so nothing was sent. Your message is still in the form; send it when you are back online.' },
};

export interface FeedbackProblems {
  name: boolean;
  email: boolean;
  feedback: boolean;
}

/** Something@something.something, without spaces: enough to catch a typo, without rejecting real addresses. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function checkFeedback(message: Pick<FeedbackMessage, 'name' | 'email' | 'feedback'>): FeedbackProblems {
  const email = message.email.trim();
  return { name: message.name.trim() === '', email: email !== '' && !EMAIL.test(email), feedback: message.feedback.trim().length < MIN_FEEDBACK_LENGTH };
}

export async function sendFeedback(
  endpoint: string,
  message: FeedbackMessage,
  send: typeof fetch = fetch,
  online: boolean = typeof navigator === 'undefined' ? true : navigator.onLine,
): Promise<FeedbackResult> {
  if (!online) return 'offline';
  let response: Response;
  try {
    // Plain text keeps this a simple request, which the script accepts without a preflight.
    response = await send(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...message, source: 'website' }),
      credentials: 'omit',
    });
  } catch {
    // Either the network failed or the reply could not be read. The two look the same from the page.
    return 'unconfirmed';
  }
  if (!response.ok) return 'failed';
  try {
    const reply: unknown = await response.json();
    if (typeof reply === 'object' && reply !== null && 'ok' in reply) return reply.ok === true ? 'sent' : 'failed';
  } catch {
    // Not JSON: the script ran but did not say whether it saved the message.
  }
  return 'unconfirmed';
}
