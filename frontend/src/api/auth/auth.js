import Swal from "sweetalert2";
import { apiFetch } from "../client";

/**
 * Login with telephone + password.
 * On success:
 * - client.js will handle JWT usage
 * - tokens are stored here
 */
export async function login(telephone, password) {
  try {
    const data = await apiFetch("/accounts/auth/login/", {
      method: "POST",
      body: {
        telephone,
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
      title: "登录失败",
      text: "手机号或密码不匹配",
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
 * Registration (activation-code based)
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
 * Step 2: register new user with activation code.
 */
export async function registerWithActivationCode({
  code,
  telephone,
  password,
}) {
  try {
    const data = await apiFetch("/accounts/auth/register/", {
      method: "POST",
      body: {
        code,
        telephone,
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
      text: err?.data?.detail || "注册失败，请检查信息",
    });

    return { ok: false };
  }
}

