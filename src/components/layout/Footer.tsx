import { Link } from 'react-router-dom';
import { Logo } from '@/components/common/Logo';

const INTERNAL_COLUMNS = [
  {
    title: 'Suya Delivery',
    links: [
      { to: '/stores', label: 'Tiendas' },
      { to: '/orders', label: 'Mis pedidos' },
    ],
  },
  {
    title: 'Soporte',
    links: [
      { to: '/help', label: 'Centro de ayuda' },
      { to: '/profile', label: 'Mi cuenta' },
    ],
  },
];

export function Footer() {
  const riderAppUrl = import.meta.env.VITE_RIDER_APP_URL?.replace(/\/$/, '');
  const columns = riderAppUrl
    ? [
        ...INTERNAL_COLUMNS.slice(0, 1),
        {
          title: 'Repartidores',
          links: [
            { href: `${riderAppUrl}/rider`, label: 'Panel del repartidor' },
            { href: `${riderAppUrl}/rider/safety`, label: 'Seguridad en ruta' },
          ],
        },
        ...INTERNAL_COLUMNS.slice(1),
      ]
    : INTERNAL_COLUMNS;

  return (
    <footer className="mt-12 hidden border-t border-suya-mist bg-white lg:block">
      <div className="shell grid grid-cols-4 gap-8 py-10">
        <div>
          <Logo size="sm" showCity />
          <p className="mt-3 max-w-[240px] text-sm text-[#6B7076]">
            Tu ciudad. Tus tiendas. Llegamos a ti. Apoyamos a los negocios de Sullana.
          </p>
        </div>
        {columns.map((column) => (
          <div key={column.title}>
            <h3 className="font-display text-sm font-bold uppercase tracking-wider text-suya-carbon">
              {column.title}
            </h3>
            <ul className="mt-3 space-y-2">
              {column.links.map((link) => (
                <li key={'href' in link ? link.href : link.to}>
                  {'href' in link ? (
                    <a href={link.href} className="text-sm text-[#6B7076] hover:text-suya-green">
                      {link.label}
                    </a>
                  ) : (
                    <Link to={link.to} className="text-sm text-[#6B7076] hover:text-suya-green">
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-suya-mist py-4">
        <p className="shell text-xs text-[#9AA0A6]">
          Suya Delivery · Sullana, Piura, Perú · Catálogo conectado a comercios incorporados.
        </p>
      </div>
    </footer>
  );
}
