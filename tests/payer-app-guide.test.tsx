import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PayerAppGuide } from '@/components/payment/PayerAppGuide';

const YAPE_QR =
  '0002010102113932111122223333444455556666777788885204561153036045802PE5906YAPERO6004Lima6304A5E0';
const LEMON_QR =
  '000201010211262800028001189030220260418000015204482953036045802PE5910Lemon Cash6004Lima80240003ID10113TESTTOKEN001=630421D5';

describe('PayerAppGuide', () => {
  it('muestra los pasos de la app elegida con el monto exacto', () => {
    render(<PayerAppGuide qrPayload={YAPE_QR} amountLabel="24.99" />);
    expect(screen.getByText(/Yapear → Escanear QR/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Plin' }));
    expect(screen.getByText(/Plin → Pagar con QR/)).toBeInTheDocument();
    expect(screen.getByText('S/ 24.99')).toBeInTheDocument();
  });

  it('avisa cuando Yape podría no leer un QR de Lemon/Dale', () => {
    render(<PayerAppGuide qrPayload={LEMON_QR} amountLabel="1.03" />);
    expect(screen.getByText(/no leen este QR/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Otro banco' }));
    expect(screen.queryByText(/no leen este QR/)).not.toBeInTheDocument();
  });

  it('preselecciona Lemon cuando el checkout eligió método lemon', () => {
    render(<PayerAppGuide qrPayload={LEMON_QR} amountLabel="25.00" initialPayerApp="lemon" />);
    expect(screen.getByRole('button', { name: 'Lemon' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Abre Lemon → Escanear QR/)).toBeInTheDocument();
    expect(screen.getByText('S/ 25.00')).toBeInTheDocument();
  });
});
