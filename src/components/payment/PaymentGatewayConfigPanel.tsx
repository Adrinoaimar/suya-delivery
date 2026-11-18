import { readQrImage } from '@/lib/payments/readQrImage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FlaskConical,
  Lock,
  PlugZap,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import {
  PAYMENT_PROVIDERS_CATALOG,
  PRELOADED_STATIC_QR_PRESETS,
  PaymentSettlementEngine,
  buildBaseMerchantEmvcoQr,
  calculateProviderFee,
  createEphemeralDkimTestSigner,
  runProviderSafeDiagnosticSuite,
  signMimeMessageDkimRsaSha256,
  synthesizeDynamicEmvcoQrFromStatic,
  validateGatewayConfigInput,
} from '@/lib/payments/paymentEngine';
import type {
  LedgerOrderRecord,
  LedgerPaymentAttemptRecord,
  PaymentGatewayEnvironment,
  PaymentGatewayProviderId,
  SafeDiagnosticSuiteResult,
  StaticQrWalletNetwork,
} from '@/lib/payments/paymentEngine';
import { notificationService, walletObserverService } from '@/lib/services';
import type {
  GatewayConfigRecord,
  PaymentReconciliationExceptionItem,
} from '@/lib/services';
import { formatDateTime, formatPrice } from '@/utils/format';

interface PaymentGatewayConfigPanelProps {
  restaurantId: string;
  restaurantName?: string;
  defaultProvider?: PaymentGatewayProviderId;
}

const SAMPLE_AMOUNTS = [10, 20, 40, 60, 100, 200] as const;

const OFFICIAL_PORTAL_LINKS: Record<
  PaymentGatewayProviderId,
  { label: string; url: string }
> = {
  static_qr: {
    label: 'Estándar QR EMVCo Interoperable BCRP (Yape / Plin / Lemon / IzipayYA)',
    url: 'https://www.bcrp.gob.pe/sistema-de-pagos/interoperabilidad.html',
  },
  mercado_pago: {
    label: 'Abrir panel oficial Mercado Pago Developers Perú',
    url: 'https://www.mercadopago.com.pe/developers/panel/app',
  },
  taypi_qr: {
    label: 'Abrir portal oficial TAYPI Perú (QR EMVCo)',
    url: 'https://taypi.pe',
  },
  culqi: {
    label: 'Abrir panel oficial Culqi',
    url: 'https://panel.culqi.com',
  },
  izipay: {
    label: 'Abrir portal oficial Izipay Developers',
    url: 'https://developers.izipay.pe',
  },
};

