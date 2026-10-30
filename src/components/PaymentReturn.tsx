import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from './AppLayout';
import { usePaymentConfirmation } from '@/hooks/usePaymentConfirmation';
import { isOrderId, pendingPaymentOrder } from '@/services/paymentService';

export function PaymentReturn() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const location = useLocation();
  const orderId = params.get('order_id') ?? params.get('external_reference') ?? pendingPaymentOrder(user?.id);
  const { data, error, isFetching, checkAgain } = usePaymentConfirmation(orderId);
  const confirmed = data?.order.status === 'approved' && !!data.order.fulfilled_at;
  const released = confirmed && data.access.entitled;
  const terminal = ['refunded', 'charged_back', 'cancelled', 'rejected', 'expired'].includes(data?.order.status ?? '');
  return <AppLayout><div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center gap-5 px-6 text-center">
    <h1 className="text-2xl font-bold">{released ? 'Acesso liberado!' : confirmed ? 'Pagamento confirmado'
      : terminal ? 'Pagamento encerrado' : 'Confirmação do pagamento'}</h1>
    {loading ? <p>Carregando sua conta...</p> : !user ? <>
      <p>Entre na conta usada na compra para consultar o pagamento.</p>
      <Link className="rounded-xl bg-primary p-3 font-semibold text-primary-foreground"
        to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}>Entrar na minha conta</Link>
    </> : !isOrderId(orderId) ? <p>Abra o comprovante do pedido ou acompanhe sua compra na tela de planos.</p>
      : error ? <p role="alert" className="text-destructive">{error instanceof Error ? error.message : 'Não foi possível consultar seu pagamento.'}</p>
        : <>
          <p>{released ? 'Seu pagamento foi confirmado e o plano está ativo.' : confirmed
            ? 'Este pagamento foi confirmado, mas sua conta não tem acesso ativo neste momento. Verifique a validade do plano ou entre em contato com o suporte.'
            : terminal ? 'Este pedido não libera um novo período de acesso. Consulte o status no Mercado Pago antes de iniciar outra compra.'
              : 'Aguardando a confirmação do Mercado Pago. Pagamentos em análise, Pix e boleto podem levar mais tempo. Não é necessário pagar novamente.'}</p>
          {released && data.access.expiresAt && <p>Válido até {new Date(data.access.expiresAt).toLocaleDateString('pt-BR')}</p>}
          {data?.order.needs_review && <p role="alert">Identificamos pagamentos adicionais neste pedido. Entre em contato com o suporte para conferir a cobrança.</p>}
        </>}
    {user && isOrderId(orderId) && <button disabled={isFetching} onClick={() => void checkAgain()}
      className="rounded-xl bg-primary p-3 font-semibold text-primary-foreground disabled:opacity-50">
      {isFetching ? 'Verificando...' : 'Verificar novamente'}</button>}
    {released ? <Link className="text-primary" to="/">Começar a estudar</Link> : <Link className="text-primary" to="/assinar">Voltar aos planos</Link>}
    {user && <Link className="text-muted-foreground" to="/perfil">Meu perfil</Link>}
  </div></AppLayout>;
}
