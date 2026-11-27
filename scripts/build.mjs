import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  LANGS, SERVICES, DESIGNS, FEATURES, PACKS, PORTALS, MEMBERSHIPS, DEFAULT_ORDER, MAX_CONSULT_LENGTH,
  MIN_MARKET_ESTIMATE, MAX_MARKET_ESTIMATE,
  estimate, estimateBreakdown, formatPrice,
} from '../public/catalog.mjs';
import { copy } from './content.mjs';

const canonical = new URL(process.env.AFAL_SITE_URL ?? 'https://afal708.github.io/afal-site-market/');
if (!canonical.pathname.endsWith('/')) canonical.pathname += '/';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(root, process.argv[2] ?? '.');
const telegram = 'https://t.me/artemis393';
const projectNames = ['FORM SUPPLY', 'STILL FRAME', 'RESPAWN'];
const projectIds = ['form', 'frame', 'respawn'];
const esc = (value) => String(value).replace(/[&<>"']/g, (symbol) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[symbol]);

const icons = {
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20.8 14.4A8.9 8.9 0 0 1 9.6 3.2a9 9 0 1 0 11.2 11.2Z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18m0-18a15 15 0 0 0 0 18"/>',
  frame: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m5 16 4-5 4 4 3-3 3 4"/><circle cx="15.5" cy="8.5" r="1"/>',
  gamepad: '<path d="M8 7h8c2.6 0 4 1.7 4.5 3.5l1.2 4.4c.7 2.5-1.7 4.1-3.6 2.4L15 14H9l-3.1 3.3c-1.9 1.7-4.3.1-3.6-2.4l1.2-4.4C4 8.7 5.4 7 8 7Z"/><path d="M8 9v4m-2-2h4m6-1h.01m2 2h.01"/>',
  bag: '<path d="M4 8h16l1 13H3L4 8Z"/><path d="M8 9V7a4 4 0 1 1 8 0v2"/>',
  building: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h1m4 0h1M9 11h1m4 0h1m-6 4h1m4 0h1m-4 6v-3h2v3"/>',
  cart: '<path d="M2 4h3l2.8 10.2a1 1 0 0 0 1 .8h9.7a1 1 0 0 0 1-.7L22 7H6"/><circle cx="10" cy="19" r="1"/><circle cx="18" cy="19" r="1"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5m-18 4 9 5 9-5"/>',
  sparkles: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  send: '<path d="M3 11.5 21 4l-4.2 16-5.2-4-3 3v-5.1L18 7.5 6.7 13.4 3 11.5Z"/>',
};
const icon = (name, css = '') => `<svg class="icon ${css}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.globe}</svg>`;
const brand = `<span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 30 30" fill="none"><path d="M5 24 14 6h4l8 18h-5l-5-12-6 12H5Z" fill="currentColor"/><path d="M14 19h4l2 5h-8l2-5Z" fill="currentColor"/></svg></span><span class="brand-name">AFAL<span>Site Market</span></span>`;

function price(amount, currency, lang) {
  return formatPrice({ amount, currency }, lang);
}

function heading(label, title, intro) {
  return `<div class="section-heading"><p class="eyebrow">${label}</p><h2>${title}</h2><p>${intro}</p></div>`;
}

function render(lang) {
  const t = copy[lang];
  const uk = lang === 'uk';
  const assets = uk ? './public/' : '../public/';
  const home = './';
  const language = uk ? './en/' : '../';
  const canonicalPage = uk ? canonical.href : new URL('en/', canonical).href;
  const preferredLink = (href, key) => `<a href="#${href}">${t[key]}</a>`;
  const contactLink = (css, extra = '') => `<a class="button ${css}" href="${telegram}" target="_blank" rel="noopener noreferrer" ${extra}>${icon('send')} ${t.telegram}</a>`;
  const initial = estimate(DEFAULT_ORDER);
  const currency = initial.currency === 'USD' ? 'USD' : (uk ? 'грн' : 'UAH');
  const serviceCards = SERVICES.map(service => `
      <article class="service-card" data-service-tier="${service.tier}">
        <div class="service-head"><div class="service-icon">${icon(service.icon)}</div><span>${service.tier === 'pro' ? t.pro : t.budget}</span></div>
        <h3>${service.name[lang]}</h3>
        <p>${service.description[lang]}</p>
        <div class="service-bottom"><span><small>${t.from}</small> ${price(service.amount, service.currency, lang)}</span><a href="#order" class="button small secondary" data-pick-service="${service.id}">${t.select}<span class="sr-only"> · ${service.name[lang]}</span></a></div>
      </article>`).join('');
  const projectArt = (i) => `<div class="project-art ${projectIds[i]}" aria-hidden="true"><div class="mock">
        <div class="mock-nav"><b>${projectNames[i]}</b><span></span><span></span></div>
        <div class="mock-content"><b>${t.projects[i][2]}</b><div class="mock-object"></div><span></span></div>
      </div></div>`;
  const projects = t.projects.map(([type, detail], i) => `
      <article class="project-card">
        ${projectArt(i)}
        <div class="project-info"><p>${type} · ${t.concept}</p><h3>${projectNames[i]}</h3><p>${detail}</p><button type="button" class="button secondary small" data-project-open="${projectIds[i]}" data-title="${projectNames[i]}" data-description="${esc(detail)}">${t.viewConcept}<span class="sr-only"> · ${projectNames[i]}</span></button></div>
      </article>
      <template id="art-${projectIds[i]}">${projectArt(i)}</template>`).join('');
  const tierPrice = (tier, title, intro) => `<article class="tier-card ${tier}">
      <header><h3>${title}</h3><p>${intro}</p></header>
      <table aria-label="${title}"><tbody>${SERVICES.filter(service => service.tier === tier).map(service => `<tr><th scope="row">${service.name[lang]}</th><td><small>${t.from}</small> ${price(service.amount, service.currency, lang)}</td></tr>`).join('')}</tbody></table>
    </article>`;
  const packCards = PACKS.map(pack => {
    const { serviceId, design, pages, features } = pack.config;
    const service = SERVICES.find(item => item.id === serviceId);
    const designLabel = DESIGNS.find(item => item.id === design).label[lang];
    const pagesLabel = uk ? (pages === 1 ? '1 сторінка' : `${pages} сторінок`) : `${pages} ${pages === 1 ? 'page' : 'pages'}`;
    const items = features.map(id => FEATURES.find(feature => feature.id === id).label[lang]);
    const { subtotal, amount, currency } = estimateBreakdown({ ...pack.config, packId: pack.id });
    return `<article class="offer-card">
      <header class="offer-header"><h4>${pack.name}</h4><span class="offer-saving">−${pack.discount}%</span></header>
      <div class="offer-price"><strong>${price(amount, currency, lang)}</strong><del>${price(subtotal, currency, lang)}</del></div>
      <ul class="pack-services">
        ${[`${service.name[lang]} · ${pagesLabel}`, designLabel, ...items].map(item => `<li>${icon('check')}${item}</li>`).join('')}
      </ul>
      <a href="#order" class="button primary" data-pick-pack="${pack.id}">${t.choosePack}<span class="sr-only"> · ${pack.name}</span></a>
    </article>`;
  }).join('');
  const membershipCards = MEMBERSHIPS.map(plan => {
    const rate = (period, label) => {
      const amount = price(plan[period], 'USD', lang);
      const message = uk ? `Вітаю! Хочу оформити ${plan.name} (${amount} ${label.toLowerCase()}).` : `Hello! I’d like to join ${plan.name} (${amount} ${label.toLowerCase()}).`;
      const draft = `${telegram}?text=${encodeURIComponent(message)}`;
      return `<div class="billing-option">
        <span>${label}</span><strong>${amount}</strong>
        <a href="${esc(draft)}" class="button secondary small" target="_blank" rel="noopener noreferrer" data-membership-join="${plan.id}" data-membership-period="${period}">${t.activate}<span class="sr-only"> · ${plan.name}, ${label}</span></a>
      </div>`;
    };
    return `<article class="offer-card membership-card${plan.portalOnly ? ' portal-plan' : ''}">
      <header class="offer-header"><h4>${plan.name}</h4><span class="offer-saving">${plan.portalOnly ? t.portalRate : `−${plan.discount}% ${t.membershipDiscount}`}</span></header>
      <div class="billing-options">${rate('monthly', t.month)}${rate('annual', t.year)}</div>
      ${plan.portalOnly
        ? `<a href="#portal-services" class="button primary">${t.viewPortals}</a>`
        : `<a href="#order" class="button secondary" data-pick-membership="${plan.id}">${t.tryMembership}<span class="sr-only"> · ${plan.name}</span></a>`}
    </article>`;
  }).join('');
  const portalCards = PORTALS.map(portal => `<article class="offer-card portal-card">
    <div class="service-icon">${icon(portal.icon)}</div>
    <div><h4>${portal.name[lang]}</h4><p>${portal.description[lang]}</p></div>
    <strong>${t.portalRate}</strong>
    <a href="#order" class="button secondary" data-pick-portal="${portal.id}">${t.choosePortal}<span class="sr-only"> · ${portal.name[lang]}</span></a>
  </article>`).join('');
  const schema = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'WebSite', name: 'AFAL Site Market',
    url: canonicalPage, inLanguage: lang, description: t.description,
  });

  return `<!doctype html>
<html lang="${lang}" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${esc(t.description)}">
  <meta name="theme-color" content="#151310">
  <title>${t.title}</title>
  <link rel="canonical" href="${esc(canonicalPage)}">
  <link rel="alternate" hreflang="uk" href="${esc(canonical.href)}">
  <link rel="alternate" hreflang="en" href="${esc(new URL('en/', canonical).href)}">
  <link rel="alternate" hreflang="x-default" href="${esc(canonical.href)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="AFAL Site Market">
  <meta property="og:title" content="${esc(t.title)}">
  <meta property="og:description" content="${esc(t.description)}">
  <meta property="og:url" content="${esc(canonicalPage)}">
  <meta property="og:locale" content="${uk ? 'uk_UA' : 'en_US'}">
  <meta property="og:image" content="${esc(new URL('public/hero.webp', canonical).href)}">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">${schema.replaceAll('<', '\\u003c')}</script>
  <script>(()=>{try{if(localStorage.getItem('afal-theme')==='light')document.documentElement.dataset.theme='light'}catch{}})()</script>
  <link rel="icon" href="${assets}favicon.png" type="image/png">
  <link rel="stylesheet" href="${assets}style.css">
  <script type="module" src="${assets}app.mjs"></script>
</head>
<body data-api-base="">
  <a class="skip-link" href="#main">${t.skip}</a>
  <header class="site-header" id="top">
    <div class="wrap header-inner">
      <a class="brand" href="${home}" aria-label="AFAL Site Market · ${t.home}">${brand}</a>
      <nav class="primary-nav" id="primary-nav" aria-label="${t.menu}">
        ${preferredLink('catalog','catalog')} ${preferredLink('portfolio','portfolio')} ${preferredLink('pricing','pricing')} ${preferredLink('consult','ai')} ${preferredLink('faq','faq')}
      </nav>
      <div class="header-actions">
        <a class="language" href="${language}" lang="${uk ? 'en' : 'uk'}" hreflang="${uk ? 'en' : 'uk'}" aria-label="${t.language}">${uk ? 'EN' : 'UA'}</a>
        <button type="button" class="icon-button" data-theme-toggle aria-label="${t.theme}">${icon('sun','sun')}${icon('moon','moon')}</button>
        <a class="button primary header-cta" href="#order">${t.order}</a>
        <button type="button" class="icon-button mobile-menu" data-menu-toggle aria-label="${t.menu}" aria-controls="primary-nav" aria-expanded="false">${icon('menu')}</button>
      </div>
    </div>
  </header>
  <main id="main">
    <section class="hero wrap" aria-labelledby="hero-title">
      <div class="hero-copy">
        <p class="eyebrow">${t.heroLabel}</p>
        <h1 id="hero-title">${t.heroTitle[0]}<br><em>${t.heroTitle[1]}</em></h1>
        <p class="hero-description">${t.heroBody}</p>
        <div class="actions"><a href="#order" class="button primary">${t.order}</a><a href="#portfolio" class="button secondary">${t.heroWork}</a></div>
      </div>
      <div class="hero-visual">
        <img src="${assets}hero.webp" width="1000" height="1000" alt="${t.heroAlt}" fetchpriority="high">
        <div class="hero-estimate"><span>${t.heroPrice}</span><strong>${t.from} ${price(Math.min(...SERVICES.filter(service => service.currency === 'USD').map(service => service.amount)), 'USD', lang)}</strong></div>
      </div>
      <ul class="hero-features">${t.heroFeatures.map(feature => `<li>${icon('check')}${feature}</li>`).join('')}</ul>
    </section>
    <section class="section wrap" id="catalog">
      <div class="catalog-header">
        ${heading(t.catalog, t.catalogTitle, t.catalogIntro)}
        <div class="filters" role="group" aria-label="${t.catalog}">
          <button type="button" data-catalog-filter="all" aria-pressed="true">${t.all}</button>
          <button type="button" data-catalog-filter="budget" aria-pressed="false">${t.budget}</button>
          <button type="button" data-catalog-filter="pro" aria-pressed="false">${t.pro}</button>
        </div>
      </div>
      <div class="service-grid">${serviceCards}</div>
    </section>
    <section class="section wrap" id="portfolio">
      ${heading(t.portfolio, t.portfolioTitle, t.portfolioIntro)}
      <div class="project-grid">${projects}</div>
      <dialog id="project-dialog" class="project-dialog" aria-labelledby="project-dialog-title">
        <button type="button" class="icon-button close-dialog" data-project-close aria-label="${t.close}">${icon('close')}</button>
        <div data-project-art></div><div class="project-info"><p>${t.concept}</p><h3 id="project-dialog-title" data-project-title></h3><p data-project-description></p></div>
      </dialog>
    </section>
    <section class="section wrap" id="pricing">
      ${heading(t.pricing, t.pricingTitle, t.pricingIntro)}
      <div class="pricing-links actions"><a href="#packs" class="button secondary small">${t.packs}</a><a href="#memberships" class="button secondary small">${t.memberships}</a><a href="#portal-services" class="button secondary small">${t.portals}</a></div>
      <div class="tier-grid">${tierPrice('budget',t.pricingBudget,t.pricingBudgetText)} ${tierPrice('pro',t.pricingPro,t.pricingProText)}</div>
      <p class="pricing-goal">${t.pricingGoal}</p>
      <section class="pricing-group" id="packs" aria-labelledby="packs-title">
        <div class="section-heading"><h3 id="packs-title">${t.packs}</h3><p>${t.packsIntro}</p></div>
        <div class="tier-grid">${packCards}</div>
      </section>
      <section class="pricing-group" id="memberships" aria-labelledby="memberships-title">
        <div class="section-heading"><h3 id="memberships-title">${t.memberships}</h3><p>${t.membershipIntro}</p></div>
        <div class="membership-grid">${membershipCards}</div>
        <p class="pricing-goal">${t.membershipNote}</p>
      </section>
      <section class="pricing-group" id="portal-services" aria-labelledby="portal-services-title">
        <div class="section-heading"><h3 id="portal-services-title">${t.portalTitle}</h3><p>${t.portalIntro}</p></div>
        <div class="service-grid">${portalCards}</div>
      </section>
    </section>
    <section class="section wrap" id="consult">
      <div class="consult-panel">
        <div>${heading(t.ai, t.consultTitle, t.consultIntro)}<div class="prompts">${t.consultHints.map(message => `<button class="button small secondary" type="button" data-consult-prompt="${esc(message)}">${message}</button>`).join('')}</div></div>
        <div class="consult-main">
          <form id="consult-form" method="post">
            <label class="field">${t.consultLabel}<textarea name="message" rows="4" minlength="3" maxlength="${MAX_CONSULT_LENGTH}" required placeholder="${esc(t.consultPlaceholder)}" aria-describedby="consult-privacy"></textarea></label>
            <p class="form-note" id="consult-privacy">${t.consultPrivacy}</p>
            <button type="submit" class="button primary">${icon('sparkles')} ${t.consultSubmit}</button>
          </form>
          <p class="feedback" data-consult-feedback role="status"></p>
          <div class="result" data-consult-result hidden>
            <p class="mode" data-consult-mode></p>
            <p data-consult-answer></p>
            <h3>${t.brief}</h3><pre data-consult-brief></pre>
            <div class="actions"><button type="button" class="button primary small" data-apply-suggestion>${t.apply}</button><button type="button" class="button secondary small" data-copy-brief>${t.copy}</button></div>
          </div>
        </div>
      </div>
    </section>
    <section class="section wrap" id="order">
      ${heading(t.order, t.orderTitle, t.orderIntro)}
      <form class="builder" id="order-form" method="post">
        <div class="builder-fields">
          <fieldset><legend>${t.configuration}</legend><div class="field-grid">
            <label class="field">${t.orderPack}<select name="packId" aria-describedby="pack-scope"><option value="">${t.noPack}</option>${PACKS.map(pack => `<option value="${pack.id}">${pack.name} · −${pack.discount}%</option>`).join('')}</select></label>
            <label class="field">${t.orderMembership}<select name="membershipId" aria-describedby="membership-estimate-note portal-estimate-note"><option value="">${t.noMembership}</option>${MEMBERSHIPS.map(plan => plan.portalOnly
              ? `<option value="${plan.id}" hidden disabled>${plan.name}</option>`
              : `<option value="${plan.id}">${plan.name} · −${plan.discount}%</option>`).join('')}</select></label>
            <p class="form-note full builder-note" id="pack-scope" data-pack-scope hidden>${t.packDetails}</p>
            <label class="field">${t.service}<select name="serviceId" required>${SERVICES.map(service => `<option value="${service.id}"${service.id === DEFAULT_ORDER.serviceId ? ' selected' : ''}>${service.name[lang]}</option>`).join('')}
              <optgroup label="${t.portals} · AFAL Portal">${PORTALS.map(portal => `<option value="${portal.id}">${portal.name[lang]}</option>`).join('')}</optgroup>
            </select></label>
            <label class="field">${t.design}<select name="design" required>${DESIGNS.map(design => `<option value="${design.id}"${design.id === DEFAULT_ORDER.design ? ' selected' : ''}>${design.label[lang]}</option>`).join('')}</select></label>
            <label class="field">${t.pages}<input name="pages" type="number" min="1" max="50" value="${DEFAULT_ORDER.pages}" required></label>
            <label class="field"><span>${t.budgetField} <span class="subtle">· ${t.optional}</span></span><span class="input-suffix"><input name="budget" type="number" min="1" step="1" inputmode="numeric" placeholder="100"><span id="budget-currency">${currency}</span></span></label>
          </div></fieldset>
          <fieldset data-portal-fields hidden disabled>
            <legend>AFAL Portal</legend>
            <label class="field portal-market"><span>${t.marketEstimate} <span class="subtle">· ${t.optional}</span></span>
              <span class="input-suffix"><input name="marketEstimate" type="number" min="${MIN_MARKET_ESTIMATE}" max="${MAX_MARKET_ESTIMATE}" step="0.01" inputmode="decimal" aria-describedby="market-help"><span>${uk ? 'грн' : 'UAH'}</span></span>
            </label>
            <p id="market-help" class="form-note">${t.marketHelp}</p>
          </fieldset>
          <fieldset><legend>${t.features}</legend><div class="checks">${FEATURES.map(feature => `<label class="check"><input name="features" type="checkbox" value="${feature.id}"><span>${feature.label[lang]}</span></label>`).join('')}</div></fieldset>
          <fieldset data-online-only hidden disabled><legend>${t.reply}</legend><div class="field-grid">
            <label class="field">${t.name}<input name="name" autocomplete="name" maxlength="100" required></label>
            <label class="field">${t.contactField}<input name="contact" minlength="3" maxlength="160" required></label>
            <label class="field full"><span>${t.details} <span class="subtle">· ${t.optional}</span></span><textarea name="details" rows="3" maxlength="1600"></textarea></label>
          </div><label class="consent"><input name="consent" type="checkbox" required><span>${t.consent}</span></label></fieldset>
        </div>
        <aside class="estimate-box">
          <p class="eyebrow">${t.estimate}</p>
          <p class="total" aria-live="polite"><strong id="estimate-total">${initial.amount}</strong> <span id="estimate-currency">${currency}</span></p>
          <dl class="savings" data-estimate-discounts hidden>
            <div data-pack-savings hidden><dt>${t.packageSavings}</dt><dd data-pack-savings-amount></dd></div>
            <div data-membership-savings hidden><dt><span data-regular-savings-label>${t.membershipSavings}</span><span data-portal-savings-label hidden>${t.portalSavings}</span></dt><dd data-membership-savings-amount></dd></div>
          </dl>
          <p class="form-note" id="membership-estimate-note" data-membership-note hidden>${t.membershipNote}</p>
          <p class="form-note" id="portal-estimate-note" data-portal-note hidden>${t.portalNote}</p>
          <p>${t.estimateNote}</p>
          <div class="estimate-actions"><button type="submit" class="button primary" data-order-submit><span data-order-submit-label>${t.submit}</span></button>${contactLink('secondary','data-telegram-fallback')}</div>
          <p class="feedback" data-order-feedback role="status"></p>
          <div class="result" data-order-result hidden>
            <b>${t.trackingCode}</b>
            <code data-order-code></code>
            <p data-order-status></p>
            <p data-order-notification></p>
            <div class="actions"><button type="button" class="button secondary small" data-copy-code>${t.copy}</button><button type="button" class="button secondary small" data-use-code>${t.checkStatus}</button></div>
          </div>
        </aside>
      </form>
    </section>
    <section class="wrap" id="tracking">
      <div class="tracking">
        <div><h2>${t.tracking}</h2><p>${t.trackingIntro}</p></div>
        <div><form id="status-form" method="post"><label class="field" data-status-input><span class="sr-only">${t.trackingCode}</span><input name="code" type="text" placeholder="AFAL-…" required maxlength="37" autocomplete="off" spellcheck="false"></label><button type="submit" class="button secondary"><span data-status-submit-label>${t.checkStatus}</span></button></form>
          <p class="feedback" data-status-feedback role="status"></p><div class="result" data-status-result hidden><p><strong data-status-label></strong></p><p data-status-updated></p></div></div>
      </div>
    </section>
    <section class="section wrap" id="about">
      ${heading(t.about,t.aboutTitle,t.aboutText)}
      <div class="steps">${t.steps.map(([title, detail]) => `<article><div class="service-icon">${icon('check')}</div><h3>${title}</h3><p>${detail}</p></article>`).join('')}</div>
    </section>
    <section class="section wrap faq" id="faq">
      <div class="section-heading"><p class="eyebrow">FAQ</p><h2>${uk ? 'Часті запитання' : 'Frequently asked questions'}</h2></div>
      <div class="questions">${t.faqs.map(([question, answer]) => `<details><summary>${question}${icon('plus')}</summary><p>${answer}</p></details>`).join('')}</div>
    </section>
    <section class="wrap final-section" id="contact">
      <div class="contact-panel">${heading(t.contact,t.contactTitle,t.contactIntro)}<div class="actions">${contactLink('primary')}<a class="button secondary" href="#order">${t.order}</a></div></div>
    </section>
    <noscript><p class="wrap">${t.noscript}</p></noscript>
  </main>
  <footer class="site-footer"><div class="wrap footer-inner">
    <div><a class="brand" href="${home}" aria-label="AFAL Site Market · ${t.home}">${brand}</a><p>${t.footerLabel}</p></div>
    <nav aria-label="${t.menu}">${preferredLink('catalog','catalog')} ${preferredLink('about','about')} ${preferredLink('contact','contact')} ${preferredLink('tracking','tracking')}</nav>
    <p>© ${new Date().getUTCFullYear()} AFAL Site Market</p>
  </div></footer>
</body>
</html>
`;
}

mkdirSync(resolve(out, 'en'), { recursive: true });
for (const lang of LANGS) {
  writeFileSync(resolve(out, lang === 'uk' ? 'index.html' : 'en/index.html'), render(lang));
}
writeFileSync(resolve(out, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${new URL('sitemap.xml', canonical)}\n`);
writeFileSync(resolve(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${esc(canonical.href)}</loc></url>\n  <url><loc>${esc(new URL('en/', canonical).href)}</loc></url>\n</urlset>\n`);
