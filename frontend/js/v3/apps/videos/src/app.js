/** Private Aizanoi TV implementation. The player stays lazy and self-contained. */
export async function mountVideos({ container, capabilities }) {
  const { apps } = capabilities;
  container.innerHTML = `<div class="az-app-shell az-tv-app"><div class="az-app-toolbar"><strong>Aizanoi TV</strong><span class="az-system-spacer"></span><span class="az-app-caption">Aizo · original videos and experiments</span></div>
    <div class="az-media az-tv-media">
      <section class="az-tv-stage" aria-label="Aizo video channel">
        <div class="az-tv-stage-head"><div><span class="az-tv-overline">AIZO / THE CHANNEL</span><h2>Watch the latest</h2><p>New uploads appear here automatically.</p></div><span class="az-tv-stage-mark" aria-hidden="true">A</span></div>
        <div class="az-tv-stage-grid">
          <div class="az-tv-player"><div class="az-tv-frame"><iframe src="https://www.youtube-nocookie.com/embed/videoseries?list=UUTurwASTgEY2NrivXpkKPmA" title="Aizo — latest uploads on YouTube" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div><p>If the player is unavailable, <a href="https://www.youtube.com/@heyaizo/videos" target="_blank" rel="noopener noreferrer">browse all videos on YouTube</a>.</p></div>
          <div class="az-tv-stage-side"><span>GO DEEPER</span><h3>From the channel to the work.</h3><p>See every upload, then explore the research and experiments behind Aizanoi Analytics.</p><a href="https://www.youtube.com/@heyaizo?sub_confirmation=1" target="_blank" rel="noopener noreferrer">Subscribe to Aizo <span aria-hidden="true">↗</span></a><a href="/arcade/snake-royale/">Play AI Snake Royale <span aria-hidden="true">↗</span></a></div>
        </div>
      </section>
      <nav class="az-tv-related" aria-label="Explore beyond TV"><span>Explore Aizanoi Analytics</span><button class="az-button" type="button" data-media-action="news">Open News</button><button class="az-button" type="button" data-media-action="analytics">Open Analytics</button><button class="az-button" type="button" data-media-action="forge">Open Forge</button></nav>
    </div></div>`;

  function handleClick(event) {
    const action = event.target.closest('[data-media-action]')?.dataset.mediaAction;
    if (action) apps.open(action);
  }

  container.addEventListener('click', handleClick);
  return {
    cleanup() {
      container.removeEventListener('click', handleClick);
      // Remove the iframe on close so playback cannot continue in a hidden tab.
      container.querySelector('.az-tv-frame iframe')?.remove();
    },
  };
}
