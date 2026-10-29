import { Link, Navigate, useParams } from "react-router-dom";
import { examPreparationScope } from "../utils/examPreparationScope.js";
import "./ExamPreparationModulePage.css";

export default function ExamPreparationTipsPage() {
  const { level } = useParams();
  const scope = examPreparationScope(level);
  if (!scope) return <Navigate to="/modules/exam-preparation" replace />;

  return (
    <div className="exam-module-page">
      <Link className="exam-module-page__back" to={`/modules/exam-preparation/${scope.levelPath}`}>
        ← 返回 TELC {scope.level}
      </Link>
      <section className="exam-module-hero">
        <div className="exam-module-hero__content">
          <h1 className="exam-module-hero__title">Unsere Tipps</h1>
          <p className="exam-module-hero__copy">TELC {scope.level}</p>
        </div>
      </section>
    </div>
  );
}
