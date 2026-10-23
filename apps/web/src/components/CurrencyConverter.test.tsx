import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockRates, renderApp } from '../test/utils';

const kwacha = () => screen.getByLabelText(/Zambian kwacha/);
const shillings = () => screen.getByLabelText(/Tanzanian shilling/);

async function openConverterPage(path = '/converter') {
  renderApp(path);
  await waitFor(() => expect(kwacha()).toBeEnabled());
}

describe('Currency converter', () => {
  it('converts kwacha to shillings as you type', async () => {
    mockRates(105);
    await openConverterPage();
    await userEvent.type(kwacha(), '100');
    expect(shillings()).toHaveValue('10,500');
  });

  it('converts shillings to kwacha using the same rate in reverse', async () => {
    mockRates(105);
    await openConverterPage();
    await userEvent.type(shillings(), '250000');
    expect(kwacha()).toHaveValue('2,380.95');
  });

  it('shows the rate both ways with the update date', async () => {
    mockRates(105);
    await openConverterPage();
    expect(screen.getByTestId('rate-line')).toHaveTextContent(
      'K 1.00 = TSh 105 · TSh 1,000 = K 9.52',
    );
    expect(screen.getByText(/Rate updated .*2026/)).toBeInTheDocument();
  });

  it('swaps which currency is on top and keeps the amounts', async () => {
    mockRates(105);
    await openConverterPage();
    await userEvent.type(kwacha(), '10');
    const before = screen.getAllByRole('textbox').map((i) => i.id);
    await userEvent.click(screen.getByRole('button', { name: 'Swap currencies' }));
    const after = screen.getAllByRole('textbox').map((i) => i.id);
    expect(after).toEqual([...before].reverse());
    expect(kwacha()).toHaveValue('10');
    expect(shillings()).toHaveValue('1,050');
  });

  it('can be pre-filled from a link, e.g. a listing price', async () => {
    mockRates(105);
    await openConverterPage('/converter?amount=380000&from=TZS');
    expect(shillings()).toHaveValue('380,000');
    expect(kwacha()).toHaveValue('3,619.05');
  });

  it('opens from the header on any page', async () => {
    mockRates(105);
    renderApp('/');
    await userEvent.click(screen.getByRole('button', { name: 'Open currency converter' }));
    const panel = screen.getByRole('dialog', { name: 'Currency converter' });
    const zmw = within(panel).getByLabelText(/Zambian kwacha/);
    await waitFor(() => expect(zmw).toBeEnabled());
    await userEvent.type(zmw, '2');
    expect(within(panel).getByLabelText(/Tanzanian shilling/)).toHaveValue('210');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('explains when no rate is available', async () => {
    mockRates(null);
    renderApp('/converter');
    expect(await screen.findByRole('alert')).toHaveTextContent(/isn't available/);
    expect(kwacha()).toBeDisabled();
  });
});