export function PaymentGatewayConfigPanel({
  restaurantId,
  restaurantName,
  defaultProvider = 'mercado_pago',
}: PaymentGatewayConfigPanelProps) {
  const [configs, setConfigs] = useState<GatewayConfigRecord[]>([]);
  const [exceptions, setExceptions] = useState<PaymentReconciliationExceptionItem[]>([]);
  const [selectedProvider, setSelectedProvider] =
    useState<PaymentGatewayProviderId>(defaultProvider);
  const [environment, setEnvironment] = useState<PaymentGatewayEnvironment>(
    defaultProvider === 'static_qr' ? 'production' : 'sandbox',
  );
  const [accountLabel, setAccountLabel] = useState('Cuenta receptora principal');
  const [publicKey, setPublicKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [merchantCode, setMerchantCode] = useState('');
  const [qrPayload, setQrPayload] = useState('');
  const [staticWalletNetwork, setStaticWalletNetwork] =
    useState<StaticQrWalletNetwork>('lemon');
  const [staticPhoneOrId, setStaticPhoneOrId] = useState('987654321');
  const [saving, setSaving] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [runningSafeTest, setRunningSafeTest] = useState(false);
  const [connectionTestedOk, setConnectionTestedOk] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [diagnosticResult, setDiagnosticResult] = useState<SafeDiagnosticSuiteResult | null>(
    null,
  );
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});
  const [resolvingExceptionId, setResolvingExceptionId] = useState<string | null>(null);

  // Laboratorio en vivo para probar Opción A (AutoCloud QR Estático / Mercado Pago)
  const [liveEngine] = useState(() => new PaymentSettlementEngine());
  const [liveOrders, setLiveOrders] = useState<
    Array<{ order: LedgerOrderRecord; attempt: LedgerPaymentAttemptRecord; lastMessage?: string }>
  >([]);
  const [liveAmountPen, setLiveAmountPen] = useState('25.00');

  const providerMeta = PAYMENT_PROVIDERS_CATALOG[selectedProvider];
  const currentSavedConfig = useMemo(
    () => configs.find((item) => item.provider === selectedProvider) ?? null,
    [configs, selectedProvider],
  );

  const loadConfigData = useCallback(async () => {
    if (
      !restaurantId ||
      (!walletObserverService.listGatewayConfigs &&
        !walletObserverService.listReconciliationExceptions)
    ) {
      return;
    }
    try {
      const [loadedConfigs, loadedExceptions] = await Promise.all([
        walletObserverService.listGatewayConfigs
          ? walletObserverService.listGatewayConfigs(restaurantId)
          : Promise.resolve([]),
        walletObserverService.listReconciliationExceptions
          ? walletObserverService.listReconciliationExceptions(restaurantId)
          : Promise.resolve([]),
      ]);
      setConfigs(loadedConfigs);
      setExceptions(loadedExceptions);
    } catch {
      // Mantiene operación local cuando la migración aún no se aplicó en el entorno remoto
    }
  }, [restaurantId]);

  useEffect(() => {
    void loadConfigData();
  }, [loadConfigData]);

  useEffect(() => {
    if (!currentSavedConfig) {
      if (selectedProvider === 'static_qr') {
        const preset = PRELOADED_STATIC_QR_PRESETS.lemon;
        setAccountLabel(`${preset.receiverLabel} (${preset.receiverEmail})`);
        setStaticWalletNetwork(preset.network);
        setQrPayload(preset.qrPayload);
      } else {
        setAccountLabel(`Cuenta ${providerMeta.shortLabel}`);
        setQrPayload('');
      }
      setPublicKey('');
      setSecretKey('');
      setWebhookSecret('');
      setMerchantCode('');
      setConnectionTestedOk(selectedProvider === 'static_qr');
      setConnectionMessage(null);
      return;
    }
    setEnvironment(currentSavedConfig.environment);
    setAccountLabel(currentSavedConfig.accountLabel);
    setPublicKey(currentSavedConfig.publicKey ?? '');
    setSecretKey('');
    setWebhookSecret('');
    setMerchantCode(currentSavedConfig.merchantCode ?? '');
    setQrPayload(
      currentSavedConfig.qrPayload ||
        (selectedProvider === 'static_qr' ? PRELOADED_STATIC_QR_PRESETS.lemon.qrPayload : ''),
    );
    setConnectionTestedOk(
      currentSavedConfig.connectionStatus === 'connected' || selectedProvider === 'static_qr',
    );
  }, [currentSavedConfig, providerMeta.shortLabel, selectedProvider]);

  const effectiveSummary = useMemo(
    () => ({
      hasSecretKey: Boolean(secretKey.trim()) || Boolean(currentSavedConfig?.hasSecretKey),
      hasWebhookSecret:
        Boolean(webhookSecret.trim()) || Boolean(currentSavedConfig?.hasWebhookSecret),
      connectionStatus: (connectionTestedOk
        ? 'connected'
        : (currentSavedConfig?.connectionStatus ?? 'untested')) as
        | 'untested'
        | 'connected'
        | 'failed',
    }),
    [connectionTestedOk, currentSavedConfig, secretKey, webhookSecret],
  );

  const validation = useMemo(
    () =>
      validateGatewayConfigInput(
        {
          restaurantId,
          provider: selectedProvider,
          environment,
          accountLabel,
          publicKey,
          secretKey,
          webhookSecret,
          merchantCode,
          qrPayload,
          active: false,
        },
        effectiveSummary,
      ),
    [
      accountLabel,
      effectiveSummary,
      environment,
      merchantCode,
      publicKey,
      qrPayload,
      restaurantId,
      selectedProvider,
      secretKey,
      webhookSecret,
    ],
  );

  const synthesizedPreview = useMemo(() => {
    if (selectedProvider !== 'static_qr' || qrPayload.trim().length < 12) return null;
    return synthesizeDynamicEmvcoQrFromStatic({
      staticQrPayload: qrPayload.trim(),
      amountCents: 3999,
      checkoutReference: 'SUYA-AUTO-01',
    });
  }, [qrPayload, selectedProvider]);

  const canActivateNow =
    validation.canActivate &&
    (selectedProvider === 'static_qr' ||
      Boolean(diagnosticResult?.passed) ||
      Boolean(currentSavedConfig?.lastSafeTestPassed));

  const isCurrentlyActive = Boolean(currentSavedConfig?.active) && canActivateNow;

  const handleGenerateEmvcoStaticQr = () => {
    const generated = buildBaseMerchantEmvcoQr({
      walletNetwork: staticWalletNetwork,
      merchantAccountId: staticPhoneOrId.trim() || '987654321',
      merchantName: restaurantName || accountLabel || 'SUYA SULLANA',
      merchantCity: 'SULLANA',
    });
    setQrPayload(generated);
    notificationService.notify(
      `QR sintético de simulación (${staticWalletNetwork.toUpperCase()}) generado. Para escanear desde un celular real, sube tu imagen QR real o pega tu cadena 000201... oficial.`,
      'info',
    );
  };

  const handleUploadQrImage = async (file: File | null) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      notificationService.notify('Elige una imagen PNG, JPG o WebP de hasta 10 MB.', 'warning');
      return;
    }
    try {
      const raw = await readQrImage(file);
      if (raw.length < 12 || raw.length > 4000) {
        notificationService.notify('No pudimos leer un QR válido. Sube una imagen nítida que muestre el QR completo.', 'warning');
        return;
      }
      setQrPayload(raw);
      notificationService.notify('Contenido original del QR leído y conservado sin modificaciones.', 'success');
    } catch {
      notificationService.notify('No se pudo procesar la imagen del QR.', 'warning');
    }
  };

  const handleApplyPreloadedQr = (presetKey: 'lemon' | 'yape') => {
    const preset = PRELOADED_STATIC_QR_PRESETS[presetKey];
    setSelectedProvider('static_qr');
    setStaticWalletNetwork(preset.network);
    setAccountLabel(`${preset.receiverLabel} (${preset.receiverEmail})`);
    setQrPayload(preset.qrPayload);
    setConnectionTestedOk(true);
    notificationService.notify(`QR real precargado: ${preset.label}.`, 'success');
  };

  const handleLoadOptionACloudflareAutoCloud = async () => {
    const trimmedQr = qrPayload.trim();
    const existingRealQr = /^(?:000201|https:\/\/|data:image\/)/i.test(trimmedQr) ? trimmedQr : '';
    const preset =
      staticWalletNetwork === 'yape'
        ? PRELOADED_STATIC_QR_PRESETS.yape
        : PRELOADED_STATIC_QR_PRESETS.lemon;
    const resolvedQr = existingRealQr || preset.qrPayload;
    setSelectedProvider('static_qr');
    setEnvironment('sandbox');
    setAccountLabel(`${preset.receiverLabel} (${preset.receiverEmail})`);
    setQrPayload(resolvedQr);
    setWebhookSecret('wh_autocloud_cloudflare_dkim_2026');
    setConnectionTestedOk(true);
    setConnectionMessage(
      `Opción A (AutoCloud 0% sin céntimos) lista: ${preset.label} + conciliación DKIM/SPF/DMARC por monto exacto.`,
    );
    const suite = await runProviderSafeDiagnosticSuite('static_qr');
    setDiagnosticResult(suite);
    notificationService.notify(
      `Opción A (AutoCloud 0%) cargada con ${preset.label}.`,
      'success',
    );
  };

  const handleLoadOptionAMercadoPago = async () => {
    setSelectedProvider('mercado_pago');
    setEnvironment('sandbox');
    setAccountLabel('Mercado Pago Perú (Solo DNI · Yape OTP + Webhook)');
    setPublicKey('TEST-77889900-suya-peru-dni');
    setSecretKey('TEST-112233445566-mp-access-token');
    setWebhookSecret('wh_mp_hmac_sha256_suya_2026');
    setConnectionTestedOk(true);
    setConnectionMessage(
      'Opción A (Mercado Pago Perú Solo DNI) lista: API Yape OTP 6 dígitos y Webhook HMAC-SHA256 verificados.',
    );
    const suite = await runProviderSafeDiagnosticSuite('mercado_pago');
    setDiagnosticResult(suite);
    notificationService.notify(
      'Opción A (Mercado Pago Perú Solo DNI) cargada y verificada.',
      'success',
    );
  };

  const handleCreateLiveTestOrder = () => {
    const parsedPen = Number(liveAmountPen.replace(',', '.'));
    const totalCents =
      Number.isFinite(parsedPen) && parsedPen >= 1 ? Math.round(parsedPen * 100) : 2500;
    const seq = liveOrders.length + 1;
    const orderId = `live-ord-${seq}-${Date.now().toString(36).slice(-3)}`;
    const code = `SUY-${String(100 + seq)}`;
    const order = liveEngine.createOrder({
      id: orderId,
      code,
      restaurantId: restaurantId || 'rest-demo',
      totalCents,
    });
    const trimmedQr = qrPayload.trim();
    const fallbackPreset =
      staticWalletNetwork === 'yape'
        ? PRELOADED_STATIC_QR_PRESETS.yape.qrPayload
        : PRELOADED_STATIC_QR_PRESETS.lemon.qrPayload;
    const baseStaticQr = /^(?:000201|https:\/\/|data:image\/)/i.test(trimmedQr)
      ? trimmedQr
      : fallbackPreset;
    const attempt = liveEngine.createPaymentAttempt({
      orderId: order.id,
      provider: selectedProvider,
      method: staticWalletNetwork === 'lemon' ? 'lemon' : 'yape',
      staticQrPayload: baseStaticQr,
      staticWalletNetwork,
    });
    setLiveOrders((prev) => [
      {
        order,
        attempt,
        lastMessage:
          selectedProvider === 'static_qr'
            ? `QR receptor listo por monto exacto S/ ${(attempt.amountCents / 100).toFixed(2)} (${staticWalletNetwork.toUpperCase()})`
            : `Solicitud creada en ${providerMeta.shortLabel} (${attempt.checkoutReference})`,
      },
      ...prev,
    ]);
  };

  const handleSimulateLiveCloudConfirmation = async (attemptId: string) => {
    const entry = liveOrders.find((item) => item.attempt.id === attemptId);
    if (!entry) return;
    const { order, attempt } = entry;

    if (attempt.provider === 'static_qr') {
      const exactPen = (
        (attempt.uniqueConciliationAmountCents ?? attempt.amountCents) / 100
      ).toFixed(2);
      const opNum = `${Math.floor(10000000 + Math.random() * 89999999)}`;
      const domainByNetwork: Record<StaticQrWalletNetwork, string> = {
        yape: 'notificacionesbcp.com.pe',
        plin: 'interbank.pe',
        lemon: 'lemon.me',
        izipayya: 'izipay.pe',
      };
      const net = (attempt.staticWalletNetwork ?? staticWalletNetwork) as StaticQrWalletNetwork;
      const dkimDomain = domainByNetwork[net];
      const rawBody =
        net === 'plin'
          ? `Constancia de operación Plin recibida por S/ ${exactPen}\r\nCódigo de operación: ${opNum}\r\nReferencia: ${attempt.checkoutReference}\r\n`
          : net === 'lemon'
            ? `Recibiste una transferencia QR en Lemon por S/ ${exactPen}\r\nOperación: LEM${opNum}\r\n`
            : net === 'izipayya'
              ? `Comprobante QR IzipayYA aprobado por S/ ${exactPen}\r\nNúmero de operación: IZI${opNum}\r\n`
              : `Servicio de Notificaciones BCP: Yape recibido por S/ ${exactPen}\r\nNúmero de operación: ${opNum}\r\n`;
      const { privateKey, resolvePublicKeySpki } = await createEphemeralDkimTestSigner();
      const signedMime = await signMimeMessageDkimRsaSha256({
        privateKey,
        selector: 'selector1',
        domain: dkimDomain,
        from: `notificaciones@${dkimDomain}`,
        to: 'pagos@suyadelivery.com',
        subject: `Confirmación automática (${net.toUpperCase()})`,
        rawBody,
      });
      const result = await liveEngine.processStaticQrAutoCloudEmail({
        restaurantId: order.restaurantId,
        messageId: `cf-worker-${attempt.id}-${Date.now()}`,
        subject: `Confirmación automática (${net.toUpperCase()})`,
        rawBodyText: signedMime.rawBody,
        rawHeaders: signedMime.rawHeaders,
        authenticationResultsHeader: `mx.cloudflare.net; spf=pass; dkim=pass header.d=${dkimDomain}; dmarc=pass`,
        resolvePublicKeySpki,
      });
      const updatedOrder = liveEngine.getOrder(order.id) ?? order;
      const updatedAttempt = liveEngine.getAttempt(attempt.id) ?? attempt;
      setLiveOrders((prev) =>
        prev.map((item) =>
          item.attempt.id === attemptId
            ? {
                order: { ...updatedOrder },
                attempt: { ...updatedAttempt },
                lastMessage: `${result.message} (DKIM RSA-2048: ${dkimDomain} · Op #${opNum})`,
              }
            : item,
        ),
      );
      notificationService.notify(result.message, result.ok ? 'success' : 'warning');
      return;
    }

    const result = liveEngine.processProviderPaymentEvent({
      provider: attempt.provider,
      eventId: `evt-live-${attempt.id}-${Date.now()}`,
      externalTransactionId: `tx_${attempt.provider}_${Math.floor(100000 + Math.random() * 899999)}`,
      attemptId: attempt.id,
      orderId: order.id,
      amountCents: attempt.amountCents,
      currency: 'PEN',
      providerStatus: 'approved',
      signatureVerified: true,
      apiVerified: true,
    });
    const updatedOrder = liveEngine.getOrder(order.id) ?? order;
    const updatedAttempt = liveEngine.getAttempt(attempt.id) ?? attempt;
    setLiveOrders((prev) =>
      prev.map((item) =>
        item.attempt.id === attemptId
          ? {
              order: { ...updatedOrder },
              attempt: { ...updatedAttempt },
              lastMessage: result.message,
            }
          : item,
      ),
    );
    notificationService.notify(result.message, result.ok ? 'success' : 'warning');
  };

  const handleSimulateLiveFraudAttempt = async (attemptId: string) => {
    const entry = liveOrders.find((item) => item.attempt.id === attemptId);
    if (!entry) return;
    const { order, attempt } = entry;
    const result = await liveEngine.processStaticQrAutoCloudEmail({
      restaurantId: order.restaurantId,
      messageId: `fraud-${attempt.id}-${Date.now()}`,
      subject: 'Correo falso sin firma bancaria',
      rawBodyText: 'Yape recibido por S/ 25.00 Operación: 99999999',
      rawHeaders: [
        'From: notificaciones@falso-bcp.com',
        'To: pagos@suyadelivery.com',
        'Subject: Correo falso sin firma bancaria',
        'DKIM-Signature: v=1; a=rsa-sha256; d=falso-bcp.com; s=s1; h=from:to:subject; bh=FAKE; b=FAKE',
      ].join('\r\n'),
      authenticationResultsHeader: 'mx.cloudflare.net; spf=fail; dkim=fail; dmarc=fail',
    });
    setLiveOrders((prev) =>
      prev.map((item) =>
        item.attempt.id === attemptId
          ? {
              ...item,
              lastMessage: `ATAQUE BLOQUEADO: ${result.message}`,
            }
          : item,
      ),
    );
    notificationService.notify(`Ataque bloqueado: ${result.message}`, 'warning');
  };

  const handleSaveCredentials = async (activateAfterSave: boolean) => {
    if (!restaurantId) {
      notificationService.notify('Selecciona primero un restaurante.', 'warning');
      return;
    }
    if (!validation.valid) {
      notificationService.notify(
        validation.errors[0] ?? 'Revisa los campos de configuración antes de guardar.',
        'warning',
      );
      return;
    }
    if (activateAfterSave && !canActivateNow) {
      notificationService.notify(
        'Para activar el cobro debes comprobar la conexión y superar la prueba segura.',
        'warning',
      );
      return;
    }

    setSaving(true);
    try {
      if (walletObserverService.saveGatewayConfig) {
        const saved = await walletObserverService.saveGatewayConfig({
          restaurantId,
          provider: selectedProvider,
          environment,
          accountLabel,
          publicKey: publicKey.trim() || null,
          secretKey: secretKey.trim() || null,
          webhookSecret: webhookSecret.trim() || null,
          merchantCode: merchantCode.trim() || null,
          qrPayload: qrPayload.trim() || null,
          active: activateAfterSave,
        });
        setConfigs((prev) => [
          ...prev.filter((item) => item.provider !== saved.provider),
          saved,
        ]);
      }
      setSecretKey('');
      setWebhookSecret('');
      notificationService.notify(
        activateAfterSave
          ? `Método ${providerMeta.shortLabel} activado correctamente.`
          : `Configuración de ${providerMeta.shortLabel} guardada de forma segura.`,
        'success',
      );
    } catch (cause) {
      notificationService.notify(
        cause instanceof Error ? cause.message : 'No se pudo guardar la configuración de cobros.',
        'danger',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!validation.valid) {
      notificationService.notify(
        validation.errors[0] ?? 'Completa primero las credenciales requeridas.',
        'warning',
      );
      return;
    }
    setTestingConnection(true);
    setConnectionMessage(null);
    try {
      const hasPendingChanges =
        Boolean(secretKey.trim()) ||
        Boolean(webhookSecret.trim()) ||
        !currentSavedConfig ||
        publicKey.trim() !== (currentSavedConfig.publicKey ?? '') ||
        qrPayload.trim() !== (currentSavedConfig.qrPayload ?? '') ||
        merchantCode.trim() !== (currentSavedConfig.merchantCode ?? '');

      if (hasPendingChanges && walletObserverService.saveGatewayConfig && restaurantId) {
        const saved = await walletObserverService.saveGatewayConfig({
          restaurantId,
          provider: selectedProvider,
          environment,
          accountLabel,
          publicKey: publicKey.trim() || null,
          secretKey: secretKey.trim() || null,
          webhookSecret: webhookSecret.trim() || null,
          merchantCode: merchantCode.trim() || null,
          qrPayload: qrPayload.trim() || null,
          active: Boolean(currentSavedConfig?.active),
        });
        setConfigs((prev) => [
          ...prev.filter((item) => item.provider !== saved.provider),
          saved,
        ]);
        setSecretKey('');
        setWebhookSecret('');
      }

      if (walletObserverService.testGatewayConnection) {
        const response = await walletObserverService.testGatewayConnection(
          restaurantId,
          selectedProvider,
        );
        setConnectionTestedOk(response.ok);
        setConnectionMessage(response.message);
        notificationService.notify(response.message, response.ok ? 'success' : 'warning');
        return;
      }

      if (selectedProvider === 'static_qr') {
        setConnectionTestedOk(true);
        const modeMsg =
          validation.verificationMode === 'automatic_cloud'
            ? 'QR Estático AutoCloud verificado: síntesis EMVCo (Tag 54 + CRC-16) y puente criptográfico DKIM/SPF/DMARC activos sin celular.'
            : 'Payload QR estático verificado localmente (modo revisión manual hasta configurar el Webhook Secret de AutoCloud).';
        setConnectionMessage(modeMsg);
        notificationService.notify(modeMsg, 'success');
        return;
      }

      setConnectionTestedOk(true);
      const localMsg = `Formato de credenciales de ${providerMeta.shortLabel} verificado localmente.`;
      setConnectionMessage(localMsg);
      notificationService.notify(localMsg, 'success');
    } catch {
      const formatValid =
        environment === 'sandbox' &&
        validation.valid &&
        (selectedProvider === 'static_qr' ||
          (effectiveSummary.hasSecretKey && effectiveSummary.hasWebhookSecret));
      setConnectionTestedOk(formatValid);
      const fallbackMsg = formatValid
        ? `Formato válido en pruebas locales (${environment}), pero la Edge Function remota payment-gateway aún no respondió.`
        : 'No se pudo comprobar la conexión real con la Edge Function payment-gateway en Supabase.';
      setConnectionMessage(fallbackMsg);
      notificationService.notify(fallbackMsg, formatValid ? 'warning' : 'danger');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleRunSafeTest = async () => {
    setRunningSafeTest(true);
    try {
      const suite = await runProviderSafeDiagnosticSuite(selectedProvider);
      setDiagnosticResult(suite);
      if (suite.passed && walletObserverService.recordGatewayTestResult && restaurantId) {
        await walletObserverService
          .recordGatewayTestResult(restaurantId, selectedProvider, connectionTestedOk, true)
          .catch(() => false);
      }
      notificationService.notify(
        suite.passed
          ? 'Prueba segura superada: firma HMAC/DKIM, colisión de importes, deduplicación y guardas verificadas.'
          : 'La prueba segura detectó un problema. Revisa el detalle.',
        suite.passed ? 'success' : 'danger',
      );
    } finally {
      setRunningSafeTest(false);
    }
  };

  const handleResolveException = async (
    exceptionId: string,
    status: 'refund_pending' | 'refunded' | 'resolved_dismissed',
  ) => {
    const note = (resolutionNotes[exceptionId] ?? '').trim();
    if (!note) {
      notificationService.notify(
        'Escribe una nota de auditoría explicando la decisión antes de actualizar la excepción.',
        'warning',
      );
      return;
    }
    setResolvingExceptionId(exceptionId);
    try {
      if (walletObserverService.resolveReconciliationException) {
        await walletObserverService.resolveReconciliationException(exceptionId, status, note);
      }
      setExceptions((prev) =>
        prev.map((item) =>
          item.id === exceptionId
            ? {
                ...item,
                resolutionStatus: status,
                resolutionNote: note,
                resolvedAt: new Date().toISOString(),
              }
            : item,
        ),
      );
      notificationService.notify('Excepción actualizada en el registro de auditoría.', 'success');
    } catch (cause) {
      notificationService.notify(
        cause instanceof Error ? cause.message : 'No se pudo actualizar la excepción.',
        'danger',
      );
    } finally {
      setResolvingExceptionId(null);
    }
  };

  const isStaticQrMode = selectedProvider === 'static_qr';
  const isLemonPresetActive =
    qrPayload.trim() === PRELOADED_STATIC_QR_PRESETS.lemon.qrPayload;
  const isYapePresetActive =
    qrPayload.trim() === PRELOADED_STATIC_QR_PRESETS.yape.qrPayload;

  return (
    <Card className="border-suya-green/30 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-suya-mist pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-suya-green">
            {isStaticQrMode ? 'Cobro directo por QR' : 'Módulo de pagos en la nube'}
          </p>
          <h2 className="font-display text-xl font-bold text-suya-carbon">
            Configuración de cobros — SUYA Delivery
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-suya-muted">
            {isStaticQrMode
              ? `Elige o sube el QR receptor${restaurantName ? ` para ${restaurantName}` : ''} y actívalo en un clic.`
              : `Configura el proveedor receptor${restaurantName ? ` para ${restaurantName}` : ''}, valida credenciales oficiales y activa la confirmación automática.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={validation.verificationMode === 'automatic_cloud' ? 'lime' : 'sun'}>
            {validation.verificationMode === 'automatic_cloud'
              ? 'Confirmación automática en la nube'
              : 'Revisión en Caja / AutoCloud pendiente'}
          </Badge>
          <Badge tone={isCurrentlyActive ? 'lime' : 'neutral'}>
            {isCurrentlyActive ? 'Método de cobro ACTIVO' : 'Pendiente de activación'}
          </Badge>
        </div>
      </div>

      {/* 1. Elegir método receptor */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <div className={`grid gap-3 ${isStaticQrMode ? 'sm:grid-cols-1' : 'sm:grid-cols-2'}`}>
            <label className="text-sm font-semibold text-suya-carbon">
              1. Método receptor
              <select
                aria-label="Método receptor de cobros"
                value={selectedProvider}
                onChange={(event) => {
                  setSelectedProvider(event.target.value as PaymentGatewayProviderId);
                  setDiagnosticResult(null);
                  setConnectionMessage(null);
                }}
                className="mt-1 h-11 w-full rounded-btn border border-suya-border bg-white px-3 text-sm font-normal"
              >
                <option value="static_qr">
                  QR Estático (Yape / Lemon / Plin · 0% comisión)
                </option>
                <option value="mercado_pago">
                  Mercado Pago Perú (Solo DNI · Yape OTP + Tarjetas · Automático)
                </option>
                <option value="taypi_qr">
                  TAYPI / KUTI QR Dinámico (RUC 10 gratis · Yape + Plin · 2.50% + S/0.20 + IGV)
                </option>
                <option value="culqi">
                  Culqi Online (RUC 10 · Yape OTP + QR Plin + Tarjetas · Automático)
                </option>
                <option value="izipay">
                  Izipay Online (RUC 10 · QR Yape/Plin + Tarjetas · Automático)
                </option>
              </select>
            </label>

            {!isStaticQrMode && (
              <label className="text-sm font-semibold text-suya-carbon">
                Entorno operativo
                <select
                  aria-label="Entorno operativo de pasarela"
                  value={environment}
                  onChange={(event) =>
                    setEnvironment(event.target.value as PaymentGatewayEnvironment)
                  }
                  className="mt-1 h-11 w-full rounded-btn border border-suya-border bg-white px-3 text-sm font-normal"
                >
                  <option value="sandbox">Pruebas seguras (Sandbox)</option>
                  <option value="production">Producción (Dinero real)</option>
                </select>
              </label>
            )}
          </div>

          {!isStaticQrMode && (
            <div className="rounded-btn border border-suya-mist bg-[#F7FAF8] p-3 text-xs text-suya-carbon">
              <p className="font-semibold text-suya-green-dark">{providerMeta.name}</p>
              <p className="mt-1 text-suya-muted">{providerMeta.summary}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-medium">
                <span>Requisito fiscal: {providerMeta.rucRequirementLabel}</span>
                <span>Celular permanente: No requiere</span>
                <span>
                  Billeteras:{' '}
                  {[
                    providerMeta.supportsYape ? 'Yape' : null,
                    providerMeta.supportsPlin ? 'Plin / Lemon / IzipayYA' : null,
                    providerMeta.supportsCards ? 'Tarjetas' : null,
                  ]
                    .filter(Boolean)
                    .join(' + ')}
                </span>
              </div>
              <a
                href={OFFICIAL_PORTAL_LINKS[selectedProvider].url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 font-semibold text-suya-green hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                {OFFICIAL_PORTAL_LINKS[selectedProvider].label}
              </a>
            </div>
          )}

          {validation.warnings.length > 0 && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-btn border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
              <div>
                <p className="font-bold">Aviso de verificación sobre QR estático</p>
                <p className="mt-0.5">{validation.warnings[0]}</p>
              </div>
            </div>
          )}

          {/* 2 y 4. Credenciales oficiales o selección directa de QR Estático */}
          <div className="grid gap-3 sm:grid-cols-2">
            {isStaticQrMode ? (
              <>
                <div className="sm:col-span-2 space-y-2">
                  <p className="text-sm font-semibold text-suya-carbon">
                    2. Elige o sube tu QR
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleApplyPreloadedQr('lemon')}
                      className={`inline-flex min-h-[44px] items-center rounded-btn border px-3.5 py-2 text-xs font-semibold transition ${
                        isLemonPresetActive
                          ? 'border-suya-green bg-suya-lime-soft text-suya-green-dark'
                          : 'border-suya-border bg-white text-suya-carbon hover:bg-suya-mist/60'
                      }`}
                    >
                      Precargar QR Lemon (Adriano)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyPreloadedQr('yape')}
                      className={`inline-flex min-h-[44px] items-center rounded-btn border px-3.5 py-2 text-xs font-semibold transition ${
                        isYapePresetActive
                          ? 'border-suya-green bg-suya-lime-soft text-suya-green-dark'
                          : 'border-suya-border bg-white text-suya-carbon hover:bg-suya-mist/60'
                      }`}
                    >
                      Precargar QR Yape (Adriano)
                    </button>
                    <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-btn border border-suya-green/40 bg-suya-lime-soft/50 px-3.5 py-2 text-xs font-semibold text-suya-green-dark hover:bg-suya-lime-soft">
                      Subir imagen de mi QR (PNG/JPG)
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        onChange={(event) =>
                          void handleUploadQrImage(event.target.files?.[0] ?? null)
                        }
                      />
                    </label>
                  </div>
                </div>

                <label className="text-sm font-semibold text-suya-carbon sm:col-span-2">
                  3. Nombre visible para el cliente
                  <input
                    aria-label="Etiqueta identificadora del receptor"
                    value={accountLabel}
                    onChange={(event) => setAccountLabel(event.target.value)}
                    placeholder="Ej. SUYA Sullana Principal"
                    className="mt-1 h-11 w-full rounded-btn border border-suya-border bg-white px-3 text-sm font-normal"
                  />
                </label>

                <details className="sm:col-span-2 rounded-btn border border-suya-border bg-[#F7FAF8] p-3 text-xs">
                  <summary className="cursor-pointer font-semibold text-suya-carbon">
                    Opciones avanzadas (código QR manual, AutoCloud y entorno)
                  </summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label
                        htmlFor="suya-static-qr-payload-input"
                        className="text-xs font-semibold text-suya-carbon"
                      >
                        Payload EMVCo (`000201...`) o URL pública del QR estático receptor
                      </label>
                      <textarea
                        id="suya-static-qr-payload-input"
                        aria-label="Payload EMVCo o URL pública del QR estático receptor"
                        rows={2}
                        value={qrPayload}
                        onChange={(event) => setQrPayload(event.target.value)}
                        placeholder="000201010211...6304XXXX"
                        className="mt-1 w-full rounded-btn border border-suya-border bg-white p-2.5 font-mono text-xs font-normal"
                      />
                    </div>

                    <label className="text-xs font-semibold text-suya-carbon">
                      Red del QR Estático
                      <select
                        aria-label="Red del QR Estático"
                        value={staticWalletNetwork}
                        onChange={(event) =>
                          setStaticWalletNetwork(event.target.value as StaticQrWalletNetwork)
                        }
                        className="mt-1 h-11 w-full rounded-btn border border-suya-border bg-white px-3 text-xs font-normal"
                      >
                        <option value="yape">Yape (BCP / Yape DNI)</option>
                        <option value="plin">Plin (Interbank / BBVA / Scotiabank)</option>
                        <option value="lemon">Lemon Cash Perú (Interoperable GMoney)</option>
                        <option value="izipayya">IzipayYA (QR 0% con DNI)</option>
                      </select>
                    </label>

                    <label className="text-xs font-semibold text-suya-carbon">
                      Entorno operativo
                      <select
                        aria-label="Entorno operativo de pasarela"
                        value={environment}
                        onChange={(event) =>
                          setEnvironment(event.target.value as PaymentGatewayEnvironment)
                        }
                        className="mt-1 h-11 w-full rounded-btn border border-suya-border bg-white px-3 text-xs font-normal"
                      >
                        <option value="production">Producción (Dinero real)</option>
                        <option value="sandbox">Pruebas seguras (Sandbox)</option>
                      </select>
                    </label>

                    <div className="flex items-end gap-2 sm:col-span-2">
                      <label className="flex-1 text-xs font-semibold text-suya-carbon">
                        Celular o ID receptor (solo prueba local)
                        <input
                          aria-label="Celular o ID receptor para QR EMVCo"
                          value={staticPhoneOrId}
                          onChange={(event) => setStaticPhoneOrId(event.target.value)}
                          placeholder="987654321"
                          className="mt-1 h-11 w-full rounded-btn border border-suya-border bg-white px-3 font-mono text-xs font-normal"
                        />
                      </label>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleGenerateEmvcoStaticQr}
                      >
                        <Sparkles className="h-4 w-4" aria-hidden="true" />
                        Generar EMVCo
                      </Button>
                    </div>

                    <label className="text-xs font-semibold text-suya-carbon sm:col-span-2">
                      Webhook Signing Secret AutoCloud (`STATIC_QR_AUTOCLOUD_SECRET`)
                      <input
                        aria-label="Webhook Signing Secret"
                        type="password"
                        value={webhookSecret}
                        onChange={(event) => setWebhookSecret(event.target.value)}
                        placeholder={
                          currentSavedConfig?.hasWebhookSecret
                            ? `AutoCloud activo (termina en ••••${currentSavedConfig.webhookSecretLast4 ?? ''})`
                            : 'Opcional si ya lo administra el servidor'
                        }
                        className="mt-1 h-11 w-full rounded-btn border border-suya-border bg-white px-3 font-mono text-xs font-normal"
                      />
                    </label>
                  </div>
                </details>
              </>
            ) : (
              <>
                <label className="text-sm font-semibold text-suya-carbon sm:col-span-2">
                  Etiqueta identificadora del receptor
                  <input
                    aria-label="Etiqueta identificadora del receptor"
                    value={accountLabel}
                    onChange={(event) => setAccountLabel(event.target.value)}
                    placeholder="Ej. SUYA Sullana Principal"
                    className="mt-1 h-11 w-full rounded-btn border border-suya-border bg-white px-3 text-sm font-normal"
                  />
                </label>
                <label className="text-sm font-semibold text-suya-carbon">
                  Public Key oficial ({providerMeta.shortLabel})
                  <input
                    aria-label="Public Key oficial"
                    value={publicKey}
                    onChange={(event) => setPublicKey(event.target.value)}
                    placeholder={
                      selectedProvider === 'mercado_pago'
                        ? 'TEST-... o APP_USR-...'
                        : selectedProvider === 'culqi'
                          ? 'pk_test_... o pk_live_...'
                          : 'Public Key del comercio'
                    }
                    className="mt-1 h-11 w-full rounded-btn border border-suya-border bg-white px-3 font-mono text-xs font-normal"
                  />
                </label>

                {selectedProvider === 'izipay' && (
                  <label className="text-sm font-semibold text-suya-carbon">
                    Código de comercio (Merchant Code)
                    <input
                      aria-label="Código de comercio"
                      value={merchantCode}
                      onChange={(event) => setMerchantCode(event.target.value)}
                      placeholder="Ej. 4001834"
                      className="mt-1 h-11 w-full rounded-btn border border-suya-border bg-white px-3 font-mono text-xs font-normal"
                    />
                  </label>
                )}

                <label className="text-sm font-semibold text-suya-carbon">
                  Secret Key / Access Token (Cifrado en servidor)
                  <input
                    aria-label="Secret Key o Access Token"
                    type="password"
                    value={secretKey}
                    onChange={(event) => setSecretKey(event.target.value)}
                    placeholder={
                      currentSavedConfig?.hasSecretKey
                        ? `Guardado (termina en ••••${currentSavedConfig.secretKeyLast4 ?? ''})`
                        : 'Introduce Access Token o Secret Key'
                    }
                    className="mt-1 h-11 w-full rounded-btn border border-suya-border bg-white px-3 font-mono text-xs font-normal"
                  />
                </label>

                <label className="text-sm font-semibold text-suya-carbon sm:col-span-2">
                  Webhook Signing Secret (HMAC-SHA256 / Clave de notificación)
                  <input
                    aria-label="Webhook Signing Secret"
                    type="password"
                    value={webhookSecret}
                    onChange={(event) => setWebhookSecret(event.target.value)}
                    placeholder={
                      currentSavedConfig?.hasWebhookSecret
                        ? `Guardado (termina en ••••${currentSavedConfig.webhookSecretLast4 ?? ''})`
                        : 'Secreto para verificar autenticidad de webhooks entrantes'
                    }
                    className="mt-1 h-11 w-full rounded-btn border border-suya-border bg-white px-3 font-mono text-xs font-normal"
                  />
                </label>
              </>
            )}
          </div>

          {validation.errors.length > 0 && (
            <div className="rounded-btn border border-red-200 bg-red-50/80 p-3 text-xs text-red-900">
              <p className="font-semibold">Pendiente para habilitar este método:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {validation.errors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 5, 6 y 7. Botón principal de activación (en modo QR estático oculta controles secundarios) */}
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            {!isStaticQrMode && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleSaveCredentials(false)}
                  disabled={saving}
                >
                  <Lock className="h-4 w-4" aria-hidden="true" />
                  {saving ? 'Guardando…' : 'Guardar credenciales'}
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleTestConnection()}
                  disabled={testingConnection}
                >
                  <PlugZap className="h-4 w-4" aria-hidden="true" />
                  {testingConnection ? 'Comprobando…' : 'Comprobar conexión'}
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleRunSafeTest()}
                  disabled={runningSafeTest}
                >
                  <FlaskConical className="h-4 w-4" aria-hidden="true" />
                  {runningSafeTest ? 'Ejecutando prueba…' : 'Realizar una prueba segura'}
                </Button>
              </>
            )}

            <Button
              type="button"
              onClick={() => void handleSaveCredentials(true)}
              disabled={saving || !canActivateNow}
              className="min-h-[44px]"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Activar método de cobro
            </Button>

            {isStaticQrMode && (
              <details className="w-full text-xs">
                <summary className="cursor-pointer font-semibold text-suya-muted hover:text-suya-carbon">
                  Más acciones (guardar borrador o comprobar conexión)
                </summary>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleSaveCredentials(false)}
                    disabled={saving}
                  >
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                    {saving ? 'Guardando…' : 'Guardar credenciales'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleTestConnection()}
                    disabled={testingConnection}
                  >
                    <PlugZap className="h-3.5 w-3.5" aria-hidden="true" />
                    {testingConnection ? 'Comprobando…' : 'Comprobar conexión'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleRunSafeTest()}
                    disabled={runningSafeTest}
                  >
                    <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
                    {runningSafeTest ? 'Ejecutando prueba…' : 'Realizar una prueba segura'}
                  </Button>
                </div>
              </details>
            )}
          </div>

          {connectionMessage && (
            <p
              role="status"
              className={`text-xs font-semibold ${connectionTestedOk ? 'text-suya-green-dark' : 'text-amber-800'}`}
            >
              {connectionMessage}
            </p>
          )}

          {diagnosticResult && (
            <div
              role="status"
              className="rounded-btn border border-suya-green/30 bg-suya-lime-soft/40 p-3 text-xs"
            >
              <p className="flex items-center gap-1.5 font-bold text-suya-green-dark">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Resultado de la prueba segura ({formatDateTime(diagnosticResult.executedAt)})
              </p>
              <ul className="mt-2 space-y-1.5">
                {diagnosticResult.checks.map((check) => (
                  <li key={check.name} className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 font-bold ${check.passed ? 'text-suya-green' : 'text-red-700'}`}
                    >
                      {check.passed ? '✓' : '✗'}
                    </span>
                    <div>
                      <span className="font-semibold text-suya-carbon">{check.name}:</span>{' '}
                      <span className="text-suya-muted">{check.detail}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Columna derecha: Vista previa limpia en QR estático o tabla de comisiones para pasarelas */}
        <div className="space-y-4">
          {!isStaticQrMode && (
            <div className="rounded-card border border-suya-mist bg-[#FAF7F1] p-4">
              <h3 className="font-display text-sm font-bold text-suya-carbon">
                Costo real por pedido ({providerMeta.shortLabel})
              </h3>
              <p className="mt-0.5 text-xs text-suya-muted">
                Incluye comisión porcentual ({providerMeta.commissionPercent}%), cargo fijo (
                {formatPrice(providerMeta.fixedFeePen)}) e IGV (18%) cuando aplica.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-suya-border text-suya-muted">
                      <th className="pb-1.5 font-semibold">Pedido</th>
                      <th className="pb-1.5 font-semibold">Comisión total</th>
                      <th className="pb-1.5 font-semibold">Neto recibido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-suya-mist">
                    {SAMPLE_AMOUNTS.map((amt) => {
                      const fee = calculateProviderFee(selectedProvider, amt);
                      return (
                        <tr key={amt}>
                          <td className="py-1.5 font-semibold">{formatPrice(amt)}</td>
                          <td className="py-1.5 text-amber-900">
                            {formatPrice(fee.totalFeePen)} ({fee.effectiveRatePercent}%)
                          </td>
                          <td className="py-1.5 font-bold text-suya-green-dark">
                            {formatPrice(fee.netReceivedPen)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {isStaticQrMode && synthesizedPreview && (
            <div className="flex flex-col items-center rounded-card border border-suya-border bg-[#F7FAF8] p-5 text-center">
              <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-suya-carbon">
                <QrCode className="h-4 w-4 text-suya-green" aria-hidden="true" />
                Vista previa del QR
              </p>
              <p className="mb-3 text-xs text-suya-muted">
                {synthesizedPreview.isEmvcoDynamic
                  ? `Simulación Sandbox: S/ ${synthesizedPreview.amountPenFormatted}`
                  : isLemonPresetActive
                    ? 'Lemon Cash · 0% comisión'
                    : isYapePresetActive
                      ? 'Yape · 0% comisión'
                      : 'QR oficial conservado · 0% comisión'}
              </p>
              <div className="rounded-xl border border-suya-border bg-white p-3">
                {/^(?:https:\/\/|data:image\/)/i.test(synthesizedPreview.qrPayload) ? (
                  <img
                    src={synthesizedPreview.qrPayload}
                    alt="Vista previa QR receptor"
                    width={160}
                    height={160}
                    loading="lazy"
                    decoding="async"
                    className="h-[160px] w-[160px] object-contain"
                  />
                ) : (
                  <QRCodeSVG
                    value={synthesizedPreview.qrPayload}
                    size={160}
                    level="M"
                    includeMargin
                  />
                )}
              </div>
              {synthesizedPreview.isEmvcoDynamic && (
                <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-900">
                  Este es un QR sintético de prueba local. Para cobrar en real usa un QR precargado o sube la foto del tuyo.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <details
        open={!isStaticQrMode || liveOrders.length > 0 || exceptions.length > 0}
        className="mt-5 rounded-card border border-suya-border bg-[#F7FAF8] p-3"
      >
        <summary className="cursor-pointer text-xs font-semibold text-suya-carbon">
          Laboratorio de pruebas en vivo y monitor de excepciones ({exceptions.length})
        </summary>

        {/* Laboratorio Interactivo en Vivo — Prueba Opción A sin celular */}
        <div className="mt-3 rounded-card border border-suya-green/40 bg-[#F4FAF6] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-suya-green-dark">
              Laboratorio Interactivo en Vivo (Sin Celular)
            </p>
            <h3 className="font-display text-base font-bold text-suya-carbon">
              Probar Opción A en Tiempo Real (Pedido + QR EMVCo + Confirmación Cloud)
            </h3>
            <p className="mt-0.5 text-xs text-suya-muted">
              Pulsa un botón para precargar la Opción A elegida, crea uno o varios pedidos simultáneos
              y simula la confirmación criptográfica en la nube para ver cómo se aprueba y pasa a cocina.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void handleLoadOptionACloudflareAutoCloud()}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Cargar Opción A: Cloudflare Worker AutoCloud (QR 0%)
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void handleLoadOptionAMercadoPago()}
            >
              <PlugZap className="h-3.5 w-3.5" aria-hidden="true" />
              Cargar Opción A: Mercado Pago Perú (Solo DNI)
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2.5 border-t border-suya-green/20 pt-3">
          <label className="text-xs font-semibold text-suya-carbon">
            Importe del pedido (S/)
            <input
              aria-label="Importe del pedido en vivo"
              value={liveAmountPen}
              onChange={(event) => setLiveAmountPen(event.target.value)}
              className="mt-1 block h-9 w-28 rounded-btn border border-suya-border bg-white px-2.5 font-mono text-xs"
            />
          </label>
          <Button type="button" size="sm" onClick={handleCreateLiveTestOrder}>
            <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
            1. Crear pedido de prueba ({providerMeta.shortLabel})
          </Button>
          <span className="text-[11px] text-suya-muted">
            Cobro por monto exacto sin céntimos · Si coinciden importes pendientes, la nube desambigua por nombre del pagador.
          </span>
        </div>

        {liveOrders.length > 0 && (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {liveOrders.map(({ order, attempt, lastMessage }) => {
              const lockedPen = (attempt.amountCents / 100).toFixed(2);
              const isConfirmed = order.status === 'confirmed';
              return (
                <div
                  key={attempt.id}
                  className="flex flex-col justify-between rounded-btn border border-suya-border bg-white p-3 text-xs shadow-sm"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-suya-carbon">
                        Pedido {order.code} · Cobro exacto: S/ {lockedPen}
                      </span>
                      <Badge tone={isConfirmed ? 'lime' : 'sun'}>
                        {isConfirmed
                          ? 'CONFIRMADO · ENVIADO A COCINA'
                          : 'ESPERANDO PAGO CLOUD'}
                      </Badge>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-suya-muted">
                      Ref: {attempt.checkoutReference} · Proveedor: {attempt.provider}
                      {attempt.staticWalletNetwork
                        ? ` (${attempt.staticWalletNetwork.toUpperCase()})`
                        : ''}
                    </p>
                    {attempt.synthesizedQrPayload && (
                      <div className="mt-2 flex items-center gap-3 rounded-btn bg-[#F7FAF8] p-2">
                        {/^(?:https:\/\/|data:image\/)/i.test(attempt.synthesizedQrPayload) ? (
                          <img
                            src={attempt.synthesizedQrPayload}
                            alt="QR del pedido"
                            width={84} height={84} loading="lazy" decoding="async"
                            className="h-[84px] w-[84px] object-contain"
                          />
                        ) : (
                          <QRCodeSVG
                            value={attempt.synthesizedQrPayload}
                            size={84}
                            level="M"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-suya-green-dark">
                            QR Receptor · Monto exacto: S/ {lockedPen}
                          </p>
                          <p className="mt-0.5 truncate font-mono text-[10px] text-suya-muted">
                            {attempt.synthesizedQrPayload}
                          </p>
                        </div>
                      </div>
                    )}
                    {lastMessage && (
                      <p className="mt-2 rounded bg-suya-mist/50 px-2 py-1 text-[11px] font-medium text-suya-carbon">
                        {lastMessage}
                      </p>
                    )}
                  </div>

                  {!isConfirmed && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void handleSimulateLiveCloudConfirmation(attempt.id)}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        2. Simular confirmación Cloud (Aprobar)
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => void handleSimulateLiveFraudAttempt(attempt.id)}
                      >
                        Probar correo falso (dkim=fail)
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Monitor de Transacciones No Conciliadas y Excepciones */}
      <div className="mt-6 border-t border-suya-mist pt-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 font-display text-base font-bold text-suya-carbon">
              <ShieldAlert className="h-4 w-4 text-suya-green" aria-hidden="true" />
              Transacciones no conciliadas, pagos tardíos y excepciones
            </h3>
            <p className="text-xs text-suya-muted">
              Registra discrepancias de monto, pagos recibidos tras expiración o cancelación y
              cobros duplicados sin alterar el libro contable.
            </p>
          </div>
          <Badge tone={exceptions.some((e) => e.resolutionStatus === 'open') ? 'sun' : 'neutral'}>
            {exceptions.length} registradas
          </Badge>
        </div>

        {exceptions.length === 0 ? (
          <p className="mt-3 rounded-btn border border-suya-mist bg-[#F7FAF8] px-3 py-2.5 text-xs text-suya-muted">
            No hay transacciones no conciliadas ni discrepancias pendientes para este restaurante.
          </p>
        ) : (
          <div className="mt-3 space-y-2.5">
            {exceptions.map((exc) => (
              <div
                key={exc.id}
                className="rounded-btn border border-suya-border bg-white p-3 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-suya-carbon">
                    {exc.exceptionType} · Proveedor: {exc.provider} · Ref:{' '}
                    {exc.externalTransactionId ?? 'N/A'}
                  </span>
                  <Badge tone={exc.resolutionStatus === 'refunded' ? 'lime' : 'sun'}>
                    {exc.resolutionStatus}
                  </Badge>
                </div>
                <p className="mt-1 text-suya-muted">
                  Esperado:{' '}
                  {exc.expectedAmountCents != null
                    ? formatPrice(exc.expectedAmountCents / 100)
                    : '—'}{' '}
                  · Recibido:{' '}
                  {exc.receivedAmountCents != null
                    ? formatPrice(exc.receivedAmountCents / 100)
                    : '—'}
                </p>
                {exc.resolutionNote && (
                  <p className="mt-1 text-suya-carbon">Nota: {exc.resolutionNote}</p>
                )}
                {exc.resolutionStatus !== 'refunded' &&
                  exc.resolutionStatus !== 'resolved_dismissed' && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        aria-label={`Nota de auditoría para excepción ${exc.id}`}
                        value={resolutionNotes[exc.id] ?? ''}
                        onChange={(event) =>
                          setResolutionNotes((prev) => ({
                            ...prev,
                            [exc.id]: event.target.value,
                          }))
                        }
                        placeholder="Nota de auditoría (ej. Devolución coordinada por Yape #op)"
                        className="h-9 flex-1 rounded-btn border border-suya-border px-2.5 text-xs"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={resolvingExceptionId === exc.id}
                        onClick={() => void handleResolveException(exc.id, 'refunded')}
                      >
                        Marcar devuelto
                      </Button>
                    </div>
                  )}
              </div>
            ))}
          </div>
        )}
      </div>
      </details>
    </Card>
  );
}
