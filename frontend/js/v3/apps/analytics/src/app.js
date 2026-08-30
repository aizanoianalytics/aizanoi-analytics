function shell(title, caption, body) {
  return `<div class="az-app-shell"><div class="az-app-toolbar"><strong>${title}</strong><span class="az-system-spacer"></span><span class="az-app-caption">${caption}</span></div>${body}</div>`;
}

export function createAnalyticsApp() {
  return {
    async mount(container) {
      container.innerHTML = shell('Analytics', 'HR Analytics Full Set', `
  <section class="az-hr-spotlight">
    <div class="az-hr-spotlight-copy">
      <p class="az-kicker">LIVE ANALYTICS COLLECTION · SYNTHETIC DATA</p>
      <h2>HR Analytics<br><span>Full Set</span></h2>
      <p class="az-hr-lede">One complete HR analytics product built by Aizanoi Analytics: ten connected dashboard surfaces, rebuilt from 27 synthetic source workbooks with the original controls, drill-downs and exports intact.</p>
      <div class="az-hr-actions">
        <a class="az-button az-hr-primary" href="/analytics/dashboards/hr-analytics-full-set/" target="_blank" rel="noopener noreferrer">Explore all dashboards</a>
        <a class="az-hr-text-link" href="/analytics/dashboards/hr-analytics-full-set/downloads/hr-analytics-full-set-synthetic-output.xlsx">Download synthetic output</a>
      </div>
    </div>
    <div class="az-hr-status" aria-label="HR Analytics Full Set status">
      <article><strong>10</strong><span>live dashboard surfaces</span></article>
      <article><strong>27</strong><span>synthetic source workbooks</span></article>
      <article><strong>0</strong><span>real employee records</span></article>
    </div>
  </section>`);
      return () => {};
    },
  };
}
