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
import ExamPreparationWritingDetailPage from "./pages/ExamPreparationWritingDetailPage.jsx";
import ExerciseSelectionPage from "./pages/ExerciseSelectionPage.jsx";
import ListeningExercisePage from "./pages/ListeningExercisePage.jsx";
import ReadingTitleMatchingPage from "./pages/ReadingTitleMatchingPage.jsx";
import ReadingUnderstandingPage from "./pages/ReadingUnderstandingPage.jsx";
import ReadingAdMatchingPage from "./pages/ReadingAdMatchingPage.jsx";
import SpeakingGapMatchingPage from "./pages/SpeakingGapMatchingPage.jsx";
import SpeakingPromptSegmentedPage from "./pages/SpeakingPromptSegmentedPage.jsx";
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
import {
  fetchSpeakingGapMatchingExercises,
  fetchSpeakingPromptSegmentedExercises,
} from "./api/exam_preparation/speakingExercises.js";

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
      { path: "/modules/exam-preparation/schreiben/:exerciseId", element: <ExamPreparationWritingDetailPage /> },
      {
        path: "/modules/exam-preparation/sprachbausteine/cloze-choice",
        element: (
          <ExerciseSelectionPage
            backTo="/modules/exam-preparation/sprachbausteine"
            backLabel="← Zurück zu Sprachbausteine"
            eyebrow="Sprachbausteine"
            title="Lückentext mit Einzeloptionen"
            description="Wähle eine konkrete Aufgabe aus und trainiere jede Lücke einzeln mit den dazugehörigen Antwortmöglichkeiten."
            tags={["Lücken einzeln lösen", "Wortschatz und Grammatik", "Gezieltes Üben"]}
            fetchExercises={fetchClozeChoiceExercises}
            buildExerciseHref={(exercise) => `/modules/exam-preparation/sprachbausteine/cloze-choice/${exercise.id}`}
            cardLabel="Sprachbausteine"
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
            title="Lückentext mit gemeinsamem Pool"
            description="Wähle eine Aufgabe aus und bearbeite einen Lückentext mit gemeinsamem Antwortpool, wie in der eigentlichen Prüfungssituation."
            tags={["Gemeinsamer Pool", "Kontext beachten", "Prüfungsnahes Training"]}
            fetchExercises={fetchClozeMatchingExercises}
            buildExerciseHref={(exercise) => `/modules/exam-preparation/sprachbausteine/cloze-matching/${exercise.id}`}
            cardLabel="Sprachbausteine"
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
            title="Kurze Texte mit Vorbereitungszeit"
            description="Wähle eine konkrete Hörübung aus. Vor dem Hören kannst du die Aufgaben lesen und dich gezielt auf die Aussagen vorbereiten."
            tags={["Vorbereitungszeit", "Kurze Hörtexte", "Richtig oder falsch"]}
            fetchExercises={() => fetchListeningExercises("short_text_true_false_with_prep")}
            buildExerciseHref={(exercise) => `/modules/exam-preparation/hoeren/short-text-prep/${exercise.id}`}
            cardLabel="Hörübung"
            cardDescription="Öffne diese Hörübung und bearbeite die Aussagen nach einer kurzen Vorbereitungszeit."
          />
        ),
      },
      {
        path: "/modules/exam-preparation/hoeren/short-text-prep/:exerciseId",
        element: (
          <ListeningExercisePage
            listeningType="short_text_true_false_with_prep"
            eyebrow="LISTENING_SHORT_TEXT_PREP"
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
            title="Kurze Texte einmal hören"
            description="Wähle eine Hörübung aus und trainiere das unmittelbare Verstehen ohne zusätzliche Vorbereitungsphase."
            tags={["Direkt hören", "Schnell reagieren", "Kurztexte"]}
            fetchExercises={() => fetchListeningExercises("short_text_true_false_once")}
            buildExerciseHref={(exercise) => `/modules/exam-preparation/hoeren/short-text-once/${exercise.id}`}
            cardLabel="Hörübung"
            cardDescription="Öffne diese Hörübung und entscheide beim ersten Hören, welche Aussagen richtig oder falsch sind."
          />
        ),
      },
      {
        path: "/modules/exam-preparation/hoeren/short-text-once/:exerciseId",
        element: (
          <ListeningExercisePage
            listeningType="short_text_true_false_once"
            eyebrow="LISTENING_SHORT_TEXT_ONCE"
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
            title="Gespräch zweimal hören"
            description="Wähle eine Dialogübung aus und trainiere das Verstehen längerer Gespräche mit zwei Hördurchgängen."
            tags={["Dialoge", "Zweimal hören", "Details verstehen"]}
            fetchExercises={() => fetchListeningExercises("dialog_true_false_twice")}
            buildExerciseHref={(exercise) => `/modules/exam-preparation/hoeren/dialog-twice/${exercise.id}`}
            cardLabel="Hörübung"
            cardDescription="Öffne diese Dialogübung und bearbeite die Aussagen nach dem Hören des Gesprächs."
          />
        ),
      },
      {
        path: "/modules/exam-preparation/hoeren/dialog-twice/:exerciseId",
        element: (
          <ListeningExercisePage
            listeningType="dialog_true_false_twice"
            eyebrow="LISTENING_DIALOG_TWICE"
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
            title="Titel zuordnen"
            description="Wähle eine Aufgabe aus und ordne mehreren Textabschnitten die passende Überschrift zu."
            tags={["Hauptaussage erkennen", "Titel zuordnen", "Lesetraining"]}
            fetchExercises={fetchReadingTitleMatchingExercises}
            buildExerciseHref={(exercise) => `/modules/exam-preparation/lesen/title-matching/${exercise.id}`}
            cardLabel="Leseübung"
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
            title="Leseverstehen"
            description="Wähle eine Aufgabe aus und bearbeite Fragen zu einem zusammenhängenden Lesetext."
            tags={["Text verstehen", "Fragen beantworten", "Details erfassen"]}
            fetchExercises={fetchReadingUnderstandingExercises}
            buildExerciseHref={(exercise) => `/modules/exam-preparation/lesen/understanding/${exercise.id}`}
            cardLabel="Leseübung"
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
            title="Anzeige zuordnen"
            description="Wähle eine Aufgabe aus und finde zu jeder Situation die passende Anzeige."
            tags={["Situationen vergleichen", "Passende Anzeige finden", "Informationen abgleichen"]}
            fetchExercises={fetchReadingAdMatchingExercises}
            buildExerciseHref={(exercise) => `/modules/exam-preparation/lesen/ad-matching/${exercise.id}`}
            cardLabel="Leseübung"
            cardDescription="Öffne diese Aufgabe und ordne die Situationen den passenden Anzeigen zu."
          />
        ),
      },
      { path: "/modules/exam-preparation/lesen/ad-matching/:exerciseId", element: <ReadingAdMatchingPage /> },
      {
        path: "/modules/exam-preparation/sprechen/gap-matching",
        element: (
          <ExerciseSelectionPage
            backTo="/modules/exam-preparation/sprechen"
            backLabel="← Zurück zu Sprechen"
            eyebrow="Sprechen"
            title="Lückentext mit Satzoptionen"
            description="Wähle eine Aufgabe aus und ergänze einen Sprechtext mit passenden Aussagen."
            tags={["Aussagen ergänzen", "Kontext beachten", "Sprechtraining"]}
            fetchExercises={fetchSpeakingGapMatchingExercises}
            buildExerciseHref={(exercise) => `/modules/exam-preparation/sprechen/gap-matching/${exercise.id}`}
            cardLabel="Sprechübung"
            cardDescription="Öffne diese Aufgabe und ergänze den Text mit den passenden Satzoptionen."
          />
        ),
      },
      { path: "/modules/exam-preparation/sprechen/gap-matching/:exerciseId", element: <SpeakingGapMatchingPage /> },
      {
        path: "/modules/exam-preparation/sprechen/prompt-segmented",
        element: (
          <ExerciseSelectionPage
            backTo="/modules/exam-preparation/sprechen"
            backLabel="← Zurück zu Sprechen"
            eyebrow="Sprechen"
            title="Prompt mit geordneten Abschnitten"
            description="Wähle eine Aufgabe aus und bringe die Abschnitte eines Beispieltexts in die richtige Reihenfolge."
            tags={["Reihenfolge ordnen", "Antwort strukturieren", "Sprechtraining"]}
            fetchExercises={fetchSpeakingPromptSegmentedExercises}
            buildExerciseHref={(exercise) => `/modules/exam-preparation/sprechen/prompt-segmented/${exercise.id}`}
            cardLabel="Sprechübung"
            cardDescription="Öffne diese Aufgabe und ordne die Abschnitte des Beispieltexts sinnvoll an."
          />
        ),
      },
      { path: "/modules/exam-preparation/sprechen/prompt-segmented/:exerciseId", element: <SpeakingPromptSegmentedPage /> },
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
