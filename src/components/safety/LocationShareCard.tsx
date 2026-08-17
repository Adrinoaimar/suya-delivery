import { useEffect, useState } from 'react';
import {
  Copy,
  Link2,
  MapPin,
  Radio,
  RefreshCw,
  Satellite,
  ShieldAlert,
  SquareArrowOutUpRight,
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Modal } from '@/components/common/Modal';
import { Toggle } from '@/components/common/Toggle';
import { MapProvider } from '@/components/map/MapProvider';
import { demoRoute } from '@/data';
import { useRiderLocation } from '@/hooks/useRiderLocationGuard';
import { useNow } from '@/hooks/useSharedLocation';
import { locationSharingService, notificationService } from '@/lib/services';
import { useRiderStore } from '@/store/riderStore';
import { useTrackingStore } from '@/store/trackingStore';
import { assetUrl } from '@/utils/asset';
import { formatRelative } from '@/utils/format';
import { DemoNotice } from './DemoNotice';

const RIDER_NAME = 'Carlos Ramírez';

export function LocationShareCard() {
  const simulated = useRiderStore((state) => state.simulatedLocation);
  const setSimulatedLocation = useRiderStore((state) => state.setSimulatedLocation);
  const trustedContact = useRiderStore((state) => state.trustedContact);
  const ensureShareToken = useRiderStore((state) => state.ensureShareToken);
  const regenerateShareToken = useRiderStore((state) => state.regenerateShareToken);
  const storedToken = useRiderStore((state) => state.shareToken);

  const sharing = useTrackingStore((state) => state.sharing);
  const setSharing = useTrackingStore((state) => state.setSharing);
  const [helpOpen, setHelpOpen] = useState(false);
  // La posición viene del rastreador único del layout: aquí no se abre otro `watchPosition`.
  const { reading, error, permission } = useRiderLocation();
  const now = useNow();

  // Al entrar, refleja si ya había una sesión de compartición abierta.
  useEffect(() => {
    setSharing(locationSharingService.getStatus() === 'sharing');
  }, [setSharing]);

  const token = storedToken ?? '';
  const shareUrl = token ? `${window.location.origin}${assetUrl(`/share/${token}`)}` : '';

  async function startSharing() {
    const nextToken = ensureShareToken();
    await locationSharingService.start({
      token: nextToken,
      riderName: RIDER_NAME,
      simulated,
    });
    setSharing(true);
    notificationService.notify('Ubicación compartida activada', 'success');
  }

  async function stopSharing() {
    await locationSharingService.stop();
    setSharing(false);
    notificationService.notify('Dejaste de compartir tu ubicación', 'info');
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      notificationService.notify('Enlace copiado', 'success');
    } catch {
      notificationService.notify('No pudimos copiar el enlace. Cópialo manualmente.', 'warning');
    }
  }

  const denied = permission === 'denied' || Boolean(error);

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">Compartir mi ubicación</h2>
          <p className="mt-1 text-sm text-[#6B7076]">
            Permite que una persona de confianza conozca tu ubicación mientras realizas entregas.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            sharing ? 'bg-suya-lime-soft text-suya-green-dark' : 'bg-suya-mist text-[#4A4F55]'
          }`}
        >
          {sharing ? 'Compartiendo' : 'Detenido'}
        </span>
      </div>

      <Button
        size="lg"
        fullWidth
        variant={sharing ? 'secondary' : 'primary'}
        onClick={sharing ? stopSharing : startSharing}
      >
        <Radio className="h-5 w-5" aria-hidden="true" />
        {sharing ? 'Dejar de compartir' : 'Compartir mi ubicación'}
      </Button>

      <Toggle
        label="Modo ubicación simulada"
        description="Recorre una ruta demo de Sullana sin usar el GPS."
        checked={simulated}
        onChange={setSimulatedLocation}
      />

      {denied && !simulated && (
        <div className="rounded-btn border border-suya-danger bg-suya-danger-soft p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-suya-danger">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            No tenemos permiso para acceder a tu ubicación.
          </p>
          <p className="mt-1 text-sm text-[#4A4F55]">
            {error ?? 'Activa el permiso de ubicación para compartir tu posición en tiempo real.'}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setHelpOpen(true)}>
              Cómo activar ubicación
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSimulatedLocation(true)}>
              Usar modo simulado
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-card border border-suya-mist">
        <div className="h-40">
          <MapProvider
            points={demoRoute.points}
            origin={demoRoute.origin}
            destination={demoRoute.destination}
            rider={reading?.position ?? null}
            label="Tu ubicación en el mapa"
          />
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-suya-mist p-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-[#6B7076]">Latitud</dt>
            <dd className="font-medium tabular-nums">
              {reading ? reading.position.lat.toFixed(5) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[#6B7076]">Longitud</dt>
            <dd className="font-medium tabular-nums">
              {reading ? reading.position.lng.toFixed(5) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[#6B7076]">Precisión</dt>
            <dd className="font-medium tabular-nums">
              {reading ? `${Math.round(reading.accuracy)} m` : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[#6B7076]">Actualizado</dt>
            <dd className="font-medium">
              {reading ? formatRelative(reading.timestamp, now) : '—'}
            </dd>
          </div>
          <div className="col-span-2 sm:col-span-4">
            <dt className="text-xs text-[#6B7076]">Estado GPS</dt>
            <dd className="flex items-center gap-1.5 font-medium">
              <Satellite className="h-4 w-4 text-suya-green" aria-hidden="true" />
              {simulated
                ? 'Simulado (ruta demo de Sullana)'
                : permission === 'granted'
                  ? 'Permiso concedido'
                  : permission === 'unsupported'
                    ? 'Este navegador no tiene geolocalización'
                    : 'Esperando permiso del navegador'}
            </dd>
          </div>
        </dl>
      </div>

      <div className="space-y-2">
        <h3 className="font-display text-[15px] font-bold">Enlace de seguimiento</h3>
        {token ? (
          <>
            <div className="flex items-center gap-2 rounded-btn border border-suya-mist bg-suya-ivory px-3 py-2.5">
              <Link2 className="h-4 w-4 shrink-0 text-[#6B7076]" aria-hidden="true" />
              <code className="min-w-0 flex-1 truncate text-xs">{shareUrl}</code>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={copyLink}>
                <Copy className="h-4 w-4" aria-hidden="true" />
                Copiar enlace
              </Button>
              <a
                href={shareUrl}
                target="_blank"
                rel="noreferrer"
                className="press inline-flex h-10 items-center gap-2 rounded-btn border border-suya-mist px-3.5 text-sm font-semibold text-suya-carbon hover:bg-suya-mist/60"
              >
                <SquareArrowOutUpRight className="h-4 w-4" aria-hidden="true" />
                Abrir en otra pestaña
              </a>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const nextToken = regenerateShareToken();
                  // El enlace anterior deja de funcionar en el mismo momento.
                  void locationSharingService.rotateToken(nextToken);
                  notificationService.notify(
                    'Enlace nuevo generado. El anterior dejó de funcionar.',
                    'info',
                  );
                }}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Nuevo enlace
              </Button>
            </div>
          </>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => ensureShareToken()}>
            <Link2 className="h-4 w-4" aria-hidden="true" />
            Crear enlace seguro
          </Button>
        )}

        {trustedContact && (
          <p className="text-sm text-[#6B7076]">
            Envíaselo a <strong>{trustedContact.name}</strong> ({trustedContact.phone}).
          </p>
        )}
      </div>

      <DemoNotice>
        El enlace funciona entre pestañas del mismo navegador mediante BroadcastChannel y
        localStorage. En producción este módulo necesitará un servicio realtime para compartir la
        ubicación entre dispositivos distintos.
      </DemoNotice>

      <Modal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="Cómo activar la ubicación"
        description="Los pasos cambian según el navegador."
      >
        <ol className="space-y-3 text-sm text-[#4A4F55]">
          <li>
            <strong>Android (Chrome):</strong> toca el candado junto a la dirección web → Permisos →
            Ubicación → Permitir. Luego recarga la página.
          </li>
          <li>
            <strong>iPhone (Safari):</strong> Ajustes → Safari → Ubicación → Preguntar o Permitir.
            Verifica también Ajustes → Privacidad → Localización.
          </li>
          <li>
            <strong>Escritorio:</strong> haz clic en el ícono de la izquierda de la barra de
            direcciones y activa el permiso de ubicación para este sitio.
          </li>
          <li className="flex items-start gap-2 rounded-btn bg-suya-mist/50 p-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-suya-green" aria-hidden="true" />
            Si no puedes activarlo, usa el <strong>modo ubicación simulada</strong> para probar toda
            la pantalla sin GPS.
          </li>
        </ol>
      </Modal>
    </Card>
  );
}
