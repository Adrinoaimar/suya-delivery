import { mountApp } from './mount';
import { WalletObserverRoutes } from '@/routes/WalletObserverRoutes';

mountApp(WalletObserverRoutes, { bootstrapAuth: false });
