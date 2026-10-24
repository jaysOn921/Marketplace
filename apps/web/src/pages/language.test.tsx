import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { mockApi, renderApp } from '../test/utils';

afterEach(async () => {
  await i18n.changeLanguage('en');
  localStorage.clear();
});

describe('Language', () => {
  it('switches the whole page to Swahili and remembers the choice', async () => {
    mockApi({});
    renderApp('/');
    expect(
      await screen.findByRole('heading', { name: 'Buy and sell across Tanzania and Zambia' }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Kiswahili' }));
    expect(
      await screen.findByRole('heading', { name: 'Nunua na uuze kati ya Tanzania na Zambia' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vinjari' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kiswahili' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(document.documentElement.lang).toBe('sw');
    expect(localStorage.getItem('tzed.lang')).toBe('sw');

    await userEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(await screen.findByRole('link', { name: 'Browse' })).toBeInTheDocument();
  });
});
