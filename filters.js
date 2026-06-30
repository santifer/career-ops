function filterListings(listings) {
  const seniorityTier = config.title_filter.seniority.tiers;
  listings = listings.filter(listing => {
    if (config.title_filter.seniority && !seniorityTier.includes(listing.seniority)) {
      return false;
    }
    // ... existing code
  });
  return listings;
}