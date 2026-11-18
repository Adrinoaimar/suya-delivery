/**
 * Verificador criptográfico RFC 6376 DKIM (`rsa-sha256`) basado en WebCrypto.
 * Implementación pura ESM sin dependencias de Node ni Deno para compartirse entre
 * Supabase Edge Functions (`payment-webhook`) y la suite de pruebas (`vitest`).
 */

export type DkimCanonMode = 'simple' | 'relaxed';

export type DkimPublicKeyResolver = (
  selector: string,
  domain: string,
) => Promise<Uint8Array | null>;

export interface VerifyEmailDkimInput {
  rawHeaders: string | null | undefined;
  rawBody: string;
  authenticationResultsHeader?: string | null;
  trustedDomains: ReadonlySet<string>;
  requireMtaPass?: boolean;
  resolvePublicKeySpki?: DkimPublicKeyResolver;
  nowMs?: number;
}

export interface VerifyEmailDkimResult {
  authentic: boolean;
  dkimDomain: string | null;
  selector: string | null;
  mtaHost: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  subject: string | null;
  reason?: string;
}

export interface ParsedHeaderEntry {
  nameLower: string;
  rawLine: string;
  unfoldedValue: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const clean = b64.replace(/\s+/g, '');
  const bin = atob(clean);
  const buffer = new ArrayBuffer(bin.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < bin.length; i += 1) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

export function timingSafeEqualText(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let i = 0; i < maxLength; i += 1) {
    const a = i < left.length ? left.charCodeAt(i) : 0;
    const b = i < right.length ? right.charCodeAt(i) : 0;
    mismatch |= a ^ b;
  }
  return mismatch === 0;
}

export function parseRawMimeHeaders(rawHeaders: string): ParsedHeaderEntry[] {
  const normalized = rawHeaders.replace(/\r?\n/g, '\r\n');
  const lines = normalized.split('\r\n');
  const rawEntries: string[] = [];

  for (const line of lines) {
    if (!line) continue;
    if (/^[ \t]/.test(line) && rawEntries.length > 0) {
      rawEntries[rawEntries.length - 1] += `\r\n${line}`;
    } else {
      rawEntries.push(line);
    }
  }

  const parsed: ParsedHeaderEntry[] = [];
  for (const entry of rawEntries) {
    const colonIdx = entry.indexOf(':');
    if (colonIdx <= 0) continue;
    const nameLower = entry.slice(0, colonIdx).trim().toLowerCase();
    const unfoldedValue = entry
      .slice(colonIdx + 1)
      .replace(/\r\n[ \t]+/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .trim();
    parsed.push({ nameLower, rawLine: entry, unfoldedValue });
  }
  return parsed;
}

export async function computeBodyHashBase64(
  bodyText: string,
  mode: DkimCanonMode = 'relaxed',
): Promise<string> {
  let normalized = bodyText.replace(/\r?\n/g, '\r\n');
  if (mode === 'relaxed') {
    normalized = normalized
      .split('\r\n')
      .map((line) => line.replace(/[ \t]+/g, ' ').replace(/[ \t]+$/, ''))
      .join('\r\n')
      .replace(/(\r\n)+$/, '');
    const canonBody = normalized.length > 0 ? `${normalized}\r\n` : '';
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonBody));
    return bytesToBase64(new Uint8Array(digest));
  }

  const strippedSimple = normalized.replace(/(\r\n)+$/, '');
  const canonSimple = strippedSimple.length > 0 ? `${strippedSimple}\r\n` : '\r\n';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonSimple));
  return bytesToBase64(new Uint8Array(digest));
}

