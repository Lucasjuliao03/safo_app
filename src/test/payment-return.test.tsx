import type { ReactNode } from 'react';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { PaymentReturn } from '@/components/PaymentReturn';

const state = vi.hoisted(() => ({ user: { id: 'student', isApproved: true, activeUntil: '2099-01-01' } as { id: string; isApproved: boolean; activeUntil: string } | null,
  status: vi.fn(), refresh: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: state.user, loading: false, refreshUser: state.refresh }) }));
vi.mock('@/components/AppLayout', () => ({ AppLayout: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/services/paymentService', () => ({ fetchPaymentStatus: (id: string) => state.status(id),
  isOrderId: (id: string) => !!id && id.includes('-'), pendingPaymentOrder: () => undefined, clearPendingPaymentOrder: vi.fn() }));
vi.mock('@/services/studyAccessService', () => ({ getStudyAccess: async () => ({ entitled: true, used: 10, limit: 10, remaining: null }) }));
const orderId = '00000000-0000-4000-8000-000000000003';
let client: QueryClient;
function renderReturn() {
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/pagamento/sucesso?order_id=${orderId}&status=approved`]}>
    <PaymentReturn /></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  state.user = { id: 'student', isApproved: true, activeUntil: '2099-01-01' };
  state.refresh.mockReset().mockResolvedValue(undefined);
  state.status.mockReset().mockResolvedValue({ order: { id: orderId, status: 'pending', fulfilled_at: null }, access: { entitled: true, expiresAt: '2099-01-01' } });
});
afterEach(() => { cleanup(); client.clear(); });

describe('payment return uses verified order state', () => {
  it('never claims this purchase was approved just because the URL or cached profile says approved', async () => {
    renderReturn();
    await waitFor(() => expect(state.status).toHaveBeenCalledWith(orderId));
    expect(screen.queryByText('Acesso liberado!')).not.toBeInTheDocument();
    expect(screen.getByText(/Aguardando a confirmação/)).toBeInTheDocument();
  });
  it('updates access caches after confirmed fulfillment and approval', async () => {
    state.status.mockResolvedValue({ order: { id: orderId, status: 'approved', fulfilled_at: '2026-10-29' }, access: { entitled: true, expiresAt: '2099-01-01' } });
    renderReturn();
    expect(await screen.findByText('Acesso liberado!')).toBeInTheDocument();
    await waitFor(() => expect(client.getQueryData(['studyAccess', 'student'])).toMatchObject({ entitled: true }));
    expect(state.refresh).toHaveBeenCalled();
  });
  it('allows a real retry after a processing response', async () => {
    renderReturn();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Verificar novamente' })).not.toBeDisabled());
    state.status.mockResolvedValue({ order: { id: orderId, status: 'approved', fulfilled_at: '2026-10-29' }, access: { entitled: true, expiresAt: null } });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar novamente' }));
    expect(await screen.findByText('Acesso liberado!')).toBeInTheDocument();
  });
  it('requires login to the purchasing account instead of waiting forever', async () => {
    state.user = null; renderReturn();
    expect(screen.getByRole('link', { name: 'Entrar na minha conta' })).toHaveAttribute('href', expect.stringContaining('returnTo='));
    expect(state.status).not.toHaveBeenCalled();
  });
  it('does not claim active access for a confirmed purchase on a suspended or expired account', async () => {
    state.status.mockResolvedValue({ order: { id: orderId, status: 'approved', fulfilled_at: '2026-10-29' }, access: { entitled: false, expiresAt: '2026-01-01' } });
    renderReturn();
    expect(await screen.findByText('Pagamento confirmado')).toBeInTheDocument();
    expect(screen.queryByText('Acesso liberado!')).not.toBeInTheDocument();
  });
});
