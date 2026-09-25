import { Navigate, useParams } from 'react-router-dom';

/** Redirige enlaces antiguos de seguimiento a la ficha simplificada del pedido. */
export default function OrderTrackPage() {
  const { id = '' } = useParams();
  return <Navigate to={`/orders/${id}`} replace />;
}
