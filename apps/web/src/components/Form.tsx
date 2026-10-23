import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { useId } from 'react';

const inputClass =
  'block w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 aria-[invalid=true]:border-red-500 aria-[invalid=true]:ring-red-100 border-stone-300 focus:border-brand-600 focus:ring-brand-100';

interface FieldProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  children: (props: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby'?: string;
  }) => ReactNode;
}

export function Field({ label, error, hint, children }: FieldProps) {
  const id = useId();
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ');
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-stone-800">
        {label}
      </label>
      {children({
        id,
        'aria-invalid': Boolean(error),
        'aria-describedby': describedBy || undefined,
      })}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-stone-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: ReactNode;
};

export function TextField({ label, error, hint, className, ...props }: InputProps) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(a11y) => <input {...a11y} {...props} className={`${inputClass} ${className ?? ''}`} />}
    </Field>
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
  hint?: ReactNode;
};

export function SelectField({ label, error, hint, children, ...props }: SelectProps) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(a11y) => (
        <select {...a11y} {...props} className={inputClass}>
          {children}
        </select>
      )}
    </Field>
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
  hint?: ReactNode;
};

export function TextareaField({ label, error, hint, ...props }: TextareaProps) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(a11y) => <textarea {...a11y} {...props} className={inputClass} />}
    </Field>
  );
}

export function SubmitButton({
  pending,
  children,
  variant = 'primary',
}: {
  pending?: boolean;
  children: ReactNode;
  variant?: 'primary' | 'danger';
}) {
  const colours =
    variant === 'danger' ? 'bg-red-700 hover:bg-red-800' : 'bg-brand-700 hover:bg-brand-800';
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60 ${colours}`}
    >
      {children}
    </button>
  );
}

export function Alert({
  kind = 'error',
  children,
}: {
  kind?: 'error' | 'success' | 'info';
  children: ReactNode;
}) {
  const styles = {
    error: 'border-red-200 bg-red-50 text-red-800',
    success: 'border-brand-100 bg-brand-50 text-brand-800',
    info: 'border-amber-200 bg-amber-50 text-amber-900',
  }[kind];
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={`rounded-lg border px-4 py-3 text-sm ${styles}`}
    >
      {children}
    </div>
  );
}

export function Card({
  title,
  children,
  description,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 md:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-stone-600">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
