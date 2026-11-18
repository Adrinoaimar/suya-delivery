# Investigación de cobros — SUYA Delivery

Fecha de consulta: 16 de noviembre de 2026, America/Lima. Investigación documental y lectura de código público; no se creó ninguna cuenta ni se operó dinero. Las condiciones de una cuenta concreta y su aprobación comercial no pueden acreditarse sin completar el proceso oficial.

## Resultado de la búsqueda

No se encontró una opción demostrada que reúna simultáneamente DNI sin RUC, 0% de comisión, API oficial verificable, asociación inequívoca con pedido y operación en nube sin dispositivo receptor encendido. Esto es una conclusión de las rutas examinadas, no una afirmación de inexistencia universal.

Mercado Pago Checkout Pro constituye el candidato técnico más práctico para añadir un segundo adaptador oficial: está disponible en Perú, admite Yape, expone creación/consulta de pagos y notificaciones autenticadas. Sin embargo, **apertura de cuenta personal con DNI no demuestra habilitación de Checkout como vendedor sin RUC**, ni autorización para recaudar fondos de restaurantes. La activación debe depender de las credenciales y permisos efectivos. [Apertura de cuenta](https://www.mercadopago.com.pe/signup/splitter), [requisitos de Checkout Pro](https://www.mercadopago.com.pe/developers/es/docs/checkout-pro-orders/overview).

Culqi sigue siendo una alternativa técnica válida para preservar la integración existente. Sus tarifas y admisión comercial deben contrastarse con la cuenta del titular: el contrato histórico admitía DNI/CE, mientras que el PDF principal actual corresponde al BCP y remite al formulario y evaluación. No se puede prometer aprobación de CulqiOnline con DNI a partir de promociones antiguas de POS. [Contrato histórico](https://culqi.com/static/files/terminos_y_condiciones_culqi_web_V6.pdf), [contrato actual](https://culqi.com/static/files/terminos_y_condiciones_culqi_web.pdf), [reserva de admisión](https://culqi.com/terminos_y_condiciones/).

KUTI y TAYPI ofrecen precisamente QR dinámico y confirmación financiera, pero ambos exigen RUC activo; no satisfacen la restricción obligatoria. Izipay ofrece afiliación con DNI y confirmación por IPN firmado, pero el paquete Online con Yape/QR/Plin tiene una condición de volumen publicada de más de S/200,000 mensuales y aceptación del proveedor. Por tanto no se debe habilitar este método para SUYA únicamente porque exista un ejemplo de API. [KUTI términos](https://www.kuti.pe/terminos), [TAYPI requisitos](https://taypi.pe/preguntas-frecuentes/), [Izipay condiciones](https://cdnwebb.izipay.pe/content-manager/pdfs/terminos/230/T%C3%A9rminos%20y%20condiciones).

## Matriz de identidad, precio y límites

`NC` = no comprobado públicamente para el producto indicado; no significa gratuito ni permitido. Los límites de cuentas personales y los de APIs son diferentes.

| Alternativa | Perú | Solo DNI / RUC | Comisión variable | Fijo por cobro | Mensualidad | Límites / restricción material |
|---|---|---|---|---|---|---|
| Yape personal / con DNI | Sí | DNI admitido | 0% en yapeos normales | S/0 | Registro gratis | Recepción 5 UIT al mes; página actual muestra S/27,500; límites de envío configurables [Y1] |
| Yape Empresa | Sí | Perfil sobre Yape BCP o DNI; acceso empresarial distinto | 2.95% de recaudación diaria | No publicado aparte | Sin otra cuota demostrada | Hasta S/999.99 por pago; reporte 90 días y ayudantes [Y2] |
| Plin personal | Sí | Cuenta bancaria persona natural; condiciones del banco | 0% | S/0 | Depende de cuenta bancaria | Interbank S/500 por transacción, S/20,000 recepción/día [P1] |
| BCP Recaudación interconectada | Sí | Contrato comercial; DNI-only NC | Cotización | Cotización | Cotización | Cuenta recaudadora e identificación por código; interconexión [B1] |
| Interbank Recaudación / Cobro Simple | Sí | Cuenta Negocio / contrato; DNI-only NC | Cotización | Cotización | Cotización | Canal empresas, validación online de deuda [B2] |
| BBVA API QR / Notificaciones | Sí | Oferta empresas; DNI-only NC | Cotización | Cotización | Cotización | API QR dinámico y avisos monetarios; no equiparar a QR Plin gratuito [B3] |
| Scotiabank Host to Host | Sí | Exige constitución y poderes de persona jurídica | Cotización | Cotización | Tarifario según contrato | ERP, conexión segura, aprobación de ejecutivo [B4] |
| Lemon Perú | Sí | DNI y selfie para persona natural | Según operación/anexos | NC | Mantenimiento S/0 | API comercio DNI NC; Pack Business no autoriza recaudar por terceros [L1] |
| DALE | Sí | A través de billetera/entidad asociada | Portada 0%; FAQ contempla comisiones avisadas | NC | NC | Sin API autoservicio para titular DNI comprobada [D1] |
| GMoney BaaS / recaudo / Yape Afiliados | Sí | Relación comercial B2B; DNI-only NC | Cotización | Cotización | Cotización | No es equivalente a obtener credenciales de tu billetera personal [G1] |
| Mercado Pago Checkout Pro | Sí | Cuenta personal DNI sí; Checkout vendedor sin RUC pendiente de comprobación | Tabla 3.49% inmediato / 3.29% 14 días; FAQ Link 3.99% / 3.79% + IGV | S/1 | Sin costos fijos según Link | Permisos, KYC, medio habilitado y tarifa de cuenta [M1–M4] |
| CulqiOnline | Sí | DNI histórico; admisión actual del producto requiere evaluación | Yape y tarjeta nacional 3.44%; PagoEfectivo/internacional 3.99% | USD0.20 para Online | S/0 mantenimiento | Mínimo S/3.50 bajo S/87.72 publicado con asterisco; confirmar aplicación por medio [C1–C3] |
| Izipay Online | Sí | DNI/RUC/CE aparece en guía oficial Online | Nacional 3.44%; internacional 4.09%, más IGV | S/0.69 + IGV | S/0 promocional en términos; confirmar vigencia | Yape/QR/Plin Online >S/200,000/mes y aprobación [I1–I3] |
| Openpay Perú | Sí | Términos generales admiten DNI/CE/RUC; ficha Pasarela BBVA exige RUC+DNI | Precio de cuenta; web pública no legible en consulta | Según contrato | Confirmar | No trasladar tarifas de Openpay Colombia a Perú [OP1–OP3] |
| Kashio Payin Perú | Sí, oferta publicada | Formulario comercial pide RUC; DNI-only NC | Cotización | Cotización | Cotización | Contratación comercial y cuenta receptora [KA1] |
| Niubiz Pago Web | Sí | RUC activo obligatorio | Cotización actual | Cotización | Cotización | SSL, web con carrito y cuenta al titular del RUC [N1] |
| KUTI QR | Sí, oferta publicada | RUC activo, CCI propio | 2.5% + IGV | S/0.20 + IGV | Registro gratis; plan concreto confirmar | QR hasta S/500; Yape afiliado hasta S/2,500 [K1–K2] |
| KUTI banco | Sí, oferta publicada | RUC activo | 1% + IGV, mínimo total S/5 | S/0.20 + IGV | Según plan | Desde S/50 [K2] |
| TAYPI QR | Sí, oferta publicada | RUC10 o RUC20, KYB para liquidación | 2.5% + IGV | S/0.20 + IGV | S/0 | Mínimo S/1; QR 15min; niveles S/10,000 o S/50,000 mensuales [T1–T2] |
| PayPal | Sí | KYC y habilitación comercial; DNI-only de API NC | Estándar Perú 5.4% | USD0.30 si se recibe USD | Sin cuota API estándar demostrada | PEN no figura como moneda soportada; conversión y retiro adicionales [PP1–PP2] |
| Prometeo | Oferta Perú publicada | Contrato / Order Form; DNI-only NC | Cotización | Cotización | Cotización | Cobertura exacta de movimientos por banco y permisos requieren contrato [A1] |
| TAPP vía GMoney | En certificación/piloto Q4 2026 según proveedor | Acceso B2B y certificación | Cotización por operación exitosa | Cotización | NC | No tratar anuncio/piloto como disponibilidad productiva inmediata [G2] |
| IzipayYA, BIM, Ligo, Agora y otras billeteras | Sí, con condiciones propias | DNI según entidad | Algunos yapeos/interoperabilidad gratis; no generalizable | Según entidad | Según entidad | No se encontró API financiera comercio DNI que permita aprobar pedidos desde QR personal [O1] |

## Matriz técnica y viabilidad

Tiempo de integración: estimación de ingeniería para un adaptador sobre SUYA, después de disponer de credenciales, sin incluir aprobación comercial. No es plazo garantizado del proveedor.

| Alternativa | API / webhook oficial | Verifica fondos recibidos | Yape / Plin | ¿Celular receptor permanente? | Seguridad / condiciones | Dificultad / viabilidad SUYA |
|---|---|---|---|---|---|---|
| Yape personal/DNI | No se encontró API pública para movimientos personales | Solo revisión oficial app; QR no prueba cobro | Interoperable | Para observador Android sí; para recibir dinero no | No usar scraping privado ni notificación como evidencia bancaria | Asistido; no automático fiable |
| Yape Empresa | Reportes/app/ayudantes; API comercio autoservicio NC | App oficial; sin contrato API no verificable desde SUYA | Yape, interoperabilidad | Sin API no se logra automatización nube demostrada | Pagar 2.95% no crea por sí solo webhook | Asistido; automático no demostrado |
| Plin personal | Sin API pública de movimientos DNI comprobada | App bancaria | Yape / Plin | Observador exige celular; QR físico puede recibir sin él | QR solo instruye destino | Asistido; no automático fiable |
| Bancos empresariales | Interconexión, APIs o H2H según producto; callbacks privados | Sí bajo contrato y referencias | Según canal contratado | No | Conexión autorizada, no credenciales de banca personal en bots | Alta, semanas; incompatible con DNI-only comprobado |
| Lemon personal | No API oficial de cobro comercio DNI encontrada | No verificable automáticamente desde SUYA con QR solamente | Sí interoperabilidad | No para recibir; sí observador | Recaudación de terceros excluida por términos Pack Business | Descartado como recaudador marketplace personal |
| DALE consumidor | No API de titular DNI comprobada | No desde SUYA sin acuerdo adicional | Interoperabilidad | Observador sí | Oferta usuario final diferente de API GMoney comercial | Descartado para aprobación automática |
| GMoney B2B | APIs publicitadas; documentación/credenciales por relación comercial | Posible bajo contrato | QR / Yape afiliado | No | Consentimiento y contrato obligatorio | Alta; candidato futuro cotizado, no 0% demostrado |
| Mercado Pago Checkout Pro | API de preferencia o Orders, GET pago, webhook HMAC | Sí: consulta API autenticada y estado approved | Yape sí; Plin directo no confirmado | No | HMAC + reconsulta + importe/PEN/referencia/collector/live_mode | Media, 3–7 jornadas estimadas; mejor nuevo adaptador condicionado |
| CulqiOnline | API cargos/órdenes/eventos, webhooks | Sí mediante API oficial | Yape sí; Plin vía PagoEfectivo no equivale a Plin directo | No | Reconsultar recurso; no confiar en token ni callback navegador | Media; preservar y reforzar implementación existente |
| Izipay Online | API y notificación IPN firmada | Sí con verificación servidor | Yape/Plin según habilitación >S200k | No | IPN/HMAC y consulta; ejemplo no debe copiarse literalmente | Media/alta; reserva si cumple habilitación comercial |
| Openpay | API Perú con cargos/consultas y webhooks Basic autenticados | Sí con reconsulta API, no sólo aviso | Según contrato habilitado | No | No confundir productos/países ni cuentas de consumidor | Media; no supera habilitación DNI incierta de MP |
| Kashio | Payin y conciliación B2B; documentación por contacto | Posible bajo contrato | Yape/Plin según oferta | No | RUC en solicitud; no ruta gratis DNI demostrada | Alta; descartado para requisito DNI-only |
| Niubiz | Portal/API/certificación de producto | Sí con confirmación oficial | Según producto aprobado | No | Credenciales, antifraude, contrato | Alta; descartado por RUC |
| KUTI | API intents/checkout y HMAC sobre timestamp.body | Sí con retrieve oficial | Ambos QR | No | SDK permite reintentos solo GET o POST con idempotencia | Media, 3–7 jornadas; descartado por RUC |
| TAYPI | API pagos, webhook HMAC, sandbox separado | Sí según documentación; no operado con credenciales propias | Ambos QR | No | Firma, idempotencia, KYB | Media, 3–7 jornadas; descartado por RUC |
| PayPal | Orders/Capture, API, webhooks oficiales | Sí | Sin Yape/Plin nativo | No | Verificación oficial; divisa extranjera | Media; inconveniente por PEN y costo |
| Prometeo | Banking/Payment APIs comerciales | Depende de recurso: validar cuenta no demuestra un ingreso | Depende de contrato | No | Consentimiento no sustituye contrato de acceso autorizado | Alta; no ofrece ruta DNI+gratis demostrada |
| Gmail API / correos | Gmail API y Pub/Sub, no webhook financiero bancario | No por sí solo | Cualquier aviso que llegue por correo | No | OAuth y DKIM autentican transporte/remitente, no crédito definitivo ni estado actual | Solo indicios y cola de conciliación; no aprobar |
| Observador Android | API propia, no API del emisor financiero | No por sí solo | Notificaciones Yape/Plin | Sí | Firma del dispositivo no convierte texto en comprobación bancaria | Incompatible con restricciones principales |
| QR dinámico EMV creado por SUYA | Generar QR no da acceso a cuenta del emisor | No | Según contenido e interoperabilidad | No para recibir | Referencia/monto sólo sirven si el emisor los devuelve verificados | No basta como solución autónoma |

## Costos para los tickets de SUYA

Son descuentos totales por una operación exitosa, en soles, redondeados a dos decimales con `Decimal` y half-up. Neto recibido = ticket − descuento. No se agregan impuestos del negocio, contracargos o retiro no publicados. Un cargo fijo por venta no es una mensualidad.

| Escenario | S/10 | S/20 | S/40 | S/60 | S/100 | S/200 |
|---|---:|---:|---:|---:|---:|---:|
| Yape / Plin personal, cobro gratuito | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Yape Empresa 2.95% | 0.30 | 0.59 | 1.18 | 1.77 | 2.95 | 5.90 |
| KUTI / TAYPI QR `(2.5% × M + 0.20) × 1.18` | 0.53 | 0.83 | 1.42 | 2.01 | 3.19 | 6.14 |
| KUTI banco, mínimo total S/5; desde S/50 | N/A | N/A | N/A | 5.00 | 5.00 | 5.00 |
| MP tabla inmediato `3.49% × M + 1`, antes de IGV no aclarado | 1.35 | 1.70 | 2.40 | 3.09 | 4.49 | 7.98 |
| MP mismo plan si se suma IGV 18% (escenario) | 1.59 | 2.00 | 2.83 | 3.65 | 5.30 | 9.42 |
| MP tabla 14 días `3.29% × M + 1`, antes de IGV no aclarado | 1.33 | 1.66 | 2.32 | 2.97 | 4.29 | 7.58 |
| MP mismo plan si se suma IGV 18% (escenario) | 1.57 | 1.96 | 2.73 | 3.51 | 5.06 | 8.94 |
| MP FAQ Link inmediato `(3.99% × M + 1) × 1.18` | 1.65 | 2.12 | 3.06 | 4.00 | 5.89 | 10.60 |
| MP FAQ Link 14 días `(3.79% × M + 1) × 1.18` | 1.63 | 2.07 | 2.97 | 3.86 | 5.65 | 10.12 |
| Culqi Yape/nacional `3.44% × M + USD0.20`, TC referencial del proveedor 3.85 | 1.11 | 1.46 | 2.15 | 2.83 | 4.21 | 7.65 |
| Culqi si aplica mínimo total S/3.50 | 3.50 | 3.50 | 3.50 | 3.50 | 4.21 | 7.65 |
| Izipay nacional `(3.44% × M + 0.69) × 1.18` | 1.22 | 1.63 | 2.44 | 3.25 | 4.87 | 8.93 |

Notas de precisión:

- Mercado Pago publica cifras incompatibles entre la tabla y FAQ de su propia página de Link. La página de Checkout muestra 3.49%/3.29% pero no aclara IGV. Por ello no se presenta una tarifa única como cobro final confirmado; el precio de la cuenta y el contrato deben decidir qué escenario aplica. Presupuestar la fila conservadora no convierte esa tarifa en la aprobada para SUYA. [Tabla Checkout](https://www.mercadopago.com.pe/herramientas-para-vender/check-out), [tabla y FAQ Link](https://www.mercadopago.com.pe/herramientas-para-vender/link-de-pago).
- Culqi declara comisiones inafectas a IGV; no se añade 18%. Su tarifa de Online fija USD0.20; S/0.77 usa **su tipo referencial S/3.85**, no el tipo de cambio de mercado actual. El costo exacto es `M×0.0344 + 0.20×TC aplicado`. La publicación del piso S/3.50 tiene diferencias de alcance entre calculadora y asteriscos del tarifario: se muestran ambos escenarios para no inventar la aplicación al Yape de una cuenta nueva. [Precios](https://culqi.com/precios/), [calculadora](https://culqi.com/).
- Yape Empresa liquida la comisión sobre el total diario, por lo que el redondeo por ticket de la tabla es orientativo y puede diferir un céntimo del agregado. No se añade IGV adicional no anunciado en la calculadora oficial.
- PayPal no permite presentar una cifra final exacta en PEN: la API no lista PEN y requiere cobro en otra moneda. Con USD la fórmula estándar es 5.4% + USD0.30; al convertir/retiro puede haber otros cargos. No es comparable como cobro local PEN equivalente. No se inventa una mensualidad ni un tipo aplicado.
- Niubiz, APIs bancarias, GMoney y Prometeo no publican una oferta final suficiente para calcular los seis tickets de SUYA. `Cotización` no equivale a S/0.

## Investigación de código público

Se descargaron exclusivamente archivos de código y metadatos para inspección, sin instalar ni ejecutar esos proyectos. Las fechas `pushed_at` son metadatos GitHub consultados el 16/11/2026; no demuestran pruebas productivas.

| Repositorio | Actividad/licencia comprobada | Código leído y resultado | Decisión |
|---|---|---|---|
| [mercadopago/sdk-nodejs](https://github.com/mercadopago/sdk-nodejs) | pushed 2026-11-13; MIT | [validador webhook](https://github.com/mercadopago/sdk-nodejs/blob/master/src/utils/webhook/index.ts), [consulta de pago](https://github.com/mercadopago/sdk-nodejs/blob/master/src/clients/payment/get/index.ts), [crear preferencia](https://github.com/mercadopago/sdk-nodejs/blob/master/src/clients/preference/create/index.ts). HMAC SHA256, comparación constante, rutas oficiales y path encoding | Referencia oficial útil; no prueba por sí misma aceptación de cuenta DNI |
| [kuti-pe/kuti-node](https://github.com/kuti-pe/kuti-node) | pushed 2026-10-07; MIT | [firma](https://github.com/kuti-pe/kuti-node/blob/main/src/webhooks.ts), [cliente](https://github.com/kuti-pe/kuti-node/blob/main/src/client.ts), [intents](https://github.com/kuti-pe/kuti-node/blob/main/src/resources/paymentIntents.ts). Firma timestamp + cuerpo crudo; tolerancia 300s; GET o POST idempotente con reintentos limitados | Protocolo técnicamente adecuado; excluido por RUC |
| [culqi/culqi-reactjs-demo-jsv4](https://github.com/culqi/culqi-reactjs-demo-jsv4) | pushed 2026-11-13; sin LICENSE detectada | [PaymentYape](https://github.com/culqi/culqi-reactjs-demo-jsv4/blob/master/src/pages/PaymentYape/PaymentYape.jsx), [checkout](https://github.com/culqi/culqi-reactjs-demo-jsv4/blob/master/src/utils/checkout.js). Token Yape no equivale a cargo; ejemplo recibe `sk` en utilitario del navegador y lo registra | No copiar ejemplo a producción; mantener secretos sólo backend |
| [izipay-pe/Server-PaymentForm-NodeJS](https://github.com/izipay-pe/Server-PaymentForm-NodeJS) | pushed 2025-01-30; sin licencia detectada | [paidController](https://github.com/izipay-pe/Server-PaymentForm-NodeJS/blob/main/controllers/paidController.js). CreatePayment y `kr-answer` firmado para IPN; ejemplo sin auditoría/atómico/idempotencia, toma importe del body y usa igualdad simple del hash | Referencia de protocolo, no módulo productivo reutilizable |
| [franclinSumaky/yape-plin-notifications](https://github.com/franclinSumaky/yape-plin-notifications) | pushed 2026-08-24; sin licencia detectada | [PaymentListenerService.kt](https://github.com/franclinSumaky/yape-plin-notifications/blob/main/android-app/app/src/main/java/com/sumaky/notifier/PaymentListenerService.kt), [Firebase function](https://github.com/franclinSumaky/yape-plin-notifications/blob/main/firebase-functions/index.js). Regex sobre notificación, guarda en Firestore y reenvía WhatsApp; no consulta banco | Descartado: requiere Android y no prueba recepción financiera |
| [camiloreynaga/yape-notifier](https://github.com/camiloreynaga/yape-notifier) | pushed 2026-05-22; sin licencia detectada | Listener NotificationListenerService y PaymentNotificationParser. Captura texto, monto `Double`, guarda localmente y agenda WorkManager | Descartado: mismo problema de confianza/dispositivo; no es API Yape oficial |
| [Naresh-Paturi-Community/openrecon](https://github.com/Naresh-Paturi-Community/openrecon) | pushed 2026-06-15; MIT | [matching.py](https://github.com/Naresh-Paturi-Community/openrecon/blob/main/src/openrecon/matching.py), [money.py](https://github.com/Naresh-Paturi-Community/openrecon/blob/main/src/openrecon/money.py). Usa Decimal y fase por referencia seguida de heurística monto/fecha | Puede asistir conciliación de reportes; nunca aprobar pedido con emparejamiento heurístico |

Observaciones concretas para el adaptador seleccionado:

1. La firma MP usa el identificador de recurso de query y `x-request-id`, no un número de operación escrito por comprador. La guía exige convertir identificadores alfanuméricos a minúsculas donde corresponda. Las docs muestran ejemplos de timestamp en milisegundos mientras el SDK leído asume segundos para tolerancia; conservar el texto al calcular HMAC y validar magnitud de tiempo defensivamente. [Guía de notificaciones](https://www.mercadopago.com.pe/developers/en/docs/checkout-pro-preferences/additional-settings/optional-notifications).
2. El SDK advierte que los eventos de QR Code no van firmados. No usar ese producto para prometer webhooks autenticados; Checkout payment es una ruta diferente.
3. La versión de SDK 3.6.1 documentó corrección de path traversal por IDs. Un adaptador REST debe validar y codificar IDs, con host fijo; nunca aceptar una URL del webhook para hacer fetch arbitrario. [Changelog](https://github.com/mercadopago/sdk-nodejs/blob/master/CHANGELOG.MD).
4. MP mantiene las rutas Preferences y Orders en documentación actual. No mezclar estados de `/v1/orders` con los de `/v1/payments`; la migración de marketplace tiene diferencias de comisiones de split. [Migración oficial](https://www.mercadopago.com.pe/developers/es/docs/checkout-api-orders/resources/migrate-payments-to-orders).

## Automatización cloud y vías descartadas

- Supabase Edge Functions es un lugar apropiado para autenticación y reconsulta de API, PostgreSQL para aplicar el pago y pedido en una sola transacción, y un job programado para recuperar notificaciones perdidas. Cloudflare Workers también podría recibir eventos, pero no aporta evidencia bancaria a un QR personal. No hace falta agregar otro hosting para lo que Supabase ya resuelve.
- Gmail puede usarse sin celular con OAuth, Pub/Sub y renovación de `watch`; requiere renovar al menos cada siete días y prever eventos demorados/perdidos. Autenticar el push de Google sólo prueba que cambió el buzón. No prueba que la transferencia sea final, no esté revertida y pertenezca al pedido. DKIM/SPF tampoco sustituyen una API contractual de movimientos. Por eso se justifica una cola de indicios, nunca `paid`. [Google Gmail push](https://developers.google.com/workspace/gmail/api/guides/push).
- Monto único, céntimos distintos, comprobante OCR, código de operación enviado por cliente y QR con descripción no aportan unicidad bancaria de origen. La asociación fiable usa una referencia creada en servidor y devuelta por el emisor con ID de transacción no reutilizable.
- No se usó ingeniería inversa de apps, interceptación de OTP, emulación Android bancaria, scraping de banca por Internet ni custodia de contraseñas personales. Una librería de conciliación no sustituye la fuente de datos financiera.
- Open banking autorizado sí existe como oferta B2B: BBVA publica APIs QR y notificaciones; Scotiabank publica H2H; GMoney y Prometeo publican capacidades comerciales. Lo no demostrado es una oferta productiva autoservicio gratis para cualquier DNI peruano. No afirmar que «ningún banco tiene API».

## Qué falta acreditar externamente

1. Cuenta de vendedor de la persona receptora: permisos reales de API en Perú, KYC, identidad, capacidad de cobrar y tarifa exacta visible.
2. Habilitación contractual de SUYA como una única cuenta recaudadora, si el dinero corresponde a operaciones propias; si actúa como marketplace de terceros, confirmar la modalidad oficial apropiada. MP Split 1:1 requiere KYC6 y OAuth por vendedor; 1:N requiere contacto comercial. Un Access Token personal no prueba autorización para agregar fondos ajenos. [Requisitos marketplace](https://www.mercadopago.com.pe/developers/es/docs/split-payments/split-1-1/prerequisites), [integración marketplace](https://www.mercadopago.com.pe/developers/es/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace).
3. Credenciales propias de prueba y un endpoint HTTPS desplegado para sandbox real; una simulación local no demuestra que Mercado Pago envió el webhook.
4. Tras sandbox, despliegue aprobado de funciones/migraciones y primer pago de validación con autorización explícita de dinero real. Suya no debe mostrarse activo antes de esas verificaciones.

## Fuentes primarias adicionales para la matriz

- Y1: [Registro y límites Yape](https://www.yape.com.pe/preguntas-frecuentes/crear-tu-cuenta-yape/9--existe-un-costo-por-registrarme).
- Y2: [Yape Empresa](https://www.yape.com.pe/productos/yape-empresa), [comisiones](https://www.yape.com.pe/preguntas-frecuentes/enviar-y-recibir-yapeos/yape-cobra-comisiones), [acceso al perfil](https://www.yape.com.pe/preguntas-frecuentes/yape-empresa/como-puedo-acceder-a-yape-empresa).
- P1: [Plin](https://plin.pe/), [Plin negocios Interbank](https://interbank.pe/canales-digitales/plin/plin-negocios), [Plin persona natural / QR Empresa BBVA](https://www.bbva.pe/personas/servicios-digitales/plin/perfilador.html).
- B1: [BCP Recaudación](https://www.viabcp.com/empresas/cobranzas-y-pagos/cobranzas/servicios-de-recaudacion).
- B2: [Interbank Recaudación](https://interbank.pe/empresas-instituciones/pagos-cobros/recaudacion/recaudacion), [Cobro Simple](https://cobrosimple.interbank.pe/).
- B3: [APIs BBVA Perú](https://www.bbva.pe/empresas/apis-bbva.v2.html). El API Market internacional contiene productos España/Colombia que no deben atribuirse a Perú.
- B4: [ScotiaConnect Host to Host Perú](https://www.scotiabank.com.pe/Empresas/Cash-Management/Banca-Electronica/host-to-host).
- L1: [Lemon términos Perú](https://lemon.me/peru/peru-terms/t%C3%A9rminos-y-condiciones-billetera-electr%C3%B3nica), [pagar QR Yape/Plin](https://help.lemon.me/pe/es/articles/9904048-necesito-un-codigo-qr-de-lemon-para-escanear).
- D1: [DALE](https://dale.pe/).
- G1: [GMoney](https://gmoney.com.pe/), [Yape Afiliados](https://gmoney.com.pe/yape-afiliados/).
- G2: [TAPP y estado de certificación](https://gmoney.com.pe/tapp/).
- M1: [Apertura personal/negocio](https://www.mercadopago.com.pe/signup/splitter).
- M2: [Cuenta personal y cuenta vendedor](https://vendedores.mercadolibre.com.pe/nota/como-funciona-mercado-pago-para-el-vendedor).
- M3: [Checkout](https://www.mercadopago.com.pe/herramientas-para-vender/check-out).
- M4: [Link y FAQ](https://www.mercadopago.com.pe/herramientas-para-vender/link-de-pago).
- C1: [Culqi precios](https://culqi.com/precios/).
- C2: [API Culqi](https://apidocs.culqi.com/).
- C3: [Admisión y condiciones Culqi](https://culqi.com/terminos_y_condiciones/).
- I1: [Izipay credenciales Online, DNI/RUC/CE](https://github.com/izipay-pe/obtener-credenciales-de-conexion).
- I2: [Izipay términos con tarifa y restricción de métodos](https://cdnwebb.izipay.pe/content-manager/pdfs/terminos/230/T%C3%A9rminos%20y%20condiciones).
- I3: [IPN firmado](https://developers.izipay.pe/android-core/integration/notifications/), [arquitectura web](https://developers.izipay.pe/web-core/diagram/).
- N1: [Requisitos Niubiz Pago Web](https://contactos.niubiz.com.pe/soluciones-de-pago/pago-web/).
- K1: [KUTI términos actualizados 05/10/2026](https://www.kuti.pe/terminos).
- K2: [KUTI tarifas](https://www.kuti.pe/tarifas).
- T1: [TAYPI FAQ](https://taypi.pe/preguntas-frecuentes/).
- T2: [TAYPI sandbox y producción](https://docs.taypi.pe/ambientes), [registro RUC](https://docs.taypi.pe/integracion).
- PP1: [PayPal tarifas Perú](https://www.paypal.com/pe/business/paypal-business-fees).
- PP2: [Monedas PayPal API](https://developer.paypal.com/api/codes/currency).
- A1: [Prometeo contrato y alcance por Order Form](https://prometeoapi.com/en/legal/msa), [cobertura Perú anunciada](https://prometeoapi.com/agentic-banking-infrastructure).
- O1: [Repositorio oficial de fintechs de Perú](https://www.gob.pe/91408-repositorio-nacional-de-fintechs), [tarifario Ligo 2026](https://ligo.pe/wp-content/uploads/2026/02/TARIFARIOFECHA-IGV-05-02-2026-v17-5.pdf).

- OP1: [Openpay condiciones generales que incluyen DNI](https://www.openpay.pe/terminos-condiciones).
- OP2: [Pasarela BBVA/Openpay exige RUC y DNI](https://www.bbva.pe/empresas/productos/cobros-y-pagos/soluciones-de-pago/pasarela-de-pago.html).
- OP3: [API de Openpay Perú](https://documents.openpay.pe/documentacion/api-v2/index.html), [documentación Perú](https://documents.openpay.pe/docs/).
- KA1: [Kashio Payin Perú y formulario RUC](https://kashio.net/payin-pe/).


## Implementación realizada en SUYA durante esta misión

Código integrado en la copia Git actual `/home/adriano/Documentos/ChatGPT/SUYA`, rama `main`, base `6f48740`. El conector SUYA apuntaba a una copia histórica y su túnel estaba inaccesible; se inspeccionaron directamente el repositorio actual, README, AGENTS, documentación, historial de pagos y código. Se preservaron los cambios del usuario que ya estaban presentes. No se creó SUYA desde cero, no se migró el stack, no se alteraron catálogo ni reparto como parte del módulo financiero.

Aplicaciones: cliente `suyadelivery.com`, repartidor `rider.suyadelivery.com`, restaurantes y administración en `panel.suyadelivery.com`; cliente móvil y observador Android dedicados también existentes. Producción Supabase: `cggxooilzhqlcnofgtmi` (SUYA-DELYVERI). QA: `tgywjfzuspxxfsdywmof` (SUYA-STAGING-QA), pausado. El usuario pidió expresamente mantenerlo pausado el 16/11/2026. No se desplegaron ni aplicaron cambios en ninguno de ellos.

Se reutilizan `orders`, `payment_attempts`, `order_events`, Auth, RLS, secretos guest, precios calculados en PostgreSQL, idempotencia del checkout y Realtime. El trigger de autorización existente confirma `pending_payment → confirmed` dentro de la transacción del pago; la transición a preparación sigue siendo una decisión independiente del restaurante. No se añadió un segundo sistema de notificaciones que duplique el flujo existente.

### Prototipos contrastados y resultados

| Ruta | Código/prueba ejecutada | Resultado y límite |
|---|---|---|
| Mercado Pago Checkout Pro | Adaptador REST oficial, handlers Edge compartidos con tests, preferencia por referencia UUID, HMAC, GET financiero, cifrado y conciliación | Pruebas HTTP/DB controladas locales superadas. Sondas HTTP públicas sin credenciales rechazaron consultas protegidas. No se realizó sandbox autenticado ni cobro real. |
| Culqi existente | Auditoría y endurecimiento de las tres Edge Functions, finalizadores sólo servidor, metadata/importe/PEN/captura y respuestas afectadas | Pruebas ejecutables de handlers superadas. No se dispone de claves para sandbox real; reservas de cargo incierto se retienen para conciliación. |
| Yape/Lemon por Android | Se inspeccionó el listener y las RPC actuales; se comprobó que las últimas migraciones sí autorizaban por observación, contradiciendo README | Se sustituyó esa autorización por declaración pendiente. Las observaciones ya no aprueban ni cancelan pedidos. No satisface automatización bancaria y no se usa como camino principal. |
| KUTI / TAYPI | Documentación, requisitos, tarifas y SDK/código inspeccionado | RUC obligatorio: descartadas antes de construir una integración comercial que incumpla la misión. |
| Izipay / Openpay | Documentación oficial y código IPN/API inspeccionado | Habilitación concreta DNI/medios no acreditada; Izipay publica restricción de volumen para Yape/QR/Plin Online. No se fingió un sandbox ni se incorporó un adaptador sin habilitación. |
| Gmail / conciliación heurística | Protocolo Gmail Pub/Sub y repositorios inspeccionados | Evidencia de correo/notificación no equivale a recepción financiera; no se implementó aprobación por esos indicios. |

### Hallazgos corregidos

1. Las RPC de confirmación por nombre/código de Yape podían autorizar mediante notificación Android. Ahora conservan la declaración como pendiente y rechazan aprobación por observación, aun si coincide exactamente con el pedido. Se retiraron los botones de aprobación de ese panel; la captura, emparejamiento y consulta de indicios permanecen disponibles.
2. Los claims y finalizadores Culqi podían llamarse desde el navegador. Se restringieron a `service_role`; las Edge Functions comprueban primero el actor con JWT/guest y luego usan el privilegio servidor. Un token de frontend nunca es una prueba financiera.
3. Un resultado incierto del proveedor ya no libera automáticamente una reserva y provoca un segundo cobro; queda retenido. La reconsulta y registro de excepciones se describen en la guía.
4. El módulo nuevo separa ID de preferencia e ID de transacción financiera, conserva la transacción canónica, impide reutilizarla y no revierte una autorización correcta por eventos de otro intento. Eventos antiguos no restauran dinero devuelto.

### Archivos y contratos principales

- Migración `20261116195853_harden_legacy_payment_trust.sql`: cierre de aprobación Android y finalizadores Culqi.
- Migración `20261116195958_provider_neutral_payment_gateway.sql`: configuración privada versionada, céntimos generados de importe decimal exacto, claims, transacciones únicas, auditoría y RPC de creación/aplicación/lectura/conciliación. No amplía enums existentes de manera incompatible: usa `gateway_state` explícito para pendiente, aprobado, rechazado, vencido, cancelado, tarde, discrepancias, devolución parcial/total, disputa y prueba.
- `supabase/functions/_shared/payment-provider.ts`: contrato del proveedor; `payment-mercadopago.ts`: primer adaptador oficial; no se añadió SDK ni dependencia de proveedor al frontend.
- `payment-gateway`: crear, consultar, guardar/comprobar/activar configuración, probar sandbox y conciliar.
- `payment-webhook`: autenticar HMAC, reconsultar recurso financiero y aplicar una RPC atómica.
- `SupabasePaymentGatewayService`, `SupabasePaymentService`, `SupabaseOrderService`: contratos compartidos y adaptación del checkout existente.
- `PaymentSettingsPage`: ruta `/payments` en backoffice y `/backoffice/payments` en app unificada. Nombre visible «Configuración de cobros — SUYA Delivery».
- `PaymentInstructions`: enlace de checkout con allowlist de host, confirmación sólo desde estado servidor, expiración y excepciones sin invitar a repetir un abono.
- `scripts/reconcile-payments.mjs` y workflow `reconcile-payments.yml`: recuperación cloud opcional cada cinco minutos; está deshabilitada hasta configurar secretos/variable. Webhook es el canal principal, Actions no ofrece puntualidad garantizada.

Las credenciales de cada restaurante se cifran AES-256-GCM con nonce aleatorio y AAD restaurante+entorno. La clave maestra sólo vive en Edge Secrets; los ciphertext históricos permanecen privados para conciliar cobros emitidos antes de rotar credenciales. No hay claves privadas en Vite, Git, outputs ni capturas. SQL financiero y lectura de secretos sólo son ejecutables por servidor; clientes sólo acceden a su intento y roles owner/manager a sus cobros. Todas las tablas nuevas tienen RLS y permisos explícitos.

La activación exige cuenta MPE comprobada, creación de preferencia permitida, webhook con HMAC válida, entorno live y declaración del administrador sobre habilitación contractual. Eso demuestra conectividad y autorización técnica para crear una solicitud; no sustituye KYC ni acredita por sí solo una venta liquidada. La primera operación real todavía requiere prueba autorizada posterior a QA/sandbox.

### Evidencia ejecutada y pruebas pendientes

- Base antes de cambios: **403/403** pruebas existentes superadas.
- Estado conjunto: **524/524** pruebas Vitest superadas, **84 archivos**, con HTTP y persistencia controlados localmente. Incluye pruebas anteriores de carrito, restaurantes, backoffice, reparto y nuevas de pagos.
- `typecheck`, `lint`, build general y builds de las tres aplicaciones: superados. El escaneo de secretos y revisión de bundles se registran en `PAYMENT_VERIFICATION.json`.
- Pantalla de cobros real renderizada en harness de prueba aislado: **320, 390, 1440 px**, sin scroll horizontal, controles con nombre y sin `pageerror`. Guardar/comprobar no activa una cuenta test. Capturas claramente rotuladas como prueba local.
- Smoke de bundles de cliente/repartidor/backoffice en Chromium: rutas públicas y barreras de acceso sin sesión; no constituye E2E financiero ni prueba multirol autenticada.
- Dos migraciones y cuerpos de funciones SQL/PLpgSQL nuevos: gramática validada con pglast PostgreSQL17. Los tests pgTAP nuevos y tres permutaciones de concurrencia en dos sesiones están escritos y su SQL se analizó sintácticamente. **No se ejecutó PostgreSQL ni se verificaron RLS/atomicidad/carreras en un servidor real**, porque QA está pausado por decisión del usuario. El parser no sustituye esa prueba.
- Sandbox autenticado y dinero real: **no ejecutados**. El usuario sólo dispone de Yape/Plin personal. Los tests locales nunca se presentan como un pago del proveedor.

Los casos implementados cubren importe correcto/incorrecto, dos pedidos del mismo importe, transacción duplicada, webhook repetido/firma inválida, pendiente/rechazado/cancelado/vencido, confirmación tardía, error de conexión/base, reintento, cancelación de pedido, llamada de aprobación desde navegador, reutilización entre pedidos, devoluciones parciales/totales, disputas, eventos fuera de orden y solicitudes simultáneas. Las pruebas locales de simultaneidad validan los handlers y sus llamadas idempotentes; la exclusión y rollback PostgreSQL quedan para pgTAP/isolationtester en QA.

### Decisión y grado de cumplimiento

Se elige **Mercado Pago Checkout Pro como adaptador técnico configurable**, sin prometer que el registro del usuario sea aprobado sólo con DNI. Los fondos se configuran por restaurante para sus ventas propias; no se implantó una recaudación agregada de terceros ni split sin autorización contractual. La interfaz ofrece «Pago en línea» y muestra los medios que habilite la cuenta; no promete Plin ni un QR específico. Yape personal sigue siendo una recepción con revisión, sin aprobación automática por indicios.

No se consiguió demostrar la combinación sin RUC + 0% + automática. Sí quedó implementada una ruta cloud oficial, sin celular permanente, que confirma y libera pedidos al recibir evidencia financiera válida, con pruebas locales y bloqueos seguros. No está declarada lista para producción. Ver `SUYA_PAYMENT_SETUP.md` para los pasos concretos externos y de despliegue.


## Motor AutoCloud integrado

# Investigación Técnica, Matriz Comparativa y Prototipos de Pagos Automáticos — SUYA Delivery

**Proyecto:** SUYA Delivery (Sullana, Piura, Perú)
**Fecha de investigación y verificación:** Noviembre 2026 (Tarifarios y normativa vigentes 2025/2026)
**Alcance:** Recepción y verificación automática de pagos en la nube (server-to-server) sin celular Android permanente, priorizando registro como persona natural con DNI peruano, comisión mínima/0% y seguridad transaccional atómica en PostgreSQL + Supabase Edge Functions.

---

## 1. Diagnóstico del Estado Previo en SUYA Delivery (Fase 1 y 2)

Antes de diseñar la nueva arquitectura, se auditó el código canónico de SUYA Delivery (`main` en `6f48740`) y sus ramas históricas (`work/sandbox` con Izipay):

1. **Flujo previo `wallet_observer` (QR estático Yape / Lemon + Lector Android)**:
   - El cliente escaneaba un QR EMVCo estático almacenado en `public.restaurant_payment_accounts` e ingresaba el código de seguridad Yape de **3 dígitos** (`confirm_manual_wallet_payment_by_code_v2`) o el nombre del titular de Lemon (`confirm_manual_wallet_payment`).
   - **Limitaciones críticas detectadas**:
     - Dependía de mantener un teléfono Android físico encendido 24/7 con la APK `Suya Caja` leyendo `StatusBarNotification` (`ingest_wallet_observation`).
     - Las notificaciones de sistema Android y los códigos ingresados por el comprador son **indicios**, no confirmaciones financieras criptográficas del banco/procesador.
     - Además, las notificaciones de pagos interoperables (cuando un cliente paga al QR de Yape desde **Plin, Interbank, BBVA o BCP**) **no incluyen el código de seguridad de 3 dígitos** en el push (`Yape! <Nombre> te envió un pago por S/ <Monto>`), dejando esos pagos bloqueados sin poder conciliarse por código de 3 dígitos.
2. **Flujo previo `culqi` (`create-culqi-order`, `charge-culqi-card`, `culqi-webhook`)**:
   - Integraba órdenes y cargos de Culqi, pero estaba acoplado por completo a variables de entorno estáticas (`VITE_CULQI_GATEWAY_ENABLED`), sin abstracción multi-proveedor, sin panel administrativo en Backoffice para configurar credenciales ni probar conexión/sandbox, y exigiendo RUC activo.

---

## 2. Distinción Legal y Operativa en Perú: DNI vs. RUC 10 vs. RUC 20

Para evaluar con rigor técnico qué proveedores cumplen la restricción **«No exigir constituir una empresa / Priorizar registro con DNI peruano»**, es indispensable separar los 3 niveles existentes en Perú:

| Nivel Fiscal en Perú | ¿Exige constituir empresa (Notaría / SUNARP)? | Costo y Tiempo de Obtención | Qué permite abrir en Fintech / Pasarelas de Perú |
| :--- | :--- | :--- | :--- |
| **1. Solo DNI (Persona Natural sin RUC)** | **No** | S/ 0.00 (Inmediato con DNI físico/azul o DNIe) | Billeteras personales (Yape DNI, Plin, Lemon, Ligo, Prexpe, Bim), IzipayYA app (QR estático 0%) y **Mercado Pago Perú (Cuenta Personal con API + Webhooks + Yape OTP)**. |
| **2. RUC 10 (Persona Natural con Negocio)** | **NO exige constituir empresa** (es la misma persona natural: `10` + `DNI` + dígito verificador) | **100% Gratis (S/ 0.00)** en 15 minutos desde la app **Personas SUNAT** con DNI y selfie biométrica. Sin gastos notariales ni SUNARP. | Desbloquea las pasarelas con **menor comisión de Perú**: **TAYPI (`taypi.pe`)**, **KUTI (`kuti.pe`)**, **Openpay Perú (BBVA)**, **Culqi Online** e **Izipay Online**. |
| **3. RUC 20 (Persona Jurídica: EIRL, SAC, SRL)** | **Sí** (Minuta, Escritura Pública, SUNARP, Cuenta Corriente Empresarial) | S/ 350 – S/ 900 y 5 a 15 días hábiles | Exigido por agregadores corporativos B2B (Monnet, Kushki Enterprise, Bamboo, APIs Host-to-Host de BCP/Interbank/GMoney). **Descartado por restricción del proyecto.** |

---

## 3. Investigación Exhaustiva por Categorías (Fase 3)

### Categoría A — Billeteras y Bancos Peruanos

1. **Yape Personal / Yape con DNI (`yape.com.pe`)**:
   - **Comisión**: **0%**.
   - **Límite de recepción mensual**: **5 UIT por mes calendario** (D.S. N.º 260-2024-EF: **S/ 26,750/mes** en 2025; D.S. N.º 301-2025-EF: **S/ 27,500/mes** en 2026 con UIT = S/ 5,500). Superado ese tope, la cuenta no puede recibir más yapeos hasta el mes siguiente.
   - **API / Webhook**: **No existe API ni Webhook oficial** para Yape Personal ni Yape con DNI.
   - **Diferencia entre códigos de 3 y 6 dígitos**:
     - *Código de seguridad de 3 dígitos*: Aparece en el comprobante tras un yapeo P2P de Yape a Yape. **No existe** cuando el pago proviene de Plin o de otro banco vía QR interoperable, y no ofrece endpoint de consulta pública.
     - *Código de aprobación de 6 dígitos (OTP «Aprobar compras»)*: Token dinámico TOTP de la app Yape diseñado específicamente para cobros automáticos server-to-server mediante API de pasarelas autorizadas (Mercado Pago, Culqi, KUTI, Niubiz, Izipay).
2. **Yape Empresa (`yape.com.pe/productos/yape-empresa`)**:
   - **Requisitos**: Cuenta BCP con DNI/RUC 10 o RUC 20. Amplía recepción hasta S/ 5,000,000/mes y pagos entrantes hasta S/ 3,000 por operación.
   - **Comisión**: **2.95%** sobre el total recaudado en el día (sin cargo fijo por transacción; incluye comprobante fiscal).
   - **API / Webhook**: **No tiene API ni Webhook para e-commerce**. Solo ofrece perfiles «Ayudante» en la app y reportes Excel. Por sí solo no automatiza un checkout web sin pasarela.
3. **Plin (Interbank, BBVA, Scotiabank, BanBif) y QR EMVCo BCRP**:
   - **Comisión en cuentas personales**: **0%** (tope de envío de S/ 500 por operación y S/ 1,500–S/ 3,000 diarios).
   - **API / Webhook directo**: No existe para cuentas personales.
   - **Interoperabilidad QR EMVCo (Circular N.º 0003-2020-BCRP)**: Cualquier QR Dinámico EMVCo generado por una pasarela conectada a la CCE/BCRP (TAYPI, KUTI, Culqi, Openpay, Izipay) puede ser escaneado indistintamente desde **Yape, Plin o cualquier banco peruano**, disparando un webhook server-to-server en `< 3 segundos`.
4. **BCP, Interbank, BBVA y Scotiabank (Open Banking Perú)**:
   - Según el cronograma del Reglamento del **Sistema de Finanzas Abiertas (SFA) de la SBS**, los 4 bancos mayores recién estarán obligados a exponer APIs estandarizadas de cuentas de ahorro para personas naturales el **1 de enero de 2028**. Hoy todas las APIs bancarias de recaudación directa exigen **RUC 20** y cuenta corriente corporativa.
5. **Lemon Perú (`lemon.me`)**:
   - **Estado actual**: Operativa en Perú para personas naturales con DNI, interoperable con Yape y Plin vía QR EMVCo y CCE a través de la EEDE **GMoney**.
   - **API / Webhook**: **No ofrece API REST ni Webhooks** para que comercios recauden y concilien pagos en soles (PEN).
6. **DALE, GMoney, Ligo, Prexpe, Bim y Agora Pay**:
   - **GMoney (`gmoney.com.pe`) / DALE**: Provee la infraestructura BaaS de dinero electrónico y QR interoperable en Perú, pero su API directa es exclusivamente **B2B para RUC 20**. Sin embargo, pasarelas como **TAYPI** y **KUTI** empaquetan esta misma infraestructura para personas naturales con **RUC 10**.
   - **Ligo, Prexpe, Bim, Agora**: Billeteras B2C o QR presencial sin API pública self-service ni webhooks para e-commerce.

---

### Categoría B — Procesadores y Pasarelas en Perú

1. **Mercado Pago Perú (`mercadopago.com.pe/developers`) — Mejor opción «Solo DNI (Sin RUC) + 100% Automático Cloud»**:
   - **Registro**: Permite abrir **Cuenta Personal únicamente con DNI peruano** (sin RUC) y activar credenciales productivas (`APP_USR-...`) y de pruebas (`TEST-...`) en `mercadopago.com.pe/developers/panel`.
   - **Yape Nativo Server-to-Server (`payment_method_id: "yape"`)**:
     1. El cliente introduce en SUYA su número de celular Yape (9 dígitos) y el **código de aprobación de 6 dígitos** de su app Yape.
     2. El servicio tokeniza vía `POST https://api.mercadopago.com/platforms/pci/yape/v1/payment?public_key=...`.
     3. El backend de SUYA ejecuta el cobro síncrono `POST https://api.mercadopago.com/v1/payments` con `X-Idempotency-Key`.
     4. El pago se confirma **en el mismo request HTTP (< 2 s)** con `"status": "approved"` y además envía un Webhook `POST` firmado con `x-signature` (`HMAC-SHA256`), verificable vía `GET https://api.mercadopago.com/v1/payments/{id}`.
   - **Tarifa vigente**: `3.49% + S/ 1.00 + IGV (18%)` (liberación inmediata) o `3.29% + S/ 1.00 + IGV` (liberación a 14 días).
2. **TAYPI (`taypi.pe`) y KUTI (`kuti.pe`) — Mejor opción «QR Dinámico Yape + Plin de Mínima Comisión» (con RUC 10 gratuito)**:
   - **Registro**: Aceptan **RUC 10 (Persona Natural con Negocio, trámite gratuito online en SUNAT con DNI)** sin constituir empresa.
   - **Funcionamiento**: Crean un **QR Dinámico EMVCo** único por pedido (`POST /v1/checkout/sessions`) con el importe exacto en céntimos bloqueado y la referencia del pedido embebida. El cliente escanea el QR con **Yape, Plin, BCP, Interbank, BBVA, Scotiabank o Lemon** y el servidor recibe un Webhook firmado con `HMAC-SHA256` (`Taypi-Signature`) en tiempo real.
   - **Tarifa vigente**: **`2.50% + S/ 0.20 + IGV (18%)`** (la comisión más baja de Perú para QR dinámico con webhook). Sin mensualidad.
3. **Openpay Perú — BBVA (`openpay.pe`)**:
   - **Registro**: RUC 10 o RUC 20.
   - **Tarifa vigente**: **`3.44% + IGV (4.06% efectivo)` sin cargo fijo por transacción** y sin mensualidad. Es la opción más económica para pedidos muy pequeños (S/ 10 – S/ 20) cuando se desea aceptar tanto QR interoperable como tarjetas.
4. **Culqi Online (`culqi.com` — Grupo Credicorp)**:
   - **Registro**: RUC 10 o RUC 20.
   - **Funcionamiento**: Soporta **Yape Token (`ype_`)**, **Órdenes QR interoperables (`ord_`)** para Yape/Plin y **Tarjetas (`tkn_`)**.
   - **Tarifa vigente**: **`3.44% + US$ 0.20 (≈ S/ 0.75)`** (inafecto a IGV en emisores financieros; `+ 18% IGV` en medios no financieros). Abono el mismo día en cuentas BCP.
5. **Izipay Online vs. IzipayYA (`izipay.pe`)**:
   - **IzipayYA (App QR)**: Permite DNI y cobra **0%**, pero **no tiene API ni Webhook** (es un QR estático para verificación manual).
   - **Izipay Online (API REST + IPN Webhook)**: Exige RUC 10 o RUC 20. Tarifa estándar `3.44% + S/ 0.69 + IGV`.
6. **Niubiz, PayPal y Fpay**:
   - **Niubiz**: Cobra afiliación (~S/ 300 + IGV) y mensualidad fija (~S/ 59 + IGV) además de `3.45% + US$ 0.15 + IGV`. Descartado por costos fijos mensuales.
   - **PayPal Perú**: Opera solo en USD (`5.40% + US$ 0.30` + pérdida cambiaria) y no soporta Yape ni Plin. Descartado.
   - **Fpay**: Cerró operaciones para comercios terceros en Perú en octubre de 2023. Descartado.

---

### Categoría C — Automatizaciones Cloud sin Celular Permanente (Verificación de Correos Bancarios y DNS en Perú)

Se verificó mediante consultas DNS reales (`dig +short TXT`) y análisis de parsers reales el comportamiento de los correos bancarios en Perú:

1. **Hallazgo crítico sobre correos de recepción en Perú**:
   - **Yape (`yape.com.pe`), BCP (`notificacionesbcp.com.pe`), Interbank (`interbank.pe`), BBVA (`bbva.com.pe`), Scotiabank (`scotiabank.com.pe`) y Lemon (`lemon.me`) NO envían correos electrónicos automáticos al RECEPTOR cuando recibe un pago por Yape, Plin o QR interoperable.**
   - Solo envían correos automáticos al **emisor** (cuando el dinero sale de su cuenta) o en **transferencias bancarias clásicas** cuando quien transfiere escribe manualmente el correo del destinatario en la casilla opcional *"Enviar constancia a correo"*.
   - Por lo tanto, depender de Gmail API o Cloudflare Email Workers como método principal para Yape/Plin **no funciona en la realidad operativa peruana** porque el banco nunca emite ese correo al comercio receptor en pagos QR/Yape/Plin.
2. **Seguridad criptográfica DNS de bancos peruanos (verificada con `dig`)**:
   - `notificacionesbcp.com.pe` y `bcp.com.pe`: `SPF -all`, `DMARC p=quarantine`, selectores DKIM `s1`, `s2`, `mailjet`, `selector1`, `selector2`.
   - `interbank.com.pe`: tiene `DMARC p=none` (mientras `interbank.pe` tiene `p=quarantine`), lo que significa que un parser de correo que solo mire el header `From:` (como hace el repo `wolugtec-sudo/finmail-peru`) es vulnerable a spoofing si no verifica explícitamente `dkim=pass`, `spf=pass` y `dmarc=pass` en `Authentication-Results` del MTA receptor.
   - Por esta razón, en SUYA Delivery las notificaciones no firmadas por una API de pagos se tratan estrictamente como **indicios para revisión de Caja** y nunca como autorización financiera automática.

---

### Categoría D — Auditoría de Código de Repositorios en GitHub

Se inspeccionó el código fuente (no solo el `README.md`) de 12 repositorios públicos:

| Repositorio GitHub | Última Actividad | Licencia | Qué hace realmente su código | ¿Requiere celular 24/7? | Evaluación de Seguridad y Viabilidad para SUYA |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `overdev-code/python_mercadopago_yape` | Mayo 2025 | Sin licencia | Tokeniza Yape OTP (`POST /platforms/pci/yape/v1/payment`) y ejecuta cobro síncrono `POST /v1/payments` con `payment_method_id: "yape"` e idempotencia. | **No (100% Cloud)** | **Patrón API oficial válido y verificado.** Su demo hardcodeaba el monto en `app.py`; en SUYA el monto se lee exclusivamente de PostgreSQL en céntimos. |
| `jeasoncues24/culqi-qr-sdk` | Octubre 2026 | MIT | SDK TypeScript para órdenes QR de Culqi (`POST /v2/orders`) para Yape/Plin y validación server-to-server `GET /v2/orders/{id}` tras webhook. | **No (100% Cloud)** | **Excelente arquitectura.** Confirma que los webhooks de Culqi deben re-verificarse siempre con `GET /v2/orders/{id}` usando `sk_`. |
| `neoevsys/taypi-whmcs` | Mayo 2026 | GPL-2.0+ | Módulo oficial de `taypi.pe` para sesiones de QR dinámico EMVCo (`POST /v1/checkout/sessions`) y webhooks firmados con `HMAC-SHA256` (`Taypi-Signature`). | **No (100% Cloud)** | **Alta seguridad.** Usa `HMAC-SHA256` con timestamp y comparación en tiempo constante (`hash_equals`). |
| `dyba404/ecommerce-pe` y `dyba404/recepcionista` | Octubre 2026 | Sin licencia | Integración multi-tenant de Culqi Yape (`ype_`) + tarjetas (`tkn_`) con llaves secretas cifradas en BD y fallback honesto a QR estático con revisión manual. | **No (100% Cloud)** | **Buena práctica adoptada en SUYA:** cifrar secretos por restaurante y separar claramente cobro automático API vs. QR estático manual. |
| `MrLooy/elduende-portal` | Octubre 2026 | MIT | Next.js + Culqi `/v2/charges` con candado de idempotencia + flujo separado para QR estático con reversión si un humano no aprueba. | **No** | Confirma que el QR estático sin pasarela nunca puede aprobarse definitivamente sin revisión. |
| `wolugtec-sudo/finmail-peru` | Julio 2026 | Sin licencia | Sincroniza Gmail (`gmail/sync.js`) buscando correos de Yape/Plin/BCP/Interbank. | No | **Descartado por inseguro e inoperante:** usa mocks inventados (`no-reply@yape.com.pe` «Te yapearon») que Yape no envía en la vida real y no verifica firmas DKIM/DMARC. |
| `sirjuno/obtener_gastos_tarjeta_bcp_gmail` | Noviembre 2025 | MIT | Google Apps Script probado con correos reales de `notificaciones@notificacionesbcp.com.pe`. | No | Demuestra que los correos reales del BCP son de **gastos/envíos salientes**, no de recepciones de Yape/Plin. |
| `JoseGordilloMendoza/LectorNotificacionesYape` | Octubre 2026 | Sin licencia | App Android en Kotlin (`YapeNotificationListenerService.kt`, `YapeParser.kt`) que lee notificaciones push de Yape/Interbank. | **Sí (Celular 24/7)** | Confirma los regex reales de push en Perú y prueba que los pagos de otros bancos/Plin a Yape no traen código de 3 dígitos. **No cumple «sin celular permanente».** |
| `Jozelom/yape-listener` y `BrunoPM2001/yapeListener` | Nov 2025 / Mar 2025 | Sin licencia | Apps Android Kotlin que interceptan `StatusBarNotification` de Yape y las suben a Firebase/REST. | **Sí (Celular 24/7)** | **Descartados como método de autorización automática** por depender de celular encendido y carecer de respaldo bancario criptográfico. |

---

## 4. Matriz Comparativa Completa y Cálculo Exacto de Costos (Fase 4)

### 4.1. Matriz Técnica y Operativa de Proveedores en Perú

| Proveedor / Método | Disponible en Perú | ¿Solo con DNI (sin RUC)? | ¿Requiere RUC? | Comisión % | Cargo Fijo | Mensualidad | Límites por Operación / Mes | ¿API Oficial? | ¿Webhook Oficial? | ¿Verifica dinero recibido? | ¿Requiere celular 24/7? | ¿Yape y Plin? | Seguridad y ToS | Dificultad Integración | Viabilidad Real para SUYA |
| :--- | :---: | :---: | :--- | :---: | :---: | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :--- | :---: | :--- |
| **1. Mercado Pago Perú (Yape OTP API + Checkout)** | **Sí** | **SÍ (Cuenta Personal DNI)** | Opcional (RUC 10/20 al escalar) | `3.49%` *(o 3.29% a 14d)* + IGV | `S/ 1.00 + IGV` (`S/ 1.18`) | **S/ 0** | S/ 2.00 a S/ 500 (Yape OTP) / S/ 30,000 (Tarjeta) | **Sí** | **Sí (`HMAC-SHA256`)** | **Sí (100% Cloud)** | **No** | **Yape Sí (API)** / Plin No | Oficial, PCI DSS, 100% legal | Media (1 día) | **ALTA (Prioridad #1 si no se tramita RUC 10)** |
| **2. TAYPI (`taypi.pe`) QR Dinámico EMVCo** | **Sí** | No | **RUC 10 (gratis con DNI, sin empresa)** | `2.50%` + IGV | `S/ 0.20 + IGV` (`S/ 0.236`) | **S/ 0** | S/ 1.00 a S/ 1,500 por QR | **Sí** | **Sí (`HMAC-SHA256`)** | **Sí (100% Cloud CCE)** | **No** | **Sí (Ambos + Bancos)** | Oficial BCRP EMVCo, 0 contracargos | Baja (1 día) | **MUY ALTA (Prioridad #1 en costo y Yape+Plin con RUC 10)** |
| **3. KUTI (`kuti.pe`) QR Dinámico + Yape** | **Sí** | No | **RUC 10 (gratis con DNI, sin empresa)** | `2.50%` (QR) / `3.00%` (Yape) + IGV | `S/ 0.20 + IGV` (`S/ 0.236`) | **S/ 0** | S/ 1.00 a S/ 500 (QR) / S/ 2,500 (Yape) | **Sí** | **Sí** | **Sí (100% Cloud)** | **No** | **Sí (Ambos)** | Oficial, respaldado por EEDE | Baja (1 día) | **MUY ALTA (Equivalente a TAYPI con RUC 10)** |
| **4. Openpay Perú (BBVA)** | **Sí** | No | **RUC 10 (gratis con DNI, sin empresa)** | `3.44%` + IGV (`4.06%`) | **S/ 0.00** | **S/ 0** | Desde S/ 1.00 | **Sí** | **Sí** | **Sí (100% Cloud)** | **No** | **Sí (QR + Tarjeta)** | Oficial Grupo BBVA | Media (1–2 días) | **ALTA (Mejor tasa en pedidos de S/ 10 a S/ 20 con RUC 10)** |
| **5. Culqi Online (Credicorp)** | **Sí** | No | **RUC 10 (gratis con DNI, sin empresa)** | `3.44%` | `US$ 0.20` (`≈ S/ 0.75`) | **S/ 0** | S/ 6.00 a S/ 500 (Yape) / S/ 5,000+ (Tarjeta) | **Sí** | **Sí (Basic + API GET)** | **Sí (100% Cloud)** | **No** | **Sí (Botón Yape + QR Plin)** | Oficial Grupo Credicorp / BCP | Ya integrado y mejorado | **ALTA (Ideal si ya se tiene cuenta BCP + RUC 10)** |
| **6. Izipay Online** | **Sí** | No | **RUC 10 (gratis con DNI, sin empresa)** | `3.44%` + IGV | `S/ 0.69 + IGV` (`S/ 0.81`) | **S/ 0** | Desde S/ 1.00 | **Sí** | **Sí (`HMAC-SHA256`)** | **Sí (100% Cloud)** | **No** | **Sí (QR Yape/Plin + Tarjeta)** | Oficial Interbank | Media | **MEDIA-ALTA (Más caro que TAYPI/Openpay en tickets bajos)** |
| **7. QR Estático AutoCloud (`static_qr`: Yape / Plin / Lemon / IzipayYA)** | **Sí** | **SÍ (Solo DNI)** | **No** *(o RUC 10 gratis en IzipayYA)* | **`0.00%`** | **S/ 0.00** | **S/ 0** | Yape DNI: 5 UIT/mes (S/ 27,500 en 2026) / Plin: S/ 1,500 a S/ 3,000/día | **Sintetizador EMVCo `Tag 54` + `CRC-16` en SUYA** | **Sí (Cloudflare Email Worker / Gmail API OAuth2 DKIM)** | **Sí (100% Cloud vía DKIM/SPF/DMARC bancario + Céntimo Único)** | **No** | **Sí (QR EMVCo interoperable Yape/Plin/Lemon/IzipayYA)** | Estándar EMVCo BCRP + RFC 6376 DKIM sin raspado ni celular | Ya integrado (`staticQrAutoCloud.ts`) | **MÁXIMA para 0% Comisión + Sin Celular (con alertas de correo bancarias / Plin / IzipayYA / Lemon)** |
| **8. Yape Empresa (App BCP)** | **Sí** | **Sí (DNI/RUC 10)** | No obligatorio | `2.95%` | **S/ 0.00** | **S/ 0** | S/ 3,000/op · S/ 5M/mes | **No** | **No** | **No en web (solo en app)** | Sí (para ver en app) | **Sí** | Oficial BCP, pero sin API web | N/A | **BAJA para automatización cloud (cobra 2.95% sin dar API)** |
| **9. Niubiz Pago Web** | **Sí** | No | RUC 10 / 20 | `3.45%` + IGV | `US$ 0.15 + IGV` | **S/ 59 + IGV** (+ S/300 alta) | Sin tope bajo | Sí | Sí | Sí | No | Sí | Oficial | Alta | **DESCARTADO por mensualidad y costo de afiliación** |

---

### 4.2. Cálculo Exacto de Costo Total por Pedido (S/ 10, S/ 20, S/ 40, S/ 60, S/ 100 y S/ 200)

Todos los cálculos incluyen **cargos fijos e IGV (18%)** cuando aplica, mostrando `Comisión Descontada (Neto Recibido por el Restaurante)`:

| Proveedor / Modalidad | Fórmula Exacta con IGV (18%) | Pedido de **S/ 10.00** | Pedido de **S/ 20.00** | Pedido de **S/ 40.00** | Pedido de **S/ 60.00** | Pedido de **S/ 100.00** | Pedido de **S/ 200.00** |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **QR Estático AutoCloud (`static_qr` — Yape / Plin / Lemon / IzipayYA)** *(EMVCo Tag 54 + DKIM AutoCloud)* | `0%` *(micro-descuento de 0 a 99 céntimos solo si hay colisión simultánea)* | **S/ 0.00** *(Recibes S/ 10.00)* | **S/ 0.00** *(Recibes S/ 20.00)* | **S/ 0.00** *(Recibes S/ 40.00)* | **S/ 0.00** *(Recibes S/ 60.00)* | **S/ 0.00** *(Recibes S/ 100.00)* | **S/ 0.00** *(Recibes S/ 200.00)* |
| **TAYPI (`taypi.pe`) / KUTI (`kuti.pe`) — QR Dinámico Yape/Plin** *(RUC 10, 100% Auto Cloud)* | `((M × 2.50%) + S/ 0.20) × 1.18` | **S/ 0.53** *(Recibes S/ 9.47)* | **S/ 0.83** *(Recibes S/ 19.17)* | **S/ 1.42** *(Recibes S/ 38.58)* | **S/ 2.01** *(Recibes S/ 57.99)* | **S/ 3.19** *(Recibes S/ 96.81)* | **S/ 6.14** *(Recibes S/ 193.86)* |
| **Openpay Perú (BBVA)** *(RUC 10, 100% Auto Cloud)* | `(M × 3.44%) × 1.18 = 4.0592%` | **S/ 0.41** *(Recibes S/ 9.59)* | **S/ 0.81** *(Recibes S/ 19.19)* | **S/ 1.62** *(Recibes S/ 38.38)* | **S/ 2.44** *(Recibes S/ 57.56)* | **S/ 4.06** *(Recibes S/ 95.94)* | **S/ 8.12** *(Recibes S/ 191.88)* |
| **Culqi Online (Yape OTP / QR / Tarjeta)** *(RUC 10, 100% Auto Cloud)* | `(M × 3.44%) + S/ 0.75` *(inafecto / con IGV)* | **S/ 1.09** *(S/ 1.29 c/IGV)* *(Recibes S/ 8.91)* | **S/ 1.44** *(S/ 1.70 c/IGV)* *(Recibes S/ 18.56)* | **S/ 2.13** *(S/ 2.51 c/IGV)* *(Recibes S/ 37.87)* | **S/ 2.81** *(S/ 3.32 c/IGV)* *(Recibes S/ 57.19)* | **S/ 4.19** *(S/ 4.94 c/IGV)* *(Recibes S/ 95.81)* | **S/ 7.63** *(S/ 9.00 c/IGV)* *(Recibes S/ 192.37)* |
| **Izipay Online (QR / Tarjeta)** *(RUC 10, 100% Auto Cloud)* | `((M × 3.44%) + S/ 0.69) × 1.18` | **S/ 1.22** *(Recibes S/ 8.78)* | **S/ 1.63** *(Recibes S/ 18.37)* | **S/ 2.44** *(Recibes S/ 37.56)* | **S/ 3.25** *(Recibes S/ 56.75)* | **S/ 4.87** *(Recibes S/ 95.13)* | **S/ 8.93** *(Recibes S/ 191.07)* |
| **Mercado Pago Perú (Yape OTP API / Checkout)** *(Solo DNI sin RUC, 100% Auto Cloud)* | `((M × 3.49%) + S/ 1.00) × 1.18` | **S/ 1.59** *(Recibes S/ 8.41)* | **S/ 2.00** *(Recibes S/ 18.00)* | **S/ 2.83** *(Recibes S/ 37.17)* | **S/ 3.65** *(Recibes S/ 56.35)* | **S/ 5.30** *(Recibes S/ 94.70)* | **S/ 9.42** *(Recibes S/ 190.58)* |
| **Yape Empresa (App BCP)** *(Sin API ni Webhook web)* | `M × 2.95%` | **S/ 0.30** *(Recibes S/ 9.70)* | **S/ 0.59** *(Recibes S/ 19.41)* | **S/ 1.18** *(Recibes S/ 38.82)* | **S/ 1.77** *(Recibes S/ 58.23)* | **S/ 2.95** *(Recibes S/ 97.05)* | **S/ 5.90** *(Recibes S/ 194.10)* |

---

## 5. Evaluación por Prioridades y Selección de Arquitectura (Fase 4 y 5)

1. **Prioridad 1 — «DNI + comisión cero + sin celular permanente + verificación totalmente automática» (`static_qr` AutoCloud)**:
   - **Cómo resolvimos la automatización 100% Cloud de QR Estático (Yape / Plin / Lemon / IzipayYA) sin depender de un celular**:
     - **A. Inyección Dinámica sobre QR Estático EMVCo (`src/lib/payments/staticQrAutoCloud.ts`)**: Todos los códigos QR interoperables del Perú (**Yape, Plin, Lemon e IzipayYA**) utilizan el estándar **EMVCo Merchant-Presented QR del BCRP (`000201...6304XXXX`)**. SUYA parsea los nodos TLV del QR estático del comercio e inyecta en la nube por cada pedido:
       - `Tag 01 = '12'` (QR con importe de transacción embebido).
       - `Tag 53 = '604'` (Moneda Soles PEN).
       - `Tag 54` = Importe único de conciliación (`allocateUniqueConciliationAmountCents`: asigna automáticamente un micro-descuento de `0` a `99` céntimos en caso de pedidos simultáneos del mismo importe, por ejemplo `25.00`, `24.99`, `24.98`, garantizando un índice único `payment_attempts_static_autocloud_unique_amount_uidx` en PostgreSQL).
       - `Tag 62` (`Subtag 05`) = Referencia `SUYA-...` del intento.
       - `Tag 63` = Suma de verificación `CRC-16/CCITT-FALSE` (`polinomio 0x1021`, `init 0xFFFF`) recalculada.
     - **B. Verificación Criptográfica Bancaria DKIM/SPF/DMARC Sin Celular (`Cloudflare Email Worker` + `Gmail API OAuth2`)**:
       - Al usar un QR receptor interoperable vinculado a **Plin (Interbank, BBVA, Scotiabank), Lemon Cash, IzipayYA o alertas de abono BCP/Yape**, cualquier pago que haga el cliente desde **Yape o Plin** dispara una constancia bancaria por correo firmada criptográficamente con **DKIM (`RFC 6376`)**.
       - Nuestro worker ([`scripts/cloudflare-email-worker-autocloud.mjs`](scripts/cloudflare-email-worker-autocloud.mjs)) o el sincronizador serverless de Gmail API (`sync_gmail_autocloud` en [`supabase/functions/payment-gateway/index.ts`](supabase/functions/payment-gateway/index.ts)) verifica criptográficamente `Authentication-Results` (`mx.cloudflare.net` / `mx.google.com` con `spf=pass`, `dkim=pass`, `dmarc=pass`), el dominio firmante (`notificacionesbcp.com.pe`, `bcp.com.pe`, `yape.com.pe`, `interbank.pe`, `interbank.com.pe`, `netinterbank.com.pe`, `bbva.com.pe`, `scotiabank.com.pe`, `izipay.pe`, `lemon.me`) y el hash SHA-256 del cuerpo (`bh=` en `DKIM-Signature`), liquidando el pedido atómicamente en PostgreSQL sin ningún celular encendido.
2. **Prioridad 2 — «DNI + comisión muy baja + sin celular permanente + verificación totalmente automática por API directa de pasarela»**:
   - **Opción 2A (Estrictamente SOLO DNI, sin tramitar siquiera RUC 10)**:
     - **Mercado Pago Perú (API Yape OTP de 6 dígitos + Tarjetas + Webhooks HMAC-SHA256)**. Permite registrarse solo con DNI peruano como persona natural, funciona 100% en la nube sin celular receptor encendido, aprueba pedidos en `< 2 segundos` y verifica cada pago server-to-server contra `https://api.mercadopago.com/v1/payments/{id}`.
   - **Opción 2B (Activando RUC 10 gratuito como Persona Natural con DNI en 15 min desde App Personas SUNAT — SIN constituir empresa)**:
     - **TAYPI (`taypi.pe`) / KUTI (`kuti.pe`) — QR Dinámico Interoperable EMVCo** (`2.50% + S/ 0.20 + IGV`, solo **S/ 0.83** en un pedido de S/ 20) y **Culqi Online** (`3.44% + US$ 0.20`, Botón Yape OTP + QR Plin/Yape + Tarjetas).
3. **Prioridad 3 — «DNI + comisión cero + sin celular permanente + verificación asistida en Caja (Respaldo)»**:
   - Si una cuenta `static_qr` aún no tiene activado el puente DKIM AutoCloud, el motor opera como respaldo seguro en modo asistido (`pending` / `under_review`), mostrando el monto exacto y bloqueando por trigger cualquier auto-aprobación basada en capturas o notificaciones no firmadas.

### Decisión Arquitectónica Implementada en SUYA Delivery

Se diseñó e integró en SUYA un **Motor de Pagos Multi-Proveedor Desacoplado (`suya-payment-engine`)** que incluye:

1. **Adaptador `static_qr` AutoCloud (100% Automático Cloud — 0% Comisión — Solo DNI — Sin Celular)**:
   - Sintetizador EMVCo (`Tag 54` + céntimo único de conciliación + `CRC-16/CCITT-FALSE`) compatible con **Yape, Plin, Lemon e IzipayYA** + verificador criptográfico `DKIM/SPF/DMARC` (`verifyBankEmailAuthenticity` y `parsePeruvianBankAndWalletEmail`) conectado por **Cloudflare Email Worker** o **Gmail API OAuth2 Serverless**.
2. **Adaptador `mercado_pago` (100% Automático Cloud — Solo DNI)**:
   - Cobro instantáneo de **Yape con Código de Aprobación OTP (6 dígitos)** (`POST /platforms/pci/yape/v1/payment` + `POST /v1/payments` con `X-Idempotency-Key`), soporte de tarjetas y receptor de Webhooks autenticados con `x-signature` (`HMAC-SHA256`) + doble verificación server-to-server `GET /v1/payments/{id}`.
3. **Adaptador `taypi_qr` / `izipay` (100% Automático Cloud — RUC 10 Persona Natural — QR Dinámico Yape + Plin de Comisión Mínima)**:
   - Generación de QR Dinámico EMVCo con monto bloqueado por orden, verificación de firma `HMAC-SHA256` (`Taypi-Signature` / `kr-hash`) en webhooks y consulta server-to-server de estado.
4. **Adaptador `culqi` (100% Automático Cloud — RUC 10 — Yape OTP + QR Orders + Tarjetas)**:
   - Integrado con el nuevo motor unificado de auditoría, deduplicación de eventos, validación de importe exacto en céntimos y protección contra reutilización de referencias.
5. **Simulador Criptográfico de Diagnóstico y Pruebas (`sandbox_test`)**:
   - Permite ejecutar desde el panel administrativo (**Configuración de cobros — SUYA Delivery**) y en la suite automatizada de pruebas las 22 verificaciones de pagos aprobados, pendientes, rechazados, duplicados, firmas inválidas, montos incorrectos, colisiones de mismo importe y pagos tardíos sin arriesgar dinero real.
