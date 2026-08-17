import { copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/*
 * GitHub Pages no reescribe rutas: una URL profunda como /suya-delivery/orders
 * devolvería 404. Copiando index.html a 404.html, Pages entrega igualmente la SPA
 * y React Router resuelve la ruta en el navegador.
 */
const dist = resolve(process.cwd(), 'dist');
await copyFile(resolve(dist, 'index.html'), resolve(dist, '404.html'));
console.log('404.html generado para las rutas de la SPA.');
