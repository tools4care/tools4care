export function restrictLocationsForUser(locations, assignments, role) {
  const allLocations = Array.isArray(locations) ? locations : [];
  const locationAssignments = Array.isArray(assignments) ? assignments : [];

  if (role === "admin" || locationAssignments.length === 0) return allLocations;

  const allowedIds = new Set(
    locationAssignments
      .filter((assignment) => assignment?.activo !== false)
      .map((assignment) => assignment?.van_id)
      .filter(Boolean)
  );

  return allLocations.filter((location) => allowedIds.has(location?.id));
}

export function hasLocationRestriction(assignments, role) {
  return role !== "admin" && Array.isArray(assignments) && assignments.length > 0;
}
