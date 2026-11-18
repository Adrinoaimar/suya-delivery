import jsQR from 'jsqr';

export async function readQrImage(file: File): Promise<string> {
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  ) {
    throw new Error('Elige una imagen PNG, JPG o WebP de hasta 10 MB.');
  }
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const BarcodeDetectorCtor = (
      window as unknown as {
        BarcodeDetector?: new (opts: { formats: string[] }) => {
          detect(source: ImageBitmap): Promise<Array<{ rawValue?: string }>>;
        };
      }
    ).BarcodeDetector;
    let raw = '';
    if (BarcodeDetectorCtor) {
      const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] });
      raw = (await detector.detect(bitmap).catch(() => []))[0]?.rawValue ?? '';
    }
    if (!raw) {
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('No se pudo leer la imagen');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      raw = jsQR(pixels.data, pixels.width, pixels.height)?.data ?? '';
    }
    return raw.trim();
  } finally {
    bitmap?.close();
  }
}
