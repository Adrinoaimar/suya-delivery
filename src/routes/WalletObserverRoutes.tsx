import { Route, Routes } from 'react-router-dom';
import WalletObserverPage from '@/pages/wallet/WalletObserverPage';

export function WalletObserverRoutes() {
  return (
    <Routes>
      <Route path="*" element={<WalletObserverPage />} />
    </Routes>
  );
}
