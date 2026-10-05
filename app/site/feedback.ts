/**
 * Sends feedback to the team's Google Apps Script and says what really
 * happened (the previous page always said "sent").
 *
 * Apps Script answers a POST by redirecting to its reply, served from
 * script.googleusercontent.com, and it redirects only once doPost has run
 * and returned that reply; when the script fails, it shows an error page
 * instead. Browsers cannot read the reply itself: following the redirect,
 * they send headers (Origin: null among them) that Google answers with 404.
 * So the page stops at the redirect and takes it as the confirmation.
 *
 * A server that replies directly is read: {"success": true} (or the earlier
 * {"ok": true}) confirms, {"success": false, "message": …} is a failure in
 * its own words, and a reply that says neither cannot be confirmed, which
 * the page says rather than claiming success.
 */

export interface FeedbackMessage {
  name: string;
  /** Where the team replies: required. */
  email: string;
  /** The form's "Company" field; the script has always called it organisation. */
  organisation: string;
  feedback: string;
  version: string;
}

export type FeedbackResult = 'sent' | 'failed' | 'unconfirmed' | 'offline';

export interface FeedbackOutcome {
  result: FeedbackResult;
  /** The script's own explanation of a problem, when it gives one. */
  detail?: string;
}

export const MIN_FEEDBACK_LENGTH = 25;

export const RESULT_TEXT: Record<FeedbackResult, { tone: 'pass' | 'warn' | 'fail'; text: string }> = {
  sent: { tone: 'pass', text: 'Message sent successfully. Thank you: it reached the Cable Tray Design team.' },
  failed: { tone: 'fail', text: 'Not sent: the feedback service reported a problem. Your message is still in the form; try again in a few minutes.' },
  unconfirmed: {
    tone: 'warn',
    text: 'The feedback service did not confirm that your message arrived. It is still in the form: if you do not hear back, send it again.',
  },
  offline: { tone: 'fail', text: 'You are offline, so nothing was sent. Your message is still in the form; send it when you are back online.' },
};

/** What the page says about an outcome: a problem the script explains is given in its own words. */
export function resultText({ result, detail }: FeedbackOutcome): string {
  if (result !== 'failed' || !detail) return RESULT_TEXT[result].text;
  return `Not sent: ${/[.!?]$/.test(detail) ? detail : `${detail}.`} Your message is still in the form.`;
}

export interface FeedbackProblems {
  name: boolean;
  email: boolean;
  feedback: boolean;
}

/** Something@something.something, without spaces: enough to catch a typo, without rejecting real addresses. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function checkFeedback(message: Pick<FeedbackMessage, 'name' | 'email' | 'feedback'>): FeedbackProblems {
  return { name: message.name.trim() === '', email: !EMAIL.test(message.email.trim()), feedback: message.feedback.trim().length < MIN_FEEDBACK_LENGTH };
}

/** The script's verdict, if its reply gives one: "success" (or the earlier "ok") is true or false. */
function verdict(reply: unknown): FeedbackOutcome | null {
  if (typeof reply !== 'object' || reply === null) return null;
  const fields = reply as Record<string, unknown>;
  const confirmed = 'success' in fields ? fields.success : fields.ok;
  if (confirmed === true) return { result: 'sent' };
  if (confirmed !== false) return null;
  const detail = typeof fields.message === 'string' ? fields.message.trim() : '';
  return detail ? { result: 'failed', detail } : { result: 'failed' };
}

export async function sendFeedback(
  endpoint: string,
  message: FeedbackMessage,
  send: typeof fetch = fetch,
  online: boolean = typeof navigator === 'undefined' ? true : navigator.onLine,
): Promise<FeedbackOutcome> {
  if (!online) return { result: 'offline' };
  let response: Response;
  try {
    // Plain text keeps this a simple request, which the script accepts without a preflight.
    response = await send(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...message, source: 'website' }),
      credentials: 'omit',
      redirect: 'manual',
    });
  } catch {
    // Either the network failed or the reply could not be read. The two look the same from the page.
    return { result: 'unconfirmed' };
  }
  // The script ran and returned its reply (see above).
  if (response.type === 'opaqueredirect') return { result: 'sent' };
  if (!response.ok) return { result: 'failed' };
  try {
    const outcome = verdict(await response.json());
    if (outcome) return outcome;
  } catch {
    // Not JSON: the script ran but did not say whether it saved the message.
  }
  return { result: 'unconfirmed' };
}
