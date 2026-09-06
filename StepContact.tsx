import { useEffect, useRef, useState } from 'react';
import { COPY, TIMELINE_OPTIONS } from '@/config';
import {
  formatPhone,
  validateContact,
  type FieldErrors,
  type LeadDraft,
} from '@/lib/validation';
import { Field } from './Field';
import { AlertIcon, ArrowLeftIcon, CheckIcon, HomeIcon } from './Icons';
import portrait from '@/assets/wil-and-liz.webp';

type Props = {
  draft: LeadDraft;
  update: (patch: Partial<LeadDraft>) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
  submitError: string | null;
};

export function StepContact({
  draft,
  update,
  onBack,
  onSubmit,
  submitting,
  submitError,
}: Props) {
  const [errors, setErrors] = useState<FieldErrors>({});
  /** Errors appear only after a submit attempt, then update live as fields are fixed. */
  const [attempted, setAttempted] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (submitError) errorRef.current?.scrollIntoView({ block: 'nearest' });
  }, [submitError]);

  function revalidate(next: LeadDraft) {
    if (attempted) setErrors(validateContact(next));
  }

  function patch(p: Partial<LeadDraft>) {
    update(p);
    revalidate({ ...draft, ...p });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const found = validateContact(draft);
    setAttempted(true);
    setErrors(found);

    const firstBad = Object.keys(found)[0];
    if (firstBad) {
      const el = document.getElementById(
        firstBad === 'timeline' ? 'timeline-group' : firstBad,
      );
      el?.focus?.();
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    onSubmit();
  }

  return (
    <section className="shell step-two step-enter">
      <div className="panel">
        <button type="button" className="btn-back" onClick={onBack} disabled={submitting}>
          <ArrowLeftIcon /> Back
        </button>

        <div className="step-marker">
          <span className="step-marker__bar" data-on="true" />
          <span className="step-marker__bar" data-on="true" />
          <span className="step-marker__text">Step 2 of 2</span>
        </div>

        <h1
          className="headline"
          ref={headingRef}
          tabIndex={-1}
          style={{ fontSize: 'clamp(1.85rem, 5.2vw, 2.6rem)', marginBottom: '0.6rem' }}
        >
          {COPY.step2Headline}
        </h1>
        <p className="subtitle" style={{ marginBottom: '1.75rem' }}>
          {COPY.step2Sub}
        </p>

        {/* The address is carried forward, never re-typed. */}
        <div className="recall">
          <HomeIcon size={18} />
          <div>
            <div className="recall__label">Your property</div>
            <div className="recall__value">{draft.propertyAddress}</div>
          </div>
          <button type="button" className="recall__edit" onClick={onBack} disabled={submitting}>
            Edit
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="grid-2">
            <Field
              id="firstName"
              label="First name"
              value={draft.firstName}
              required
              autoComplete="given-name"
              autoCapitalize="words"
              enterKeyHint="next"
              error={errors.firstName}
              onChange={(e) => patch({ firstName: e.target.value })}
            />
            <Field
              id="lastName"
              label="Last name"
              value={draft.lastName}
              required
              autoComplete="family-name"
              autoCapitalize="words"
              enterKeyHint="next"
              error={errors.lastName}
              onChange={(e) => patch({ lastName: e.target.value })}
            />
          </div>

          <Field
            id="email"
            label="Email"
            type="email"
            inputMode="email"
            value={draft.email}
            required
            autoComplete="email"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="next"
            error={errors.email}
            onChange={(e) => patch({ email: e.target.value })}
          />

          <Field
            id="phone"
            label="Phone number"
            type="tel"
            inputMode="tel"
            value={draft.phone}
            required
            autoComplete="tel-national"
            enterKeyHint="done"
            placeholder="(555) 123-4567"
            error={errors.phone}
            onChange={(e) => patch({ phone: formatPhone(e.target.value) })}
          />

          <fieldset className="timeline" data-invalid={errors.timeline ? 'true' : 'false'}>
            <legend className="timeline__legend">{COPY.timelineLabel}</legend>

            <div
              className="timeline__options"
              id="timeline-group"
              role="radiogroup"
              aria-labelledby={undefined}
              aria-describedby={errors.timeline ? 'timeline-error' : undefined}
            >
              {TIMELINE_OPTIONS.map((opt) => {
                const selected = draft.timeline === opt.value;
                return (
                  <label
                    key={opt.value}
                    className="choice"
                    data-selected={selected ? 'true' : 'false'}
                  >
                    <input
                      type="radio"
                      name="timeline"
                      value={opt.value}
                      checked={selected}
                      onChange={() => patch({ timeline: opt.value })}
                    />
                    <CheckIcon size={17} className="choice__check" />
                    <span>{opt.label}</span>
                  </label>
                );
              })}
            </div>

            {errors.timeline && (
              <p className="field__error" id="timeline-error" role="alert">
                <AlertIcon />
                <span>{errors.timeline}</span>
              </p>
            )}
          </fieldset>

          {submitError && (
            <div className="submit-error" ref={errorRef} role="alert">
              <AlertIcon size={16} />
              <span>{submitError}</span>
            </div>
          )}

          <div style={{ marginTop: '1.6rem' }}>
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? (
                <>
                  <span className="btn__spinner" aria-hidden="true" />
                  SENDING…
                </>
              ) : (
                COPY.step2Cta
              )}
            </button>
          </div>

          {/* Announces the busy state to screen readers without a visual change. */}
          <p className="sr-only" role="status" aria-live="polite">
            {submitting ? 'Sending your request, please wait.' : ''}
          </p>

          <p className="form-footnote">
            By submitting, you agree that the Wil &amp; Liz Team may contact you about
            selling your home. Message and data rates may apply.
          </p>
        </form>
      </div>

      {/*
        Wide screens only. Carries the same portrait through from step 1 so the
        two steps read as one experience and the visitor can see who they are
        handing their details to. No extra copy, no extra asks.
      */}
      <aside className="step-two__aside" aria-hidden="true">
        <img src={portrait} width={694} height={960} alt="" decoding="async" />
      </aside>
    </section>
  );
}
