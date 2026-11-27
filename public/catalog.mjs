export const LANGS = ['uk', 'en'];

export const SERVICES = [
  {
    id: 'business-card', tier: 'budget', amount: 40, currency: 'USD', icon: 'globe', pages: 1,
    name: { uk: 'Сайт-візитка', en: 'One-page website' },
    description: {
      uk: 'Послуги, коротко про вас і контакти на одній сторінці.',
      en: 'Your services, a short introduction, and contact details on one page.',
    },
  },
  {
    id: 'portfolio', tier: 'budget', amount: 60, currency: 'USD', icon: 'frame', pages: 3,
    name: { uk: 'Сайт-портфоліо', en: 'Portfolio website' },
    description: {
      uk: 'Галерея робіт, сторінки проєктів і зручний спосіб зв’язатися з вами.',
      en: 'A gallery for your work, project pages, and a clear way to get in touch.',
    },
  },
  {
    id: 'gaming-landing', tier: 'budget', amount: 75, currency: 'USD', icon: 'gamepad', pages: 1,
    name: { uk: 'Ігровий лендінг', en: 'Gaming landing page' },
    description: {
      uk: 'Промосторінка для гри, сервера або спільноти з медіа та кнопкою вступу.',
      en: 'A promo page for a game, server, or community, with media and a join link.',
    },
  },
  {
    id: 'simple-shop', tier: 'budget', amount: 120, currency: 'USD', icon: 'bag', pages: 3,
    name: { uk: 'Простий магазин', en: 'Starter shop' },
    description: {
      uk: 'Невеликий каталог із картками товарів і заявками на замовлення.',
      en: 'A small catalogue with product cards and order enquiries.',
    },
  },
  {
    id: 'corporate', tier: 'pro', amount: 15000, currency: 'UAH', icon: 'building', pages: 5,
    name: { uk: 'Великий корпоративний сайт', en: 'Corporate website' },
    description: {
      uk: 'Послуги, команда, кейси та розділи компанії в єдиній структурі.',
      en: 'A complete structure for your services, team, case studies, and company pages.',
    },
  },
  {
    id: 'ecommerce', tier: 'pro', amount: 25000, currency: 'UAH', icon: 'cart', pages: 6,
    name: { uk: 'Інтернет-магазин', en: 'E-commerce website' },
    description: {
      uk: 'Каталог із фільтрами, кошик, оформлення та керування замовленнями.',
      en: 'Catalogue filters, a cart, checkout, and order management.',
    },
  },
  {
    id: 'gaming-portal', tier: 'pro', amount: 30000, currency: 'UAH', icon: 'gamepad', pages: 6,
    name: { uk: 'Ігровий портал', en: 'Gaming portal' },
    description: {
      uk: 'Центр ігрової спільноти з новинами, подіями та рейтингами.',
      en: 'A hub for your gaming community with news, events, and leaderboards.',
    },
  },
  {
    id: 'platform', tier: 'pro', amount: 45000, currency: 'UAH', icon: 'layers', pages: 8,
    name: { uk: 'Бізнес-платформа', en: 'Business platform' },
    description: {
      uk: 'Особисті кабінети, ролі та керування вашими бізнес-процесами.',
      en: 'Account dashboards, access roles, and tools to manage your business workflows.',
    },
  },
  {
    id: 'custom', tier: 'pro', amount: 50000, currency: 'UAH', icon: 'sparkles', pages: 8,
    name: { uk: 'Масштабний індивідуальний проєкт', en: 'Large custom project' },
    description: {
      uk: 'Індивідуальна архітектура для складних функцій, даних та інтеграцій.',
      en: 'Custom architecture for complex features, data, and integrations.',
    },
  },
];

export const DESIGNS = [
  { id: 'standard', label: { uk: 'Стандартний дизайн', en: 'Standard design' }, percent: 0 },
  { id: 'premium', label: { uk: 'Преміальний дизайн', en: 'Premium design' }, percent: 25 },
];

