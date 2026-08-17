import { useCallback, useState } from 'react';
import { STORAGE_KEYS, readSession, writeSession } from '@/lib/storage';

/**
 * La animación completa se muestra solo en la primera visita o tras recargar por completo.
 * Durante la navegación interna se usan skeletons.
 */
export function useIntro() {
  const [visible, setVisible] = useState(() => !readSession<boolean>(STORAGE_KEYS.introSeen, false));

  const finish = useCallback(() => {
    writeSession(STORAGE_KEYS.introSeen, true);
    setVisible(false);
  }, []);

  return { visible, finish };
}
