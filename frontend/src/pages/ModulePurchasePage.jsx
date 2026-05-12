import { Navigate, useNavigate, useParams } from "react-router-dom";
import { MODULES_BY_ID } from "./Homepage/homeShared.js";
import "./ModulePurchasePage.css";

export default function ModulePurchasePage() {
  const navigate = useNavigate();
  const { moduleId } = useParams();
  const module = MODULES_BY_ID[moduleId];

  if (!module) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="module-purchase-page">
      <button
        className="module-purchase-page__back"
        type="button"
        onClick={() => {
          navigate(-1);
        }}
      >
        <span aria-hidden="true">←</span>
        <span>返回</span>
      </button>

      <section className="module-purchase-page__card" aria-label={`${module.title} 详情`}>
        <img className="module-purchase-page__image" src={module.image} alt={module.title} />

        <div className="module-purchase-page__body">
          <h1 className="module-purchase-page__title">{module.title}</h1>

          <div className="module-purchase-page__labels">
            {(module.purchaseLabels || []).map((item) => (
              <span key={item} className="module-purchase-page__label">
                {item}
              </span>
            ))}
          </div>

          <p className="module-purchase-page__description">{module.purchaseDescription}</p>

          <ul className="module-purchase-page__list">
            {(module.purchaseFeatures || []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <div className="module-purchase-page__footer">
        <button
          className="module-purchase-page__cta"
          type="button"
          disabled
        >
          立刻购买
        </button>
        <div className="module-purchase-page__footer-row">
          <button
            className="module-purchase-page__trial"
            type="button"
            onClick={() => {
              if (module?.route) {
                navigate(module.route);
              }
            }}
          >
            立刻试用
          </button>
          <button
            className="module-purchase-page__ghost"
            type="button"
            onClick={() => {
              navigate(-1);
            }}
          >
            稍后再说
          </button>
        </div>
      </div>
    </div>
  );
}
