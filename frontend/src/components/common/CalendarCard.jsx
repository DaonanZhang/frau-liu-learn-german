import { useMemo, useState } from "react";

import Card from "./Card";
import "./dashboardCards.css";

/**
 * Parse an ISO date string (YYYY-MM-DD).
 *
 * @param {string} isoDate - Date string in YYYY-MM-DD.
 * @returns {{ year: number, month: number, day: number } | null} month is 1-12.
 */
function parseIsoDateParts(isoDate) {
  const value = String(isoDate || "");
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  return { year, month, day };
}

/**
 * Get days count in a month.
 *
 * @param {number} year - Full year.
 * @param {number} month1 - Month (1-12).
 * @returns {number} Days in that month.
 */
function getDaysInMonth(year, month1) {
  return new Date(year, month1, 0).getDate();
}

/**
 * Convert JS Sunday-based day (0..6) to Monday-based (0..6).
 *
 * @param {number} jsDay - 0..6 where 0 is Sunday.
 * @returns {number} 0..6 where 0 is Monday.
 */
function toMondayIndex(jsDay) {
  return (jsDay + 6) % 7;
}

/**
 * Build a YYYY-MM label.
 *
 * @param {number} year
 * @param {number} month1
 * @returns {string}
 */
function formatMonthLabel(year, month1) {
  const monthName = new Date(year, month1 - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  return monthName;
}

/**
 * Add months to a year-month pair.
 *
 * @param {{year: number, month: number}} current - month is 1-12
 * @param {number} delta - negative/positive months
 * @returns {{year: number, month: number}}
 */
function addMonths(current, delta) {
  const date = new Date(current.year, current.month - 1 + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

/**
 * Compare two year-month values.
 *
 * @param {{year: number, month: number}} a
 * @param {{year: number, month: number}} b
 * @returns {number} -1/0/1
 */
function compareYearMonth(a, b) {
  if (a.year !== b.year) {
    return a.year < b.year ? -1 : 1;
  }
  if (a.month !== b.month) {
    return a.month < b.month ? -1 : 1;
  }
  return 0;
}

/**
 * Build a set of active day numbers for the currently visible month.
 *
 * @param {string[]} activeDates
 * @param {number} year
 * @param {number} month
 * @returns {Set<number>}
 */
function buildActiveDaySet(activeDates, year, month) {
  const result = new Set();
  (Array.isArray(activeDates) ? activeDates : []).forEach((dateString) => {
    const parts = parseIsoDateParts(dateString);
    if (!parts) {
      return;
    }
    if (parts.year === year && parts.month === month) {
      result.add(parts.day);
    }
  });
  return result;
}

export default function CalendarCard({
  activeDates = [],
  maxPastMonths = 3,
}) {
  const today = useMemo(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  }, []);

  const [visibleMonth, setVisibleMonth] = useState(() => {
    return { year: today.year, month: today.month };
  });

  const earliestAllowedMonth = useMemo(() => {
    return addMonths({ year: today.year, month: today.month }, -maxPastMonths);
  }, [today, maxPastMonths]);

  const canGoPrev = useMemo(() => {
    return compareYearMonth(addMonths(visibleMonth, -1), earliestAllowedMonth) >= 0;
  }, [visibleMonth, earliestAllowedMonth]);

  const title = useMemo(() => {
    return formatMonthLabel(visibleMonth.year, visibleMonth.month);
  }, [visibleMonth]);

  const activeDaySet = useMemo(() => {
    return buildActiveDaySet(activeDates, visibleMonth.year, visibleMonth.month);
  }, [activeDates, visibleMonth]);

  const daysInMonth = useMemo(() => {
    return getDaysInMonth(visibleMonth.year, visibleMonth.month);
  }, [visibleMonth]);

  const leadingEmptyCells = useMemo(() => {
    const firstDay = new Date(visibleMonth.year, visibleMonth.month - 1, 1);
    const mondayIndex = toMondayIndex(firstDay.getDay());
    return mondayIndex; // 0..6
  }, [visibleMonth]);

  const isCurrentMonth = useMemo(() => {
    return visibleMonth.year === today.year && visibleMonth.month === today.month;
  }, [visibleMonth, today]);

  const selectedDay = isCurrentMonth ? today.day : null;

  function handlePrev() {
    if (!canGoPrev) {
      return;
    }
    setVisibleMonth((prev) => addMonths(prev, -1));
  }

  function handleNext() {
    setVisibleMonth((prev) => addMonths(prev, 1));
  }

  const actions = (
    <div className="cal-actions">
      <button
        className="cal-nav-btn"
        type="button"
        onClick={handlePrev}
        disabled={!canGoPrev}
        aria-disabled={!canGoPrev}
        title={!canGoPrev ? `Only past ${maxPastMonths} months are available` : "Previous month"}
      >
        ‹
      </button>
      <button className="cal-nav-btn" type="button" onClick={handleNext} title="Next month">
        ›
      </button>
    </div>
  );

  return (
    <Card
      title={title}
      icon={<i className="fa-regular fa-calendar calendar-card-icon" />}
      actions={actions}
    >
      <div className="calendar">
        <div className="cal-weekdays">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="cal-weekday">
              {d}
            </div>
          ))}
        </div>

        <div className="cal-grid">
          {Array.from({ length: leadingEmptyCells }, (_, i) => (
            <div key={`empty-${i}`} className="cal-day cal-day-empty" />
          ))}

          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
            const isActive = activeDaySet.has(day);
            const isSelected = selectedDay === day;

            return (
              <button
                key={day}
                type="button"
                className={[
                  "cal-day",
                  isActive ? "is-active" : "",
                  isSelected ? "is-selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
