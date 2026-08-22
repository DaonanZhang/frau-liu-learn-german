/** Determine whether the current entitlement snapshot grants module access at a given time. */
export function hasModuleAccess(user, module, at = new Date()) {
  if (module?.isOpenAccess) {
    return true;
  }

  if (!user || !module?.moduleKey) {
    return false;
  }

  if (user.is_staff || user.is_superuser) {
    return true;
  }

  const entitlements = Array.isArray(user.entitlements) ? user.entitlements : [];
  const allowedSeasonNumbers = Array.isArray(module?.seasonNumbers)
    ? module.seasonNumbers.map((item) => Number(item)).filter(Number.isFinite)
    : [Number(module?.seasonNumber)].filter(Number.isFinite);

  return entitlements.some((item) => {
    const startsAt = item?.starts_at ? new Date(item.starts_at) : null;
    const expiresAt = item?.expires_at ? new Date(item.expires_at) : null;
    if (item?.status !== "active") {
      return false;
    }
    if (startsAt && !Number.isNaN(startsAt.getTime()) && startsAt > at) {
      return false;
    }
    if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt <= at) {
      return false;
    }

    const scope = String(item.scope || "");
    if (scope === "platform") {
      return true;
    }

    const moduleKey = item?.module?.key;
    if (moduleKey !== module.moduleKey) {
      return false;
    }

    if (!item?.season) {
      return true;
    }

    return allowedSeasonNumbers.includes(Number(item.season?.season_number));
  });
}
