import { useUserStore } from '@/store/userStore';
import { useMediaQuery } from './useMediaQuery';

/**
 * Respeta `prefers-reduced-motion` del sistema y también la preferencia manual
 * que el usuario puede activar en su perfil.
 */
export function usePrefersReducedMotion(): boolean {
  const systemPreference = useMediaQuery('(prefers-reduced-motion: reduce)');
  const userPreference = useUserStore((state) => state.preferences.reduceMotion);
  return systemPreference || userPreference;
}
