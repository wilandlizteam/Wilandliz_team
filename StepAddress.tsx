import { useRef, useState } from 'react';
import { COPY, HERO_BACKGROUND } from '@/config';
import { validateAddress } from '@/lib/validation';
import { Field } from './Field';
import portrait from '@/assets/wil-and-liz.webp';

type Props = {
  value: string;
  onChange: (v: string) => void;
  onContinue: () => void;
};

/** Step 1 — the hero. One question, one button. */
export function StepAddress({ value, onChange, onContinue }: Props) {
  const [error, setError] = useState<string | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const message = validateAddress(value);
    if (message) {
      setError(message);
      inputRef.current?.focus();
      return;
    }
    setError(undefined);
    onContinue();
  }

  return (
    <section
      className={HERO_BACKGROUND ? 'hero hero--photo' : 'hero'}
      style={
        HERO_BACKGROUND
          ? ({
              '--hero-bg': `url(${HERO_BACKGROUND.large})`,
              '--hero-bg-sm': `url(${HERO_BACKGROUND.small})`,
            } as React.CSSProperties)
          : undefined
      }
    >
      {HERO_BACKGROUND && (
        <>
          <div className="hero__bg" aria-hidden="true" />
          <div className="hero__scrim" aria-hidden="true" />
        </>
      )}

      <div className="shell hero__grid">
        {/* The glass card carries the copy and the form as one calm surface,
            so the photograph behind it can stay bright and legible. */}
        <div className="hero__copy glass rise">
          <p className="eyebrow rise">Southern California Home Sellers</p>

          <h1 className="headline rise d1">{COPY.headline}</h1>
          <p className="subtitle rise d2">{COPY.subtitle}</p>

          <form className="panel rise d3" onSubmit={handleSubmit} noValidate>
            <Field
              ref={inputRef}
              id="property-address"
              name="propertyAddress"
              label={COPY.addressLabel}
              placeholder={COPY.addressPlaceholder}
              value={value}
              required
              autoComplete="street-address"
              enterKeyHint="go"
              autoCapitalize="words"
              spellCheck={false}
              error={error}
              onChange={(e) => {
                onChange(e.target.value);
                if (error) setError(undefined);
              }}
            />

            <div style={{ marginTop: '1.15rem' }}>
              <button type="submit" className="btn">
                {COPY.step1Cta}
              </button>
            </div>

            <p className="form-footnote">
              No obligation, and we never sell your information.
            </p>
          </form>
        </div>

        <div className="hero__portrait-band">
          <div className="hero__portrait rise-photo d4">
            <img
              src={portrait}
              width={694}
              height={960}
              alt="Wil Olguin and Liz Lee of the Wil &amp; Liz Real Estate Team"
              fetchPriority="high"
              decoding="async"
            />
            <div className="hero__credit">
              <div className="hero__credit-name">Wil &amp; Liz Team</div>
              <div className="hero__credit-sub">
                <span className="ehomes">ehomes</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
