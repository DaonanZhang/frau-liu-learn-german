import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../api/auth";
import { fetchMyProfile, updateMyProfile } from "../api/auth/profile.js";
import "./ProfilePage.css";

const COUNTRY_CODE_OPTIONS = [
  { value: "+86", label: "🇨🇳 中国 +86" },
  { value: "+49", label: "🇩🇪 德国 +49" },
  { value: "+43", label: "🇦🇹 奥地利 +43" },
  { value: "+41", label: "🇨🇭 瑞士 +41" },
  { value: "+852", label: "🇭🇰 中国香港 +852" },
  { value: "+853", label: "🇲🇴 中国澳门 +853" },
  { value: "+886", label: "中国台湾 +886" },
  { value: "+65", label: "🇸🇬 新加坡 +65" },
  { value: "+81", label: "🇯🇵 日本 +81" },
  { value: "+82", label: "🇰🇷 韩国 +82" },
  { value: "+44", label: "🇬🇧 英国 +44" },
  { value: "+33", label: "🇫🇷 法国 +33" },
  { value: "+1", label: "🇺🇸 美国 +1" },
  { value: "+61", label: "🇦🇺 澳大利亚 +61" },
];

function extractErrorMessage(error) {
  if (!error) {
    return "保存失败，请稍后重试。";
  }

  const detail = error?.data?.detail;
  if (detail) {
    return String(detail);
  }

  const usernameError = error?.data?.username;
  if (Array.isArray(usernameError) && usernameError.length > 0) {
    return String(usernameError[0]);
  }

  const emailError = error?.data?.email;
  if (Array.isArray(emailError) && emailError.length > 0) {
    return String(emailError[0]);
  }

  if (error?.message) {
    return String(error.message);
  }

  return "保存失败，请稍后重试。";
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, reloadMe } = useAuth();

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [successText, setSuccessText] = useState("");

  const [countryCode, setCountryCode] = useState("+86");
  const [telephone, setTelephone] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");

  const normalizedUsername = useMemo(() => username.trim(), [username]);
  const normalizedEmail = useMemo(() => email.trim(), [email]);
  const canSave = !saving && !loadingProfile;

  useEffect(() => {
    let aborted = false;

    async function loadProfile() {
      try {
        setLoadingProfile(true);
        setErrorText("");
        setSuccessText("");

        const profile = await fetchMyProfile();
        if (aborted) {
          return;
        }

        setTelephone(String(profile?.telephone || ""));
        setCountryCode(String(profile?.country_code || "+86"));
        setUsername(String(profile?.username || ""));
        setEmail(String(profile?.email || ""));
      } catch (error) {
        if (aborted) {
          return;
        }
        setErrorText(extractErrorMessage(error));
      } finally {
        if (!aborted) {
          setLoadingProfile(false);
        }
      }
    }

    loadProfile();

    return () => {
      aborted = true;
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSave) {
      return;
    }

    setSaving(true);
    setErrorText("");
    setSuccessText("");

    try {
      const updated = await updateMyProfile({
        username: normalizedUsername,
        email: normalizedEmail || null,
      });

      setTelephone(String(updated?.telephone || ""));
      setCountryCode(String(updated?.country_code || "+86"));
      setUsername(String(updated?.username || ""));
      setEmail(String(updated?.email || ""));
      setSuccessText("资料已保存。");
      await reloadMe();
    } catch (error) {
      setErrorText(extractErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="profile-page">
      <section className="profile-card">
        <div className="profile-header">
          <button
            type="button"
            className="profile-backBtn"
            onClick={() => {
              navigate(-1);
            }}
            aria-label="Back"
          >
            ‹
          </button>
          <div>
            <h1 className="profile-title">个人资料</h1>
          </div>
        </div>

        {loadingProfile ? (
          <div className="profile-stateText">加载中…</div>
        ) : (
          <form className="profile-form" onSubmit={handleSubmit}>
            <label className="profile-label">
              手机号
              <div className="profile-inputRow">
                <select
                  className="profile-input profile-select profile-input--readonly"
                  value={countryCode || user?.country_code || "+86"}
                  disabled
                >
                  {COUNTRY_CODE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <input
                  className="profile-input profile-input--readonly"
                  value={telephone || user?.telephone || ""}
                  disabled
                />
              </div>
            </label>

            <label className="profile-label">
              用户名
              <input
                className="profile-input"
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value.slice(0, 10));
                }}
                placeholder="请输入用户名"
                maxLength={10}
                autoComplete="nickname"
              />
            </label>

            <label className="profile-label">
              邮箱
              <input
                className="profile-input"
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
                placeholder="请输入邮箱"
                autoComplete="email"
              />
            </label>

            {errorText ? <div className="profile-errorText">{errorText}</div> : null}
            {successText ? <div className="profile-successText">{successText}</div> : null}

            <button type="submit" className="profile-saveBtn" disabled={!canSave}>
              {saving ? "保存中…" : "保存资料"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
