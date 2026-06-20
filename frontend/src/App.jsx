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
import ExamPreparationModulePage from "./pages/ExamPreparationModulePage.jsx";
import ExamPreparationListeningPage from "./pages/ExamPreparationListeningPage.jsx";
import ExamPreparationSpeakingPage from "./pages/ExamPreparationSpeakingPage.jsx";
import ExamPreparationSprachbausteinePage from "./pages/ExamPreparationSprachbausteinePage.jsx";
import ExamPreparationReadingPage from "./pages/ExamPreparationReadingPage.jsx";
import ClozeChoicePage from "./pages/ClozeChoicePage.jsx";
import ClozeMatchingPage from "./pages/ClozeMatchingPage.jsx";
import ExamPreparationWritingPage from "./pages/ExamPreparationWritingPage.jsx";
import ListeningExercisePage from "./pages/ListeningExercisePage.jsx";
import ReadingTitleMatchingPage from "./pages/ReadingTitleMatchingPage.jsx";
import ReadingUnderstandingPage from "./pages/ReadingUnderstandingPage.jsx";
import ReadingAdMatchingPage from "./pages/ReadingAdMatchingPage.jsx";
import SpeakingGapMatchingPage from "./pages/SpeakingGapMatchingPage.jsx";
import SpeakingPromptSegmentedPage from "./pages/SpeakingPromptSegmentedPage.jsx";
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
      { path: "/modules/exam-preparation", element: <ExamPreparationModulePage /> },
      { path: "/modules/exam-preparation/hoeren", element: <ExamPreparationListeningPage /> },
      { path: "/modules/exam-preparation/sprechen", element: <ExamPreparationSpeakingPage /> },
      { path: "/modules/exam-preparation/sprachbausteine", element: <ExamPreparationSprachbausteinePage /> },
      { path: "/modules/exam-preparation/schreiben", element: <ExamPreparationWritingPage /> },
      { path: "/modules/exam-preparation/sprachbausteine/cloze-choice", element: <ClozeChoicePage /> },
      { path: "/modules/exam-preparation/sprachbausteine/cloze-matching", element: <ClozeMatchingPage /> },
      {
        path: "/modules/exam-preparation/hoeren/short-text-prep",
        element: (
          <ListeningExercisePage
            listeningType="short_text_true_false_with_prep"
            eyebrow="LISTENING_SHORT_TEXT_PREP"
          />
        ),
      },
      {
        path: "/modules/exam-preparation/hoeren/short-text-once",
        element: (
          <ListeningExercisePage
            listeningType="short_text_true_false_once"
            eyebrow="LISTENING_SHORT_TEXT_ONCE"
          />
        ),
      },
      {
        path: "/modules/exam-preparation/hoeren/dialog-twice",
        element: (
          <ListeningExercisePage
            listeningType="dialog_true_false_twice"
            eyebrow="LISTENING_DIALOG_TWICE"
          />
        ),
      },
      { path: "/modules/exam-preparation/lesen", element: <ExamPreparationReadingPage /> },
      { path: "/modules/exam-preparation/lesen/title-matching", element: <ReadingTitleMatchingPage /> },
      { path: "/modules/exam-preparation/lesen/understanding", element: <ReadingUnderstandingPage /> },
      { path: "/modules/exam-preparation/lesen/ad-matching", element: <ReadingAdMatchingPage /> },
      { path: "/modules/exam-preparation/sprechen/gap-matching", element: <SpeakingGapMatchingPage /> },
      { path: "/modules/exam-preparation/sprechen/prompt-segmented", element: <SpeakingPromptSegmentedPage /> },
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
