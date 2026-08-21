import { mountApp } from './mount';
import { CustomerRoutes } from '@/routes/CustomerRoutes';
import { OrderBootstrap } from '@/app/OrderBootstrap';

mountApp(CustomerRoutes, { Bootstrap: OrderBootstrap, registerServiceWorker: true });
