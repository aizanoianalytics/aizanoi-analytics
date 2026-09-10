import { createMarketsDashboard } from '../../../../../analytics/markets/dashboard.js';

export function createMarketsApp() {
  return {
    async mount(container) {
      return createMarketsDashboard(container, { compact:true, updateUrl:false });
    },
  };
}
