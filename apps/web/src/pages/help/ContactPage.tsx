import { guestContactSchema, ticketSchema } from '@tzed/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { Alert, SubmitButton, TextareaField, TextField } from '../../components/Form';
import { useMe } from '../../lib/auth';
import { apiErrors, validate, type FieldErrors } from '../../lib/forms';
import { useCreateTicket } from '../../lib/support';

export function ContactPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const { data: me } = useMe();
  const create = useCreateTicket();
  const [values, setValues] = useState({
    name: '',
    email: '',
    subject: params.get('subject') ?? '',
    body: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const main = validate(ticketSchema, values);
    const guest = me ? { errors: null } : validate(guestContactSchema, values);
    const all = { ...(main.errors ?? {}), ...(guest.errors ?? {}) };
    setErrors(all);
    if (!Object.keys(all).length)
      create.mutate(me ? { subject: values.subject, body: values.body } : values);
  }

  if (create.isSuccess) {
    const { id, token } = create.data;
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-2xl font-semibold">{t('support.sentTitle')}</h1>
        <Alert kind="success">{t(token ? 'support.sentGuest' : 'support.sentUser', { id })}</Alert>
        <Link
          to={`/support/tickets/${id}${token ? `?token=${encodeURIComponent(token)}` : ''}`}
          className="inline-block font-medium text-brand-700 hover:underline"
        >
          {t('support.viewTicket')}
        </Link>
      </div>
    );
  }

  const server = apiErrors(create.error);
  const err = (k: string) => errors[k] ?? server.fields[k];
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link to="/help" className="text-sm text-brand-700 hover:underline">
        ← {t('help.back')}
      </Link>
      <h1 className="text-2xl font-semibold">{t('support.contactTitle')}</h1>
      <p className="text-stone-600">{t('support.contactIntro')}</p>
      <form
        onSubmit={onSubmit}
        noValidate
        className="space-y-4 rounded-xl border border-stone-200 bg-white p-5"
      >
        {server.message && <Alert>{server.message}</Alert>}
        {me ? (
          <p className="text-sm text-stone-600">{t('support.asUser', { email: me.email })}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={t('auth.fields.name')}
              value={values.name}
              onChange={(e) => setValues({ ...values, name: e.target.value })}
              error={err('name')}
              autoComplete="name"
            />
            <TextField
              label={t('auth.fields.email')}
              type="email"
              value={values.email}
              onChange={(e) => setValues({ ...values, email: e.target.value })}
              error={err('email')}
              autoComplete="email"
            />
          </div>
        )}
        <TextField
          label={t('support.subject')}
          value={values.subject}
          maxLength={200}
          onChange={(e) => setValues({ ...values, subject: e.target.value })}
          error={err('subject')}
        />
        <TextareaField
          label={t('support.message')}
          rows={6}
          maxLength={5000}
          value={values.body}
          onChange={(e) => setValues({ ...values, body: e.target.value })}
          error={err('body')}
          hint={t('support.messageHint')}
        />
        <SubmitButton pending={create.isPending}>{t('support.send')}</SubmitButton>
      </form>
    </div>
  );
}
