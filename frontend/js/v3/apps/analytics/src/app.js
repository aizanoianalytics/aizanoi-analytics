import { ANALYTICS_SETS, analyticsSetById } from '../../../../../analytics/catalog.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[char]));

function renderCatalog(container) {
  container.innerHTML = `
    <div class="az-app-shell az-analytics-app">
      <section class="az-analytics-index" aria-labelledby="az-analytics-sets-title">
        <header class="az-analytics-intro">
          <p class="az-kicker">AIZANOI ANALYTICS</p>
          <h2 id="az-analytics-sets-title">Analytics Sets</h2>
          <p>Complete analytical products live here as independent sets. The same canonical catalog drives this app and the public Analytics landing page.</p>
        </header>
        <div class="az-analytics-set-grid">
          ${ANALYTICS_SETS.map((set) => `
            <article class="az-analytics-set-card">
              <div>
                <p class="az-kicker">${esc(set.eyebrow)}</p>
                <h3>${esc(set.title)} <span>${esc(set.accent)}</span></h3>
                <p>${esc(set.description)}</p>
              </div>
              <div class="az-analytics-set-metrics" aria-label="${esc(set.title)} ${esc(set.accent)} summary">
                ${set.metrics.slice(0,3).map((metric) => `<span><strong>${esc(metric.value)}</strong>${esc(metric.label)}</span>`).join('')}
              </div>
              <button class="az-button az-button-primary" type="button" data-analytics-set="${esc(set.id)}">Open set</button>
            </article>`).join('')}
          <article class="az-analytics-set-card az-analytics-set-card--future" aria-label="Future Analytics Sets">
            <div><p class="az-kicker">NEXT COLLECTIONS</p><h3>More sets can land here.</h3><p>Market, model, finance, product or other analytical collections can use the same catalog contract when they are ready.</p></div>
            <span class="az-analytics-coming">Catalog ready</span>
          </article>
        </div>
      </section>
    </div>`;
}

function dashboardCards(set) {
  return set.dashboards.map((dashboard, index) => `
    <article class="az-analytics-dashboard-card">
      <div class="az-analytics-dashboard-number">${String(index + 1).padStart(2, '0')}</div>
      <h3>${esc(dashboard.title)}</h3>
      <p>${esc(dashboard.summary)}</p>
      <a href="${esc(dashboard.href)}" target="_blank" rel="noopener noreferrer">Launch dashboard <span aria-hidden="true">↗</span></a>
    </article>`).join('');
}

function renderSet(container, set) {
  container.innerHTML = `
    <div class="az-app-shell az-analytics-app">
      <div class="az-analytics-detail-bar">
        <button class="az-button" type="button" data-analytics-back>← Analytics Sets</button>
        <span>Collection · ${esc(set.title)} ${esc(set.accent)}</span>
      </div>
      <div class="az-analytics-detail">
        <section class="az-hr-spotlight">
          <div class="az-hr-spotlight-copy">
            <p class="az-kicker">${esc(set.eyebrow)}</p>
            <h2>${esc(set.title)}<br><span>${esc(set.accent)}</span></h2>
            <p class="az-hr-lede">${esc(set.summary)}</p>
            <div class="az-hr-actions">
              <button class="az-button az-hr-primary" type="button" data-analytics-dashboard-list>Explore all dashboards</button>
              ${set.download ? `<a class="az-hr-text-link" href="${esc(set.download)}">Download synthetic output</a>` : ''}
            </div>
          </div>
          <div class="az-hr-status" aria-label="${esc(set.title)} ${esc(set.accent)} status">
            ${set.metrics.map((metric) => `<article><strong>${esc(metric.value)}</strong><span>${esc(metric.label)}</span></article>`).join('')}
          </div>
        </section>
        <section class="az-analytics-dashboard-section" data-analytics-dashboard-inventory aria-labelledby="az-dashboard-inventory-title">
          <div class="az-analytics-section-head">
            <p class="az-kicker">DASHBOARD INVENTORY</p>
            <h2 id="az-dashboard-inventory-title">The complete product map</h2>
            <p>Each dashboard launches as its finished analytical product, without wrapping another AizanoiOS window around it.</p>
          </div>
          <div class="az-analytics-dashboard-grid">${dashboardCards(set)}</div>
        </section>
      </div>
    </div>`;
}

export function createAnalyticsApp() {
  return {
    async mount(container) {
      renderCatalog(container);

      function handleClick(event) {
        const setId = event.target.closest('[data-analytics-set]')?.dataset.analyticsSet;
        if (setId) {
          const set = analyticsSetById(setId);
          if (set) renderSet(container, set);
          return;
        }
        if (event.target.closest('[data-analytics-back]')) {
          renderCatalog(container);
          return;
        }
        if (event.target.closest('[data-analytics-dashboard-list]')) {
          const inventory = container.querySelector('[data-analytics-dashboard-inventory]');
          inventory?.scrollIntoView({ behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'start' });
        }
      }

      container.addEventListener('click', handleClick);
      return () => container.removeEventListener('click', handleClick);
    },
  };
}
