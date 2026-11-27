import { DESIGNS, FEATURES, MAX_CONSULT_LENGTH, SERVICES, consult, estimate, formatPrice } from './catalog.mjs';
import { API_BASE } from './deployment.mjs';

const root = document.documentElement;
const lang = root.lang === 'en' ? 'en' : 'uk';
const locale = lang === 'en' ? 'en-US' : 'uk-UA';
const money = new Intl.NumberFormat(locale);
const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
const select = (selector, scope = document) => scope.querySelector(selector);
const selectAll = (selector, scope = document) => [...scope.querySelectorAll(selector)];

const copy = {
  uk: {
    light: 'Увімкнути світлу тему',
    dark: 'Увімкнути темну тему',
    menuOpen: 'Відкрити меню',
    menuClose: 'Закрити меню',
    telegramSubmit: 'Відкрити чернетку в Telegram',
    staticOrder: 'Відкрийте чернетку в Telegram і надішліть її в чаті AFAL.',
    sending: 'Зберігаємо заявку…',
    orderSaved: 'Заявку збережено. Збережіть код для відстеження.',
    orderFailure: 'Не вдалося підтвердити збереження заявки. Спробуйте ще раз або відкрийте чернетку в Telegram.',
    invalidOrder: 'Перевірте поля та згоду на обробку контактів.',
    checking: 'Перевіряємо статус…',
    staticStatus: 'Відстеження доступне після підключення сервера замовлень. Уточнити статус можна в Telegram.',
    telegramStatus: 'Уточнити в Telegram',
    invalidCode: 'Введіть повний код, який ви отримали після створення заявки.',
    notFound: 'За цим кодом заявку не знайдено. Перевірте код та спробуйте ще раз.',
    statusFailure: 'Не вдалося перевірити статус. Спробуйте за хвилину.',
    consulting: 'Готуємо рекомендацію…',
    invalidMessage: `Опишіть ідею проєкту в 3–${MAX_CONSULT_LENGTH} символах.`,
    consultFailure: 'Не вдалося підготувати рекомендацію. Спробуйте описати проєкт іншими словами.',
    guided: 'Консультація за каталогом',
    ai: 'AI-консультація',
    briefCopied: 'Технічне завдання скопійовано.',
    codeCopied: 'Код скопійовано.',
    copyManually: 'Текст виділено. Скористайтеся командою копіювання.',
    rateLimited: 'Забагато запитів. Спробуйте за хвилину.',
    currencies: { USD: 'USD', UAH: 'грн' },
    statuses: {
      received: 'Отримано', 'in-review': 'На розгляді', 'in-progress': 'У роботі',
      ready: 'Готово', completed: 'Завершено', cancelled: 'Скасовано',
    },
    notification: {
      sent: 'Сповіщення надіслано в Telegram.',
      pending: 'Сповіщення в Telegram очікує надсилання.',
      unconfigured: 'Сповіщення в Telegram тимчасово недоступне.',
    },
    draft({ project, design, pages, features, price, budget }) {
      return [
        'Вітаю! Хочу обговорити сайт з AFAL.',
        `Тип сайту: ${project}`,
        `Дизайн: ${design}`,
        `Сторінок: ${pages}`,
        features && `Додаткові функції: ${features}`,
        `Попередній розрахунок: ${price}`,
        budget && `Бюджет: ${budget}`,
      ].filter(Boolean).join('\n');
    },
  },
  en: {
    light: 'Switch to light theme',
    dark: 'Switch to dark theme',
    menuOpen: 'Open menu',
    menuClose: 'Close menu',
    telegramSubmit: 'Open draft in Telegram',
    staticOrder: 'Open your draft in Telegram and send it in the AFAL chat.',
    sending: 'Saving your request…',
    orderSaved: 'Request saved. Keep this tracking code.',
    orderFailure: 'We could not confirm that your request was saved. Try again or open the draft in Telegram.',
    invalidOrder: 'Check the fields and confirm consent to process your contact details.',
    checking: 'Checking the status…',
    staticStatus: 'Status tracking requires the order server. You can ask for an update in Telegram.',
    telegramStatus: 'Ask in Telegram',
    invalidCode: 'Enter the full tracking code you received when you created the request.',
    notFound: 'There is no request with that code. Check the code and try again.',
    statusFailure: 'We could not check the status. Try again in a minute.',
    consulting: 'Preparing a recommendation…',
    invalidMessage: `Describe your project in 3–${MAX_CONSULT_LENGTH} characters.`,
    consultFailure: 'We could not prepare a recommendation. Try rephrasing your project idea.',
    guided: 'Catalog-based consultation',
    ai: 'AI consultation',
    briefCopied: 'Project brief copied.',
    codeCopied: 'Code copied.',
    copyManually: 'Text selected. Use your device’s copy command.',
    rateLimited: 'Too many requests. Try again in a minute.',
    currencies: { USD: 'USD', UAH: 'UAH' },
    statuses: {
      received: 'Received', 'in-review': 'In review', 'in-progress': 'In progress',
      ready: 'Ready', completed: 'Completed', cancelled: 'Cancelled',
    },
    notification: {
      sent: 'A Telegram notification was sent.',
      pending: 'The Telegram notification is pending.',
      unconfigured: 'Telegram notifications are temporarily unavailable.',
    },
    draft({ project, design, pages, features, price, budget }) {
      return [
        'Hi! I’d like to discuss a website with AFAL.',
        `Site type: ${project}`,
        `Design: ${design}`,
        `Pages: ${pages}`,
        features && `Additional features: ${features}`,
        `Initial estimate: ${price}`,
        budget && `Budget: ${budget}`,
      ].filter(Boolean).join('\n');
    },
  },
}[lang];

