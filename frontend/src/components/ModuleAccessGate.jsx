import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../api/auth/useAuth.js";
import { MODULES_BY_ID } from "../pages/Homepage/homeShared.js";
import { hasModuleAccess } from "../utils/moduleAccess.js";


export default function ModuleAccessGate({ moduleId, children }) {
  const { user, loading, isAuthenticated } = useAuth();
  const module = MODULES_BY_ID[moduleId];
  const location = useLocation();
  const [accessCheckTime, setAccessCheckTime] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setAccessCheckTime(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  if (loading) {
    return null;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  const mockExamRouteMatch = location.pathname.match(
    /^\/modules\/exam-preparation\/telc\/(b1|b2)\/mock-exams?\/?$/i,
  );
  if (mockExamRouteMatch && !hasModuleAccess(user, module, accessCheckTime)) {
    const level = mockExamRouteMatch[1]?.toLowerCase();
    return <Navigate to={level ? `/modules/exam-preparation/${level}` : "/modules/exam-preparation"} replace />;
  }
  const allowsExamPreparationTrial =
    moduleId === "exam-preparation"
    && location.pathname.startsWith("/modules/exam-preparation");
  if (!allowsExamPreparationTrial && !hasModuleAccess(user, module, accessCheckTime)) {
    return <Navigate to={`/modules/${moduleId}/purchase`} replace />;
  }
  return children;
}
