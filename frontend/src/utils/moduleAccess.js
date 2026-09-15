function entitlementMatchesModule(item, module) {
  const allowedSeasonNumbers = Array.isArray(module?.seasonNumbers)
    ? module.seasonNumbers.map((item) => Number(item)).filter(Number.isFinite)
    : [Number(module?.seasonNumber)].filter(Number.isFinite);

  const scope = String(item?.scope || "");
  if (scope === "platform") {
    return true;
  }

  if (item?.module?.key !== module?.moduleKey) {
    return false;
  }

  return !item?.season || allowedSeasonNumbers.includes(Number(item.season?.season_number));
}

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

    return entitlementMatchesModule(item, module);
  });
}

/** Return the most recent elapsed entitlement expiry for a module. */
export function getLatestExpiredModuleExpiry(user, module, at = new Date()) {
  if (!user || !module?.moduleKey) {
    return null;
  }

  const expiries = (Array.isArray(user.entitlements) ? user.entitlements : [])
    .filter((item) => {
      if (!["active", "expired"].includes(item?.status) || !entitlementMatchesModule(item, module)) {
        return false;
      }
      const startsAt = item?.starts_at ? new Date(item.starts_at) : null;
      const expiresAt = item?.expires_at ? new Date(item.expires_at) : null;
      return (
        expiresAt
        && !Number.isNaN(expiresAt.getTime())
        && expiresAt <= at
        && (!startsAt || Number.isNaN(startsAt.getTime()) || startsAt <= at)
      );
    })
    .map((item) => new Date(item.expires_at));

  return expiries.length
    ? new Date(Math.max(...expiries.map((date) => date.getTime())))
    : null;
}

export function formatExpiredDuration(expiredAt, at = new Date()) {
  if (!(expiredAt instanceof Date) || Number.isNaN(expiredAt.getTime()) || expiredAt > at) {
    return "";
  }

  const totalMinutes = Math.floor((at.getTime() - expiredAt.getTime()) / 60000);
  if (totalMinutes < 1) {
    return "已过期不到 1 分钟";
  }
  if (totalMinutes < 60) {
    return `已过期 ${totalMinutes} 分钟`;
  }

  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    return `已过期 ${totalHours} 小时`;
  }

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return `已过期 ${days} 天${hours ? ` ${hours} 小时` : ""}`;
}
