/**
 * FILE: app/superAdmin/(protected)/settings/booking-rules/RuleDatesCalendar.jsx
 * ROLE: Super-admin only — used inside BookingRuleForm.jsx's Section 1
 *
 * PURPOSE:
 * Month-grid calendar where the admin clicks date(s) to pick which
 * specific calendar dates a rule set applies to. Selecting exactly one
 * date puts Section 1 in "Rule 1" mode (choose a booking type); selecting
 * two or more puts it in "Rule 2" mode (customized overnight + hourly
 * charge). Adapted from the existing single-purpose
 * AvailabilityCalendarClient month-grid pattern, generalized here for
 * plain multi-select instead of blackout-toggle.
 *
 * DATA FLOW:
 * 1. Parent (BookingRuleForm) owns the selected dates as a Set of
 *    "YYYY-MM-DD" strings and passes it down with onToggleDate.
 * 2. Clicking a day calls onToggleDate(dateKey) — parent adds/removes it,
 *    or (per its own anchor+range logic) fills in every date between
 *    the previous single selection and this click.
 * 3. Parent watches the Set's size to decide which fields to render below.
 * 4. Past dates (before today) are rendered dark gray and are not
 *    clickable — a rule set can never be scheduled for a date that has
 *    already passed.
 */
"use client";

import { useState } from "react";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * toDateKey
 * Formats a Date as "YYYY-MM-DD" — matches the key format stored in
 * the parent's selectedDates Set and the ruleDates DB column.
 */
export function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * getDateRangeKeys
 * Given two "YYYY-MM-DD" keys in any order, returns every date key from
 * the earlier one to the later one, inclusive. Used by the parent form
 * to fill in a full range when the admin clicks a second date (e.g.
 * clicking July 1 then July 5 selects July 1-5, all 5 days).
 */
export function getDateRangeKeys(keyA, keyB) {
  const [startKey, endKey] = [keyA, keyB].sort();
  const [startYear, startMonth, startDay] = startKey.split("-").map(Number);
  const [endYear, endMonth, endDay] = endKey.split("-").map(Number);
  const cursor = new Date(startYear, startMonth - 1, startDay);
  const end = new Date(endYear, endMonth - 1, endDay);

  const keys = [];
  while (cursor <= end) {
    keys.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

export default function RuleDatesCalendar({ selectedDates, onToggleDate }) {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = firstOfMonth.getDay();

  const cells = [];
  for (let i = 0; i < leadingBlanks; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(year, month, day));

  const monthLabel = visibleMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Today, normalized to midnight, so "past" means strictly before
  // today — today itself remains selectable.
  const todayKey = toDateKey(new Date());

  return (
    <div className="bookingRulesCalendarCard">
      <div className="bookingRulesCalendarNavRow">
        <button
          type="button"
          className="bookingRulesButton bookingRulesButton--neutral"
          onClick={() => setVisibleMonth(new Date(year, month - 1, 1))}
          aria-label="Previous month"
        >
          ← Prev
        </button>
        <h3 className="bookingRulesCalendarMonthLabel">{monthLabel}</h3>
        <button
          type="button"
          className="bookingRulesButton bookingRulesButton--neutral"
          onClick={() => setVisibleMonth(new Date(year, month + 1, 1))}
          aria-label="Next month"
        >
          Next →
        </button>
      </div>

      <div className="bookingRulesCalendarWeekdayRow">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="bookingRulesCalendarWeekdayLabel">{label}</span>
        ))}
      </div>

      <div className="bookingRulesCalendarGrid">
        {cells.map((date, index) => {
          if (!date) return <span key={`blank-${index}`} className="bookingRulesCalendarCell bookingRulesCalendarCell--blank" />;

          const dateKey = toDateKey(date);
          const isSelected = selectedDates.has(dateKey);
          const isPast = dateKey < todayKey;

          return (
            <button
              key={dateKey}
              type="button"
              disabled={isPast}
              className={`bookingRulesCalendarCell${isSelected ? " bookingRulesCalendarCell--selected" : ""}${isPast ? " bookingRulesCalendarCell--past" : ""}`}
              onClick={() => !isPast && onToggleDate(dateKey)}
              title={isPast ? "Past date — cannot be selected" : isSelected ? "Selected — click to remove" : "Click to select this date"}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>

      <p className="bookingRulesHint">
        {selectedDates.size === 0 && "Pumili ng isa o higit pang petsa sa itaas para simulan ang rule."}
        {selectedDates.size === 1 && "1 petsa napili — piliin ang uri ng booking sa baba."}
        {selectedDates.size > 1 && `${selectedDates.size} na petsa napili — customized overnight na may hourly charge ang mode.`}
      </p>
    </div>
  );
}