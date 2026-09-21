import type { MentorFeedback, Trade } from "./types";

export function analyzeTrade(trade: Trade, previousTrades: Trade[]): MentorFeedback[] {
  const feedback: MentorFeedback[] = [];

  if (!trade.stopLoss) {
    feedback.push({
      title: "Нет стоп-лосса",
      message:
        "Сделка открыта без заранее заданного стоп-лосса. Для обучения это хороший момент: перед входом нужно понимать, где идея сделки станет неверной.",
      riskScore: 35
    });
  }

  if (trade.riskPercent > 3) {
    feedback.push({
      title: "Риск выше учебного лимита",
      message:
        "Риск на сделку выше 3% виртуального капитала. На раннем этапе полезнее тренировать дисциплину с риском около 1-2%.",
      riskScore: 45
    });
  }

  const recentTrades = previousTrades.filter((item) => {
    const minutes =
      (Date.now() - new Date(item.createdAt).getTime()) / (1000 * 60);
    return minutes < 10;
  });

  if (recentTrades.length >= 3) {
    feedback.push({
      title: "Похоже на overtrading",
      message:
        "За короткое время открыто несколько сделок. Перед следующей сделкой сформулируй причину входа и максимальный убыток.",
      riskScore: 25
    });
  }

  if (trade.quantity * trade.entryPrice > 5000) {
    feedback.push({
      title: "Крупная позиция",
      message:
        "Размер позиции занимает заметную часть учебного депозита. Проверь, соответствует ли позиция твоему плану риска.",
      riskScore: 20
    });
  }

  if (feedback.length === 0) {
    feedback.push({
      title: "Сделка выглядит дисциплинированно",
      message:
        "Есть контроль размера позиции и риска. Следующий шаг: после выхода из сделки сравнить результат с первоначальным планом.",
      riskScore: 5
    });
  }

  return feedback;
}