const statuses = copy.statuses;
const trackingPattern = /^AFAL-[0-9A-F]{32}$/i;
const orderForm = select('#order-form');
const statusForm = select('#status-form');
const consultForm = select('#consult-form');
const telegramLink = select('[data-telegram-fallback]');
const directTelegramUrl = 'https://t.me/artemis393';
const fields = orderForm?.elements;
const featureFields = orderForm ? selectAll('input[name="features"]', orderForm) : [];

function apiDirectory() {
  const configured = (document.body.dataset.apiBase || API_BASE).trim();
  if (!configured && (location.protocol === 'file:' || location.hostname.endsWith('.github.io'))) return null;

  try {
    const url = configured ? new URL(configured, document.baseURI) : new URL('../api/', import.meta.url);
    const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    const path = url.pathname.replace(/\/+$/, '');
    url.pathname = path.endsWith('/api') ? `${path}/` : `${path}/api/`;
    return url;
  } catch {
    return null;
  }
}

const api = apiDirectory();

async function request(route, payload, key) {
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (key) headers['Idempotency-Key'] = key;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(new URL(route, api), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('unexpected-response');
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || 'unexpected-response');
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function setText(selector, text) {
  const element = select(selector);
  if (element) element.textContent = text;
}

function show(selector, visible) {
  const element = select(selector);
  if (element) element.hidden = !visible;
}

function setBusy(form, busy) {
  form.setAttribute('aria-busy', String(busy));
  const submit = select('[type="submit"]', form);
  if (submit) submit.disabled = busy;
}

function navigateTo(target, field) {
  const section = select(target);
  if (!section) return;
  if (location.hash !== target) location.hash = target;
  else section.scrollIntoView({ block: 'start' });
  field?.focus({ preventScroll: true });
}

async function copyResult(selector, feedback, copiedMessage) {
  const node = select(selector);
  if (!node?.textContent) return;

  try {
    await navigator.clipboard.writeText(node.textContent);
    setText(feedback, copiedMessage);
  } catch {
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    setText(feedback, copy.copyManually);
  }
}

const themeToggle = select('[data-theme-toggle]');
function applyTheme(theme) {
  root.dataset.theme = theme;
  themeToggle?.setAttribute('aria-label', copy[theme === 'dark' ? 'light' : 'dark']);
}

try {
  applyTheme(localStorage.getItem('afal-theme') === 'light' ? 'light' : 'dark');
} catch {
  applyTheme(root.dataset.theme === 'light' ? 'light' : 'dark');
}

themeToggle?.addEventListener('click', () => {
  const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(theme);
  try { localStorage.setItem('afal-theme', theme); } catch { /* The active theme still applies. */ }
});

const menuToggle = select('[data-menu-toggle]');
const menu = select('#primary-nav');
function setMenu(open) {
  menu?.classList.toggle('is-open', open);
  menuToggle?.setAttribute('aria-expanded', String(open));
  menuToggle?.setAttribute('aria-label', open ? copy.menuClose : copy.menuOpen);
}

if (menu && menuToggle) {
  menuToggle.addEventListener('click', () => setMenu(!menu.classList.contains('is-open')));
  menu.addEventListener('click', (event) => {
    if (event.target.closest('a')) setMenu(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menu.classList.contains('is-open')) {
      setMenu(false);
      menuToggle.focus();
    }
  });
}

const filters = selectAll('[data-catalog-filter]');
const catalogCards = selectAll('[data-service-tier]');
function filterCatalog(tier) {
  for (const button of filters) button.setAttribute('aria-pressed', String(button.dataset.catalogFilter === tier));
  for (const card of catalogCards) card.hidden = tier !== 'all' && card.dataset.serviceTier !== tier;
}

for (const filter of filters) filter.addEventListener('click', () => filterCatalog(filter.dataset.catalogFilter));

function builderConfig() {
  return {
    serviceId: fields.serviceId.value,
    design: fields.design.value,
    pages: Number(fields.pages.value),
    features: featureFields.filter((control) => control.checked).map((control) => control.value),
  };
}

function updateEstimator() {
  const config = builderConfig();
  const service = SERVICES.find(({ id }) => id === config.serviceId);
  const design = DESIGNS.find(({ id }) => id === config.design);
  const currencyText = copy.currencies[service?.currency] ?? '—';
  setText('#estimate-currency', currencyText);
  setText('#budget-currency', currencyText);

  try {
    const { amount, currency } = estimate(config);
    setText('#estimate-total', money.format(amount));
    if (!telegramLink) return;

    const budget = Number(fields.budget.value);
    const draft = copy.draft({
      project: service.name[lang],
      design: design.label[lang],
      pages: config.pages,
      features: FEATURES.filter(({ id }) => config.features.includes(id)).map(({ label }) => label[lang]).join(', '),
      price: formatPrice({ amount, currency }, lang),
      budget: budget > 0 && fields.budget.validity.valid ? formatPrice({ amount: budget, currency }, lang) : '',
    });
    telegramLink.href = `${directTelegramUrl}?text=${encodeURIComponent(draft)}`;
  } catch {
    setText('#estimate-total', '—');
    if (telegramLink) telegramLink.href = directTelegramUrl;
  }
}

function pickService(serviceId) {
  const service = SERVICES.find(({ id }) => id === serviceId);
  if (!service || !fields) return false;
  fields.serviceId.value = serviceId;
  fields.pages.value = service.pages;
  updateEstimator();
  return true;
}

for (const button of selectAll('[data-pick-service]')) {
  button.addEventListener('click', (event) => {
    if (pickService(button.dataset.pickService)) {
      event.preventDefault();
      navigateTo('#order', fields.serviceId);
    }
  });
}

function createIdempotencyKey() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

let currentCode;
let lastSubmission;

if (orderForm) {
  const feedback = '[data-order-feedback]';
  const submitLabel = select('[data-order-submit-label]') || select('[data-order-submit]') || select('[type="submit"]', orderForm);
  for (const group of selectAll('[data-online-only]', orderForm)) {
    group.hidden = !api;
    group.disabled = !api;
  }
  if (!api) {
    for (const field of [fields.name, fields.contact, fields.details, fields.consent]) field.disabled = true;
    if (submitLabel) submitLabel.textContent = copy.telegramSubmit;
    setText(feedback, copy.staticOrder);
  }

  fields.serviceId.addEventListener('change', () => pickService(fields.serviceId.value));
  orderForm.addEventListener('input', updateEstimator);
  orderForm.addEventListener('change', updateEstimator);
  updateEstimator();

  orderForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (orderForm.getAttribute('aria-busy') === 'true') return;

    if (!api) {
      if (telegramLink) telegramLink.click();
      else location.assign(directTelegramUrl);
      return;
    }

    const payload = {
      ...builderConfig(),
      budget: fields.budget.value === '' ? null : Number(fields.budget.value),
      name: fields.name.value.trim(),
      contact: fields.contact.value.trim(),
      details: fields.details.value.trim(),
      consent: fields.consent.checked,
      lang,
    };

    if (!payload.name || payload.contact.length < 3 || !payload.consent) {
      setText(feedback, copy.invalidOrder);
      return;
    }

    setBusy(orderForm, true);
    setText(feedback, copy.sending);
    try {
      const fingerprint = JSON.stringify(payload);
      if (lastSubmission?.fingerprint !== fingerprint) {
        lastSubmission = { fingerprint, key: createIdempotencyKey() };
      }
      const data = await request('orders', payload, lastSubmission.key);
      if (!trackingPattern.test(data?.code) || !Object.hasOwn(statuses, data.status)) throw new Error('unexpected-response');

      currentCode = data.code;
      const notification = copy.notification[data.notification] ?? '';
      if (select('[data-order-notification]')) {
        setText('[data-order-status]', statuses[data.status]);
        setText('[data-order-notification]', notification);
      } else {
        setText('[data-order-status]', [statuses[data.status], notification].filter(Boolean).join(' · '));
      }
      setText('[data-order-code]', currentCode);
      show('[data-order-result]', true);
      show('[data-copy-code]', true);
      show('[data-use-code]', true);
      setText(feedback, copy.orderSaved);
    } catch (error) {
      const errors = {
        'rate-limited': copy.rateLimited,
        'invalid-order': copy.invalidOrder,
        'body-too-large': copy.invalidOrder,
      };
      setText(feedback, errors[error.message] ?? copy.orderFailure);
    } finally {
      setBusy(orderForm, false);
    }
  });

  select('[data-copy-code]')?.addEventListener('click', () => copyResult('[data-order-code]', feedback, copy.codeCopied));
}

