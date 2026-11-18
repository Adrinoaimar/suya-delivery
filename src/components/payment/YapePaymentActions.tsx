import { useEffect, useRef, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Clipboard } from '@capacitor/clipboard';
import { Copy, Download, ExternalLink } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';

const FILENAME = 'suya-yape-qr.png';
const androidStore = 'https://play.google.com/store/apps/details?id=com.bcp.innovacxion.yapeapp';
// El manifiesto de Yape registra yape://yape.com.pe como enlace BROWSABLE.
const androidAppLink = `intent://yape.com.pe/#Intent;scheme=yape;package=com.bcp.innovacxion.yapeapp;S.browser_fallback_url=${encodeURIComponent(androidStore)};end`;
const nativeYape = registerPlugin<{
  saveQr(options: { base64: string }): Promise<{ destination: 'gallery' | 'files' | 'cancelled' }>;
  openYape(): Promise<{ opened: boolean }>;
}>('SuyaYapeActions');

function pngFile(source: string): File {
  const base64 = source.slice(source.indexOf(',') + 1);
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return new File([bytes], FILENAME, { type: 'image/png' });
}

export function YapePaymentActions({ qrPayload, isImage, receiverPhone }: {
  qrPayload: string;
  isImage: boolean;
  receiverPhone?: string | null;
}) {
  const qrCanvas = useRef<HTMLCanvasElement>(null);
  const sourceImage = useRef<HTMLImageElement>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'info' | 'error' | 'store'; message: string } | null>(null);
  const [previewPng, setPreviewPng] = useState<string | null>(null);
  const nativeAndroid = Capacitor.getPlatform() === 'android';
  const hasNativeActions = nativeAndroid && Capacitor.isPluginAvailable('SuyaYapeActions');
  const androidBrowser = !nativeAndroid && /Android/i.test(navigator.userAgent);
  const iosBrowser = !Capacitor.isNativePlatform() && (/iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

  useEffect(() => {
    setStatus(null);
    setPreviewPng(null);
  }, [qrPayload]);

  function getPng(): string {
    const image = sourceImage.current;
    const rendered = qrCanvas.current;
    const source = isImage ? image : rendered;
    const width = isImage ? image?.naturalWidth : rendered?.width;
    const height = isImage ? image?.naturalHeight : rendered?.height;
    if (!source || !width || !height) throw new Error();
    const canvas = document.createElement('canvas');
    // QRCodeCanvas multiplica su tamaño por el DPR. Exportamos una imagen de tamaño fijo.
    const scale = Math.min(1, 600 / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error();
    context.imageSmoothingEnabled = isImage;
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  }

  async function saveQr() {
    setSaving(true);
    setStatus(null);
    setPreviewPng(null);
    let png: string | null = null;
    try {
      png = getPng();
      if (hasNativeActions) {
        const { destination } = await nativeYape.saveQr({ base64: png.slice(png.indexOf(',') + 1) });
        if (destination !== 'cancelled') setStatus({
          kind: 'info',
          message: destination === 'gallery' ? 'QR guardado en la galería, en el álbum Suya.' : 'QR guardado en la carpeta que elegiste.',
        });
        return;
      }

      const file = pngFile(png);
      if (iosBrowser && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }

      const url = URL.createObjectURL(file);
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = FILENAME;
        document.body.append(link);
        try { link.click(); } finally { link.remove(); }
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      }
      setStatus({ kind: 'info', message: 'Busca el archivo suya-yape-qr.png en Descargas.' });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (png) setPreviewPng(png);
      setStatus({
        kind: 'error',
        message: png ? 'Mantén pulsada la imagen para guardarla.' : isImage
          ? 'Esta imagen no se pudo descargar. Ábrela para guardarla.'
          : 'No pudimos guardar el QR. Inténtalo de nuevo.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function copyReceiverPhone() {
    if (!receiverPhone) return;
    setPreviewPng(null);
    try {
      if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Clipboard')) {
        await Clipboard.write({ string: receiverPhone });
      } else {
        await navigator.clipboard.writeText(receiverPhone);
      }
      setStatus({ kind: 'info', message: 'Número copiado. Pégalo en «Yapear».' });
    } catch {
      setStatus({ kind: 'info', message: `Busca ${receiverPhone} en «Yapear».` });
    }
  }

  async function openYape() {
    setStatus(null);
    setPreviewPng(null);
    try {
      if ((await nativeYape.openYape()).opened) return;
    } catch {
      // El enlace a la tienda sigue disponible si Android no puede lanzar Yape.
    }
    setStatus({ kind: 'store', message: 'Yape no se pudo abrir en este teléfono.' });
  }

  const openClass = 'inline-flex min-h-11 items-center gap-2 rounded-btn bg-suya-green px-3 text-sm font-semibold text-white';
  return (
    <div className="mt-3 rounded-btn border border-suya-border bg-suya-lime-soft p-3">
      <div hidden>
        {isImage
          ? <img ref={sourceImage} src={qrPayload} crossOrigin="anonymous" alt="" width={600} height={600} loading="eager" decoding="async" />
          : <QRCodeCanvas ref={qrCanvas} value={qrPayload} size={600} level="M" marginSize={4} />}
      </div>
      <p className="font-semibold text-suya-carbon">Paga con el mismo celular</p>
      {receiverPhone && <p className="mt-1 text-xs text-suya-carbon">Número de Yape <strong className="select-all tabular-nums">{receiverPhone}</strong></p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => void saveQr()} disabled={saving}
          className="inline-flex min-h-11 items-center gap-2 rounded-btn border border-suya-border bg-white px-3 text-sm font-semibold text-suya-carbon disabled:opacity-65">
          <Download size={16} aria-hidden="true" /> {saving ? 'Guardando…' : 'Guardar QR'}
        </button>
        {receiverPhone && (
          <button type="button" onClick={() => void copyReceiverPhone()}
            className="inline-flex min-h-11 items-center gap-2 rounded-btn border border-suya-border bg-white px-3 text-sm font-semibold text-suya-carbon">
            <Copy size={16} aria-hidden="true" /> Copiar número
          </button>
        )}
        {hasNativeActions && (
          <button type="button" className={openClass} onClick={() => void openYape()}>
            <ExternalLink size={16} aria-hidden="true" /> Abrir Yape
          </button>
        )}
        {androidBrowser && (
          <a href={androidAppLink} className={openClass}>
            <ExternalLink size={16} aria-hidden="true" /> Abrir Yape
          </a>
        )}
      </div>
      <p className="mt-2 text-xs text-suya-carbon">{receiverPhone
        ? 'Pega el número en «Yapear» o abre «Escanear QR» y elige la imagen guardada. Confirma el monto y el destinatario.'
        : 'Guarda el QR. En Yape, abre «Escanear QR» y elige la imagen. Confirma el monto y el destinatario.'}</p>
      {status && (
        <p role="status" className="mt-2 text-xs font-semibold text-suya-carbon">
          {status.message}{' '}
          {status.kind === 'store' && <a href={androidStore} target="_blank" rel="noopener noreferrer" className="underline">Ver en Google Play</a>}
          {status.kind === 'error' && isImage && !previewPng && (
            <a href={qrPayload} target="_blank" rel="noopener noreferrer" className="underline">Ver imagen del QR</a>
          )}
        </p>
      )}
      {previewPng && (
        <img data-light-surface src={previewPng} alt="QR de Yape para guardar" width={600} height={600} loading="eager" decoding="async"
          className="mt-3 h-auto w-44 rounded-xl bg-white p-2" />
      )}
    </div>
  );
}
