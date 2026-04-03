import { useState } from 'react';
import { useNotificationContext } from '@/contexts/NotificationContext';
import { Bell, BellOff, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function NotificationSettings() {
  const { webPush } = useNotificationContext();
  const [isExpanded, setIsExpanded] = useState(false);

  const handlePushToggle = async () => {
    if (webPush.isSubscribed) {
      const success = await webPush.unsubscribe();
      if (success) {
        toast.success('Push notifications desativadas');
      } else {
        toast.error('Erro ao desativar push');
      }
    } else {
      const success = await webPush.subscribe();
      if (success) {
        toast.success('Push notifications ativadas! 🔔');
      } else {
        toast.error(
          'Não foi possível ativar. Verifique se o navegador permite notificações para este site.'
        );
      }
    }
  };

  return (
    <div className="rounded-2xl bg-card border border-border overflow-hidden">
      {/* Header expandível */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Bell className="h-4 w-4 text-primary" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-foreground">Notificações Push</p>
            <p className="text-[10px] text-muted-foreground">
              {webPush.isSubscribed
                ? '✅ Ativadas — você recebe alertas mesmo com app fechado'
                : '⚠️ Desativadas — ative para receber lembretes'}
            </p>
          </div>
        </div>
        <ChevronRight
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform',
            isExpanded && 'rotate-90'
          )}
        />
      </button>

      {isExpanded && (
        <div className="space-y-3 px-4 pb-4 animate-slide-down">
          {/* Botão principal de ativar/desativar push */}
          <button
            onClick={handlePushToggle}
            disabled={webPush.isLoading}
            className={cn(
              'w-full flex items-center justify-center gap-2 p-3 rounded-xl font-semibold text-sm transition-all active:scale-[0.98]',
              webPush.isSubscribed
                ? 'bg-destructive/10 border border-destructive/20 text-destructive hover:bg-destructive/20'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
              webPush.isLoading && 'opacity-50 cursor-not-allowed'
            )}
          >
            {webPush.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : webPush.isSubscribed ? (
              <>
                <BellOff className="h-4 w-4" />
                Desativar Push Notifications
              </>
            ) : (
              <>
                <Bell className="h-4 w-4" />
                Ativar Push Notifications
              </>
            )}
          </button>

          {/* Info se não suportado */}
          {!webPush.isSupported && (
            <div className="rounded-xl bg-warning/10 border border-warning/20 p-3 mt-3">
              <p className="text-xs text-warning font-medium">
                Seu navegador não suporta Push Notifications. Use Chrome, Edge ou Firefox para ativar.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