export const FEATURES = [
  { id: 'multilingual', label: { uk: 'Додаткова мова', en: 'Additional language' }, usd: 25, uah: 2500 },
  { id: 'booking', label: { uk: 'Онлайн-бронювання', en: 'Online booking' }, usd: 35, uah: 3500 },
  { id: 'cms', label: { uk: 'Редагування вмісту (CMS)', en: 'Content editor (CMS)' }, usd: 40, uah: 4500 },
  { id: 'payments', label: { uk: 'Онлайн-оплата', en: 'Online payments' }, usd: 50, uah: 5500 },
  { id: 'accounts', label: { uk: 'Особисті кабінети', en: 'User accounts' }, usd: 65, uah: 6500 },
  { id: 'integrations', label: { uk: 'Інтеграція зі стороннім сервісом', en: 'External service integration' }, usd: 55, uah: 6000 },
];

export const DEFAULT_ORDER = {
  serviceId: 'business-card',
  design: 'standard',
  pages: 1,
  features: [],
};

export const EXTRA_PAGE = { USD: 12, UAH: 1000 };
export const MAX_PAGES = 50;
export const MAX_CONSULT_LENGTH = 2000;

export function estimate(config) {
  const { serviceId, design, pages, features } = config ?? {};
  const service = SERVICES.find(({ id }) => id === serviceId);
  const designOption = DESIGNS.find(({ id }) => id === design);
  const validFeatures = Array.isArray(features)
    && features.length <= FEATURES.length
    && new Set(features).size === features.length
    && [...features].every(feature => FEATURES.some(({ id }) => id === feature));
  if (!service || !designOption || !Number.isInteger(pages) || pages < 1 || pages > MAX_PAGES || !validFeatures) {
    throw new RangeError('Invalid order configuration');
  }
  const { amount, pages: includedPages, currency } = service;
  const extraPages = Math.max(0, pages - includedPages);
  const designSubtotal = (amount + extraPages * EXTRA_PAGE[currency]) * (1 + designOption.percent / 100);
  const featureCurrency = currency.toLowerCase();
  const extraFeatures = FEATURES.reduce(
    (total, feature) => total + (features.includes(feature.id) ? feature[featureCurrency] : 0),
    0,
  );
  return { amount: Math.round(designSubtotal) + extraFeatures, currency };
}

export function formatPrice({ amount, currency }, lang = 'uk') {
  const formatter = new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'uk-UA', {
    maximumFractionDigits: 0,
  });
  const number = formatter.format(amount);
  return currency === 'USD' ? `$${number}` : `${number} ${lang === 'en' ? 'UAH' : 'грн'}`;
}

const serviceSignals = [
  ['custom', /масштабн.{0,25}(?:індивідуальн|про[єе]кт)|складн.{0,25}архітектур|індивідуальн.{0,25}про[єе]кт|large[ -]scale (?:system|project)|custom (?:project|architecture)|bespoke project/u],
  ['platform', /бізнес[ -]?платформ|бізнес[ -]?процес|\bsaas\b|(?:business|marketplace) platform|workflow automation|business workflow/u],
  ['gaming-portal', /ігров.{0,12}портал|турнір|рейтинг.{0,18}(?:грав|сезон)|gam(?:ing|e) portal|tournaments?|leaderboards?/u],
  ['simple-shop', /прост.{0,12}магазин|невелик.{0,12}магазин|маленьк.{0,12}магазин|мінімальн.{0,12}магазин|(?:basic|small|starter|simple) (?:online )?(?:shop|store)/u],
  ['ecommerce', /(?:інтернет|онлайн)[\s-]?магазин|кошик|доставк|облік залишків|e[ -]?commerce|online (?:shop|store)|checkout|shopping cart|inventory/u],
  ['portfolio', /портфоліо|фотограф|галере[яї] робіт|фріланс|portfolio|photograph|showcase my work|my projects/u],
  ['gaming-landing', /ігр(?:а|и|ою|ов)|\bgame\b|gaming|minecraft|discord|майнкрафт|сервер[а-яіїєґ]* для гри/u],
  ['corporate', /корпоративн|сайт.{0,12}компані[яїі]|для компанії|сайт.{0,12}підприємств|corporate|company (?:website|site)|site for (?:my|our) company/u],
  ['simple-shop', /магазин|товар|каталог продукці|\bshop\b|\bstore\b|product catalogu?e/u],
  ['platform', /\bcrm\b|систем.{0,18}керуван|dashboard for/u],
  ['business-card', /візитк|лендінг|односторінк|послуг|контакт|landing page|one[ -]page|business card|services/u],
];

