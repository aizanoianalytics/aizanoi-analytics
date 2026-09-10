import { createMarketsDashboard } from './dashboard.js';

const root = document.querySelector('[data-markets-root]');
if (root) createMarketsDashboard(root);
