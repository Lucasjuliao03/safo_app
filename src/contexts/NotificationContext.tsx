import { createContext, useContext, ReactNode } from 'react';
import { useNotifications } from '@/hooks/useNotifications';
import { useWebPush } from '@/hooks/useWebPush';

interface NotificationContextType {
  // Notificações locais (em sessão)
  settings: ReturnType<typeof useNotifications>['settings'];
  permission: NotificationPermission;
  isSupported: boolean;
  sendNotification: ReturnType<typeof useNotifications>['sendNotification'];
  sendAchievementNotification: ReturnType<typeof useNotifications>['sendAchievementNotification'];
  sendStreakSavedNotification: ReturnType<typeof useNotifications>['sendStreakSavedNotification'];
  markAsStudied: ReturnType<typeof useNotifications>['markAsStudied'];
  requestPermission: ReturnType<typeof useNotifications>['requestPermission'];
  saveSettings: ReturnType<typeof useNotifications>['saveSettings'];
  // Web Push real (app fechado)
  webPush: ReturnType<typeof useWebPush>;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const notifications = useNotifications();
  const webPush = useWebPush();

  return (
    <NotificationContext.Provider value={{ ...notifications, webPush }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationContext() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotificationContext must be used within NotificationProvider');
  }
  return ctx;
}
