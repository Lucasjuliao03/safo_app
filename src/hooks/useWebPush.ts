import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

/**
 * Hook para gerenciar Web Push subscriptions reais.
 * Registra o service worker, solicita permissão, cria push subscription
 * e persiste no Supabase.
 */
export function useWebPush() {
  const { user } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);

  // Re-verificar permissão real do browser
  const refreshPermission = useCallback(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  // Verificar suporte e estado atual
  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setIsSupported(supported);

    if (!supported) return;

    refreshPermission();

    // Obter o registration do service worker já registrado pelo VitePWA
    navigator.serviceWorker.ready.then(async (reg) => {
      setRegistration(reg);

      // Verificar se já existe uma subscription
      const sub = await reg.pushManager.getSubscription();
      setIsSubscribed(!!sub);
    });

    // Re-verificar permissão quando o usuário volta para a aba
    // (pode ter mudado nas configurações do browser)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshPermission();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Escutar mensagens do SW (re-subscribe, navigation)
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_SUBSCRIPTION_EXPIRED') {
        setIsSubscribed(false);
        if (user?.id) {
          subscribe();
        }
      }
      if (event.data?.type === 'NOTIFICATION_CLICK' && event.data?.url) {
        window.location.href = event.data.url;
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user?.id, refreshPermission]);

  // Converter base64url para Uint8Array (necessário para applicationServerKey)
  const urlBase64ToUint8Array = useCallback((base64String: string): Uint8Array => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }, []);

  /**
   * Solicita permissão e cria push subscription.
   * Salva a subscription no Supabase.
   */
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !user?.id || !VAPID_PUBLIC_KEY) {
      console.warn('[WebPush] Não suportado ou sem user/VAPID key');
      return false;
    }

    // Esperar SW ficar pronto se ainda não estiver
    let reg = registration;
    if (!reg) {
      try {
        reg = await navigator.serviceWorker.ready;
        setRegistration(reg);
      } catch {
        console.error('[WebPush] Service Worker não disponível');
        return false;
      }
    }

    setIsLoading(true);

    try {
      // 1. Sempre tentar solicitar permissão (mesmo se "denied" antes)
      // O browser decide se mostra o popup ou não
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== 'granted') {
        console.warn('[WebPush] Permissão negada pelo browser');
        return false;
      }

      // 2. Criar push subscription no browser
      const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      let pushSubscription = await registration.pushManager.getSubscription();

      if (!pushSubscription) {
        pushSubscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }

      const subscriptionJson = pushSubscription.toJSON();
      if (!subscriptionJson.endpoint || !subscriptionJson.keys) {
        throw new Error('Subscription inválida');
      }

      // 3. Salvar no Supabase
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: user.id,
          endpoint: subscriptionJson.endpoint,
          p256dh_key: subscriptionJson.keys.p256dh,
          auth_key: subscriptionJson.keys.auth,
          user_agent: navigator.userAgent,
          is_active: true,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,endpoint',
        });

      if (error) {
        console.error('[WebPush] Erro ao salvar subscription:', error);
        throw error;
      }

      // 4. Salvar/atualizar preferências
      await supabase
        .from('user_notification_preferences')
        .upsert({
          user_id: user.id,
          push_enabled: true,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        });

      setIsSubscribed(true);
      console.log('[WebPush] Subscription salva com sucesso');
      return true;
    } catch (err) {
      console.error('[WebPush] Erro no subscribe:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, registration, user?.id, urlBase64ToUint8Array]);

  /**
   * Remove a push subscription do browser e marca como inativa no Supabase.
   */
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!registration || !user?.id) return false;

    setIsLoading(true);

    try {
      const pushSubscription = await registration.pushManager.getSubscription();

      if (pushSubscription) {
        // 1. Desinscrever no browser
        await pushSubscription.unsubscribe();

        // 2. Marcar como inativa no Supabase
        const subscriptionJson = pushSubscription.toJSON();
        if (subscriptionJson.endpoint) {
          await supabase
            .from('push_subscriptions')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('user_id', user.id)
            .eq('endpoint', subscriptionJson.endpoint);
        }
      }

      // 3. Atualizar preferências
      await supabase
        .from('user_notification_preferences')
        .upsert({
          user_id: user.id,
          push_enabled: false,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        });

      setIsSubscribed(false);
      console.log('[WebPush] Unsubscribed com sucesso');
      return true;
    } catch (err) {
      console.error('[WebPush] Erro no unsubscribe:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [registration, user?.id]);

  /**
   * Atualiza uma preferência de notificação no Supabase.
   */
  const updatePreference = useCallback(async (
    key: string,
    value: boolean | string
  ): Promise<void> => {
    if (!user?.id) return;

    await supabase
      .from('user_notification_preferences')
      .upsert({
        user_id: user.id,
        [key]: value,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });
  }, [user?.id]);

  /**
   * Busca as preferências do usuário do Supabase.
   */
  const fetchPreferences = useCallback(async () => {
    if (!user?.id) return null;

    const { data } = await supabase
      .from('user_notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single();

    return data;
  }, [user?.id]);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    subscribe,
    unsubscribe,
    updatePreference,
    fetchPreferences,
  };
}