const featureSignals = [
  ['multilingual', /багатомов|двомов|мовні верс|версі[яїю] англійською|англійськ.{0,18}українськ|українськ.{0,18}англійськ|multilingual|bilingual|(?:two|multiple|additional) languages|english.{0,12}ukrainian|ukrainian.{0,12}english/u],
  ['booking', /бронюван|онлайн[ -]?запис|запис на прийом|online book|appointment|reservation/u],
  ['cms', /\bcms\b|редагува.{0,18}(?:контент|вміст)|адмін[ -]?панел|content edit|admin dashboard/u],
  ['payments', /онлайн[ -]?оплат|оплат[аиу].{0,10}онлайн|платіжн|оплат[аиу] картк|payments?|payment gateway|stripe|liqpay/u],
  ['accounts', /особист.{0,12}кабінет|реєстраці[яїю].{0,25}користувач|авторизаці|user accounts?|member login|sign[ -]?in/u],
  ['integrations', /інтеграці|\bcrm\b|integration|sync with|\bapi\b/u],
];

function detectBudget(text) {
  const amountPattern = '(\\d{1,3}(?:[ \\u00a0\\u202f,]\\d{3})+|\\d+)';
  const currencyPattern = '(\\$|₴|usd|uah|грн|гривень|гривні|долар[а-я]*|dollars?)';
  const before = text.match(new RegExp(`${currencyPattern}\\s*${amountPattern}`, 'u'));
  const after = text.match(new RegExp(`${amountPattern}\\s*${currencyPattern}`, 'u'));
  if (!before && !after) return null;
  const [currencyText, amountText] = before ? [before[1], before[2]] : [after[2], after[1]];
  return {
    amount: Number(amountText.replace(/[\s,]/gu, '')),
    currency: /\$|usd|долар|dollar/u.test(currencyText) ? 'USD' : 'UAH',
  };
}

function redactContacts(text) {
  return text
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/giu, '…')
    .replace(/(?<![\p{L}\d])(?:\+\d[\d().\s-]{7,}\d|0\d{9})(?!\d)/gu, '…')
    .replace(/(?<!\w)@[a-z0-9_]{5,}/giu, '…');
}

function asksForFeature(request, signal) {
  const match = signal.exec(request);
  if (!match) return false;
  const leadIn = request.slice(Math.max(0, match.index - 28), match.index);
  return !/(?:^|[^\p{L}])(?:без|не потрібно|no|without)\s+(?:(?:an?|any)\s+)?$/u.test(leadIn);
}

