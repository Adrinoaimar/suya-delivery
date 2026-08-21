import { mountApp } from './mount';
import { RiderRoutes } from '@/routes/RiderRoutes';
import { OrderBootstrap } from '@/app/OrderBootstrap';

mountApp(RiderRoutes, { Bootstrap: OrderBootstrap });
