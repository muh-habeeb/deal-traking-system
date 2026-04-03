const env = require('../config/env');

const ALLOWED_PRIORITIES = new Set(['high', 'medium', 'low']);

function normalizePriority(priority) {
  const normalized = String(priority || '').trim().toLowerCase();
  if (ALLOWED_PRIORITIES.has(normalized)) {
    return normalized;
  }

  return 'medium';
}

function getCanadaTimeHour() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: env.queue.timezone,
    hour: '2-digit',
    hourCycle: 'h23',
  });

  const hourText = formatter.format(new Date());
  const hour = Number(hourText);
  return Number.isFinite(hour) ? hour : 12;
}

function isPeakHour(hour) {
  const morning = hour >= env.queue.morningPeakStartHour && hour <= env.queue.morningPeakEndHour;
  const evening = hour >= env.queue.eveningPeakStartHour && hour <= env.queue.eveningPeakEndHour;
  return morning || evening;
}

function getNextDelayMs(priority) {
  const normalizedPriority = normalizePriority(priority);
  const hour = getCanadaTimeHour();
  const peak = isPeakHour(hour);

  if (normalizedPriority === 'high') {
    return peak ? env.queue.highPeakDelayMs : env.queue.highOffPeakDelayMs;
  }

  if (normalizedPriority === 'low') {
    return peak ? env.queue.lowPeakDelayMs : env.queue.lowOffPeakDelayMs;
  }

  return peak ? env.queue.mediumPeakDelayMs : env.queue.mediumOffPeakDelayMs;
}

module.exports = {
  normalizePriority,
  getCanadaTimeHour,
  getNextDelayMs,
};
