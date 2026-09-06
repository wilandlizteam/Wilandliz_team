import { useEffect, useRef } from 'react';
import { COPY } from '@/config';
import { KeyIcon } from './Icons';

export function StepSuccess({ address }: { address: string }) {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    ref.current?.focus();
    window.scrollTo({ top: 0 });
  }, []);

  return (
    <section className="shell">
      <div className="success step-enter">
        <div className="success__mark" aria-hidden="true">
          <KeyIcon />
        </div>

        <h1 ref={ref} tabIndex={-1}>
          {COPY.successHeadline}
        </h1>
        <p>{COPY.successBody}</p>

        {address && (
          <div className="success__detail">
            Property we&rsquo;ll be looking at
            <strong>{address}</strong>
          </div>
        )}
      </div>
    </section>
  );
}
