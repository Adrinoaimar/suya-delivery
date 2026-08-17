import { useEffect, useState } from 'react';
import sceneUrl from '@/assets/loader/sullana-scene.svg';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import '@/styles/intro-loader.css';
import { Logo } from './Logo';

const ROAD_D = 'M8 274 C 90 252, 150 264, 214 248 C 268 234, 312 238, 392 226';

/** Trazos de la silueta arquitectónica (PLACEHOLDER IGLESIA SULLANA). */
const CHURCH_PATHS = [
  'M96 240 V96 H164 V240',
  'M88 96 L130 46 L172 96',
  'M130 46 V26 M120 34 H140',
  'M436 240 V96 H504 V240',
  'M428 96 L470 46 L512 96',
  'M470 46 V26 M460 34 H480',
  'M164 240 V128 H436 V240',
  'M156 128 L300 66 L444 128',
  'M300 66 V40 M288 50 H312',
  'M270 240 V196 a30 30 0 0 1 60 0 v44',
  'M206 240 V186 a14 14 0 0 1 28 0 v54',
  'M366 240 V186 a14 14 0 0 1 28 0 v54',
];

interface SuyaIntroLoaderProps {
  onFinish: () => void;
  /** Duración mínima visible; la app se prepara detrás mientras tanto. */
  minDuration?: number;
}

export function SuyaIntroLoader({ onFinish, minDuration = 2600 }: SuyaIntroLoaderProps) {
  const reduceMotion = usePrefersReducedMotion();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const duration = reduceMotion ? 700 : minDuration;
    const leaveTimer = window.setTimeout(() => setLeaving(true), duration);
    const finishTimer = window.setTimeout(onFinish, duration + 420);
    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(finishTimer);
    };
  }, [minDuration, onFinish, reduceMotion]);

  return (
    <div
      className="suya-intro"
      data-leaving={leaving}
      role="status"
      aria-live="polite"
      aria-label="Cargando Suya Delivery"
    >
      <div className="suya-intro__stage">
        {reduceMotion ? (
          <img src={sceneUrl} alt="" className="suya-intro__scene" width={400} height={300} />
        ) : (
          <svg viewBox="0 0 400 300" className="suya-intro__scene" aria-hidden="true">
            <g className="intro-sun">
              <circle cx="200" cy="152" r="54" fill="#FFC107" opacity="0.22" />
              <circle cx="200" cy="152" r="30" fill="#FFC107" opacity="0.55" />
            </g>

            <g
              transform="translate(90.5 120.4) scale(0.365)"
              fill="none"
              stroke="#0E6B44"
              strokeWidth="9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {CHURCH_PATHS.map((d, index) => (
                <path
                  key={d}
                  d={d}
                  pathLength={1}
                  className="intro-draw"
                  style={{ animationDelay: `${300 + index * 28}ms`, animationDuration: '620ms' }}
                />
              ))}
              <circle
                cx="300"
                cy="150"
                r="20"
                pathLength={1}
                className="intro-draw"
                style={{ animationDelay: '660ms', animationDuration: '620ms' }}
              />
            </g>

            <path
              d="M20 210 H380"
              stroke="#E6E7E9"
              strokeWidth="3"
              strokeLinecap="round"
              pathLength={1}
              className="intro-draw"
              style={{ animationDelay: '700ms', animationDuration: '500ms' }}
            />

            <path
              id="intro-road"
              d={ROAD_D}
              fill="none"
              stroke="#E6E7E9"
              strokeWidth="17"
              strokeLinecap="round"
              pathLength={1}
              className="intro-draw"
              style={{ animationDelay: '800ms', animationDuration: '1000ms' }}
            />
            <path
              d={ROAD_D}
              fill="none"
              stroke="#FFC107"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="10 14"
              pathLength={1}
              className="intro-draw"
              style={{ animationDelay: '900ms', animationDuration: '900ms' }}
            />

            <g className="intro-rider">
              {/*
                La escala vive en un grupo propio: una animación CSS de `transform` sobre el
                mismo elemento reemplazaría el atributo `transform` del SVG y el repartidor
                aparecería a tamaño real y fuera de la ruta.
              */}
              <g transform="scale(0.42) translate(-80 -104)">
                <g className="intro-rider__body">
                  <path
                    d="M59 48 v14 M53 55 h12"
                    stroke="#FFFFFF"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M34 100 L68 80 L102 80 L126 100"
                    fill="none"
                    stroke="#0E6B44"
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path d="M62 80 h34" stroke="#1F2023" strokeWidth="9" strokeLinecap="round" />
                  <path
                    d="M126 100 L114 64"
                    stroke="#1F2023"
                    strokeWidth="6"
                    strokeLinecap="round"
                  />
                  <path
                    d="M108 62 L126 56"
                    stroke="#1F2023"
                    strokeWidth="5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M80 74 L88 92 L104 92"
                    fill="none"
                    stroke="#0A5335"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path d="M78 74 L94 48" stroke="#0E6B44" strokeWidth="13" strokeLinecap="round" />
                  <path d="M94 50 L114 62" stroke="#0E6B44" strokeWidth="8" strokeLinecap="round" />
                  <circle cx="103" cy="38" r="12" fill="#0A5335" />
                  <circle
                    cx="34"
                    cy="100"
                    r="18"
                    fill="none"
                    stroke="#1F2023"
                    strokeWidth="7"
                    className="intro-wheel"
                  />
                  <circle
                    cx="126"
                    cy="100"
                    r="18"
                    fill="none"
                    stroke="#1F2023"
                    strokeWidth="7"
                    className="intro-wheel"
                  />
                </g>
              </g>
              <animateMotion
                begin="0.9s"
                dur="1.3s"
                fill="freeze"
                rotate="0"
                calcMode="spline"
                keyPoints="0;0.86"
                keyTimes="0;1"
                keySplines="0.25 0.1 0.25 1"
              >
                <mpath href="#intro-road" />
              </animateMotion>
            </g>

            <g className="intro-pin" transform="translate(352 198)">
              <path
                d="M0 0 c-11 0 -20 9 -20 20 0 14 20 32 20 32 s20 -18 20 -32 c0 -11 -9 -20 -20 -20 z"
                fill="#FFC107"
              />
              <circle cx="0" cy="20" r="7" fill="#0E6B44" />
            </g>
          </svg>
        )}

        <div className={reduceMotion ? undefined : 'intro-logo'}>
          <Logo size="lg" showCity />
        </div>
        <p
          className={`${reduceMotion ? '' : 'intro-tagline '}text-center font-display text-sm font-semibold text-suya-green`}
        >
          Tu ciudad. Tus tiendas. Llegamos a ti.
        </p>
        <div className="intro-progress" aria-hidden="true">
          <span />
        </div>
      </div>
    </div>
  );
}
