import { useTranslation } from 'react-i18next';
import {
  applyUpdate,
  dismissInstall,
  installBannerWanted,
  isIos,
  promptInstall,
  usePwa,
} from '../lib/pwa';

const button =
  'rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800';
const quiet = 'rounded-lg px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100';

/**
 * Bottom-of-screen notices: "A new version is ready" and "Install TZed". At most one shows,
 * the update first. They sit above the page, so they leave room at the bottom (pb in Layout).
 */
export function AppPrompts() {
  const { t } = useTranslation();
  const pwa = usePwa();

  let content: React.ReactNode = null;
  if (pwa.waitingWorker) {
    content = (
      <>
        <p className="text-sm text-stone-800">{t('pwa.updateReady')}</p>
        <button type="button" className={button} onClick={applyUpdate}>
          {t('pwa.reload')}
        </button>
      </>
    );
  } else if (installBannerWanted(pwa)) {
    content = (
      <>
        <img src="/icons/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium text-stone-900">{t('pwa.installTitle')}</p>
          <p className="text-stone-600">
            {pwa.installEvent ? t('pwa.installText') : isIos() ? t('pwa.iosText') : null}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          {pwa.installEvent && (
            <button type="button" className={button} onClick={() => void promptInstall()}>
              {t('pwa.install')}
            </button>
          )}
          <button type="button" className={quiet} onClick={dismissInstall}>
            {pwa.installEvent ? t('pwa.notNow') : t('pwa.gotIt')}
          </button>
        </div>
      </>
    );
  }
  if (!content) return null;

  return (
    <section
      aria-label={t('pwa.region')}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg backdrop-blur"
    >
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3">{content}</div>
    </section>
  );
}
