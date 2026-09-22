import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const PAYMENT_STATUSES = new Set(['created', 'pending', 'approved', 'rejected', 'failed', 'expired', 'refunded', 'cancelled']);

function parseOptions(args) {
  const options = { _: [] };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith('--')) {
      options._.push(value);
      continue;
    }
    const key = value.slice(2).replaceAll('-', '_');
    const next = args[index + 1];
    if (next && !next.startsWith('--')) {
      options[key] = next;
      index += 1;
    } else {
      options[key] = true;
    }
  }
  return options;
}

function integer(value, fallback, minimum = Number.MIN_SAFE_INTEGER) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : fallback;
}

function decimal(value, fallback, minimum = Number.MIN_SAFE_INTEGER) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

function cents(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Monto inválido: ${value}`);
  return Math.round(parsed * 100);
}

function soles(value) {
  return Number((value / 100).toFixed(2));
}

function outputResult(result, options) {
  const serialized = JSON.stringify(result, null, 2);
  if (options.output) {
    return writeFile(String(options.output), `${serialized}\n`, 'utf8').then(() => {
      console.log(`Reporte escrito en ${options.output}`);
    });
  }
  console.log(serialized);
  return Promise.resolve();
}

export function simulateLocation(options = {}) {
  const lat = decimal(options.lat, -12, -90);
  const lon = decimal(options.lon, -77, -180);
  const accuracy = decimal(options.accuracy, 8, 0);
  const duration = integer(options.duration, 60, 0);
  const intervalMs = integer(options.interval_ms, 1000, 1);
  const seed = integer(options.seed, 1);
  const lostAt = options.gps_lost_at === undefined ? null : integer(options.gps_lost_at, 0, 0);
  const recoverAt = options.recover_at === undefined ? null : integer(options.recover_at, duration + 1, 0);
  const staleAfter = options.stale_after === undefined ? null : integer(options.stale_after, 0, 0);
  const samples = Math.floor((duration * 1000) / intervalMs) + 1;
  const points = [];
  for (let index = 0; index < samples; index += 1) {
    const elapsedMs = index * intervalMs;
    const elapsedSeconds = elapsedMs / 1000;
    const lost = lostAt !== null && elapsedSeconds >= lostAt && elapsedSeconds < (recoverAt ?? duration + 1);
    const point = {
      sequence: index,
      timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, 0, elapsedMs)).toISOString(),
      lat: Number((lat + index * 0.0001 + (seed % 1000) * 0.000000001).toFixed(7)),
      lon: Number((lon + index * 0.0001).toFixed(7)),
      accuracy: lost ? null : accuracy,
      status: lost ? 'gps_lost' : staleAfter !== null && elapsedSeconds >= staleAfter ? 'stale' : 'active',
      ageMs: staleAfter !== null && elapsedSeconds >= staleAfter ? intervalMs * 3 : 0,
    };
    points.push(point);
  }
  if (options.out_of_order && points.length > 2) {
    const previous = points[points.length - 2];
    points[points.length - 2] = points[points.length - 1];
    points[points.length - 1] = previous;
  }
  return {
    kind: 'location',
    dryRun: Boolean(options.dry_run),
    route: options.route ?? 'synthetic',
    inputs: { lat, lon, accuracy, duration, intervalMs, seed, lostAt, recoverAt, staleAfter },
    points,
    events: [
      { type: 'location_started', atSeconds: 0 },
      ...(lostAt === null ? [] : [{ type: 'gps_lost', atSeconds: lostAt }]),
      ...(recoverAt === null || recoverAt > duration ? [] : [{ type: 'gps_recovered', atSeconds: recoverAt }]),
      ...(staleAfter === null ? [] : [{ type: 'location_stale', atSeconds: staleAfter }]),
      ...(options.out_of_order ? [{ type: 'out_of_order_sample', atSeconds: duration }] : []),
      { type: 'location_stopped', atSeconds: duration },
    ],
  };
}

export function simulateRider(options = {}) {
  const scenario = options.scenario ?? 'delivery';
  const speedKmh = decimal(options.speed_kmh, 25, 0);
  const pauseSeconds = integer(options.pause_seconds, 0, 0);
  const states = ['waiting', 'accepted', 'to_restaurant', 'at_restaurant', 'picked_up', 'to_customer', 'at_customer', 'delivered'];
  if (scenario === 'cancelled') states.splice(states.indexOf('delivered'), 1, 'cancelled');
  const events = states.map((state, index) => ({
    sequence: index,
    state,
    atSeconds: index * 30 + pauseSeconds * (index > 1 ? 1 : 0),
    speedKmh: state.includes('to_') ? speedKmh : 0,
  }));
  if (options.offline_at !== undefined) {
    const offlineAt = integer(options.offline_at, 60, 0);
    events.push({ sequence: events.length, state: 'connection_lost', atSeconds: offlineAt, speedKmh: 0 });
    events.push({ sequence: events.length, state: 'connection_recovered', atSeconds: offlineAt + 10, speedKmh: 0 });
  }
  if (options.duplicate_positions) events.push({ sequence: events.length, state: 'duplicate_position', atSeconds: 75, speedKmh });
  if (options.out_of_order) events.push({ sequence: events.length, state: 'out_of_order_position', atSeconds: 76, speedKmh });
  const lifecycleEvents = events.filter((event) => states.includes(event.state));
  return {
    kind: 'rider',
    dryRun: Boolean(options.dry_run),
    inputs: { scenario, speedKmh, pauseSeconds },
    events,
    invariants: {
      hasAccepted: events.some((event) => event.state === 'accepted'),
      terminalState: lifecycleEvents.at(-1)?.state ?? null,
      hasConnectionRecovery: events.some((event) => event.state === 'connection_recovered'),
    },
  };
}

export function simulateCashFlow(options = {}) {
  const orderCount = integer(options.orders, 5, 1);
  const riderCount = integer(options.riders, 2, 1);
  const includeCancellation = Boolean(options.include_cancellation);
  const includeRefund = Boolean(options.include_refund);
  const orders = [];
  for (let index = 0; index < orderCount; index += 1) {
    const subtotal = cents(20 + index * 5);
    const deliveryFee = cents(5);
    const discount = index % 2 === 1 ? cents(1) : 0;
    const total = subtotal + deliveryFee - discount;
    const cancelled = includeCancellation && index === orderCount - 1;
    const refund = cancelled ? total : includeRefund && index === 0 ? Math.min(total, cents(2)) : 0;
    const collected = cancelled ? 0 : total;
    const commission = Math.floor((subtotal - discount) * 10 / 100);
    const riderEarning = Math.floor(deliveryFee * 60 / 100);
    orders.push({
      id: `qa-order-${index + 1}`,
      riderIndex: index % riderCount,
      subtotal,
      deliveryFee,
      discount,
      total,
      status: cancelled ? 'cancelled' : 'completed',
      collected,
      refund,
      commission,
      restaurantNet: subtotal - discount - commission,
      riderEarning,
    });
  }
  const totals = orders.reduce((sum, order) => ({
    charged: sum.charged + order.total,
    collected: sum.collected + order.collected,
    refunded: sum.refunded + order.refund,
    commission: sum.commission + order.commission,
    restaurantNet: sum.restaurantNet + order.restaurantNet,
    riderEarning: sum.riderEarning + order.riderEarning,
  }), { charged: 0, collected: 0, refunded: 0, commission: 0, restaurantNet: 0, riderEarning: 0 });
  const invariants = {
    totalsMatch: orders.every((order) => order.total === order.subtotal + order.deliveryFee - order.discount),
    refundWithinCharge: orders.every((order) => order.refund >= 0 && order.refund <= order.total),
    noUnexpectedNegative: orders.every((order) => Object.values(order).filter((value) => typeof value === 'number').every((value) => value >= 0)),
    cashSettlementMatches: totals.collected === orders.reduce((sum, order) => sum + order.collected, 0),
  };
  return {
    kind: 'cash',
    dryRun: Boolean(options.dry_run),
    inputs: { orderCount, riderCount, includeCancellation, includeRefund },
    currency: 'PEN',
    orders: orders.map((order) => ({ ...order, amounts: Object.fromEntries(['subtotal', 'deliveryFee', 'discount', 'total', 'collected', 'refund', 'commission', 'restaurantNet', 'riderEarning'].map((key) => [key, soles(order[key])])) })),
    totals: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, soles(value)])),
    invariants,
    passed: Object.values(invariants).every(Boolean),
  };
}

export function simulatePayment(options = {}) {
  const scenario = options.scenario ?? 'approved';
  const requested = scenario === 'refunded' ? ['created', 'pending', 'approved', 'refunded'] :
    scenario === 'rejected' ? ['created', 'pending', 'rejected'] :
      scenario === 'failed' ? ['created', 'pending', 'failed'] :
        scenario === 'expired' ? ['created', 'pending', 'expired'] :
          scenario === 'cancelled' ? ['created', 'pending', 'cancelled'] :
            ['created', 'pending', 'approved'];
  const webhookEvents = requested.map((status, index) => ({ id: `event-${index + 1}`, idempotencyKey: `payment-qa-${status}`, status, signatureValid: true }));
  if (scenario === 'webhook-duplicate' || options.duplicate_webhook) webhookEvents.push({ ...webhookEvents.at(-1), id: 'event-duplicate' });
  if (scenario === 'out-of-order' || options.out_of_order) webhookEvents.splice(1, 0, { id: 'event-out-of-order', idempotencyKey: 'payment-qa-approved', status: 'approved', signatureValid: true });
  if (scenario === 'invalid-signature' || options.invalid_signature) webhookEvents.push({ id: 'event-invalid-signature', idempotencyKey: 'payment-qa-invalid', status: 'approved', signatureValid: false });
  let status = 'created';
  const seen = new Set();
  const acceptedEvents = [];
  let duplicates = 0;
  let rejectedEvents = 0;
  for (const event of webhookEvents) {
    if (!PAYMENT_STATUSES.has(event.status) || !event.signatureValid) {
      rejectedEvents += 1;
      continue;
    }
    if (seen.has(event.idempotencyKey)) {
      duplicates += 1;
      continue;
    }
    seen.add(event.idempotencyKey);
    if (status === 'approved' && event.status === 'pending') continue;
    if (status === 'refunded') continue;
    status = event.status;
    acceptedEvents.push(event);
  }
  return {
    kind: 'payment',
    dryRun: Boolean(options.dry_run),
    inputs: { scenario },
    events: webhookEvents,
    acceptedEvents,
    finalStatus: status,
    idempotency: { duplicates, uniqueKeys: seen.size },
    rejectedEvents,
    passed: status === requested.at(-1) && rejectedEvents === (scenario === 'invalid-signature' || options.invalid_signature ? 1 : 0),
  };
}

function help() {
  return `Uso: node scripts/qa/simulate.mjs <location|rider|cash|payment> [opciones]

Comandos:
  location  --lat --lon --accuracy --duration --interval-ms --route --seed --gps-lost-at --recover-at --stale-after --out-of-order --dry-run
  rider     --scenario delivery|cancelled --speed-kmh --pause-seconds --offline-at --duplicate-positions --out-of-order --dry-run
  cash      --scenario restaurant-order --orders --riders --include-cancellation --include-refund --dry-run
  payment   --scenario approved|rejected|failed|expired|cancelled|refunded|webhook-duplicate|out-of-order|invalid-signature --dry-run

Todos imprimen JSON determinista. --output <archivo> exporta reporte local; nunca llama producción.`;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const [, , command, ...rawArgs] = process.argv;
  const options = parseOptions(rawArgs);
  if (!command || command === 'help' || command === '--help' || command === '-h' || options.help) {
    console.log(help());
  } else {
    const simulators = { location: simulateLocation, rider: simulateRider, cash: simulateCashFlow, payment: simulatePayment };
    const simulator = simulators[command];
    if (!simulator) {
      console.error(`Comando desconocido: ${command}`);
      console.error(help());
      process.exitCode = 1;
    } else {
      await outputResult(simulator(options), options);
    }
  }
}
