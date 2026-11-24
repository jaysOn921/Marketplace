import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { askInstall, dismissInstall } from '../lib/pwa';
import { mockApi, renderApp, sampleUser } from '../test/utils';

/** A pretend browser with push support: one subscription, created on request. */
function fakePushBrowser(permission: NotificationPermission = 'default') {
  let sub: { endpoint: string; toJSON: () => object; unsubscribe: () => Promise<boolean> } | null =
    null;
  const pushManager = {
    getSubscription: vi.fn(async () => sub),
    subscribe: vi.fn(async () => {
      sub = {
        endpoint: 'https://push.example.com/send/abc',
        toJSON: () => ({
          endpoint: 'https://push.example.com/send/abc',
          keys: { p256dh: 'p', auth: 'a' },
        }),
        unsubscribe: vi.fn(async () => {
          sub = null;
          return true;
        }),
      };
      return sub;
    }),
  };
  const registration = { pushManager };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: async () => registration, ready: Promise.resolve(registration) },
  });
  vi.stubGlobal('PushManager', function PushManager() {});
  const Notification = { permission, requestPermission: vi.fn(async () => 'granted') };
  vi.stubGlobal('Notification', Notification);
  return { pushManager, Notification };
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  // @ts-expect-error removing the fake added above
  delete navigator.serviceWorker;
});

describe('Notifications on this phone', () => {
  it('turns on: asks the browser, subscribes, and tells the server', async () => {
    const browser = fakePushBrowser();
    const sent: unknown[] = [];
    mockApi(
      {
        'GET /push/key': () => ({ body: { publicKey: 'BEl62iUYgUivxIkv69yViEuiBIa' } }),
        'GET /me/push': () => ({ body: { devices: sent.length } }),
        'POST /me/push': (body) => {
          sent.push(body);
          return { status: 204 };
        },
      },
      { user: sampleUser },
    );
    renderApp('/account');
    expect(await screen.findByText('Notifications are off for this phone.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Turn on notifications' }));
    expect(await screen.findByText('Notifications are on for this phone.')).toBeInTheDocument();
    expect(browser.Notification.requestPermission).toHaveBeenCalled();
    expect(browser.pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    expect(sent).toEqual([
      { endpoint: 'https://push.example.com/send/abc', keys: { p256dh: 'p', auth: 'a' } },
    ]);
  });

  it('explains how to unblock them, and says when the server has none', async () => {
    fakePushBrowser('denied');
    mockApi({ 'GET /me/push': () => ({ body: { devices: 0 } }) }, { user: sampleUser });
    renderApp('/account');
    expect(await screen.findByText(/Notifications are blocked for TZed/)).toBeInTheDocument();
  });

  it('suggests them on an open order, once', async () => {
    fakePushBrowser();
    mockApi(
      { 'GET /push/key': () => ({ body: { publicKey: 'BEl62iUYgUivxIkv69yViEuiBIa' } }) },
      { user: sampleUser },
    );
    const { PushPrompt } = await import('./PushSettings');
    const { render } = await import('@testing-library/react');
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
    const view = () => (
      <QueryClientProvider client={new QueryClient()}>
        <PushPrompt context="buyer" />
      </QueryClientProvider>
    );
    const first = render(view());
    expect(await screen.findByText(/when the seller replies/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByText(/when the seller replies/)).not.toBeInTheDocument();
    first.unmount();
    render(view());
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/when the seller replies/)).not.toBeInTheDocument();
  });
});

describe('Install banner', () => {
  it('shows iPhone instructions when asked from the menu, and can be dismissed', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',
    );
    mockApi();
    renderApp('/');
    act(() => askInstall());
    const banner = await screen.findByRole('region', { name: 'App notices' });
    expect(banner).toHaveTextContent('Add to Home Screen');
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('region', { name: 'App notices' })).not.toBeInTheDocument();
    act(() => dismissInstall());
  });
});
