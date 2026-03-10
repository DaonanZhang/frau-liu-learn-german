import Card from "./Card.jsx";
import "./dashboardCards.css";

export default function WeChatQrCard() {
  return (
    <Card title="学习群二维码" icon="👥">
      <div className="qr-card">
        <img
          className="qr-card__image"
          src="/images/wechat-qr.png"
          alt="学习群微信二维码"
        />
        <p className="qr-card__text">欢迎扫码加入学习群</p>
      </div>
    </Card>
  );
}
