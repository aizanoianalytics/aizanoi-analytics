const ROUTE_MAP = { 'hr-analytics':'chatbot', 'ancient-world':'ancient', 'games':'games', 'projects':'projects', 'videos':'videos', 'about':'about', 'docs':'docs', 'changelog':'changelog', 'privacy':'privacy', 'terms':'terms' };
const APP_TO_ROUTE = { chatbot:'hr-analytics', ancient:'ancient-world', games:'games', projects:'projects', videos:'videos', about:'about', docs:'docs', changelog:'changelog', privacy:'privacy', terms:'terms' };
let __suppressRoute = false;
function getRouteFromApp(a) { if (APP_TO_ROUTE[a]) return '/' + APP_TO_ROUTE[a] + '/'; return '/'; }
function getAppFromRoute(p) { var slug = p.replace(/^\/+|\/+$/g, ''); if (!slug) return null; return ROUTE_MAP[slug] || null; }
function updateRoute(appId) {
  if (__suppressRoute) return;
  var target = window.location.origin + getRouteFromApp(appId);
  if (window.location.href !== target) history.pushState({ appId: appId }, '', target);
}
function handleRouteChange() {
  var appId = getAppFromRoute(window.location.pathname);
  if (appId && typeof openApp === 'function') {
    __suppressRoute = true;
    try { openApp(appId); } finally { __suppressRoute = false; }
    if (typeof updateMetaForRoute === 'function') updateMetaForRoute(appId);
    return;
  }
  if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
    Object.keys(APP_TO_ROUTE).forEach(function(id) {
      if (openWindows.has(id)) closeApp(id);
    });
    if (typeof updateMetaForRoute === 'function') updateMetaForRoute(null);
  }
}
function initRouter() {
  window.addEventListener('popstate', handleRouteChange);
  if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') handleRouteChange();
}
window.getRouteFromApp = getRouteFromApp;
window.getAppFromRoute = getAppFromRoute;
window.updateRoute = updateRoute;
window.handleRouteChange = handleRouteChange;
window.initRouter = initRouter;
window.ROUTE_MAP = ROUTE_MAP;
window.APP_TO_ROUTE = APP_TO_ROUTE;
window.__suppressRoute = false;

// openApp URL-aware yap
var _origOpenApp = window.openApp || openApp;
window.openApp = function(appId) {
  try { if (typeof updateRoute === 'function') updateRoute(appId); } catch(e) {}
  try { if (typeof updateMetaForRoute === 'function') updateMetaForRoute(appId); } catch(e) {}
  return _origOpenApp(appId);
};

// initRouter baslat
setTimeout(function() { if (typeof initRouter === 'function') initRouter(); }, 600);
