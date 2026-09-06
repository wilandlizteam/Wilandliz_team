import { useEffect, useRef, useState } from 'react';
import { Masthead, SiteFooter } from '@/components/Chrome';
import { StepAddress } from '@/components/StepAddress';
import { StepContact } from '@/components/StepContact';
import { StepSuccess } from '@/components/StepSuccess';
import { captureAttribution } from '@/lib/attribution';
import { initPixel, trackLead } from '@/lib/pixel';
import { submitLead } from '@/lib/submitLead';
import { createId, type LeadDraft } from '@/lib/validation';

type Step = 'address' | 'contact' | 'success';

const EMPTY: LeadDraft = {
  propertyAddress: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  timeline: '',
};

export default function App() {
  const [step, setStep] = useState<Step>('address');
  const [draft, setDraft] = useState<LeadDraft>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /**
   * One id per completed lead. Reused across retries so a submission that
   * actually succeeded but appeared to fail (timeout, dropped connection)
   * cannot become a duplicate record in the CRM. Also passed to Meta as the
   * event ID for conversion deduplication.
   */
  const submissionId = useRef<string>(createId());
  /** Belt and braces against a double-tap racing past the disabled attribute. */
  const inFlight = useRef(false);

  useEffect(() => {
    captureAttribution();
    initPixel(); // fires PageView once, here and nowhere else
  }, []);

  function update(patch: Partial<LeadDraft>) {
    setDraft((d) => ({ ...d, ...patch }));
    if (submitError) setSubmitError(null);
  }

  function goToContact() {
    setStep('contact');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setSubmitError(null);

    const result = await submitLead(draft, submissionId.current);

    if (result.ok) {
      // The ONLY place the Lead conversion fires: after the server confirmed
      // Follow Up Boss accepted the lead.
      trackLead(submissionId.current);
      setStep('success');
      setSubmitting(false);
      // Deliberately leave inFlight locked — this lead is done.
      return;
    }

    setSubmitError(result.message);
    setSubmitting(false);
    inFlight.current = false;
  }

  return (
    <div className="page">
      <a className="skip-link" href="#main">
        Skip to form
      </a>

      <Masthead />

      <main id="main">
        {step === 'address' && (
          <StepAddress
            value={draft.propertyAddress}
            onChange={(propertyAddress) => update({ propertyAddress })}
            onContinue={goToContact}
          />
        )}

        {step === 'contact' && (
          <StepContact
            draft={draft}
            update={update}
            onBack={() => setStep('address')}
            onSubmit={handleSubmit}
            submitting={submitting}
            submitError={submitError}
          />
        )}

        {step === 'success' && <StepSuccess address={draft.propertyAddress} />}
      </main>

      <SiteFooter />
    </div>
  );
}
