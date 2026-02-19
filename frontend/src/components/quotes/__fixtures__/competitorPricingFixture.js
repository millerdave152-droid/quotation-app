/**
 * Mock competitor_pricing fixture based on real AGA product structure.
 * Used by the /dev/competitor-pricing preview route.
 */
const competitorPricingFixture = {
  lowest_price: 1299,
  best_buy: { price: 1299, updated: '2026-03-07 00:09:14' },
  home_depot: { price: 1349, updated: '2026-03-07 00:09:14' },
  lowes: { price: 0, updated: '2026-03-07 00:09:14' },
  aj_madison: { price: 0, updated: '2026-03-07 00:09:14' },
};

export default competitorPricingFixture;
