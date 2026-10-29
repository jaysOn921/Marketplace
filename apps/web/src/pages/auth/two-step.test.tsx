import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, renderApp, sampleUser } from '../../test/utils';

describe('Two-step sign-in', () => {
  it('asks for the code after the password, then signs in', async () => {
    const sent: unknown[] = [];
    mockApi({
      'POST /auth/login': () => ({ body: { user: null, csrfToken: 't', twoStepRequired: true } }),
      'POST /auth/login/two-step': (body) => {
        sent.push(body);
        return (body as { code: string }).code === '123456'
          ? { body: { user: sampleUser, csrfToken: 't2' } }
          : {
              status: 400,
              body: {
                error: {
                  code: 'TWO_STEP_INVALID',
                  message: 'That code is not right. Check the app and try again.',
                  details: {
                    fields: { code: 'That code is not right. Check the app and try again.' },
                  },
                },
              },
            };
      },
    });
    renderApp('/login?next=/account');
    await userEvent.type(screen.getByLabelText('Email'), 'natasha@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'a-good-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Enter your code' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Code'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText(/That code is not right/)).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Code'));
    await userEvent.type(screen.getByLabelText('Code'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'My account' })).toBeInTheDocument();
    expect(sent).toEqual([{ code: '000000' }, { code: '123456' }]);
  });

  it('sets up with a QR code and shows backup codes once', async () => {
    mockApi(
      {
        'POST /me/two-step/setup': () => ({
          body: {
            secret: 'JBSWY3DPEHPK3PXP',
            otpauthUrl: 'otpauth://totp/TZed:natasha%40example.com?secret=JBSWY3DPEHPK3PXP',
          },
        }),
        'POST /me/two-step/enable': () => ({
          body: {
            user: { ...sampleUser, twoStepEnabled: true },
            backupCodes: ['abcd-efgh', 'jkmn-pqrs'],
          },
        }),
      },
      { user: sampleUser },
    );
    renderApp('/account');
    await userEvent.click(await screen.findByRole('button', { name: 'Turn on two-step sign-in' }));
    expect(await screen.findByRole('img', { name: /QR code/ })).toBeInTheDocument();
    expect(screen.getByText('JBSW Y3DP EHPK 3PXP')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Enter the 6-digit code the app shows'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Turn on' }));

    const codes = await screen.findByRole('list', { name: 'Backup codes' });
    expect(codes).toHaveTextContent('abcd-efgh');
    await userEvent.click(screen.getByRole('button', { name: "I've saved them" }));
    expect(screen.queryByRole('list', { name: 'Backup codes' })).not.toBeInTheDocument();
    expect(screen.getByText('Two-step sign-in is on.')).toBeInTheDocument();
  });

  it('keeps admins out of the admin area until it is on', async () => {
    mockApi({}, { user: { ...sampleUser, role: 'ADMIN', twoStepRequired: true } });
    renderApp('/admin');
    expect(
      await screen.findByRole('heading', { name: 'Turn on two-step sign-in first' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Set it up now' })).toHaveAttribute(
      'href',
      '/account#two-step',
    );
  });
});
