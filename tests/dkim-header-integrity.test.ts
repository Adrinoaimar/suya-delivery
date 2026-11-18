import { expect, it } from 'vitest';
import { signMimeMessageDkimRsaSha256, verifyEmailDkimCryptographic } from '../supabase/functions/payment-webhook/dkim';

it('verifica RSA y rechaza cabeceras críticas duplicadas que no cubre la firma', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const message = await signMimeMessageDkimRsaSha256({ privateKey: pair.privateKey, selector: 'test', domain: 'dale.pe', from: 'billing@dale.pe', to: 'receiver@example.com', subject: 'Confirmación', rawBody: 'Operación: 123456\r\n' });
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
  const verify = (rawHeaders: string) => verifyEmailDkimCryptographic({ rawHeaders, rawBody: message.rawBody, trustedDomains: new Set(['dale.pe']), requireMtaPass: false, resolvePublicKeySpki: async () => publicKey });
  expect((await verify(message.rawHeaders)).authentic).toBe(true);
  for (const header of ['Subject: S/ 99.99', 'From: attacker@dale.pe', 'To: other@example.com']) {
    expect(await verify(`${header}\r\n${message.rawHeaders}`)).toMatchObject({ authentic: false, reason: 'duplicate_critical_header' });
  }
});
