import { createBrowserRouter, RouterProvider } from "react-router-dom";
import AppLayout from "./layouts/AppLayout.jsx";
import Home from "./pages/Home.jsx";
import VideoStudyPage from "./pages/VideoStudy/VideoStudyPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import ActivatePage from "./pages/ActivatePage.jsx";
import LexiconPage from "./pages/LexiconPage/LexiconPage.jsx";

import { AuthProvider } from "./api/auth";

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/activate", element: <ActivatePage /> },
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/videos/:videoId", element: <VideoStudyPage /> },
      { path: "/lexicon", element: <LexiconPage /> },
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
