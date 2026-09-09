import { mountApp } from './mount';
import { MobileRoutes } from '@/routes/MobileRoutes';
import { OrderBootstrap } from '@/app/OrderBootstrap';

mountApp(MobileRoutes, { Bootstrap: OrderBootstrap, registerServiceWorker: false });