if (statusForm) {
  const feedback = '[data-status-feedback]';
  const field = statusForm.elements.code;
  const result = '[data-status-result]';
  select('[data-use-code]')?.addEventListener('click', (event) => {
    if (!currentCode) return;
    event.preventDefault();
    field.value = currentCode;
    const section = field.closest('section[id]');
    if (section) navigateTo(`#${section.id}`, field);
    else field.focus();
    statusForm.requestSubmit();
  });

  if (!api) {
    field.disabled = true;
    const wrapper = field.closest('[data-status-input]');
    if (wrapper) wrapper.hidden = true;
    const submitLabel = select('[data-status-submit-label]', statusForm) || select('[type="submit"]', statusForm);
    if (submitLabel) submitLabel.textContent = copy.telegramStatus;
    setText(feedback, copy.staticStatus);
  }
  statusForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (statusForm.getAttribute('aria-busy') === 'true') return;
    show(result, false);
    if (!api) {
      window.open(directTelegramUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    const code = field.value.trim().toUpperCase();
    if (!trackingPattern.test(code)) {
      setText(feedback, copy.invalidCode);
      return;
    }
    field.value = code;
    setBusy(statusForm, true);
    setText(feedback, copy.checking);
    try {
      const data = await request('status', { code });
      const updated = new Date(data?.updatedAt);
      if (!Object.hasOwn(statuses, data?.status) || typeof data.updatedAt !== 'string' || Number.isNaN(updated.valueOf())) {
        throw new Error('unexpected-response');
      }

      setText('[data-status-label]', statuses[data.status]);
      const timestamp = select('[data-status-updated]');
      if (timestamp?.tagName === 'TIME') timestamp.dateTime = updated.toISOString();
      setText('[data-status-updated]', dateTime.format(updated));
      setText('[data-status-notification]', copy.notification[data.notification] ?? '');
      setText(feedback, '');
      show(result, true);
    } catch (error) {
      const errors = { 'not-found': copy.notFound, 'invalid-code': copy.invalidCode, 'rate-limited': copy.rateLimited };
      setText(feedback, errors[error.message] ?? copy.statusFailure);
    } finally {
      setBusy(statusForm, false);
    }
  });
}