function canonicalizeHeaderLine(rawLine: string, mode: DkimCanonMode): string {
  if (mode === 'simple') return rawLine;
  const colonIdx = rawLine.indexOf(':');
  if (colonIdx <= 0) return rawLine;
  const nameLower = rawLine.slice(0, colonIdx).trim().toLowerCase();
  const value = rawLine
    .slice(colonIdx + 1)
    .replace(/\r\n/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
  return `${nameLower}:${value}`;
}

function stripDkimBTagValue(rawDkimHeaderLine: string): string {
  return rawDkimHeaderLine.replace(/(^|[;\s])(b\s*=\s*)([^;]*)/i, '$1$2');
}

function parseDkimTags(rawDkimValue: string): Map<string, string> {
  const tags = new Map<string, string>();
  for (const part of rawDkimValue.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx > 0) {
      const k = part.slice(0, eqIdx).trim().toLowerCase();
      const v = part.slice(eqIdx + 1).trim();
      tags.set(k, v);
    }
  }
  return tags;
}

function extractDomainFromAddress(headerValue: string): string | null {
  const match = headerValue.match(/@([a-z0-9.-]+\.[a-z]{2,})/i);
  return match ? match[1].toLowerCase() : null;
}

function domainMatchesOrSubdomain(candidateDomain: string, signingDomain: string): boolean {
  const c = candidateDomain.toLowerCase();
  const d = signingDomain.toLowerCase();
  return c === d || c.endsWith(`.${d}`);
}

function buildDkimSigningData(params: {
  parsedHeaders: ParsedHeaderEntry[];
  dkimEntryIndex: number;
  signedHeaderNames: string[];
  headerCanonMode: DkimCanonMode;
}): Uint8Array<ArrayBuffer> {
  const { parsedHeaders, dkimEntryIndex, signedHeaderNames, headerCanonMode } = params;
  const usedIndices = new Set<number>();
  const lines: string[] = [];

  for (const name of signedHeaderNames) {
    const targetName = name.trim().toLowerCase();
    if (!targetName) continue;
    // RFC 6376 §5.4.2: recorrer de abajo hacia arriba evitando repetir ocurrencias ya consumidas
    for (let idx = parsedHeaders.length - 1; idx >= 0; idx -= 1) {
      if (idx === dkimEntryIndex || usedIndices.has(idx)) continue;
      if (parsedHeaders[idx].nameLower === targetName) {
        usedIndices.add(idx);
        lines.push(canonicalizeHeaderLine(parsedHeaders[idx].rawLine, headerCanonMode));
        break;
      }
    }
  }

  const dkimWithoutSig = stripDkimBTagValue(parsedHeaders[dkimEntryIndex].rawLine);
  const canonDkimHeader = canonicalizeHeaderLine(dkimWithoutSig, headerCanonMode);
  const payload = `${lines.map((l) => `${l}\r\n`).join('')}${canonDkimHeader}`;
  const encoded = new TextEncoder().encode(payload);
  const buffer = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(buffer).set(encoded);
  return new Uint8Array(buffer);
}

function parseDnsTxtDkimRecord(txtRecords: string[]): Uint8Array<ArrayBuffer> | null {
  for (const rawTxt of txtRecords) {
    const tags = parseDkimTags(rawTxt);
    const keyType = (tags.get('k') ?? 'rsa').toLowerCase();
    const pTag = (tags.get('p') ?? '').replace(/\s+/g, '');
    if (keyType !== 'rsa' || !pTag) continue;
    try {
      return base64ToBytes(pTag);
    } catch {
      continue;
    }
  }
  return null;
}

export async function resolveDkimPublicKeyViaDoh(
  selector: string,
  domain: string,
): Promise<Uint8Array | null> {
  const fqdn = `${selector}._domainkey.${domain}`;
  const endpoints = [
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(fqdn)}&type=TXT`,
    `https://dns.google/resolve?name=${encodeURIComponent(fqdn)}&type=TXT`,
  ];

  for (const url of endpoints) {
    const res = await fetch(url, { headers: { Accept: 'application/dns-json' } }).catch(() => null);
    if (!res?.ok) continue;
    const data = (await res.json().catch(() => null)) as {
      Answer?: Array<{ type?: number; data?: string }>;
    } | null;
    const txtValues = (data?.Answer ?? [])
      .filter((a) => a.type === 16 && typeof a.data === 'string')
      .map((a) => {
        const raw = a.data ?? '';
        const quotedChunks = Array.from(raw.matchAll(/"([^"]*)"/g)).map((m) => m[1]);
        return quotedChunks.length > 0 ? quotedChunks.join('') : raw;
      });
    const spki = parseDnsTxtDkimRecord(txtValues);
    if (spki) return spki;
  }

  return null;
}

