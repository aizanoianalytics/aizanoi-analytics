const SERIES = [
  { title:'AI & Technology', type:'SERIES', body:'Models, agents, local AI, software, hardware and the systems changing how we work.' },
  { title:'Markets & Economy', type:'SERIES', body:'Market structure, companies, macro stories, dashboards and data-led economic discussion.' },
  { title:'Cinema & Sport', type:'SERIES', body:'Film, football and sports commentary without pretending every subject needs to become a data product.' },
  { title:'Conversations & Experiments', type:'SERIES', body:'Open-ended discussions, unusual builds, behind-the-scenes work and ideas that do not fit a single category.' },
];

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[char]));

/** Private Aizanoi TV implementation. */
export async function mountVideos({ container, capabilities }) {
  const { apps } = capabilities;
  container.innerHTML = `<div class="az-app-shell"><div class="az-app-toolbar"><strong>Aizanoi TV</strong><span class="az-system-spacer"></span><span class="az-app-caption">English-language video channel</span></div><div class="az-media"><div class="az-simple-grid">${SERIES.map((item) => `<article class="az-simple-card"><p class="az-kicker">${esc(item.type)}</p><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p></article>`).join('')}</div><div class="az-simple-card az-project-session"><p class="az-kicker">COMPANION LAYER</p><h3>Videos should connect to the rest of Aizanoi</h3><p>Each published video can grow into a companion page with transcript, research sources, related News or Journal items, dashboards and public source code when relevant.</p><div class="az-session-actions"><button class="az-button" type="button" data-media-action="news">Open News</button><button class="az-button" type="button" data-media-action="analytics">Open Analytics</button><button class="az-button" type="button" data-media-action="forge">Open Forge</button></div></div></div></div>`;

  function handleClick(event) {
    const action = event.target.closest('[data-media-action]')?.dataset.mediaAction;
    if (action) apps.open(action);
  }

  container.addEventListener('click', handleClick);
  return {
    cleanup() {
      container.removeEventListener('click', handleClick);
    },
  };
}
