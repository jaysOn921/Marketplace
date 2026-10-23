import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, renderApp, sampleUser } from '../../test/utils';

describe('Sign in', () => {
  it('validates before calling the API', async () => {
    const fetchMock = mockApi();
    renderApp('/login');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/auth/login'))).toBe(false);
  });

  it('shows the API error for wrong credentials', async () => {
    mockApi({
      'POST /auth/login': () => ({
        status: 401,
        body: {
          error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' },
        },
      }),
    });
    renderApp('/login');
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
  });

  it('signs in with the CSRF token and goes to the requested page', async () => {
    const fetchMock = mockApi({
      'POST /auth/login': () => ({ body: { user: sampleUser, csrfToken: 'new-token' } }),
    });
    renderApp('/login?next=/account/seller');
    await userEvent.type(screen.getByLabelText('Email'), 'natasha@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'a-good-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Seller profile' })).toBeInTheDocument();
    const login = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/auth/login'));
    expect(new Headers(login?.[1]?.headers).get('X-CSRF-Token')).toBe('test-csrf');
    expect(screen.getByRole('button', { name: /Natasha/ })).toBeInTheDocument();
  });

  it('retries once with a fresh token when the session expired', async () => {
    let attempts = 0;
    mockApi({
      'POST /auth/login': () => {
        attempts += 1;
        return attempts === 1
          ? { status: 403, body: { error: { code: 'CSRF_INVALID', message: 'expired' } } }
          : { body: { user: sampleUser, csrfToken: 'x' } };
      },
    });
    renderApp('/login');
    await userEvent.type(screen.getByLabelText('Email'), 'natasha@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'My account' })).toBeInTheDocument();
    expect(attempts).toBe(2);
  });
});

describe('Register', () => {
  it('requires a country, consent and a valid phone for that country', async () => {
    mockApi();
    renderApp('/register');
    await userEvent.type(screen.getByLabelText('Phone number (optional)'), '+255712345678');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Choose Tanzania or Zambia.')).toBeInTheDocument();
    expect(
      screen.getByText('You need to accept the terms and privacy policy.'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByText('Zambia'));
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText(/Enter a Zambian number/)).toBeInTheDocument();
  });

  it('creates the account and shows the welcome message', async () => {
    let sent: Record<string, unknown> | undefined;
    mockApi({
      'POST /auth/register': (body) => {
        sent = body as Record<string, unknown>;
        return {
          status: 201,
          body: { user: { ...sampleUser, emailVerified: false }, csrfToken: 't' },
        };
      },
    });
    renderApp('/register');
    await userEvent.click(screen.getByText('Zambia'));
    await userEvent.type(screen.getByLabelText('Full name'), 'Natasha Phiri');
    await userEvent.type(screen.getByLabelText('Email'), 'Natasha@Example.com');
    await userEvent.type(screen.getByLabelText('Phone number (optional)'), '0977 123 456');
    await userEvent.type(screen.getByLabelText('Password'), 'a-good-password');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText(/Welcome to TZed!/)).toBeInTheDocument();
    expect(screen.getByText(/Please confirm your email address/)).toBeInTheDocument();
    expect(sent).toMatchObject({
      email: 'natasha@example.com',
      phone: '+260977123456',
      countryCode: 'ZM',
    });
  });
});

describe('Account pages', () => {
  it('redirects to sign-in when signed out', async () => {
    mockApi();
    renderApp('/account');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('saves a seller profile with regions from the user’s country', async () => {
    let sent: unknown;
    mockApi(
      {
        'PUT /me/seller-profile': (body) => {
          sent = body;
          return {
            body: {
              user: {
                ...sampleUser,
                sellerProfile: {
                  shopName: 'Mwila Home',
                  slug: 'mwila-home',
                  bio: null,
                  regionId: 2,
                  regionName: 'Lusaka',
                  town: 'Lusaka',
                  contactPreference: 'MESSAGES',
                },
              },
            },
          };
        },
      },
      { user: sampleUser },
    );
    renderApp('/account/seller');
    await userEvent.type(await screen.findByLabelText('Shop name'), 'Mwila Home');
    const province = screen.getByLabelText('Province');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Lusaka' })).toBeInTheDocument());
    expect(screen.queryByRole('option', { name: 'Mbeya' })).not.toBeInTheDocument();
    await userEvent.selectOptions(province, 'Lusaka');
    await userEvent.type(screen.getByLabelText('Town or city'), 'Lusaka');
    await userEvent.click(screen.getByRole('button', { name: 'Create seller profile' }));

    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(sent).toMatchObject({ shopName: 'Mwila Home', regionId: '2', town: 'Lusaka' });
    expect(screen.getByText('Your shop link: /shop/mwila-home')).toBeInTheDocument();
  });

  it('signs out from the header menu', async () => {
    mockApi({ 'POST /auth/logout': () => ({ status: 204 }) }, { user: sampleUser });
    renderApp('/');
    await userEvent.click(await screen.findByRole('button', { name: /Natasha/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });
});