function checkMtaAuthenticationResults(params: {
  headerCandidates: string[];
  signingDomain: string;
}): { ok: boolean; mtaHost: string | null; reason?: string } {
  const { headerCandidates, signingDomain } = params;
  for (const rawAuth of headerCandidates) {
    const authHeader = rawAuth.trim();
    const mtaMatch = authHeader.match(/^\s*(mx\.cloudflare\.net|mx\.google\.com)\b/i);
    if (!mtaMatch) continue;
    const mtaHost = mtaMatch[1].toLowerCase();

    if (!/\bspf=pass\b/i.test(authHeader) || !/\bdmarc=pass\b/i.test(authHeader)) {
      return { ok: false, mtaHost, reason: 'spf_or_dmarc_failed' };
    }

    const clauses = authHeader.split(';');
    const matchingDkimPass = clauses.some((clause) => {
      if (!/\bdkim=pass\b/i.test(clause)) return false;
      const domMatch = clause.match(/\bheader\.(?:d|i)=@?([a-z0-9.-]+)/i);
      if (!domMatch) return false;
      return domainMatchesOrSubdomain(domMatch[1], signingDomain);
    });

    if (matchingDkimPass) {
      return { ok: true, mtaHost };
    }
    return { ok: false, mtaHost, reason: 'dkim_header_domain_alignment_mismatch' };
  }

  return { ok: false, mtaHost: null, reason: 'untrusted_mta_authentication_results' };
}

