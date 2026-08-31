import { ANALYTICS_SETS } from './catalog.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[char]));

const host = document.querySelector('[data-analytics-catalog]');
if (host) {
  host.innerHTML = ANALYTICS_SETS.map((set) => `
    <article class="card">
      <p class="eyebrow">${esc(set.eyebrow)}</p>
      <h2>${esc(set.title)} ${esc(set.accent)}</h2>
      <p>${esc(set.description)}</p>
      <div class="actions">
        <a class="button" href="${esc(set.landing)}">View full set</a>
        ${set.source ? `<a class="button secondary" href="${esc(set.source)}" target="_blank" rel="noopener noreferrer">${esc(set.sourceLabel || 'Source')}</a>` : ''}
      </div>
    </article>`).join('') + `
    <article class="card">
      <p class="eyebrow">Publishing standard</p>
      <h2>Open by design</h2>
      <p>Every production project exposes a usable launch surface, concise documentation, transparent formulas and explicit data provenance.</p>
      <p class="muted">Dashboards are one interface format inside Analytics—not the identity of the entire product family.</p>
    </article>`;
}
