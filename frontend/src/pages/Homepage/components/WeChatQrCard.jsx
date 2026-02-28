import Card from "./Card.jsx";
import "./dashboardCards.css";

export default function WeChatQrCard() {
  return (
    <Card title="内测群二维码" icon="👥">
      <div className="qr-card">
        <img
          className="qr-card__image"
          src="/images/wechat-qr.png"
          alt="内测群微信二维码"
        />
        <p className="qr-card__text">欢迎扫码加入内测微信群</p>
      </div>
    </Card>
  );
}
