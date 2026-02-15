import { useState, useEffect, useRef } from 'react';
import './CalendarDropdown.css';

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface CalendarDropdownProps {
  onClose: () => void;
}

export function CalendarDropdown({ onClose }: CalendarDropdownProps) {
  const [viewDate, setViewDate] = useState(() => new Date());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    setTimeout(() => document.addEventListener('mousedown', handleClick), 10);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const today = new Date();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells: { day: number; isCurrentMonth: boolean; isToday: boolean }[] = [];

  // Previous month trailing days
  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, isCurrentMonth: false, isToday: false });
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday =
      d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
    cells.push({ day: d, isCurrentMonth: true, isToday });
  }

  // Next month leading days
  const remaining = 42 - cells.length; // 6 rows × 7
  for (let d = 1; d <= remaining; d++) {
    cells.push({ day: d, isCurrentMonth: false, isToday: false });
  }

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  return (
    <div ref={ref} className="calendar-dropdown">
      <div className="calendar-dropdown__header">
        <span className="calendar-dropdown__month">
          {MONTHS[month]} {year}
        </span>
        <div className="calendar-dropdown__nav">
          <button className="calendar-dropdown__nav-btn" onClick={prevMonth}>‹</button>
          <button className="calendar-dropdown__nav-btn" onClick={nextMonth}>›</button>
        </div>
      </div>
      <div className="calendar-dropdown__grid">
        {DAYS_OF_WEEK.map((d) => (
          <span key={d} className="calendar-dropdown__dow">{d}</span>
        ))}
        {cells.map((cell, i) => (
          <button
            key={i}
            className={`calendar-dropdown__day ${cell.isToday ? 'calendar-dropdown__day--today' : ''
              } ${!cell.isCurrentMonth ? 'calendar-dropdown__day--other' : ''}`}
          >
            {cell.day}
          </button>
        ))}
      </div>
    </div>
  );
}
