import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, del } from '../lib/api';
import { pushStatus, turnOffPush, turnOnPush, type PushStatus } from '../lib/pwa';
import { Alert, Card } from './Form';

const button =
  'rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50 disabled:opacity-50';
const primary =
  'rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50';

function usePushStatus() {
  return useQuery({ queryKey: ['push', 'status'], queryFn: pushStatus, staleTime: Infinity });
}

function useTurnOn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: turnOnPush,
    onSuccess: (status) => {
      qc.setQueryData<PushStatus>(['push', 'status'], status);
      void qc.invalidateQueries({ queryKey: ['push', 'devices'] });
    },
  });
}

/** "Notifications on this phone" under My account. */
export function PushSettings() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: status } = usePushStatus();
  const devices = useQuery({
    queryKey: ['push', 'devices'],
    queryFn: () => api<{ devices: number }>('/me/push'),
  });
  const on = useTurnOn();
  const off = useMutation({
    mutationFn: turnOffPush,
    onSuccess: () => {
      qc.setQueryData<PushStatus>(['push', 'status'], 'off');
      void qc.invalidateQueries({ queryKey: ['push', 'devices'] });
    },
  });
  const offEverywhere = useMutation({
    mutationFn: async () => {
      await del('/me/push/all');
      await turnOffPush();
    },
    onSuccess: () => {
      qc.setQueryData<PushStatus>(['push', 'status'], 'off');
      void qc.invalidateQueries({ queryKey: ['push', 'devices'] });
    },
  });

  if (!status) return null;
  const others = (devices.data?.devices ?? 0) - (status === 'on' ? 1 : 0);
  return (
    <Card title={t('push.title')} description={t('push.intro')}>
      <div className="space-y-3 text-sm">
        {status === 'unsupported' && <p className="text-stone-600">{t('push.unsupported')}</p>}
        {status === 'unavailable' && <p className="text-stone-600">{t('push.unavailable')}</p>}
        {status === 'blocked' && <Alert kind="info">{t('push.blocked')}</Alert>}
        {status === 'on' && (
          <>
            <p className="font-medium text-brand-800">{t('push.on')}</p>
            <button
              type="button"
              className={button}
              disabled={off.isPending}
              onClick={() => off.mutate()}
            >
              {t('push.turnOff')}
            </button>
          </>
        )}
        {status === 'off' && (
          <>
            <p className="text-stone-700">{t('push.off')}</p>
            <button
              type="button"
              className={primary}
              disabled={on.isPending}
              onClick={() => on.mutate()}
            >
              {t('push.turnOn')}
            </button>
          </>
        )}
        {on.error && <Alert>{t('push.failed')}</Alert>}
        {others > 0 && (
          <div className="border-t border-stone-100 pt-3">
            <p className="text-stone-600">{t('push.otherDevices', { count: others })}</p>
            <button
              type="button"
              className={`mt-2 ${button}`}
              disabled={offEverywhere.isPending}
              onClick={() => offEverywhere.mutate()}
            >
              {t('push.turnOffEverywhere')}
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * Suggests notifications at a moment they're clearly useful (an order, a listing), once.
 * Shows nothing if they're already on, impossible, blocked, or the prompt was dismissed.
 */
export function PushPrompt({ context }: { context: 'buyer' | 'seller' }) {
  const { t } = useTranslation();
  const { data: status } = usePushStatus();
  const on = useTurnOn();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem('tzed.pushPromptDismissed') === '1';
    } catch {
      return false;
    }
  });
  if (status !== 'off' || dismissed) return null;
  const dismiss = () => {
    try {
      localStorage.setItem('tzed.pushPromptDismissed', '1');
    } catch {
      // ignore
    }
    setDismissed(true);
  };
  return (
    <section
      aria-label={t('push.title')}
      className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-100 bg-brand-50 p-4 text-sm"
    >
      <p className="min-w-0 flex-1 text-stone-800">{t(`push.prompt.${context}`)}</p>
      <div className="flex gap-1">
        <button
          type="button"
          className={primary}
          disabled={on.isPending}
          onClick={() => on.mutate()}
        >
          {t('push.turnOn')}
        </button>
        <button
          type="button"
          className="rounded-lg px-3 py-2 font-medium text-stone-700 hover:bg-white"
          onClick={dismiss}
        >
          {t('pwa.notNow')}
        </button>
      </div>
    </section>
  );
}
