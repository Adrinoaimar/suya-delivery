import { mountApp } from './mount';
import { BackofficeRoutes } from '@/routes/BackofficeRoutes';
import { OrderBootstrap } from '@/app/OrderBootstrap';

mountApp(BackofficeRoutes, { Bootstrap: OrderBootstrap });
