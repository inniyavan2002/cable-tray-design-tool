import { Send } from 'lucide-react';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { APP, CONFIG } from '../data';
import { checkFeedback, MIN_FEEDBACK_LENGTH, RESULT_TEXT, resultText, sendFeedback, type FeedbackOutcome } from '../feedback';
import { Reveal, SECTION, SectionHeading, Wrap } from './ui';

const input =
  'w-full rounded-lg border border-line-3 bg-bg px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-3 focus-visible:border-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 aria-[invalid=true]:border-fail motion-safe:transition-colors';
const TONE = { pass: 'bg-pass-bg text-pass', warn: 'bg-warn-bg text-warn', fail: 'bg-fail-bg text-fail' } as const;

/**
 * Questions, problems and suggestions, sent to the team's feedback sheet,
 * with the sender's email address for the reply. The form says the message
 * was sent only when the sheet confirms it (see feedback.ts).
 */
export function Contact() {
  const [values, setValues] = useState({ name: '', email: '', company: '', message: '' });
  const [trap, setTrap] = useState('');
  const [problems, setProblems] = useState({ name: false, email: false, feedback: false });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<FeedbackOutcome | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const messageInput = useRef<HTMLTextAreaElement>(null);
  const set = (key: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = checkFeedback({ name: values.name, email: values.email, feedback: values.message });
    setProblems(found);
    if (found.name || found.email || found.feedback) {
      (found.name ? nameInput : found.email ? emailInput : messageInput).current?.focus();
      return;
    }
    setResult(null);
    const clear = () => setValues({ name: '', email: '', company: '', message: '' });
    // A bot filled the hidden field: act as if sent, and send nothing.
    if (trap) {
      clear();
      setResult({ result: 'sent' });
      return;
    }
    setSending(true);
    const outcome = await sendFeedback(CONFIG.feedbackEndpoint, {
      name: values.name.trim(),
      email: values.email.trim(),
      organisation: values.company.trim(),
      feedback: values.message.trim(),
      version: APP.version,
    });
    setSending(false);
    if (outcome.result === 'sent') clear();
    setResult(outcome);
  };

  return (
    <section id="contact" aria-labelledby="contact-title" className={SECTION}>
      <Wrap className="grid items-start gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="grid gap-6 lg:sticky lg:top-28">
          <SectionHeading id="contact-title" intro="Report a wrong catalogue value, ask about the method or suggest a change. The team reads every message.">
            Get in touch
          </SectionHeading>
          <Reveal className="grid gap-3 rounded-xl border border-line-2 bg-surface px-5 py-4 text-[14.5px] text-ink-2">
            <p>
              <b className="text-ink">For a wrong catalogue value,</b> give the manufacturer, the cable and the catalogue page.
            </p>
            <p>The team replies to the email address you give.</p>
            {CONFIG.contactEmail && (
              <p>
                You can also email <a href={`mailto:${CONFIG.contactEmail}`}>{CONFIG.contactEmail}</a>.
              </p>
            )}
          </Reveal>
        </div>

        <Reveal>
          <form className="grid gap-4 rounded-2xl border border-line-2 bg-surface p-6 md:p-8" noValidate onSubmit={submit}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field id="ct-name" label="Name" error={problems.name ? 'Enter your name.' : undefined}>
                <input
                  ref={nameInput}
                  id="ct-name"
                  name="name"
                  autoComplete="name"
                  maxLength={120}
                  required
                  value={values.name}
                  onChange={set('name')}
                  aria-invalid={problems.name}
                  aria-describedby={problems.name ? 'ct-name-error' : undefined}
                  className={input}
                />
              </Field>
              <Field id="ct-email" label="Email" error={problems.email ? 'Enter your email address, like name@example.com, so the team can reply.' : undefined}>
                <input
                  ref={emailInput}
                  id="ct-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={200}
                  required
                  value={values.email}
                  onChange={set('email')}
                  aria-invalid={problems.email}
                  aria-describedby={problems.email ? 'ct-email-error' : undefined}
                  className={input}
                />
              </Field>
            </div>
            <Field id="ct-company" label="Company" optional>
              <input id="ct-company" name="company" autoComplete="organization" maxLength={180} value={values.company} onChange={set('company')} className={input} />
            </Field>
            <Field
              id="ct-message"
              label="Message"
              help={`At least ${MIN_FEEDBACK_LENGTH} characters.`}
              error={problems.feedback ? `Write at least ${MIN_FEEDBACK_LENGTH} characters, so the team can act on it.` : undefined}
            >
              <textarea
                ref={messageInput}
                id="ct-message"
                name="message"
                rows={6}
                minLength={MIN_FEEDBACK_LENGTH}
                required
                value={values.message}
                onChange={set('message')}
                aria-invalid={problems.feedback}
                aria-describedby={`ct-message-help${problems.feedback ? ' ct-message-error' : ''}`}
                className={`${input} resize-y`}
              />
            </Field>
            <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
              <label htmlFor="ct-website">Leave this field empty</label>
              <input id="ct-website" name="website" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 pt-1">
              <p className="text-[13.5px] text-ink-3">Sent to the Cable Tray Design team's feedback sheet, with the app version.</p>
              <button
                type="submit"
                disabled={sending}
                className="inline-flex items-center gap-2 rounded-lg border border-accent-strong bg-accent-strong px-5 py-3 text-[15px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] hover:bg-[#1e55d6] disabled:cursor-wait disabled:opacity-70 motion-safe:transition-colors motion-safe:active:scale-[0.97]"
              >
                {sending ? 'Sending…' : 'Send message'}
                <Send className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p role="status" aria-live="polite" data-result={result?.result} className={result ? `rounded-lg px-4 py-3 text-[14.5px] ${TONE[RESULT_TEXT[result.result].tone]}` : 'hidden'}>
              {result && resultText(result)}
            </p>
          </form>
        </Reveal>
      </Wrap>
    </section>
  );
}

function Field({ id, label, optional = false, help, error, children }: { id: string; label: string; optional?: boolean; help?: string; error?: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label} {optional && <span className="font-normal text-ink-3">(optional)</span>}
      </label>
      {children}
      {help && (
        <span id={`${id}-help`} className="text-[13px] text-ink-3">
          {help}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className="text-[13px] text-fail">
          {error}
        </span>
      )}
    </div>
  );
}