export function consult(message, lang = 'uk') {
  if (typeof message !== 'string' || !message.trim() || message.length > MAX_CONSULT_LENGTH) {
    throw new RangeError(`Expected a request of 1–${MAX_CONSULT_LENGTH} characters`);
  }
  const language = LANGS.includes(lang) ? lang : 'uk';
  const english = language === 'en';
  const request = message.trim().replace(/\s+/gu, ' ');
  const normalized = request.normalize('NFKC').toLowerCase();
  const matchedService = serviceSignals.find(([, signal]) => signal.test(normalized))?.[0];
  const budget = detectBudget(normalized);
  const serviceId = matchedService ?? DEFAULT_ORDER.serviceId;
  const service = SERVICES.find(({ id }) => id === serviceId);
  const pageCountMatch = normalized.match(/(?<![\p{L}\d])(\d{1,6})\s*(?:сторін(?:к[аиою]|ок)?|pages?)(?!\p{L})/u);
  const requestedPages = pageCountMatch ? Number(pageCountMatch[1]) : service.pages;
  const pages = Math.min(MAX_PAGES, Math.max(1, requestedPages));
  const design = asksForFeature(normalized, /преміум|преміальн|premium|high[ -]end/u) ? 'premium' : 'standard';
  const features = featureSignals
    .filter(([id, signal]) => asksForFeature(normalized, signal) && !(id === 'accounts' && serviceId === 'platform'))
    .map(([id]) => id);
  const suggestedConfig = { serviceId, design, pages, features };
  const price = estimate(suggestedConfig);
  const formattedPrice = formatPrice(price, language);
  const priceMismatch = budget && budget.currency !== price.currency;
  const overBudget = budget && !priceMismatch && budget.amount < price.amount;
  const name = service.name[language];
  const description = service.description[language];
  const extras = FEATURES.filter(({ id }) => features.includes(id)).map(({ label }) => label[language]);
  const designLabel = DESIGNS.find(({ id }) => id === design).label[language];
  const answer = [
    matchedService
      ? (english ? `Recommended format — ${name}. ${description}` : `Рекомендований формат — «${name}». ${description}`)
      : (english
        ? 'A one-page website is a starting point. Tell us what visitors should do on the site and what content you plan to publish.'
        : 'Почати можна із сайту-візитки. Уточніть, що відвідувачі мають робити на сайті та який вміст ви хочете опублікувати.'),
    english ? `Estimated price for this scope is ${formattedPrice}.` : `Попередня вартість такої комплектації — ${formattedPrice}.`,
    overBudget && (english
      ? `The estimate exceeds your ${formatPrice(budget, language)} budget. Consider starting with fewer pages or moving optional features to a second phase.`
      : `Кошторис перевищує бюджет ${formatPrice(budget, language)}. Можна скоротити кількість сторінок або відкласти додаткові функції на наступний етап.`),
    priceMismatch && (english
      ? 'Your budget and the estimate are in different currencies. Confirm the budget currency when submitting the order.'
      : 'Бюджет і кошторис у різних валютах. Уточніть валюту бюджету під час подання заявки.'),
    requestedPages > MAX_PAGES && (english
      ? `The calculator covers up to ${MAX_PAGES} pages. Discuss the full page count when confirming the scope.`
      : `Калькулятор враховує до ${MAX_PAGES} сторінок. Повну кількість можна узгодити під час обговорення проєкту.`),
  ].filter(Boolean).join(' ');

  const brief = (english ? [
    `Project brief — ${name}`,
    '',
    'Client request',
    redactContacts(request),
    '',
    'Initial scope',
    `• ${description}`,
    `• ${pages} ${pages === 1 ? 'page' : 'pages'} · ${designLabel}`,
    ...extras.map(feature => `• ${feature}`),
    '• Responsive layouts, keyboard access, and page titles and descriptions.',
    '',
    'Before development',
    '• Confirm the page list, content owner, brand assets, and how visitors will complete the main action.',
    '• Agree on the delivery date, hosting, and acceptance criteria.',
    `• Estimated price — ${formattedPrice}.`,
  ] : [
    `Чернетка ТЗ — ${name}`,
    '',
    'Запит клієнта',
    redactContacts(request),
    '',
    'Попередній обсяг',
    `• ${description}`,
    `• Кількість сторінок — ${pages} · ${designLabel}`,
    ...extras.map(feature => `• ${feature}`),
    '• Адаптивний інтерфейс, навігація з клавіатури, заголовки й описи сторінок.',
    '',
    'Перед розробкою',
    '• Погодити перелік сторінок, джерело матеріалів, фірмовий стиль і головний сценарій для відвідувача.',
    '• Узгодити строки, хостинг і критерії приймання.',
    `• Попередня вартість — ${formattedPrice}.`,
  ]).join('\n');
  return { serviceId, answer, brief, suggestedConfig };
}
