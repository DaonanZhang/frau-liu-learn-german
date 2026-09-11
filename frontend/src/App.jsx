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
import FavoriteQuestionsPage from "./pages/FavoriteQuestionsPage.jsx";
import ModulePage from "./pages/ModulePage.jsx";
import VlogModulePage from "./pages/VlogModulePage.jsx";
import ExamPreparationModulePage from "./pages/ExamPreparationModulePage.jsx";
import ExamPreparationListeningPage from "./pages/ExamPreparationListeningPage.jsx";
import ExamPreparationSpeakingPage from "./pages/ExamPreparationSpeakingPage.jsx";
import ExamPreparationSprachbausteinePage from "./pages/ExamPreparationSprachbausteinePage.jsx";
import ExamPreparationReadingPage from "./pages/ExamPreparationReadingPage.jsx";
import {
  LISTENING_TYPES,
  READING_TYPES,
  SPEAKING_TYPES,
  SPRACHBAUSTEINE_TYPES,
} from "./pages/examPreparationTypeContent.js";
import ClozeChoicePage from "./pages/ClozeChoicePage.jsx";
import ClozeMatchingPage from "./pages/ClozeMatchingPage.jsx";
import ExamPreparationWritingPage from "./pages/ExamPreparationWritingPage.jsx";
import ExamPreparationWritingDetailPage from "./pages/ExamPreparationWritingDetailPage.jsx";
import ExerciseSelectionPage from "./pages/ExerciseSelectionPage.jsx";
import ListeningExercisePage from "./pages/ListeningExercisePage.jsx";
import ReadingTitleMatchingPage from "./pages/ReadingTitleMatchingPage.jsx";
import ReadingUnderstandingPage from "./pages/ReadingUnderstandingPage.jsx";
import ReadingAdMatchingPage from "./pages/ReadingAdMatchingPage.jsx";
import SpeakingTeilExercisePage from "./pages/SpeakingTeilExercisePage.jsx";
import ModulePurchasePage from "./pages/ModulePurchasePage.jsx";
import ModuleCheckoutPage from "./pages/ModuleCheckoutPage.jsx";
import AlipayReturnPage from "./pages/AlipayReturnPage.jsx";
import { fetchListeningExercises } from "./api/exam_preparation/listeningExercises.js";
import {
  fetchReadingAdMatchingExercises,
} from "./api/exam_preparation/readingAdMatching.js";
import {
  fetchReadingTitleMatchingExercises,
} from "./api/exam_preparation/readingTitleMatching.js";
import {
  fetchReadingUnderstandingExercises,
} from "./api/exam_preparation/readingUnderstanding.js";
import {
  fetchClozeChoiceExercises,
  fetchClozeMatchingExercises,
} from "./api/exam_preparation/clozeExercises.js";
import { fetchSpeakingTeilExercises } from "./api/exam_preparation/speakingExercises.js";

import { AuthProvider } from "./api/auth";
import { useAuth } from "./api/auth/useAuth.js";
import ModuleAccessGate from "./components/ModuleAccessGate.jsx";

function FallbackRedirect() {
  const { loading, isAuthenticated } = useAuth();

  if (loading) {
    return null;
  }

  return <Navigate to={isAuthenticated ? "/" : "/login"} replace />;
}

