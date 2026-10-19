import { Navigate, useParams } from "react-router-dom";
import TelcMockExamPage from "./telc/TelcMockExamPage.jsx";

export default function MockExamPage() {
  const { examType } = useParams();

  if (String(examType || "").toLowerCase() !== "telc") {
    return <Navigate to="/modules/exam-preparation" replace />;
  }

  return <TelcMockExamPage />;
}
