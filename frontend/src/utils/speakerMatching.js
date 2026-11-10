function statementLetter(index) {
  return String.fromCharCode(97 + index);
}

export function buildSpeakerMatchingRows(exercise) {
  const questions = Array.isArray(exercise?.questions) ? exercise.questions : [];
  const contentStatements = Array.isArray(exercise?.content?.statements)
    ? exercise.content.statements
    : [];
  const sourceStatements = contentStatements.length
    ? contentStatements
    : questions.map((question, index) => ({
      statement_number: index + 1,
      statement: question.question_text,
    }));
  const statements = sourceStatements.map((statement, index) => {
    const number = statement.statement_number || index + 1;
    const text = statement.statement || statement.question_text || "";
    const question = questions.find((item) => (
      item.question_key === `statement_${number}` || item.question_text === text
    ));
    return { key: statementLetter(index), text, question };
  });
  const speakers = new Map();
  questions.forEach((question) => {
    (question.answer_options || []).forEach((option) => {
      if (!speakers.has(option.option_key)) {
        speakers.set(option.option_key, option.option_text);
      }
    });
  });

  return [...speakers].map(([speakerKey], index) => {
    const question = questions.find((item) => (
      item.answer_options || []
    ).some((option) => option.option_key === speakerKey && option.is_correct));
    const correctStatement = statements.find((statement) => statement.question?.id === question?.id);
    return question && correctStatement ? {
      question,
      speakerKey,
      speakerText: `Sprecher/-in ${index + 1}`,
      correctStatementKey: correctStatement.key,
      statements,
    } : null;
  }).filter(Boolean);
}

export function speakerMatchingAnswerIsCorrect(row, value) {
  return Boolean(value) && value === row.correctStatementKey;
}