export async function verifyEmailDkimCryptographic(
  input: VerifyEmailDkimInput,
): Promise<VerifyEmailDkimResult> {
  const rawHeaders = (input.rawHeaders ?? '').trim();
  if (!rawHeaders) {
    return {
      authentic: false,
      dkimDomain: null,
      selector: null,
      mtaHost: null,
      fromAddress: null,
      toAddress: null,
      subject: null,
      reason: 'missing_raw_mime_headers',
    };
  }

  const parsedHeaders = parseRawMimeHeaders(rawHeaders);
  // Una cabecera duplicada puede hacer que el valor presentado al parser sea
  // distinto de la ocurrencia que DKIM verifica de abajo hacia arriba.
  if (['from', 'subject', 'to'].some((name) =>
    parsedHeaders.filter((header) => header.nameLower === name).length > 1
  )) {
    return {
      authentic: false, dkimDomain: null, selector: null, mtaHost: null,
      fromAddress: null, toAddress: null, subject: null,
      reason: 'duplicate_critical_header',
    };
  }
  const fromEntry = parsedHeaders.find((h) => h.nameLower === 'from');
  const toEntry = parsedHeaders.find((h) => h.nameLower === 'to');
  const subjectEntry = parsedHeaders.find((h) => h.nameLower === 'subject');
  const fromAddress = fromEntry?.unfoldedValue ?? null;
  const toAddress = toEntry?.unfoldedValue ?? null;
  const subject = subjectEntry?.unfoldedValue ?? null;
  const fromDomain = fromAddress ? extractDomainFromAddress(fromAddress) : null;

  const dkimIndices: number[] = [];
  for (let i = 0; i < parsedHeaders.length; i += 1) {
    if (parsedHeaders[i].nameLower === 'dkim-signature') dkimIndices.push(i);
  }
  if (dkimIndices.length === 0) {
    return {
      authentic: false,
      dkimDomain: null,
      selector: null,
      mtaHost: null,
      fromAddress,
      toAddress,
      subject,
      reason: 'missing_dkim_signature_header',
    };
  }

  const resolver = input.resolvePublicKeySpki ?? resolveDkimPublicKeyViaDoh;
  const nowSec = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const authHeaderCandidates = [
    ...(input.authenticationResultsHeader ? [input.authenticationResultsHeader] : []),
    ...parsedHeaders
      .filter((h) => h.nameLower === 'authentication-results')
      .map((h) => h.unfoldedValue),
  ];

  let lastReason = 'dkim_verification_failed';
  let lastDomain: string | null = null;
  let lastSelector: string | null = null;
  let lastMtaHost: string | null = null;

  for (const dkimIndex of dkimIndices) {
    const dkimEntry = parsedHeaders[dkimIndex];
    const tags = parseDkimTags(dkimEntry.unfoldedValue);
    const version = tags.get('v') ?? '';
    const algo = (tags.get('a') ?? '').toLowerCase();
    const dkimDomain = (tags.get('d') ?? '').toLowerCase();
    const selector = tags.get('s') ?? '';
    const bhTag = (tags.get('bh') ?? '').replace(/\s+/g, '');
    const bTag = (tags.get('b') ?? '').replace(/\s+/g, '');
    const hTag = (tags.get('h') ?? '').toLowerCase();
    const cTag = (tags.get('c') ?? 'relaxed/relaxed').toLowerCase();
    const iTag = tags.get('i') ?? '';
    const xTag = tags.get('x');
    const lTag = tags.get('l');

    lastDomain = dkimDomain || null;
    lastSelector = selector || null;

    if (version !== '1' || algo !== 'rsa-sha256') {
      lastReason = 'unsupported_dkim_version_or_algorithm';
      continue;
    }
    if (!dkimDomain || !input.trustedDomains.has(dkimDomain)) {
      lastReason = 'untrusted_dkim_signing_domain';
      continue;
    }
    if (!selector || !bhTag || !bTag) {
      lastReason = 'incomplete_dkim_signature_tags';
      continue;
    }
    if (xTag && Number.isFinite(Number(xTag)) && Number(xTag) < nowSec) {
      lastReason = 'expired_dkim_signature';
      continue;
    }
    if (iTag) {
      const iDomain = extractDomainFromAddress(iTag);
      if (!iDomain || !domainMatchesOrSubdomain(iDomain, dkimDomain)) {
        lastReason = 'dkim_auid_domain_mismatch';
        continue;
      }
    }
    if (!fromDomain || !domainMatchesOrSubdomain(fromDomain, dkimDomain)) {
      lastReason = 'from_domain_dkim_alignment_mismatch';
      continue;
    }

    const signedHeaders = hTag
      .split(':')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!signedHeaders.includes('from') || !signedHeaders.includes('subject')) {
      lastReason = 'dkim_missing_critical_signed_headers';
      continue;
    }

    const [rawHeaderCanon = 'relaxed', rawBodyCanon = 'relaxed'] = cTag.split('/');
    const headerCanonMode: DkimCanonMode = rawHeaderCanon === 'simple' ? 'simple' : 'relaxed';
    const bodyCanonMode: DkimCanonMode = rawBodyCanon === 'simple' ? 'simple' : 'relaxed';

    if (lTag !== undefined) {
      // Rechazar truncamiento parcial del cuerpo (l=) que permite inyectar texto tras la firma
      const canonicalBodyLen = new TextEncoder().encode(
        input.rawBody.replace(/\r?\n/g, '\r\n').replace(/(\r\n)+$/, ''),
      ).length;
      if (!/^\d+$/.test(lTag) || Number(lTag) < canonicalBodyLen) {
        lastReason = 'dkim_partial_body_length_rejected';
        continue;
      }
    }

    if (input.requireMtaPass !== false) {
      const mtaCheck = checkMtaAuthenticationResults({
        headerCandidates: authHeaderCandidates,
        signingDomain: dkimDomain,
      });
      lastMtaHost = mtaCheck.mtaHost;
      if (!mtaCheck.ok) {
        lastReason = mtaCheck.reason ?? 'mta_auth_failed';
        continue;
      }
    }

    const computedBh = await computeBodyHashBase64(input.rawBody, bodyCanonMode);
    if (!timingSafeEqualText(computedBh, bhTag)) {
      lastReason = 'dkim_body_hash_mismatch_tampered_content';
      continue;
    }

    const publicKeySpki = await resolver(selector, dkimDomain);
    if (!publicKeySpki) {
      lastReason = 'dkim_dns_public_key_unavailable';
      continue;
    }

    let sigBytes: Uint8Array<ArrayBuffer>;
    try {
      sigBytes = base64ToBytes(bTag);
    } catch {
      lastReason = 'invalid_dkim_signature_base64';
      continue;
    }

    const signedData = buildDkimSigningData({
      parsedHeaders,
      dkimEntryIndex: dkimIndex,
      signedHeaderNames: signedHeaders,
      headerCanonMode,
    });

    try {
      const spkiBuffer = new ArrayBuffer(publicKeySpki.byteLength);
      new Uint8Array(spkiBuffer).set(publicKeySpki);
      const cryptoKey = await crypto.subtle.importKey(
        'spki',
        spkiBuffer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      );
      const verified = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        cryptoKey,
        sigBytes,
        signedData,
      );
      if (verified) {
        return {
          authentic: true,
          dkimDomain,
          selector,
          mtaHost: lastMtaHost,
          fromAddress,
          toAddress,
          subject,
        };
      }
      lastReason = 'dkim_rsa_signature_invalid';
    } catch {
      lastReason = 'dkim_rsa_crypto_error';
    }
  }

  return {
    authentic: false,
    dkimDomain: lastDomain,
    selector: lastSelector,
    mtaHost: lastMtaHost,
    fromAddress,
    toAddress,
    subject,
    reason: lastReason,
  };
}

