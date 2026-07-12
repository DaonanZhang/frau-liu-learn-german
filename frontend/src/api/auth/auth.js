import Swal from "sweetalert2";
import { apiFetch } from "../client";

function pickErrorMessage(err, fallback) {
  const data = err?.data;
  if (typeof data?.detail === "string" && data.detail.trim()) {
    return data.detail;
  }
  if (data && typeof data === "object") {
    for (const value of Object.values(data)) {
      if (Array.isArray(value) && value.length > 0) {
        return String(value[0]);
      }
      if (typeof value === "string" && value.trim()) {
        return value;
      }
    }
  }
  return fallback;
}

const TEMPORARY_LOGIN_MAINTENANCE_MESSAGE =
  "我们正在维修服务器，目前无法登录，预计需要 1–2 天时间。";

/**
 * Login with telephone + password.
 * On success:
 * - client.js will handle JWT usage
 * - tokens are stored here
 */
export async function login(telephone, password, countryCode) {
  try {
    const data = await apiFetch("/accounts/auth/login/", {
      method: "POST",
      body: {
        telephone,
        country_code: countryCode,
        password,
      },
    });

    // Expect SimpleJWT response shape
    if (!data?.access || !data?.refresh) {
      throw new Error("Invalid login response");
    }

    localStorage.setItem("accessToken", data.access);
    localStorage.setItem("refreshToken", data.refresh);

    await Swal.fire({
      icon: "success",
      title: "登录成功",
      text: "即将跳转",
      timer: 1200,
      showConfirmButton: false,
    });

    return { ok: true };
  } catch (err) {
    console.error("[login] failed:", err);

    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");

    await Swal.fire({
      icon: "error",
      title: "服务器维修中",
      text: TEMPORARY_LOGIN_MAINTENANCE_MESSAGE,
    });

    return { ok: false };
  }
}

/**
 * Logout (client-side only).
 * Server-side blacklist can be added later if needed.
 */
export function logout() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
}

/* =========================================================
 * Registration / activation
 * ========================================================= */

/**
 * Step 1: verify activation code.
 * Returns payload preview (entitlements info).
 */
export async function verifyActivationCode(code) {
  return apiFetch("/accounts/auth/register/verify-code/", {
    method: "POST",
    body: { code },
  });
}

/**
 * Register new user directly.
 */
export async function registerUser({
  telephone,
  countryCode,
  email,
  password,
}) {
  try {
    const data = await apiFetch("/accounts/auth/register/", {
      method: "POST",
      body: {
        telephone,
        country_code: countryCode,
        email,
        password,
      },
    });

    await Swal.fire({
      icon: "success",
      title: "注册成功",
      text: "请使用手机号和密码登录",
      timer: 1500,
      showConfirmButton: false,
    });

    return { ok: true, data };
  } catch (err) {
    console.error("[register] failed:", err);

    await Swal.fire({
      icon: "error",
      title: "注册失败",
      text: pickErrorMessage(err, "注册失败，请检查信息"),
    });

    return { ok: false };
  }
}

/**
 * Apply activation code for an existing user (grant entitlements).
 */
export async function applyActivationCode(code) {
  try {
    const data = await apiFetch("/accounts/auth/activate-code/", {
      method: "POST",
      body: { code },
    });

    await Swal.fire({
      icon: "success",
      title: "激活成功",
      text: "权限已添加到当前账户",
      timer: 1400,
      showConfirmButton: false,
    });

    return { ok: true, data };
  } catch (err) {
    console.error("[activate-code] failed:", err);
    await Swal.fire({
      icon: "error",
      title: "激活失败",
      text: err?.data?.detail || "激活码无效或已过期",
    });
    return { ok: false };
  }
}

export async function requestPasswordReset(email) {
  try {
    const data = await apiFetch("/accounts/auth/password-reset/request/", {
      method: "POST",
      body: { email },
    });

    await Swal.fire({
      icon: "success",
      title: "请查收邮箱",
      text: data?.detail || "验证码已经发送。",
      timer: 1800,
      showConfirmButton: false,
    });

    return { ok: true, data };
  } catch (err) {
    console.error("[password-reset-request] failed:", err);

    await Swal.fire({
      icon: "error",
      title: "暂时无法发送验证码",
      text: err?.data?.detail || "请稍后再试。",
    });

    return { ok: false };
  }
}

export async function confirmPasswordReset({ email, code, newPassword }) {
  try {
    const data = await apiFetch("/accounts/auth/password-reset/confirm/", {
      method: "POST",
      body: {
        email,
        code,
        new_password: newPassword,
      },
    });

    await Swal.fire({
      icon: "success",
      title: "密码已更新",
      text: data?.detail || "现在可以用新密码登录了。",
      timer: 1800,
      showConfirmButton: false,
    });

    return { ok: true, data };
  } catch (err) {
    console.error("[password-reset-confirm] failed:", err);

    await Swal.fire({
      icon: "error",
      title: "无法重置密码",
      text: err?.data?.detail || "请检查验证码后重试。",
    });

    return { ok: false };
  }
}
