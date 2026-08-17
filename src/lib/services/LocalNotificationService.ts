import type { NotificationLevel, NotificationService } from './types';

type Listener = (message: string, level: NotificationLevel) => void;

/**
 * Notificaciones locales: alimentan los toasts de la interfaz.
 * FUTURE: reemplazar por push notifications reales cuando exista backend.
 */
export class LocalNotificationServiceImpl implements NotificationService {
  private listeners = new Set<Listener>();

  notify(message: string, level: NotificationLevel = 'info'): void {
    this.listeners.forEach((listener) => listener(message, level));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const LocalNotificationService = new LocalNotificationServiceImpl();
