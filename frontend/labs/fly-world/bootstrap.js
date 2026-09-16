const glbUrl = new URL('./assets/fly-house.glb', import.meta.url);

async function boot() {
  try {
    const response = await fetch(glbUrl, { method: 'HEAD', cache: 'no-store' });
    if (response.ok) {
      await import('./glb-runtime-v3.js');
      return;
    }
  } catch (error) {
    console.info('[fly-world] Blender v0.3 GLB not published yet; using the reference-detailed browser fallback.', error);
  }

  await import('./main-v3.js');
}

boot().catch((error) => {
  console.error(error);
  const fatal = document.querySelector('#fatal');
  if (fatal) {
    fatal.hidden = false;
    fatal.textContent = `Fly World failed to boot: ${error?.stack || error}`;
  }
});