function protectExamPreparationRoutes(routes) {
  return routes.map((route) => {
    const path = String(route.path || "");
    if (!path.startsWith("/modules/exam-preparation") && path !== "/favorite-questions") {
      return route;
    }
    return {
      ...route,
      element: (
        <ModuleAccessGate moduleId="exam-preparation">
          {route.element}
        </ModuleAccessGate>
      ),
    };
  });
}

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/activate", element: <ActivatePage /> },
  { path: "/activate-entitlement", element: <Navigate to="/redeem-code" replace /> },
  { path: "/payments/alipay/return", element: <AlipayReturnPage /> },
  {
    element: <AppLayout />,
    children: protectExamPreparationRoutes([
      { path: "/", element: <Home /> },
      { path: "/modules/science-season", element: <ModulePage /> },
      { path: "/modules/vlog-season", element: <VlogModulePage /> },
      { path: "/modules/exam-preparation", element: <ExamPreparationModulePage /> },
      { path: "/modules/exam-preparation/hoeren", element: <ExamPreparationListeningPage /> },
      { path: "/modules/exam-preparation/sprechen", element: <ExamPreparationSpeakingPage /> },
      { path: "/modules/exam-preparation/sprachbausteine", element: <ExamPreparationSprachbausteinePage /> },
      { path: "/modules/exam-preparation/schreiben", element: <ExamPreparationWritingPage /> },
      { path: "/modules/exam-preparation/schreiben/:exerciseId", element: <ExamPreparationWritingDetailPage /> },
      {
        path: "/modules/exam-preparation/sprachbausteine/cloze-choice",
        element: (
          <ExerciseSelectionPage
            backTo="/modules/exam-preparation/sprachbausteine"
            backLabel="← Zurück zu Sprachbausteine"
            eyebrow="Sprachbausteine"
            title="Teil 1"
            description={SPRACHBAUSTEINE_TYPES[0].description}
            fetchExercises={fetchClozeChoiceExercises}
            buildExerciseHref={(exercise) => `/modules/exam-preparation/sprachbausteine/cloze-choice/${exercise.id}`}
            cardDescription="Öffne diese Aufgabe und bearbeite die Lücken Schritt für Schritt mit den vorgegebenen Optionen."
          />
        ),
      },
      {
        path: "/modules/exam-preparation/sprachbausteine/cloze-choice/:exerciseId",
        element: <ClozeChoicePage />,
      },
      {
        path: "/modules/exam-preparation/sprachbausteine/cloze-matching",
        element: (
          <ExerciseSelectionPage
            backTo="/modules/exam-preparation/sprachbausteine"
            backLabel="← Zurück zu Sprachbausteine"
            eyebrow="Sprachbausteine"
            title="Teil 2"
            description={SPRACHBAUSTEINE_TYPES[1].description}
            fetchExercises={fetchClozeMatchingExercises}
            buildExerciseHref={(exercise) => `/modules/exam-preparation/sprachbausteine/cloze-matching/${exercise.id}`}
            cardDescription="Öffne diese Aufgabe und ordne die verfügbaren Ausdrücke den passenden Lücken zu."
          />
        ),
      },
      {
        path: "/modules/exam-preparation/sprachbausteine/cloze-matching/:exerciseId",
        element: <ClozeMatchingPage />,
      },
      {
        path: "/modules/exam-preparation/hoeren/short-text-prep",
        element: (
          <ExerciseSelectionPage
            backTo="/modules/exam-preparation/hoeren"
            backLabel="← Zurück zu Hören"
            eyebrow="Hören"
            title="Teil 1"
            description={LISTENING_TYPES[0].description}
            fetchExercises={() => fetchListeningExercises("short_text_true_false_with_prep")}
            buildExerciseHref={(exercise) => `/modules/exam-preparation/hoeren/short-text-prep/${exercise.id}`}
            cardDescription="Öffne diese Hörübung und bearbeite die Aussagen nach einer kurzen Vorbereitungszeit."
          />
        ),
      },
      {
        path: "/modules/exam-preparation/hoeren/short-text-prep/:exerciseId",
        element: (
          <ListeningExercisePage
            listeningType="short_text_true_false_with_prep"
            backTo="/modules/exam-preparation/hoeren/short-text-prep"
          />
        ),
      },
      {
        path: "/modules/exam-preparation/hoeren/short-text-once",
        element: (
          <ExerciseSelectionPage
            backTo="/modules/exam-preparation/hoeren"
            backLabel="← Zurück zu Hören"
            eyebrow="Hören"
            title="Teil 2"
            description={LISTENING_TYPES[1].description}
            fetchExercises={() => fetchListeningExercises("short_text_true_false_once")}
            buildExerciseHref={(exercise) => `/modules/exam-preparation/hoeren/short-text-once/${exercise.id}`}
            cardDescription="Öffne diese Hörübung und entscheide nach zweimaligem Hören des Gesprächs, welche Aussagen richtig oder falsch sind."
          />
        ),
      },
      {
        path: "/modules/exam-preparation/hoeren/short-text-once/:exerciseId",
        element: (
          <ListeningExercisePage
            listeningType="short_text_true_false_once"
            backTo="/modules/exam-preparation/hoeren/short-text-once"
          />
        ),
      },
      {
        path: "/modules/exam-preparation/hoeren/dialog-twice",
        element: (
          <ExerciseSelectionPage
            backTo="/modules/exam-preparation/hoeren"
            backLabel="← Zurück zu Hören"
            eyebrow="Hören"
            title="Teil 3"
            description={LISTENING_TYPES[2].description}
            fetchExercises={() => fetchListeningExercises("dialog_true_false_twice")}
            buildExerciseHref={(exercise) => `/modules/exam-preparation/hoeren/dialog-twice/${exercise.id}`}
            cardDescription="Öffne diese Hörübung und entscheide beim einmaligen Hören der kurzen Texte, welche Aussagen richtig oder falsch sind."
          />
        ),
      },
      {
        path: "/modules/exam-preparation/hoeren/dialog-twice/:exerciseId",
        element: (
          <ListeningExercisePage
            listeningType="dialog_true_false_twice"
            backTo="/modules/exam-preparation/hoeren/dialog-twice"
          />
        ),
      },
      { path: "/modules/exam-preparation/lesen", element: <ExamPreparationReadingPage /> },
      {
        path: "/modules/exam-preparation/lesen/title-matching",
        element: (
          <ExerciseSelectionPage
            backTo="/modules/exam-preparation/lesen"
            backLabel="← Zurück zu Lesen"
            eyebrow="Lesen"
            title="Teil 1"
            description={READING_TYPES[0].description}
            fetchExercises={fetchReadingTitleMatchingExercises}
            buildExerciseHref={(exercise) => `/modules/exam-preparation/lesen/title-matching/${exercise.id}`}
            buildCardTitle={(exercise, index) =>
              `Übung ${exercise?.exercise_base?.external_id || exercise?.id || index + 1}`
            }
            cardDescription="Öffne diese Aufgabe und finde für jeden Text die passende Überschrift."
          />
        ),
      },
      { path: "/modules/exam-preparation/lesen/title-matching/:exerciseId", element: <ReadingTitleMatchingPage /> },
      {
        path: "/modules/exam-preparation/lesen/understanding",
        element: (
          <ExerciseSelectionPage
            backTo="/modules/exam-preparation/lesen"
            backLabel="← Zurück zu Lesen"
            eyebrow="Lesen"
            title="Teil 2"
            description={READING_TYPES[1].description}
            fetchExercises={fetchReadingUnderstandingExercises}
            buildExerciseHref={(exercise) => `/modules/exam-preparation/lesen/understanding/${exercise.id}`}
            cardDescription="Öffne diese Aufgabe und beantworte die Fragen zum Lesetext Schritt für Schritt."
          />
        ),
      },
      { path: "/modules/exam-preparation/lesen/understanding/:exerciseId", element: <ReadingUnderstandingPage /> },
      {
        path: "/modules/exam-preparation/lesen/ad-matching",
        element: (
          <ExerciseSelectionPage
            backTo="/modules/exam-preparation/lesen"
            backLabel="← Zurück zu Lesen"
            eyebrow="Lesen"
            title="Teil 3"
            description={READING_TYPES[2].description}
            fetchExercises={fetchReadingAdMatchingExercises}
            buildExerciseHref={(exercise) => `/modules/exam-preparation/lesen/ad-matching/${exercise.id}`}
            buildCardTitle={(exercise, index) =>
              `Übung ${exercise?.exercise_base?.external_id || exercise?.id || index + 1}`
            }
            cardDescription="Öffne diese Aufgabe und ordne die Situationen den passenden Anzeigen zu."
          />
        ),
      },
      { path: "/modules/exam-preparation/lesen/ad-matching/:exerciseId", element: <ReadingAdMatchingPage /> },
      ...[1, 2, 3].flatMap((teil) => [
        {
          path: `/modules/exam-preparation/sprechen/teil-${teil}`,
          element: (
            <ExerciseSelectionPage
              backTo="/modules/exam-preparation/sprechen"
              backLabel="← Zurück zu Sprechen"
              eyebrow="Sprechen"
              title={`Teil ${teil}`}
              description={SPEAKING_TYPES[teil - 1].description}
              fetchExercises={() => fetchSpeakingTeilExercises(teil)}
              buildExerciseHref={(exercise) => `/modules/exam-preparation/sprechen/teil-${teil}/${exercise.id}`}
              buildCardTitle={teil === 1
                ? (exercise, index) => `${exercise?.exercise_base?.title?.trim() || "Einander kennenlernen"} Beispiel ${index + 1}`
                : undefined}
              cardDescription="Öffne diese Aufgabe und sprich sie anhand der angegebenen Stichpunkte durch."
            />
          ),
        },
        { path: `/modules/exam-preparation/sprechen/teil-${teil}/:exerciseId`, element: <SpeakingTeilExercisePage teil={teil} /> },
      ]),
      { path: "/modules/:moduleId/preview", element: <ModulePurchasePage /> },
      { path: "/modules/:moduleId/purchase", element: <ModuleCheckoutPage /> },
      { path: "/manual", element: <ManualPage /> },
      { path: "/videos/:videoId", element: <VideoStudyPage /> },
      { path: "/lexicon", element: <LexiconPage /> },
      { path: "/favorite-questions", element: <FavoriteQuestionsPage /> },
      { path: "/learning-records", element: <LearningRecordPage /> },
      { path: "/profile", element: <ProfilePage /> },
      { path: "/redeem-code", element: <ActivateEntitlementPage /> },
    ]),
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
