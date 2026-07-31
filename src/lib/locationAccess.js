export function restrictLocationsForUser(locations, assignments, role, platformAdmin = false) {
  const allLocations = Array.isArray(locations) ? locations : [];
  const locationAssignments = Array.isArray(assignments) ? assignments : [];

  if (platformAdmin || locationAssignments.length === 0) return allLocations;

  const allowedIds = new Set(
    locationAssignments
      .filter((assignment) => assignment?.activo !== false)
      .map((assignment) => assignment?.van_id)
      .filter(Boolean)
  );

  return allLocations.filter((location) => allowedIds.has(location?.id));
}

export function hasLocationRestriction(assignments, role, platformAdmin = false) {
  return !platformAdmin && Array.isArray(assignments) && assignments.length > 0;
}