/**
 * Firma un mensaje MIME real con RSA-SHA256 RFC 6376 (para pruebas criptográficas reales
 * y diagnóstico seguro con llaves efímeras, nunca con firmas ficticias).
 */
export async function signMimeMessageDkimRsaSha256(params: {
  privateKey: CryptoKey;
  selector: string;
  domain: string;
  from: string;
  to: string;
  subject: string;
  rawBody: string;
  extraHeaders?: string[];
  canon?: 'relaxed/relaxed' | 'simple/simple';
}): Promise<{
  rawHeaders: string;
  dkimSignatureHeader: string;
  rawBody: string;
  bh: string;
}> {
  const canon = params.canon ?? 'relaxed/relaxed';
  const [rawHeaderCanon, rawBodyCanon] = canon.split('/') as [DkimCanonMode, DkimCanonMode];
  const bh = await computeBodyHashBase64(params.rawBody, rawBodyCanon);
  const headerLines = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    ...(params.extraHeaders ?? []),
  ];
  const signedHeaders = ['from', 'to', 'subject'];
  const dkimHeaderPrefix =
    `DKIM-Signature: v=1; a=rsa-sha256; c=${canon}; d=${params.domain}; s=${params.selector}; ` +
    `h=${signedHeaders.join(':')}; bh=${bh}; b=`;

  const parsedHeaders = parseRawMimeHeaders([...headerLines, dkimHeaderPrefix].join('\r\n'));
  const dkimIndex = parsedHeaders.length - 1;
  const signingData = buildDkimSigningData({
    parsedHeaders,
    dkimEntryIndex: dkimIndex,
    signedHeaderNames: signedHeaders,
    headerCanonMode: rawHeaderCanon,
  });

  const sigBuf = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', params.privateKey, signingData);
  const signatureB64 = bytesToBase64(new Uint8Array(sigBuf));
  const fullDkimLine = `${dkimHeaderPrefix}${signatureB64}`;
  const rawHeaders = [...headerLines, fullDkimLine].join('\r\n');

  return {
    rawHeaders,
    dkimSignatureHeader: fullDkimLine.replace(/^DKIM-Signature:\s*/i, ''),
    rawBody: params.rawBody,
    bh,
  };
}
