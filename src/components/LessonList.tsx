"use client";

import { useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  Lock,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Check,
  X,
} from "lucide-react";
import { lessons, lessonContents } from "@/data/lessons";

export function LessonList() {
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<
    Record<string, Record<number, number>>
  >({});
  const [quizSubmitted, setQuizSubmitted] = useState<Record<string, boolean>>(
    {}
  );

  function toggle(slug: string) {
    setExpandedSlug((prev) => (prev === slug ? null : slug));
  }

  function handleQuizAnswer(lessonSlug: string, questionIdx: number, answerIdx: number) {
    setQuizAnswers((prev) => ({
      ...prev,
      [lessonSlug]: {
        ...prev[lessonSlug],
        [questionIdx]: answerIdx,
      },
    }));
  }

  function submitQuiz(lessonSlug: string) {
    setQuizSubmitted((prev) => ({ ...prev, [lessonSlug]: true }));
  }

  function getQuizScore(lessonSlug: string): { correct: number; total: number } {
    const content = lessonContents[lessonSlug];
    if (!content) return { correct: 0, total: 0 };
    const answers = quizAnswers[lessonSlug] || {};
    let correct = 0;
    content.quiz.forEach((q, i) => {
      if (answers[i] === q.correct) correct++;
    });
    return { correct, total: content.quiz.length };
  }

  return (
    <section className="panel rounded-lg p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Учебный маршрут</h2>
          <p className="text-sm text-ink/65">
            {lessons.length} модулей · Нажми на урок чтобы изучить
          </p>
        </div>
        <BookOpen className="text-steel" size={22} />
      </div>
      <div className="space-y-3">
        {lessons.map((lesson, index) => {
          const isOpen = expandedSlug === lesson.slug;
          const isLocked = lesson.status === "locked";
          const content = lessonContents[lesson.slug];
          const isSubmitted = quizSubmitted[lesson.slug];
          const score = isSubmitted ? getQuizScore(lesson.slug) : null;

          return (
            <article
              className={`rounded-md border bg-white transition ${
                isOpen
                  ? "border-steel/30 shadow-sm"
                  : "border-ink/10 hover:border-ink/20"
              } ${isLocked ? "opacity-60" : "cursor-pointer"}`}
              key={lesson.slug}
              onClick={() => !isLocked && toggle(lesson.slug)}
              role={isLocked ? undefined : "button"}
              tabIndex={isLocked ? -1 : 0}
              onKeyDown={(e) => {
                if (!isLocked && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  toggle(lesson.slug);
                }
              }}
            >
              <div className="p-4">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-steel">
                      Модуль {index + 1} · {lesson.duration}
                    </p>
                    <h3 className="mt-1 font-semibold">{lesson.title}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {isLocked ? (
                      <Lock size={18} className="text-ink/35" />
                    ) : (
                      <>
                        <CheckCircle2 size={18} className="text-mint" />
                        {isOpen ? (
                          <ChevronUp size={16} className="text-ink/40" />
                        ) : (
                          <ChevronDown size={16} className="text-ink/40" />
                        )}
                      </>
                    )}
                  </div>
                </div>
                <p className="text-sm leading-6 text-ink/70">
                  {lesson.description}
                </p>
              </div>

              {/* Expanded content */}
              {isOpen && !isLocked && content && (
                <div className="border-t border-ink/10 bg-paper/50 px-4 py-4">
                  {/* Lesson sections */}
                  <div className="space-y-4">
                    {content.sections.map((section, sIdx) => (
                      <div key={sIdx}>
                        <h4 className="text-sm font-bold text-ink/80 mb-1">
                          {sIdx + 1}. {section.title}
                        </h4>
                        <p className="text-sm leading-6 text-ink/70">
                          {section.text}
                        </p>
                        {section.tip && (
                          <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200/50 px-3 py-2">
                            <Lightbulb size={14} className="text-amber-500 mt-0.5 shrink-0" />
                            <p className="text-xs text-amber-700 leading-5">
                              {section.tip}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Quiz */}
                  {content.quiz.length > 0 && (
                    <div className="mt-6">
                      <h4 className="text-sm font-bold text-ink/80 mb-3">
                        📝 Проверь себя
                      </h4>
                      <div className="space-y-4">
                        {content.quiz.map((q, qIdx) => {
                          const selected = quizAnswers[lesson.slug]?.[qIdx];
                          const isCorrect = selected === q.correct;

                          return (
                            <div
                              key={qIdx}
                              className="rounded-lg border border-ink/10 bg-white p-3"
                            >
                              <p className="text-sm font-medium text-ink/80 mb-2">
                                {qIdx + 1}. {q.question}
                              </p>
                              <div className="space-y-1.5">
                                {q.options.map((opt, oIdx) => {
                                  const isSelected = selected === oIdx;
                                  const showResult = isSubmitted && isSelected;
                                  const isCorrectOption = oIdx === q.correct;

                                  return (
                                    <button
                                      key={oIdx}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!isSubmitted) {
                                          handleQuizAnswer(lesson.slug, qIdx, oIdx);
                                        }
                                      }}
                                      type="button"
                                      disabled={isSubmitted}
                                      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition ${
                                        showResult
                                          ? isCorrect
                                            ? "border-mint bg-mint/10 text-mint"
                                            : "border-coral bg-coral/10 text-coral"
                                          : isSubmitted && isCorrectOption
                                          ? "border-mint/50 bg-mint/5 text-mint"
                                          : isSelected
                                          ? "border-ink/30 bg-ink/5 text-ink"
                                          : "border-ink/10 text-ink/60 hover:border-ink/20"
                                      }`}
                                    >
                                      <span className="shrink-0 font-medium">
                                        {String.fromCharCode(65 + oIdx)}.
                                      </span>
                                      <span className="flex-1">{opt}</span>
                                      {showResult && isCorrect && (
                                        <Check size={14} className="text-mint shrink-0" />
                                      )}
                                      {showResult && !isCorrect && (
                                        <X size={14} className="text-coral shrink-0" />
                                      )}
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Explanation after submit */}
                              {isSubmitted && (
                                <p className="mt-2 text-xs text-ink/50 italic">
                                  💡 {q.explanation}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Submit / Results */}
                      {!isSubmitted ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            submitQuiz(lesson.slug);
                          }}
                          disabled={
                            !quizAnswers[lesson.slug] ||
                            Object.keys(quizAnswers[lesson.slug] || {}).length <
                              content.quiz.length
                          }
                          className={`mt-4 w-full rounded-lg py-2.5 text-sm font-bold transition ${
                            quizAnswers[lesson.slug] &&
                            Object.keys(quizAnswers[lesson.slug] || {}).length >=
                              content.quiz.length
                              ? "bg-ink text-white hover:bg-ink/90"
                              : "bg-ink/10 text-ink/30 cursor-not-allowed"
                          }`}
                          type="button"
                        >
                          Проверить ответы
                        </button>
                      ) : (
                        <div
                          className={`mt-4 rounded-lg border p-3 text-center ${
                            score && score.correct === score.total
                              ? "border-mint/30 bg-mint/10"
                              : score && score.correct >= score.total / 2
                              ? "border-amber-300/30 bg-amber-50"
                              : "border-coral/30 bg-coral/10"
                          }`}
                        >
                          <p className="text-sm font-bold">
                            {score?.correct} из {score?.total} правильных
                          </p>
                          <p className="text-xs text-ink/50 mt-1">
                            {score?.correct === score?.total
                              ? "🎉 Отлично! Ты освоил этот модуль!"
                              : score && score.correct >= score.total / 2
                              ? "👍 Хорошо! Но есть что повторить."
                              : "📖 Перечитай урок и попробуй снова."}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Fallback for lessons without content */}
              {isOpen && !isLocked && !content && (
                <div className="border-t border-ink/10 bg-paper/50 px-4 py-4 text-sm leading-6 text-ink/70">
                  <p className="mb-2 font-medium text-ink/80">
                    Что узнаешь:
                  </p>
                  <ul className="list-inside list-disc space-y-1">
                    <li>Основные принципы и правила</li>
                    <li>Как применять на практике в симуляторе</li>
                    <li>Типичные ошибки новичков</li>
                  </ul>
                  <p className="mt-3 text-xs text-ink/45">
                    Контент урока скоро будет добавлен. Пока попробуй симулятор →
                  </p>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
