import { createBrowserRouter, RouterProvider } from "react-router-dom";
import AppLayout from "./layouts/AppLayout.jsx";
import Home from "./pages/Home.jsx";
import VideoStudyPage from "./pages/VideoStudy/VideoStudyPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import ActivatePage from "./pages/ActivatePage.jsx";
import ActivateEntitlementPage from "./pages/ActivateEntitlementPage.jsx";
import LexiconPage from "./pages/LexiconPage/LexiconPage.jsx";
import LearningRecordPage from "./pages/RecordPage/LearningRecordPage.jsx";
import ManualPage from "./pages/ManualPage.jsx";

import { AuthProvider } from "./api/auth";

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/activate", element: <ActivatePage /> },
  { path: "/activate-entitlement", element: <ActivateEntitlementPage /> },
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/manual", element: <ManualPage /> },
      { path: "/videos/:videoId", element: <VideoStudyPage /> },
      { path: "/lexicon", element: <LexiconPage /> },
      { path: "/learning-records", element: <LearningRecordPage /> },
    ],
  },
]);

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
