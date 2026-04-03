import { useState, useEffect, useCallback } from 'react';
import { NotificationSettings, DEFAULT_NOTIFICATION_SETTINGS, NOTIFICATION_MESSAGES, NotificationPayload } from '@/types/notifications';

const SETTINGS_KEY = 'notification_settings';

/**
 * Hook para notificações locais (em sessão).
 * Continua funcionando como toasts/alertas quando o app está aberto.
 * O Web Push real (app fechado) é tratado pelo useWebPush.ts + Edge Functions.
 */
export function useNotifications() {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setIsSupported(true);
      setPermission(Notification.permission);

      const savedSettings = localStorage.getItem(SETTINGS_KEY);
      if (savedSettings) {
        try {
          setSettings({ ...DEFAULT_NOTIFICATION_SETTINGS, ...JSON.parse(savedSettings) });
        } catch (e) {
          console.error('Erro ao carregar settings de notificação:', e);
        }
      }
    }
  }, []);

  const saveSettings = useCallback((newSettings: NotificationSettings) => {
    setSettings(newSettings);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
  }, []);

  const requestPermission = useCallback(async () => {
    if (!isSupported) return false;

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result === 'granted';
    } catch (e) {
      console.error('Erro ao solicitar permissão:', e);
      return false;
    }
  }, [isSupported]);

  /**
   * Envia notificação LOCAL (só funciona com app aberto).
   * Para push com app fechado, usar Edge Function + Service Worker.
   */
  const sendNotification = useCallback((payload: NotificationPayload) => {
    if (!isSupported || permission !== 'granted' || !settings.enabled) {
      return;
    }

    try {
      const notification = new Notification(payload.title, {
        body: payload.body,
        icon: payload.icon || '/app.png',
        tag: payload.tag || 'safo-notification',
        requireInteraction: false,
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
        if (payload.data?.url) {
          window.location.href = payload.data.url;
        }
      };

      setTimeout(() => notification.close(), 10000);
    } catch (e) {
      console.error('Erro ao enviar notificação:', e);
    }
  }, [isSupported, permission, settings.enabled]);

  const sendAchievementNotification = useCallback((achievementName: string, icon: string) => {
    if (!settings.achievementAlert) return;

    sendNotification({
      title: '🏆 Conquista Desbloqueada!',
      body: `${icon} ${achievementName}`,
      tag: 'achievement',
      data: { url: '/medalhas' },
    });
  }, [settings.achievementAlert, sendNotification]);

  const sendStreakSavedNotification = useCallback(() => {
    if (!settings.streakAlert) return;

    const messages = NOTIFICATION_MESSAGES.streakSaved;
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];

    sendNotification({
      title: '✅ Streak Mantido!',
      body: randomMessage,
      tag: 'streak-saved',
    });
  }, [settings.streakAlert, sendNotification]);

  const markAsStudied = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem('last_notification_date', today);
  }, []);

  return {
    settings,
    permission,
    isSupported,
    saveSettings,
    requestPermission,
    sendNotification,
    sendAchievementNotification,
    sendStreakSavedNotification,
    markAsStudied,
  };
}
