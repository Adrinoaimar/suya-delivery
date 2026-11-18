# Tres accesos para usar Suya

La persona elige según lo que necesita hacer. Cada acceso abre las herramientas de su público.

| Público | Acceso visible | Qué encuentra |
| --- | --- | --- |
| **Público general** | **Pedir ahora** | Suya Delivery para buscar, pedir, pagar y seguir el pedido. Suya Menús para ver la carta y pedir desde el enlace o el QR de mesa del comercio. |
| **Empresas** | **Gestionar mi negocio** | Suya Operaciones para administrar pedidos, carta, precios, horarios, ofertas, mesas, cobros y caja. El personal ingresa con su acceso al comercio. |
| **Repartidores** | **Repartir pedidos** | Suya Repartidor para activar disponibilidad, ver la entrega asignada, recoger, seguir la ruta y confirmar la entrega. El repartidor ingresa con su cuenta habilitada. |

En la web pública, **Pedir ahora** es la acción principal. **Empresas** y **Repartidores** son
accesos de navegación hacia sus respectivos paneles. El nombre **Repartidores** identifica al
equipo que entrega, mientras **Suya Delivery** identifica la app donde el cliente pide.
**Suya Jobs** queda como enlace de postulación para quien busca trabajo.

## Cómo se pasa un pedido de un equipo a otro

1. **El cliente hace el pedido.** En Suya Delivery indica una dirección. En Suya Menús entra
   por la carta pública o escanea el QR de mesa y puede pedir como invitado.
2. **La empresa prepara.** Los pedidos de los tres canales se ven en **Operaciones → Pedidos**.
   Un pedido digital entra a preparación tras verificarse el pago. En efectivo, el pedido puede
   confirmarse con el cobro pendiente. El comercio inicia la preparación y decide el despacho
   según el tipo de atención.
3. **Se entrega el pedido.** El personal del local atiende los pedidos en mesa. Para un pedido
   a domicilio, el comercio asigna a un repartidor. Este recoge, actualiza el avance y valida
   el código de entrega con el cliente. Cuando el pedido es contra entrega, cobra y entrega el
   efectivo a la caja del negocio para registrarlo en el turno.

## Suya Caja vive dentro del recorrido de Empresas

| Herramienta | Quién la usa | Para qué |
| --- | --- | --- |
| **Dispositivos de pagos** en Operaciones | Dueño, encargado autorizado o administrador | Configurar los QR de Yape y Lemon, emparejar dispositivos, habilitar rutas y revisar abonos dudosos. |
| **Suya Caja** en Android | Responsable del dispositivo de cobro | Mantener el equipo conectado y reportar notificaciones de abono al servidor. |
| **Caja y cierre** en Operaciones | Encargado de caja | Abrir turno, registrar efectivo de ventas y mesas, explicar diferencias y hacer el cierre. |

El servidor valida montos y pagos y comparte el estado del pedido con cada aplicación. Con la
asignación de Suya Caja habilitada, Yape y Lemon usan el primer puesto listo por billetera
en el orden **Adriano → Jean → Reserva**. Tres minutos sin señal dejan el puesto fuera de los
nuevos cobros. Cada QR que ya se mostró conserva su destinatario. Si Yape omite el nombre, el
flujo por código exige que coincidan el código observado, el monto y un solo intento elegible.
Las dudas las revisa Caja en la cuenta receptora antes de solicitar otro pago.

El **QR de mesa** abre la carta. El **QR de cobro** abre la transferencia. El **código de Yape**
permite conciliar el abono y el **código de entrega de Suya** acredita la recepción del pedido.

## Ajustes pendientes para aplicar esta separación

- **Repartidores.** Mostrar **Cobrar al entregar** para efectivo y **Pago verificado** cuando el
  cliente ya pagó. La pantalla revisada muestra **Total a cobrar** con cualquier método.
- **Empresas.** Mostrar y permitir la asignación de reparto solo en pedidos a domicilio.
  Verificar también el paso de servicio a cuenta para completar el cierre de Mesa QR.

**Referencias internas**

[Cliente y Menús](../src/routes/CustomerRoutes.tsx) ·
[Acceso de Empresas](../src/routes/BackofficeRoutes.tsx) ·
[Pedidos de Operaciones](../src/pages/backoffice/OrdersOperationsPage.tsx) ·
[Turnos de Caja](../src/pages/backoffice/CashRegisterPage.tsx) ·
[App de Caja](../src/pages/wallet/WalletObserverPage.tsx) ·
[Acceso para Repartidores](../src/routes/RiderRoutes.tsx) ·
[Entrega activa](../src/pages/rider/RiderCurrentPage.tsx) ·
[Asignación de billeteras](../supabase/migrations/20261118030839_wallet_observer_routing.sql) ·
[Conciliación de Yape por código](../supabase/migrations/20261118043507_wallet_observer_yape_code_fallback.sql)
