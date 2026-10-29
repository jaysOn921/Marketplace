import { useMutation } from '@tanstack/react-query';
import {
  twoStepCodeSchema,
  twoStepDisableSchema,
  type BackupCodesResponse,
  type MeResponse,
  type SessionUser,
  type TwoStepSetupResponse,
} from '@tzed/shared';
import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { post } from '../lib/api';
import { useSetMe } from '../lib/auth';
import { apiErrors, validate, type FieldErrors } from '../lib/forms';
import { Alert, Card, SubmitButton, TextField } from './Form';

const buttonClass =
  'rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50';

/** Two-step sign-in under My account: set up with an authenticator app, backup codes, turn off. */
export function TwoStepSettings({ user }: { user: SessionUser }) {
  const { t } = useTranslation();
  const [codes, setCodes] = useState<string[] | null>(null);
  const { hash } = useLocation();
  useEffect(() => {
    // Admins are sent here from the admin area (/account#two-step).
    if (hash === '#two-step') document.getElementById('two-step')?.scrollIntoView?.();
  }, [hash]);
  return (
    <div id="two-step">
      <Card title={t('account.twoStep.title')} description={t('account.twoStep.intro')}>
        {user.twoStepRequired && !user.twoStepEnabled && !codes && (
          <div className="mb-4">
            <Alert kind="info">{t('account.twoStep.requiredForAdmins')}</Alert>
          </div>
        )}
        {codes ? (
          <BackupCodes codes={codes} onDone={() => setCodes(null)} />
        ) : user.twoStepEnabled ? (
          <Enabled user={user} onNewCodes={setCodes} />
        ) : (
          <Setup onEnabled={setCodes} />
        )}
      </Card>
    </div>
  );
}

function Setup({ onEnabled }: { onEnabled: (codes: string[]) => void }) {
  const { t } = useTranslation();
  const setMe = useSetMe();
  const start = useMutation({
    mutationFn: () => post<TwoStepSetupResponse>('/me/two-step/setup'),
  });
  const enable = useMutation({
    mutationFn: (code: string) =>
      post<MeResponse & BackupCodesResponse>('/me/two-step/enable', { code }),
    onSuccess: (data) => {
      onEnabled(data.backupCodes);
      setMe(data.user);
    },
  });
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const url = start.data?.otpauthUrl;
  useEffect(() => {
    if (!url) return;
    void QRCode.toString(url, { type: 'svg', margin: 1, width: 192 }).then(setQr);
  }, [url]);

  if (!start.data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-stone-700">{t('account.twoStep.offText')}</p>
        {start.error && <Alert>{apiErrors(start.error).message}</Alert>}
        <button
          type="button"
          className={buttonClass}
          disabled={start.isPending}
          onClick={() => start.mutate()}
        >
          {t('account.twoStep.turnOn')}
        </button>
      </div>
    );
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { data, errors } = validate(twoStepCodeSchema, { code });
    setErrors(errors ?? {});
    if (data) enable.mutate(data.code);
  }

  const server = apiErrors(enable.error);
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <ol className="list-decimal space-y-2 pl-5 text-sm text-stone-700">
        <li>{t('account.twoStep.step1')}</li>
        <li>{t('account.twoStep.step2')}</li>
      </ol>
      {qr && (
        <div
          role="img"
          aria-label={t('account.twoStep.qrLabel')}
          className="w-48 rounded-lg border border-stone-200 bg-white p-1"
          // Generated locally from our own otpauth link: an SVG of black squares.
          dangerouslySetInnerHTML={{ __html: qr }}
        />
      )}
      <p className="text-sm text-stone-700">
        {t('account.twoStep.manual')}{' '}
        <code className="break-all rounded bg-stone-100 px-1.5 py-0.5 font-mono text-sm">
          {start.data.secret.replace(/(.{4})/g, '$1 ').trim()}
        </code>
      </p>
      <TextField
        label={t('account.twoStep.step3')}
        inputMode="numeric"
        autoComplete="one-time-code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        error={errors.code ?? server.fields.code}
      />
      {server.message && !server.fields.code && <Alert>{server.message}</Alert>}
      <SubmitButton pending={enable.isPending}>{t('account.twoStep.confirm')}</SubmitButton>
    </form>
  );
}

function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const { t } = useTranslation();
  const text = `${t('account.twoStep.codesFileTitle')}\n\n${codes.join('\n')}\n`;
  return (
    <div className="space-y-4">
      <Alert kind="success">{t('account.twoStep.codesIntro')}</Alert>
      <ul
        aria-label={t('account.twoStep.codesLabel')}
        className="grid grid-cols-2 gap-2 rounded-lg bg-stone-50 p-4 font-mono text-sm sm:grid-cols-5"
      >
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3">
        <a
          className={buttonClass}
          download="tzed-backup-codes.txt"
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`}
        >
          {t('account.twoStep.download')}
        </a>
        <button type="button" className={buttonClass} onClick={onDone}>
          {t('account.twoStep.savedThem')}
        </button>
      </div>
    </div>
  );
}

function Enabled({ user, onNewCodes }: { user: SessionUser; onNewCodes: (c: string[]) => void }) {
  const { t } = useTranslation();
  const setMe = useSetMe();
  const [mode, setMode] = useState<'idle' | 'codes' | 'off'>('idle');
  const [values, setValues] = useState({ code: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const regenerate = useMutation({
    mutationFn: (code: string) => post<BackupCodesResponse>('/me/two-step/backup-codes', { code }),
    onSuccess: (data) => onNewCodes(data.backupCodes),
  });
  const disable = useMutation({
    mutationFn: (input: { code: string; password: string }) =>
      post<MeResponse>('/me/two-step/disable', input),
    onSuccess: (data) => setMe(data.user),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (mode === 'codes') {
      const { data, errors } = validate(twoStepCodeSchema, { code: values.code });
      setErrors(errors ?? {});
      if (data) regenerate.mutate(data.code);
    } else {
      const { data, errors } = validate(twoStepDisableSchema, values);
      setErrors(errors ?? {});
      if (data) disable.mutate(data);
    }
  }

  const server = apiErrors(mode === 'codes' ? regenerate.error : disable.error);
  if (mode === 'idle') {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-brand-800">{t('account.twoStep.onText')}</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className={buttonClass} onClick={() => setMode('codes')}>
            {t('account.twoStep.newCodes')}
          </button>
          {!user.twoStepRequired && (
            <button type="button" className={buttonClass} onClick={() => setMode('off')}>
              {t('account.twoStep.turnOff')}
            </button>
          )}
        </div>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {server.message && !server.fields.code && !server.fields.password && (
        <Alert>{server.message}</Alert>
      )}
      {mode === 'off' && (
        <TextField
          label={t('auth.fields.password')}
          type="password"
          autoComplete="current-password"
          value={values.password}
          onChange={(e) => setValues({ ...values, password: e.target.value })}
          error={errors.password ?? server.fields.password}
        />
      )}
      <TextField
        label={t('auth.twoStep.code')}
        inputMode="numeric"
        autoComplete="one-time-code"
        value={values.code}
        onChange={(e) => setValues({ ...values, code: e.target.value })}
        error={errors.code ?? server.fields.code}
      />
      <div className="flex gap-3">
        <SubmitButton
          variant={mode === 'off' ? 'danger' : undefined}
          pending={regenerate.isPending || disable.isPending}
        >
          {mode === 'off' ? t('account.twoStep.turnOff') : t('account.twoStep.newCodes')}
        </SubmitButton>
        <button
          type="button"
          onClick={() => setMode('idle')}
          className="rounded-lg px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
        >
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
