import { Navigate } from "react-router-dom";

import { useAuth } from "../api/auth/useAuth.js";
import { MODULES_BY_ID } from "../pages/Homepage/homeShared.js";
import { hasModuleAccess } from "../utils/moduleAccess.js";


export default function ModuleAccessGate({ moduleId, children }) {
  const { user, loading, isAuthenticated } = useAuth();
  const module = MODULES_BY_ID[moduleId];

  if (loading) {
    return null;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (!hasModuleAccess(user, module)) {
    return <Navigate to={`/modules/${moduleId}/purchase`} replace />;
  }
  return children;
}
