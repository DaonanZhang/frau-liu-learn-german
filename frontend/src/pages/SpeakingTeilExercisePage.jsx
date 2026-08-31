import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchSpeakingTeilExerciseDetail } from "../api/exam_preparation/speakingExercises.js";
import SpeakingPracticeRecorder from "../components/examPreparation/SpeakingPracticeRecorder.jsx";
import "./SpeakingTeilExercisePage.css";

const TITLES = {
  1: "Einander kennenlernen",
  2: "Über ein Thema sprechen",
  3: "Gemeinsam etwas planen",
};

function Dialogue({ turns = [] }) {
  return (
    <div className="speaking-detail-dialogue">
      {turns.map((turn, index) => {
        const role = turn.role || "TN1";
        const roleKind = role.startsWith("Prüfer") ? "examiner" : role.toLowerCase();
        return (
          <article
            className={`speaking-detail-turn speaking-detail-turn--${roleKind}`}
            key={`${turn.sequence || index}-${role}`}
          >
            <span className="speaking-detail-turn__role">{role}</span>
            <p>{turn.text}</p>
          </article>
        );
      })}
    </div>
  );
}

export default function SpeakingTeilExercisePage({ teil }) {
  const { exerciseId } = useParams();
  const [exercise, setExercise] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetchSpeakingTeilExerciseDetail(exerciseId)
      .then((data) => {
        if (active) setExercise(data);
      })
      .catch((err) => {
        if (active) setError(err?.message || "练习加载失败。");
      });
    return () => {
      active = false;
    };
  }, [exerciseId]);

  if (error) {
    return <div className="speaking-detail-state speaking-detail-state--error">{error}</div>;
  }
  if (!exercise) {
    return <div className="speaking-detail-state">练习加载中...</div>;
  }

  const content = exercise.content || {};
  const cards = Array.isArray(content.cards) ? content.cards : [];
  const dialogue = Array.isArray(content.dialogue) ? content.dialogue : [];
  const sections = Array.isArray(content.sections) ? content.sections : [];
  const topics = Array.isArray(content.topics) ? content.topics : [];
  const base = exercise.exercise_base || {};

  return (
    <div className="speaking-detail-page">
      <div className="speaking-detail-topbar">
        <Link to={`/modules/exam-preparation/sprechen/teil-${teil}`} className="speaking-detail-back">
          ← Zurück zu Sprechen Teil {teil}
        </Link>
      </div>

      <header className="speaking-detail-hero">
        <p className="speaking-detail-hero__eyebrow">Sprechen · Teil {teil}</p>
        <h1>{base.title || TITLES[teil]}</h1>
        <div className="speaking-detail-badges">
          <span>{base.level || "B1"}</span>
          <span>{base.exam_type || "telc"}</span>
          {base.is_real_exam ? <span className="speaking-detail-badge--exam">真题</span> : null}
        </div>
      </header>

      <section className="speaking-detail-card speaking-detail-task">
        <p className="speaking-detail-card__eyebrow">Aufgabe</p>
        <h2>{TITLES[teil]}</h2>
        <p className="speaking-detail-task__instruction">{exercise.instruction}</p>
        {content.task ? <p className="speaking-detail-task__text">{content.task}</p> : null}

        {teil === 1 && topics.length ? (
          <div className="speaking-detail-topic-list" aria-label="Gesprächspunkte">
            {topics.map((topic) => <span key={topic}>{topic}</span>)}
          </div>
        ) : null}

        {teil === 2 && cards.length ? (
          <div className="speaking-detail-opinion-grid">
            {cards.map((card) => (
              <article className="speaking-detail-opinion" key={card.participant}>
                <span>{card.participant}</span>
                <h3>{card.title}</h3>
                <p>{card.content}</p>
              </article>
            ))}
          </div>
        ) : null}

        {teil === 3 && sections.length ? (
          <ol className="speaking-detail-stage-list">
            {sections.map((section, index) => (
              <li key={`${index}-${section.type}`}>
                <span>{index + 1}</span>
                <p>{section.type}</p>
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      <section className="speaking-detail-card speaking-detail-recording">
        <div>
          <p className="speaking-detail-card__eyebrow">Deine Antwort</p>
          <h2>Aufnehmen und anhören</h2>
          <p>点击麦克风开始或停止录音；录好后点击播放按钮即可听自己的回答。</p>
        </div>
        <SpeakingPracticeRecorder language="zh" recordingId={`teil-${teil}-${exerciseId}`} />
      </section>

      <section className="speaking-detail-card speaking-detail-example">
        <p className="speaking-detail-card__eyebrow">Beispiel</p>
        <h2>Beispieldialog</h2>
        {teil === 3 && sections.length ? (
          <div className="speaking-detail-section-list">
            {sections.map((section, index) => (
              <section className="speaking-detail-dialogue-section" key={`${index}-${section.type}`}>
                <h3>{section.type}</h3>
                <Dialogue turns={section.turns} />
              </section>
            ))}
          </div>
        ) : (
          <Dialogue turns={dialogue} />
        )}
      </section>
    </div>
  );
}
