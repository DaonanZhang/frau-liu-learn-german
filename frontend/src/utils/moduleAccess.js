export function hasModuleAccess(user, module) {
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
    if (!item?.is_valid_now) {
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
