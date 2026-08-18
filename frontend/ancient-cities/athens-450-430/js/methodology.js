// Athens 450–430 BCE — reconstruction methodology surfaced outside WebGL.
// This module renders into a non-WebGL fallback and a static page so the
// reconstruction rules stay readable for non-3D visitors and search engines.
import { ATHENS_MANIFEST } from '../data/manifest.js';

export const ATHENS_METHODOLOGY = Object.freeze({
  title: 'How Athens 450–430 BCE is reconstructed',
  sections: [
    {
      heading: 'Period framing',
      body: '450–430 BCE is the mature Periclean city between the Thirty Years’ Peace (445 BCE) and the outbreak of the Plague of Athens (430 BCE). The Parthenon and Propylaea are finished; the Erechtheion is still under construction.',
    },
    {
      heading: 'Acropolis',
      body: 'Parthenon, Propylaea, Temple of Athena Nike, Chalkotheke and the older sanctuary footprints are placed from Wikipedia and ASCSA records. The Erechtheion is shown with its 421 BCE start date and under-construction state.',
    },
    {
      heading: 'Agora and south slope',
      body: 'Hephaisteion, Stoa Poikile, Stoa of Zeus Eleutherios, Royal Stoa, Bouleuterion, Tholos, Theatre of Dionysus, Odeion of Pericles and Asclepieion are placed with their evidence levels declared per monument.',
    },
    {
      heading: 'Outside the walls',
      body: 'Kerameikos cemetery, Sacred and Dipylon Gates, Pompeion, Pnyx, Areopagus and the small archaic Olympieion (Deigma) are positioned from archaeological and topographic references. The Academy olive grove sits on the north-west plain.',
    },
    {
      heading: 'Piraeus and the Long Walls',
      body: 'Piraeus is shown as a separate connected harbour city via the parallel Long Walls corridor. The Hippodamian grid, the Agora of Hippalos and the Zea / Munichia shipsheds are placed at the harbour basin.',
    },
    {
      heading: 'What is deliberately schematic',
      body: 'Domestic massing is procedural and explicit `plausible` evidence; it does not claim to reconstruct any individual excavated house. Local elevation is illustrative and does not pretend to be a surveyed fifth-century surface.',
    },
  ],
});

const METHODOLOGY_KEY = 'aizanoi-athens-methodology';

export function mountMethodologyPanel(target = document) {
  if (!target || !ATHENS_MANIFEST) return () => {};
  const container = target.querySelector(`#${METHODOLOGY_KEY}`)
    || Object.assign(document.createElement('section'), { id: METHODOLOGY_KEY, className: 'methodology' });
  container.innerHTML = `
    <h2>${ATHENS_METHODOLOGY.title}</h2>
    ${ATHENS_METHODOLOGY.sections.map((section) => `
      <article>
        <h3>${section.heading}</h3>
        <p>${section.body}</p>
      </article>
    `).join('')}
    <p class="source">Manifest: <code>${ATHENS_MANIFEST.id}</code> · ${ATHENS_MANIFEST.title} · ${ATHENS_MANIFEST.period}</p>
  `;
  if (!container.isConnected) target.appendChild(container);
  return () => container.remove();
}

export default ATHENS_METHODOLOGY;
