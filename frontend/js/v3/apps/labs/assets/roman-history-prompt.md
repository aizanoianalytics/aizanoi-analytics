Create a cinematic, professional, fully programmatic short video about Roman history.

## Goal

Render an animated historical video inside the browser using HTML, CSS and JavaScript, then export a real MP4 file named `roman_history.mp4`. This must be an actual video, not merely a web page.

Target: 45–60 seconds, approximately 55 seconds, 1920×1080, 30 FPS, 16:9, H.264, yuv420p, faststart. The result should feel cinematic, historically serious, premium, documentary-like, dark and dramatic, with clean modern motion graphics and Ancient Roman museum aesthetics. Avoid generic AI visuals, neon, cyberpunk, excessive glow, shiny gold, SaaS styling and cliché imperial imagery.

## Technical architecture

Use a deterministic frame-by-frame timeline. Prefer Canvas 2D, SVG, CSS transforms, requestAnimationFrame and a centralized `renderFrame(frameNumber)` or `renderAtTime(seconds)` function. Animation timing must not depend on computer performance. Use Node.js with Playwright or Puppeteer to render exact frames as PNG files, then use FFmpeg to encode the MP4. Do not rely on MediaRecorder for MP4 production.

Minimum project structure:

`roman-history-video/` with `index.html`, `style.css`, `main.js`, `render.js`, `package.json`, `assets/` and `output/`.

`npm run render` must launch a headless browser, render sequential PNG frames without retaining all frames in RAM, call FFmpeg, optionally merge audio when available, run FFprobe validation, and leave `output/roman_history.mp4`. Provide `npm run clean-frames`, and fail clearly when a dependency is unavailable.

## Subject: The Rise of Rome

Tell how Rome transformed from a small settlement into the dominant power of the Mediterranean. Use maps, dates, short titles and territorial animation rather than paragraphs. Keep the history accurate as reasonably possible.

### 0–5s — Opening

Begin nearly black with subtle stone texture, film grain and ancient material texture. Slowly reveal `753 BC`, then `ROME`, with `From a city on the Tiber...` below. Gradually reveal a restrained topographic map of early Rome and the Tiber; use subtle forward camera motion without cheap glow.

### 5–12s — A small city

Show a stylized ancient map of the Italian Peninsula. Rome begins as a small point. Label `ROME` and the Tiber. Use slow pan, gentle zoom and map drift. Display `A small settlement on the Tiber.` followed by `One among many.` Rome must still feel insignificant.

### 12–20s — The Republic

Show `509 BC`, then `THE REPUBLIC`. Gradually animate Roman territorial expansion across Italy in several distinct stages. Subtitle: `Rome expands across Italy.` The letters `SPQR` may appear briefly and elegantly. Avoid overusing eagles, emblems and imperial clichés.

### 20–30s — The Punic Wars

Zoom out to the Mediterranean. Show `264–146 BC` and `ROME vs CARTHAGE` with sophisticated, distinct territorial tones. Animate Hannibal’s crossing of the Alps with a thin route labelled `HANNIBAL`. Transition toward Rome’s victory with `Rome survives.` and then `Rome dominates the western Mediterranean.`

### 30–38s — Caesar

Darken dramatically. Show `44 BC`, then `JULIUS CAESAR`. Use a marble bust silhouette, marble textures, restrained laurel forms or Senate-inspired geometry rather than a literal portrait. Briefly show `DICTATOR PERPETUO`, then fade or cut to darkness. Display `IDES OF MARCH` followed by `44 BC`. No blood or cheap horror effects; keep it elegant and ominous.

### 38–47s — Augustus and the Empire

Show `27 BC`, then `AUGUSTUS`, with the subtitle `The Republic becomes an Empire.` Smoothly animate Roman territory expanding across the Mediterranean and frame the Mediterranean as the central region.

### 47–54s — Greatest extent

Show `117 AD`, then `ROME AT ITS GREATEST EXTENT`. Depict the Roman Empire around Trajan’s reign at approximately its maximum territory. Subtly label some regions: `BRITANNIA`, `HISPANIA`, `GAUL`, `ITALIA`, `GRAECIA`, `AEGYPTUS`, `SYRIA`, `AFRICA`. Keep the map dominant and labels hierarchical.

### 54–60s — Final

Let the map disappear into darkness. Show `From one city...`, then `...to an empire.`, then `ROME` and `753 BC — 476 AD`. Hold the final frame for about 1.5 seconds.

## Visual language

Use obsidian black, aged parchment, ivory, muted Roman red, weathered bronze and stone grey. The visual target is ancient, academic and cinematic: premium historical documentary, animated historical map and museum exhibition motion design. Use legally usable serif typography evocative of Roman inscriptions with fallbacks; major titles should be large, clean, restrained and slightly tracked. Use fades, masked reveals and subtle vertical reveals, never PowerPoint transitions.

Create a custom SVG-based map rather than using Google Maps or a generic world map. It should cover Italy, Iberia, Gaul, Britain, Greece, Anatolia, the Levant, Egypt and North Africa and support province reveals, territorial expansion, military routes, labels, camera pans and zooms. Coastlines should be designed for this film.

Maintain continuous but restrained motion: camera drift, map movement, film grain, parallax, light movement and slight scale changes. Use professional easing such as easeInOutCubic, easeOutQuart and smoothstep. Add procedural grain at roughly 2–5% opacity and a very subtle vignette; do not make it look damaged.

## Audio

If possible, add legally usable subtle ambience: low-frequency drone, distant battlefield atmosphere, wind, restrained transition boom and low rumble. Audio must never overpower the visuals, and missing audio must never break rendering. Optional voice-over:

“Rome did not begin as an empire. It began as a small settlement beside the River Tiber. Over centuries, Rome conquered Italy, defeated Carthage, and became the dominant power of the Mediterranean. But conquest transformed the Republic itself. Civil wars followed. Julius Caesar rose. The Republic collapsed. And under Augustus, a new Roman Empire emerged. By the second century, Rome ruled lands from Britain to Egypt, and from Spain to Mesopotamia. One city had become the center of an empire.”

If there is no voice-over, do not display the entire narration as subtitles; keep screen text concise.

## Quality control

After rendering, check that no text leaves the frame, fonts load, map labels do not overlap, there are no frame jumps or unintended black frames, no browser UI is visible, the timeline is exactly 30 FPS, and the MP4 plays in Chrome, VLC and standard players. Use FFprobe to verify actual H.264 codec, yuv420p pixel format, duration around 45–60 seconds and 1920×1080 resolution. Do not delete frame files until MP4 generation and validation succeed.
