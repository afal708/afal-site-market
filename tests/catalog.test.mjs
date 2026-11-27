import assert from 'node:assert/strict';
import test from 'node:test';
import {
  consult,
  DEFAULT_ORDER,
  estimate,
  estimateBreakdown,
  formatPrice,
  MAX_CONSULT_LENGTH,
  MAX_PAGES,
  MEMBERSHIPS,
  PACKS,
  SERVICES,
} from '../public/catalog.mjs';

test('all nine service starting prices match the published tiers', () => {
  assert.deepEqual(
    SERVICES.map(({ id, tier, amount, currency }) => [id, tier, amount, currency]),
    [
      ['business-card', 'budget', 40, 'USD'],
      ['portfolio', 'budget', 60, 'USD'],
      ['gaming-landing', 'budget', 75, 'USD'],
      ['simple-shop', 'budget', 120, 'USD'],
      ['corporate', 'pro', 15000, 'UAH'],
      ['ecommerce', 'pro', 25000, 'UAH'],
      ['gaming-portal', 'pro', 30000, 'UAH'],
      ['platform', 'pro', 45000, 'UAH'],
      ['custom', 'pro', 50000, 'UAH'],
    ],
  );
  for (const service of SERVICES) {
    const config = { ...DEFAULT_ORDER, serviceId: service.id, pages: service.pages };
    assert.deepEqual(estimate(config), { amount: service.amount, currency: service.currency });
  }
});

test('estimates cover pages, design, and features in the chosen service currency', () => {
  assert.deepEqual(
    estimate({ serviceId: 'portfolio', design: 'premium', pages: 5, features: ['booking'] }),
    { amount: 140, currency: 'USD' },
  );
  assert.deepEqual(
    estimate({ serviceId: 'ecommerce', design: 'premium', pages: 7, features: ['payments'] }),
    { amount: 38000, currency: 'UAH' },
  );
  assert.deepEqual(
    estimate({ ...DEFAULT_ORDER, serviceId: 'platform', pages: 2 }),
    { amount: 45000, currency: 'UAH' },
  );
});

test('package prices are 25% below the same services ordered separately', () => {
  const expected = [
    { amount: 75, currency: 'USD', subtotal: 100, packSavings: 25, membershipSavings: 0 },
    { amount: 21000, currency: 'UAH', subtotal: 28000, packSavings: 7000, membershipSavings: 0 },
  ];
  for (const [index, pack] of PACKS.entries()) {
    assert.equal(estimate(pack.config).amount, expected[index].subtotal);
    assert.deepEqual(estimateBreakdown({ ...pack.config, packId: pack.id }), expected[index]);
  }
});

test('memberships apply once to service work and stack after the pack discount', () => {
  assert.deepEqual(
    MEMBERSHIPS.map(({ id, monthly, annual, discount }) => [id, monthly, annual, discount]),
    [['plus', 15, 99, 5], ['pro', 100, 950, 20]],
  );
  assert.deepEqual(estimate({ ...DEFAULT_ORDER, membershipId: 'plus' }), { amount: 38, currency: 'USD' });
  const start = PACKS[0];
  const quote = estimateBreakdown({ ...start.config, packId: start.id, membershipId: 'plus' });
  assert.deepEqual(quote, { amount: 71.25, currency: 'USD', subtotal: 100, packSavings: 25, membershipSavings: 3.75 });
  assert.equal(formatPrice(quote, 'en'), '$71.25');
  assert.equal(formatPrice(quote, 'uk'), '$71,25');
  const pro = PACKS[1];
  assert.deepEqual(
    estimateBreakdown({ ...pro.config, packId: pro.id, membershipId: 'pro' }),
    { amount: 16800, currency: 'UAH', subtotal: 28000, packSavings: 7000, membershipSavings: 4200 },
  );
});

test('package contents must match the advertised services, regardless of feature order', () => {
  const pack = PACKS[0];
  const order = { ...pack.config, packId: pack.id };
  assert.deepEqual(estimate({ ...order, features: [...pack.config.features].reverse() }), estimate(order));
  for (const change of [
    { packId: 'unknown' }, { membershipId: 'unknown' }, { membershipId: null }, { design: 'premium' },
    { pages: 2 }, { features: ['multilingual'] }, { features: ['multilingual', 'booking', 'cms'] },
  ]) {
    assert.throws(() => estimate({ ...order, ...change }), RangeError);
  }
  assert.deepEqual(estimate({ ...DEFAULT_ORDER, packId: '', membershipId: '' }), estimate(DEFAULT_ORDER));
});

test('invalid and ambiguous order configuration fails instead of producing a price', () => {
  for (const change of [
    { serviceId: 'unknown' }, { design: 'unknown' }, { pages: 1.2 }, { pages: 0 },
    { pages: MAX_PAGES + 1 }, { pages: '2' }, { features: ['payments', 'payments'] },
    { features: ['unknown'] }, { features: '' }, { features: Array(1) },
  ]) {
    assert.throws(() => estimate({ ...DEFAULT_ORDER, ...change }), RangeError);
  }
  assert.throws(() => estimate(null), RangeError);
});

test('Ukrainian consultation returns a structured brief and the same estimate as the order builder', () => {
  const result = consult('Інтернет-магазин на 7 сторінок з онлайн-оплатою. Бюджет 25 000 грн. demo@example.com.', 'uk');
  assert.equal(result.serviceId, 'ecommerce');
  assert.deepEqual(result.suggestedConfig, {
    serviceId: 'ecommerce', design: 'standard', pages: 7, features: ['payments'],
  });
  assert.match(result.answer, /перевищує бюджет/u);
  assert.deepEqual(estimate(result.suggestedConfig), { amount: 31500, currency: 'UAH' });
  assert.match(result.brief, /Чернетка ТЗ/u);
  assert.match(result.brief, /31\s500 грн/u);
  assert.doesNotMatch(result.brief, /demo@example\.com/u);
});

test('English consultation selects gaming, localizes prices, and respects page limits', () => {
  const result = consult('A premium game promo for a Discord community. 85 pages, no payments, $450 budget.', 'en');
  assert.deepEqual(result.suggestedConfig, {
    serviceId: 'gaming-landing', design: 'premium', pages: MAX_PAGES, features: [],
  });
  assert.match(result.answer, /up to 50 pages/u);
  assert.match(result.brief, /Project brief/u);
  assert.match(result.brief, /\$829/u);
  assert.throws(() => consult(' '), RangeError);
  assert.throws(() => consult('x'.repeat(MAX_CONSULT_LENGTH + 1)), RangeError);
});
