import { ANALYTICS_SETS } from './catalog.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[char]));

// The page ships a complete static catalog (every set incl. Tableau, plus the
// publishing-standard card). This module only re-renders it from the canonical
// ANALYTICS_SETS; any failure leaves the static markup in place.
const host = document.querySelector('[data-analytics-catalog]');
if (host) {
  try {
    const html = ANALYTICS_SETS.map((set) => `
    <article class="card">
      <p class="eyebrow">${esc(set.eyebrow)}</p>
      <h2>${esc(set.title)} ${esc(set.accent)}</h2>
      <p>${esc(set.description)}</p>
      ${set.interfaceLanguage ? `<p class="muted"><strong>Interface language:</strong> ${esc(set.interfaceLanguage)}</p>` : ''}
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
    if (ANALYTICS_SETS.length) host.innerHTML = html;
  } catch (error) {
    console.warn('Analytics catalog enhancement skipped; static catalog kept.', error);
  }
}
