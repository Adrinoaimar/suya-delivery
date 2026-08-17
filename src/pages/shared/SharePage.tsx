import { useState } from 'react';
import { BatteryMedium, Clock, EyeOff, MapPin, Siren, WifiOff } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Logo } from '@/components/common/Logo';
import { MapProvider } from '@/components/map/MapProvider';
import { DemoNotice } from '@/components/safety/DemoNotice';
import { demoRoute } from '@/data';
import { useNow, useSharedLocation } from '@/hooks/useSharedLocation';
import { formatRelative, formatTime } from '@/utils/format';

/** Vista pública que ve el contacto de confianza del repartidor. */
export default function SharePage() {
  const { token = '' } = useParams();
  const { snapshot, tokenMismatch } = useSharedLocation(token);
  const now = useNow();
  const [watching, setWatching] = useState(true);

  const sharing = snapshot?.status === 'sharing';

  return (
    <div className="min-h-dvh bg-suya-ivory">
      <header className="bg-suya-green px-4 py-3.5 text-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <Logo tone="onDark" size="sm" />
          <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold">
            Seguimiento seguro
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-5">
        {!snapshot || tokenMismatch ? (
          <Card className="text-center">
            <WifiOff className="mx-auto h-8 w-8 text-[#9AA0A6]" aria-hidden="true" />
            <h1 className="mt-3 font-display text-xl font-bold">Este enlace no está activo</h1>
            <p className="mt-1 text-sm text-[#6B7076]">
              El repartidor todavía no comenzó a compartir su ubicación, o el enlace corresponde a
              otra sesión.
            </p>
            <DemoNotice className="mt-4 text-left">
              Abre <code>/rider/safety</code> en otra pestaña de este mismo navegador y activa
              «Compartir mi ubicación» para ver los datos aquí.
            </DemoNotice>
            <Link to="/rider/safety" className="mt-4 inline-block text-sm font-semibold text-suya-green">
              Ir al panel de seguridad
            </Link>
          </Card>
        ) : !watching ? (
          <Card className="text-center">
            <EyeOff className="mx-auto h-8 w-8 text-[#9AA0A6]" aria-hidden="true" />
            <h1 className="mt-3 font-display text-xl font-bold">Dejaste de visualizar</h1>
            <p className="mt-1 text-sm text-[#6B7076]">
              Ya no estás viendo la ubicación de {snapshot.riderName}.
            </p>
            <Button className="mt-4" onClick={() => setWatching(true)}>
              Volver a visualizar
            </Button>
          </Card>
        ) : (
          <>
            {snapshot.sos && (
              <div
                role="alert"
                className="flex items-center gap-3 rounded-card border border-suya-danger bg-suya-danger-soft p-4"
              >
                <Siren className="h-6 w-6 shrink-0 text-suya-danger" aria-hidden="true" />
                <div>
                  <p className="font-display font-bold text-suya-danger">Alerta de emergencia demo</p>
                  <p className="text-sm text-[#4A4F55]">
                    {snapshot.riderName} activó el botón SOS dentro de la demostración.
                  </p>
                </div>
              </div>
            )}

            <Card>
              <h1 className="font-display text-xl font-bold">
                {snapshot.riderName.split(' ')[0]} está compartiendo su ubicación contigo
              </h1>
              <p className="mt-1 flex items-center gap-2 text-sm">
                <span
                  aria-hidden="true"
                  className={`h-2.5 w-2.5 rounded-full ${sharing ? 'bg-suya-lime' : 'bg-[#9AA0A6]'}`}
                />
                <span className="font-semibold">{sharing ? 'En ruta' : 'Dejó de compartir'}</span>
                <span className="text-[#6B7076]">
                  · Ubicación actualizada {formatRelative(snapshot.updatedAt, now)}
                </span>
              </p>
            </Card>

            <div className="h-64 overflow-hidden rounded-card border border-suya-mist bg-white">
              <MapProvider
                points={demoRoute.points}
                origin={demoRoute.origin}
                destination={demoRoute.destination}
                rider={snapshot.position}
                label={`Ubicación compartida por ${snapshot.riderName}`}
              />
            </div>

            <Card>
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="flex items-center gap-1 text-xs text-[#6B7076]">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    Inicio
                  </dt>
                  <dd className="font-medium">{formatTime(snapshot.startedAt)}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1 text-xs text-[#6B7076]">
                    <BatteryMedium className="h-3.5 w-3.5" aria-hidden="true" />
                    Batería demo
                  </dt>
                  <dd className="font-medium tabular-nums">{snapshot.battery}%</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1 text-xs text-[#6B7076]">
                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                    Coordenadas
                  </dt>
                  <dd className="font-medium tabular-nums">
                    {snapshot.position
                      ? `${snapshot.position.lat.toFixed(4)}, ${snapshot.position.lng.toFixed(4)}`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[#6B7076]">Precisión</dt>
                  <dd className="font-medium tabular-nums">
                    {snapshot.accuracy ? `${Math.round(snapshot.accuracy)} m` : '—'}
                  </dd>
                </div>
              </dl>
              {snapshot.simulated && (
                <p className="mt-3 text-xs text-[#9AA0A6]">
                  El repartidor está usando el modo de ubicación simulada.
                </p>
              )}
            </Card>

            <Button variant="secondary" fullWidth onClick={() => setWatching(false)}>
              <EyeOff className="h-4 w-4" aria-hidden="true" />
              Dejar de visualizar
            </Button>

            <DemoNotice>
              Esta pantalla se sincroniza únicamente entre pestañas del mismo navegador. En
              producción este módulo necesitará un servicio realtime para compartir la ubicación
              entre dispositivos.
            </DemoNotice>
          </>
        )}
      </main>
    </div>
  );
}
