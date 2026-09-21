import { useLayoutEffect } from 'react';

const SITE_ORIGIN = 'https://suyadelivery.com';
const DEFAULT_IMAGE = `${SITE_ORIGIN}/brand/suya-logo.svg`;

interface SeoHeadProps {
  title: string;
  description: string;
  path?: string;
  noIndex?: boolean;
  image?: string;
  schema?: Record<string, unknown> | Record<string, unknown>[];
}

function upsertMeta(attribute: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

function upsertCanonical(href: string) {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!element) {
    element = document.createElement('link');
    element.rel = 'canonical';
    document.head.appendChild(element);
  }
  element.href = href;
}

/** Metadatos de búsqueda y compartir para las rutas públicas de la web cliente. */
export function SeoHead({
  title,
  description,
  path,
  noIndex = false,
  image = DEFAULT_IMAGE,
  schema,
}: SeoHeadProps) {
  // Los metadatos cambian cuando una ruta SPA termina de cargar. Aplicarlos en
  // layout evita que una página inexistente llegue a pintar brevemente como
  // indexable y mantiene el estado SEO sincronizado antes de la siguiente
  // lectura del DOM.
  useLayoutEffect(() => {
    const normalizedPath = path ?? window.location.pathname;
    const canonical = new URL(normalizedPath, SITE_ORIGIN).toString();
    const imageUrl = new URL(image, SITE_ORIGIN).toString();

    document.title = title;
    upsertMeta('name', 'description', description);
    upsertMeta('name', 'robots', noIndex ? 'noindex,nofollow' : 'index,follow');
    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:url', canonical);
    upsertMeta('property', 'og:image', imageUrl);
    upsertMeta('property', 'og:type', 'website');
    upsertMeta('property', 'og:locale', 'es_PE');
    upsertMeta('name', 'twitter:card', 'summary');
    upsertMeta('name', 'twitter:title', title);
    upsertMeta('name', 'twitter:description', description);
    upsertMeta('name', 'twitter:image', imageUrl);
    upsertCanonical(canonical);

    document.getElementById('suya-seo-schema')?.remove();
    if (schema) {
      const script = document.createElement('script');
      script.id = 'suya-seo-schema';
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify(schema);
      document.head.appendChild(script);
    }
  }, [description, image, noIndex, path, schema, title]);

  return null;
}

export { SITE_ORIGIN };