if (consultForm) {
  const feedback = '[data-consult-feedback]';
  const result = '[data-consult-result]';
  const field = consultForm.elements.message;
  let suggestion;

  async function recommend(message) {
    if (api) {
      try {
        const response = await request('consult', { message, lang });
        estimate(response.suggestedConfig);
        if (typeof response.answer === 'string' && typeof response.brief === 'string') return response;
      } catch { /* The public catalog also generates a project brief. */ }
    }
    return { ...consult(message, lang), mode: 'guided' };
  }

  consultForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (consultForm.getAttribute('aria-busy') === 'true') return;
    const message = field.value.trim();
    if (message.length < 3 || message.length > MAX_CONSULT_LENGTH) {
      setText(feedback, copy.invalidMessage);
      return;
    }

    setBusy(consultForm, true);
    show(result, false);
    setText(feedback, copy.consulting);
    try {
      const response = await recommend(message);
      suggestion = response.suggestedConfig;
      setText('[data-consult-answer]', response.answer);
      setText('[data-consult-brief]', response.brief);
      setText('[data-consult-mode]', response.mode === 'ai' ? copy.ai : copy.guided);
      setText(feedback, '');
      show(result, true);
    } catch {
      setText(feedback, copy.consultFailure);
    } finally {
      setBusy(consultForm, false);
    }
  });

  for (const button of selectAll('[data-consult-prompt]')) {
    button.addEventListener('click', () => {
      field.value = button.dataset.consultPrompt;
      consultForm.requestSubmit();
    });
  }

  select('[data-apply-suggestion]')?.addEventListener('click', (event) => {
    if (!suggestion || !fields) return;
    event.preventDefault();
    fields.serviceId.value = suggestion.serviceId;
    fields.design.value = suggestion.design;
    fields.pages.value = suggestion.pages;
    for (const feature of featureFields) feature.checked = suggestion.features.includes(feature.value);
    updateEstimator();
    navigateTo('#order', fields.serviceId);
  });

  select('[data-copy-brief]')?.addEventListener('click', () => copyResult('[data-consult-brief]', feedback, copy.briefCopied));
}

const projectDialog = select('#project-dialog');
if (projectDialog) {
  select('[data-project-close]', projectDialog)?.addEventListener('click', () => projectDialog.close());
  projectDialog.addEventListener('click', (event) => {
    if (event.target === projectDialog) projectDialog.close();
  });

  for (const button of selectAll('[data-project-open]')) {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const { title, description, projectOpen } = button.dataset;
      setText('[data-project-title]', title);
      setText('[data-project-description]', description);
      const graphic = select('[data-project-art]', projectDialog);
      const template = document.getElementById(`art-${projectOpen}`);
      if (graphic && template?.content) graphic.replaceChildren(template.content.cloneNode(true));
      projectDialog.showModal();
    });
  }
}
