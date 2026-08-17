import { ROME_MANIFEST, ROME_CAPABILITIES } from '../../../frontend/ancient-cities/rome-410-476/data/manifest.js';
import { TERRAIN_EVIDENCE } from '../../../frontend/ancient-cities/rome-410-476/data/terrain.js';
import { URBAN_FABRIC_METHOD } from '../../../frontend/ancient-cities/rome-410-476/data/urban-fabric.js';
import { EVIDENCE_LEVELS, installEvidenceStyles } from '../../../frontend/ancient-world/engine/evidence.js';

installEvidenceStyles();

const button = document.querySelector('#evidence');
const modal = document.querySelector('#evidenceModal');
const closeButton = document.querySelector('#evidenceClose');
const body = document.querySelector('#evidenceBody');

function paragraph(text, className = '') {
  const node = document.createElement('p');
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function evidenceCard(level, description) {
  const card = document.createElement('div');
  const badge = document.createElement('span');
  badge.className = `awEvidence awEvidence-${level.id}`;
  badge.dataset.evidence = level.id;
  badge.textContent = level.label;
  card.append(badge, paragraph(description));
  return card;
}

function renderMethodology() {
  if (!body) return;
  body.replaceChildren();
  body.append(paragraph('This renderer experiment preserves the production rule that visual detail does not equal historical certainty. Three.js may change how Rome looks; it must not silently change what the reconstruction claims to know.'));

  const grid = document.createElement('div');
  grid.className = 'awEvidenceGrid';
  grid.append(
    evidenceCard(EVIDENCE_LEVELS.archaeological, 'Physical archaeological evidence supports the represented feature.'),
    evidenceCard(EVIDENCE_LEVELS.documented, 'Historical or topographical evidence supports the place or route while exact restitution may remain incomplete.'),
    evidenceCard(EVIDENCE_LEVELS.plausible, 'An informed reconstruction fills unresolved fifth-century form without being presented as excavated fact.'),
    evidenceCard(EVIDENCE_LEVELS.atmospheric, 'Illustrative ambience improves legibility or mood without claiming an exact historical object or placement.'),
  );
  body.append(grid);

  const heading = document.createElement('h3');
  heading.textContent = 'Rome contract';
  body.append(heading);
  body.append(paragraph(`${ROME_MANIFEST.monuments.length} named/source-led monument records · ${ROME_MANIFEST.roads.length} road records · ${ROME_MANIFEST.districts.length} regiones · ${ROME_CAPABILITIES.teleportTargets} travel targets.`));
  body.append(paragraph(`${TERRAIN_EVIDENCE.label}: ${TERRAIN_EVIDENCE.note}`, 'awEvidenceNote'));
  body.append(paragraph(`Urban fabric: ${URBAN_FABRIC_METHOD.note}`, 'awEvidenceNote'));
  body.append(paragraph('Generic blocks and proxy monuments can later be replaced by richer builders or owned/licensed GLB assets. Their evidence class remains a city-data concern, not a renderer decision.'));
}

function openMethodology() {
  if (!modal) return;
  renderMethodology();
  modal.classList.remove('hidden');
  closeButton?.focus({ preventScroll: true });
}

function closeMethodology() {
  modal?.classList.add('hidden');
  button?.focus({ preventScroll: true });
}

button?.addEventListener('click', openMethodology);
closeButton?.addEventListener('click', closeMethodology);
modal?.addEventListener('click', (event) => {
  if (event.target === modal) closeMethodology();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && modal && !modal.classList.contains('hidden')) closeMethodology();
});

const style = document.createElement('style');
style.textContent = '.awEvidenceGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:14px 0}.awEvidenceGrid>div{border:1px solid rgba(235,197,125,.18);border-radius:9px;padding:11px;background:rgba(255,255,255,.025)}.awEvidenceGrid p{margin:8px 0 0;color:#cdbf9f;font-size:11px;line-height:1.5}@media(max-width:620px){.awEvidenceGrid{grid-template-columns:1fr}}';
document.head.appendChild(style);

window.__ROME_THREE_EVIDENCE__ = Object.freeze({ open: openMethodology, close: closeMethodology });
