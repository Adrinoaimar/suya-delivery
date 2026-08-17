import { assetUrl } from '@/utils/asset';
import type { Store } from '@/types';

interface StoreGalleryProps {
  gallery: NonNullable<Store['gallery']>;
  storeName: string;
}

/** Tira de fotos del local: se desliza en móvil y se reparte en escritorio. */
export function StoreGallery({ gallery, storeName }: StoreGalleryProps) {
  if (gallery.length === 0) return null;

  return (
    <section aria-label={`Fotos de ${storeName}`} className="pt-5">
      <h2 className="section-title mb-3">Así se ve {storeName}</h2>
      <ul className="hide-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0">
        {gallery.map((photo) => (
          <li
            key={photo.src}
            className="w-[248px] shrink-0 snap-start overflow-hidden rounded-card border border-suya-mist bg-white shadow-card lg:w-auto"
          >
            <img
              src={assetUrl(photo.src)}
              alt={photo.caption}
              loading="lazy"
              decoding="async"
              width={720}
              height={480}
              className="aspect-[3/2] w-full object-cover"
            />
            <p className="px-3 py-2 text-xs text-[#6B7076]">{photo.caption}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
