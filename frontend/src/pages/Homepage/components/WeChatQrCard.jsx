import { useEffect, useRef, useState } from "react";

import Card from "./Card.jsx";
import "./dashboardCards.css";
import { useAuth } from "../../../api/auth/useAuth.js";
import { fetchWeChatQr, uploadWeChatQr } from "../../../api/homepage/wechatQr.js";

export default function WeChatQrCard() {
  const { user } = useAuth();
  const fileInputRef = useRef(null);
  const [imageUrl, setImageUrl] = useState("/images/wechat-qr.png");
  const [canManage, setCanManage] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadQrImage() {
      try {
        const data = await fetchWeChatQr();
        if (!mounted) {
          return;
        }
        setImageUrl(data?.wechat_qr_image_url || "/images/wechat-qr.png");
        setCanManage(Boolean(data?.can_manage));
      } catch {
        if (!mounted) {
          return;
        }
        setImageUrl("/images/wechat-qr.png");
        setCanManage(Boolean(user?.is_superuser));
      }
    }

    loadQrImage();

    return () => {
      mounted = false;
    };
  }, [user?.telephone]);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setErrorText("");
    setIsUploading(true);
    try {
      const data = await uploadWeChatQr(file);
      setImageUrl(data?.wechat_qr_image_url || "/images/wechat-qr.png");
      setCanManage(Boolean(data?.can_manage));
    } catch (error) {
      setErrorText(error?.data?.wechat_qr_image?.[0] || error?.data?.detail || "上传失败，请重试。");
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  return (
    <Card title="学习群二维码" icon="👥">
      <div className="qr-card">
        <img
          className="qr-card__image"
          src={imageUrl}
          alt="学习群微信二维码"
        />
        <p className="qr-card__text">欢迎扫码加入学习群</p>
        {canManage ? (
          <>
            <input
              ref={fileInputRef}
              className="qr-card__file-input"
              type="file"
              accept="image/png"
              onChange={handleFileChange}
            />
            <button
              className="qr-card__upload-btn"
              type="button"
              onClick={() => {
                fileInputRef.current?.click();
              }}
              disabled={isUploading}
            >
              {isUploading ? "上传中..." : "替换图片"}
            </button>
          </>
        ) : null}
        {errorText ? <p className="qr-card__error">{errorText}</p> : null}
      </div>
    </Card>
  );
}
