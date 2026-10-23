import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { App } from './App';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App shell', () => {
  it('renders the home page with brand and hero', () => {
    renderAt('/');
    expect(screen.getByRole('link', { name: 'TZed home' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: /across Tanzania and Zambia/i }),
    ).toBeInTheDocument();
  });

  it('submits a search and shows the query on the search page', async () => {
    renderAt('/');
    const [input] = screen.getAllByRole('searchbox');
    await userEvent.type(input!, 'iphone{enter}');
    expect(screen.getByRole('heading', { name: /results for “iphone”/i })).toBeInTheDocument();
  });

  it('has a help centre page linked from the footer', () => {
    renderAt('/help');
    expect(screen.getByRole('heading', { name: 'Help centre' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Help centre' })).toHaveAttribute('href', '/help');
  });

  it('shows a not-found page for unknown routes', () => {
    renderAt('/nope');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
