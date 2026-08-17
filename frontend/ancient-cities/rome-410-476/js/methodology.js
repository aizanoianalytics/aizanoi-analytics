import { ROME_MANIFEST, ROME_CAPABILITIES } from '../data/manifest.js';
import { EVIDENCE_LEVELS, evidenceBadgeHTML, installEvidenceStyles } from '../../../ancient-world/engine/evidence.js';
import { TERRAIN_EVIDENCE } from '../data/terrain.js';
import { URBAN_FABRIC_METHOD } from '../data/urban-fabric.js';

installEvidenceStyles();

const button = document.querySelector('#evidence');
const modal = document.querySelector('#modal');
const title = document.querySelector('#modalTitle');
const body = document.querySelector('#modalBody');

function openMethodology() {
  if (!modal || !title || !body) return;
  title.textContent = 'Reconstruction method · what is known?';
  body.innerHTML = `
    <p>This experience separates <b>visual detail</b> from <b>historical confidence</b>. A convincing-looking street or house is not automatically presented as archaeological fact.</p>
    <div class="awEvidenceGrid">
      <div>${evidenceBadgeHTML(EVIDENCE_LEVELS.archaeological)}<p>Used only when physical archaeological evidence supports the represented feature.</p></div>
      <div>${evidenceBadgeHTML(EVIDENCE_LEVELS.documented)}<p>Historical or topographical evidence supports the place or route, while exact restitution may remain incomplete.</p></div>
      <div>${evidenceBadgeHTML(EVIDENCE_LEVELS.plausible)}<p>An informed reconstruction used where exact fifth-century form is unresolved.</p></div>
      <div>${evidenceBadgeHTML(EVIDENCE_LEVELS.atmospheric)}<p>Illustrative ambience that helps the scene feel inhabited without claiming an exact excavated object or placement.</p></div>
    </div>
    <h3>Rome model</h3>
    <p><b>${ROME_MANIFEST.monuments.length}</b> named/source-led monument records · <b>${ROME_MANIFEST.roads.length}</b> major road records · <b>${ROME_MANIFEST.districts.length}</b> regiones · <b>${ROME_CAPABILITIES.teleportTargets}</b> travel targets.</p>
    <p class="awEvidenceNote"><b>${TERRAIN_EVIDENCE.label}:</b> ${TERRAIN_EVIDENCE.note}</p>
    <p class="awEvidenceNote"><b>Urban fabric:</b> ${URBAN_FABRIC_METHOD.note}</p>
    <p>The renderer, traversal system and future asset library are replaceable. The evidence labels and city manifest are intended to remain stable even if Rome later moves to Three.js or another renderer.</p>
    <p><a href="./research/">Open the local research notes →</a></p>
  `;
  modal.classList.remove('hidden');
}

if (button) button.addEventListener('click', openMethodology);

const style = document.createElement('style');
style.textContent = `.awEvidenceGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:14px 0}.awEvidenceGrid>div{border:1px solid rgba(235,197,125,.18);border-radius:9px;padding:11px;background:rgba(255,255,255,.025)}.awEvidenceGrid p{margin:8px 0 0;color:#cdbf9f;font-size:11px;line-height:1.5}@media(max-width:620px){.awEvidenceGrid{grid-template-columns:1fr}}`;
document.head.appendChild(style);
