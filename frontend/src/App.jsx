import { Navigate, createBrowserRouter, RouterProvider } from "react-router-dom";
import AppLayout from "./layouts/AppLayout.jsx";
import Home from "./pages/Home.jsx";
import VideoStudyPage from "./pages/VideoStudy/VideoStudyPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import ForgotPasswordPage from "./pages/ForgotPasswordPage.jsx";
import ActivatePage from "./pages/ActivatePage.jsx";
import ActivateEntitlementPage from "./pages/ActivateEntitlementPage.jsx";
import LexiconPage from "./pages/LexiconPage/LexiconPage.jsx";
import LearningRecordPage from "./pages/RecordPage/LearningRecordPage.jsx";
import ManualPage from "./pages/ManualPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import ModulePage from "./pages/ModulePage.jsx";
import VlogModulePage from "./pages/VlogModulePage.jsx";
import ModulePurchasePage from "./pages/ModulePurchasePage.jsx";
import ModuleCheckoutPage from "./pages/ModuleCheckoutPage.jsx";
import AlipayReturnPage from "./pages/AlipayReturnPage.jsx";

import { AuthProvider } from "./api/auth";
import { useAuth } from "./api/auth/useAuth.js";

function FallbackRedirect() {
  const { loading, isAuthenticated } = useAuth();

  if (loading) {
    return null;
  }

  return <Navigate to={isAuthenticated ? "/" : "/login"} replace />;
}

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/activate", element: <ActivatePage /> },
  { path: "/activate-entitlement", element: <ActivateEntitlementPage /> },
  { path: "/payments/alipay/return", element: <AlipayReturnPage /> },
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/modules/science-season", element: <ModulePage /> },
      { path: "/modules/vlog-season", element: <VlogModulePage /> },
      { path: "/modules/:moduleId/preview", element: <ModulePurchasePage /> },
      { path: "/modules/:moduleId/purchase", element: <ModuleCheckoutPage /> },
      { path: "/manual", element: <ManualPage /> },
      { path: "/videos/:videoId", element: <VideoStudyPage /> },
      { path: "/lexicon", element: <LexiconPage /> },
      { path: "/learning-records", element: <LearningRecordPage /> },
      { path: "/profile", element: <ProfilePage /> },
    ],
  },
  { path: "*", element: <FallbackRedirect /> },
]);

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
