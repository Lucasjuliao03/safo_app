import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotificationContext } from '@/contexts/NotificationContext';

interface NotificationBannerProps {
  onDismiss?: () => void;
}

export function NotificationBanner({ onDismiss }: NotificationBannerProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const { webPush, isSupported } = useNotificationContext();

  useEffect(() => {
    const dismissed = localStorage.getItem('push_banner_dismissed');
    if (dismissed) {
      setIsDismissed(true);
      return;
    }

    // Se suporta push e NÃO está inscrito, mostrar banner
    if (isSupported && webPush.isSupported && !webPush.isSubscribed) {
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isSupported, webPush.isSupported, webPush.isSubscribed]);

  const handleAccept = async () => {
    // Tenta inscrever no Web Push real
    const success = await webPush.subscribe();
    if (success) {
      // toast já é chamado dentro do NotificationSettings
    }
    setIsVisible(false);
    setIsDismissed(true);
    localStorage.setItem('push_banner_dismissed', 'true');
    onDismiss?.();
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setIsDismissed(true);
    localStorage.setItem('push_banner_dismissed', 'true');
    onDismiss?.();
  };

  if (!isVisible || isDismissed || !isSupported || webPush.isSubscribed) {
    return null;
  }

  return (
    <div className={cn(
      "fixed top-4 left-4 right-4 z-50 mx-auto max-w-md",
      "animate-slide-down"
    )}>
      <div className="rounded-2xl bg-gradient-to-br from-primary/95 to-primary/90 p-4 shadow-xl backdrop-blur-sm border border-white/10">
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <X className="h-4 w-4 text-white" />
        </button>

        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <Bell className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-white text-lg mb-1">
              Ative as Notificações 🔔
            </h3>
            <p className="text-white/80 text-sm mb-3">
              Receba lembretes para estudar, alertas de streak e mensagens motivacionais, mesmo com o app fechado!
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleAccept}
                disabled={webPush.isLoading}
                className="flex-1 py-2.5 px-4 rounded-xl bg-white text-primary font-semibold text-sm hover:bg-white/90 transition-colors active:scale-[0.98]"
              >
                {webPush.isLoading ? 'Ativando...' : 'Ativar'}
              </button>
              <button
                onClick={handleDismiss}
                className="py-2.5 px-4 rounded-xl bg-white/10 text-white font-medium text-sm hover:bg-white/20 transition-colors"
              >
                Agora não
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function useNotificationBanner() {
  const { webPush, isSupported } = useNotificationContext();

  useEffect(() => {
    if (!isSupported || !webPush.isSupported || webPush.isSubscribed) {
      return;
    }

    const dismissed = localStorage.getItem('push_banner_dismissed');
    if (dismissed) return;

    const timer = setTimeout(() => {
      const event = new CustomEvent('safo:show-notification-banner');
      window.dispatchEvent(event);
    }, 3000);

    return () => clearTimeout(timer);
  }, [isSupported, webPush.isSupported, webPush.isSubscribed]);
}
