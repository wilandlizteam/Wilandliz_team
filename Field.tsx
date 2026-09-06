import { forwardRef } from 'react';
import { AlertIcon } from './Icons';

type FieldProps = {
  id: string;
  label: string;
  error?: string;
  /** Rendered under the input, always visible. */
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>;

/**
 * A labelled text input with accessible error reporting.
 *
 * Errors are surfaced with three independent signals — border colour, a
 * background tint, and an icon + message — so the state never depends on
 * colour alone. The message is linked via aria-describedby and announced by
 * role="alert" the moment it appears.
 */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { id, label, error, hint, required, ...inputProps },
  ref,
) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {!required && <span className="field__req"> (optional)</span>}
      </label>

      <input
        {...inputProps}
        id={id}
        ref={ref}
        required={required}
        className="input"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />

      {hint && (
        <p id={hintId} className="form-footnote" style={{ marginTop: '0.4rem' }}>
          {hint}
        </p>
      )}

      {error && (
        <p className="field__error" id={errorId} role="alert">
          <AlertIcon />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
});
