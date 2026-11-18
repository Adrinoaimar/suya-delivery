import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { assetUrl } from '@/utils/asset';

const PHOTOS = [
  '/images/stores/tio-jhony/ceviche-mixto.webp',
  '/images/stores/tio-jhony/pollo-a-la-brasa.webp',
  '/images/stores/tio-jhony/ronda-nortena.webp',
] as const;

const ROTATION_MS = 4600;
interface PhotoState {
  active: number;
  previous: number | null;
}

function nextPhoto({ active }: PhotoState): PhotoState {
  return { active: (active + 1) % PHOTOS.length, previous: active };
}

export function HomeBannerPhotos({ reduceMotion }: { reduceMotion: boolean }) {
  const frame = useRef<HTMLDivElement>(null);
  const [{ active, previous }, setPhoto] = useState<PhotoState>({ active: 0, previous: null });
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const rotating = !reduceMotion && inView && pageVisible;

  useEffect(() => {
    const element = frame.current;
    if (!element || reduceMotion || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => setInView((entry?.intersectionRatio ?? 0) >= 0.25),
      { threshold: 0.25 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [reduceMotion]);

  useEffect(() => {
    const syncVisibility = () => setPageVisible(!document.hidden);
    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
    return () => document.removeEventListener('visibilitychange', syncVisibility);
  }, []);

  useEffect(() => {
    if (!rotating) return;
    const timer = window.setTimeout(() => setPhoto(nextPhoto), ROTATION_MS);
    return () => window.clearTimeout(timer);
  }, [active, rotating]);

  return (
    <div
      ref={frame}
      data-rotating={rotating}
      className="home-banner-media relative min-w-0 overflow-hidden bg-suya-green"
      style={{ '--home-banner-duration': `${ROTATION_MS}ms` } as CSSProperties}
    >
      {PHOTOS.map((src, index) => (
        <div
          key={src}
          data-active={index === active}
          data-previous={index === previous}
          className="home-banner-slide absolute inset-0"
          aria-hidden="true"
        >
          <img
            src={assetUrl(src)}
            alt=""
            width="640"
            height="640"
            loading={index === 0 ? 'eager' : 'lazy'}
            decoding="async"
            className="home-hero-photo h-full w-full object-cover object-[55%_53%]"
          />
        </div>
      ))}

    </div>
  );
}
