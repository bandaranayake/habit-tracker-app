/**
 * Local-time date helpers. All storage/lookup keys use the `"YYYY-MM-DD"` form
 * produced by `formatDate`, computed from the machine's local calendar day.
 */
import { DateFormatPreference } from './constant'

export const startOfDay = (date: Date): Date => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export const formatDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Human-readable date, in the user's chosen `dateFormat` (defaults to the long form). */
export const formatDisplayDate = (
  date: Date,
  dateFormat: DateFormatPreference = 'long'
): string => {
  switch (dateFormat) {
    case 'iso':
      return formatDate(date)
    case 'us':
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'numeric',
        day: 'numeric',
        year: 'numeric'
      })
    case 'eu':
      return date.toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'numeric',
        year: 'numeric'
      })
    case 'long':
    default:
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
  }
}

export const isToday = (date: Date): boolean => {
  return isSameDate(date, new Date())
}

export const isFutureDate = (date: Date): boolean => {
  return startOfDay(date).getTime() > startOfDay(new Date()).getTime()
}

export const isSameDate = (date1: Date | null, date2: Date): boolean => {
  if (!date1) return false
  return formatDate(date1) === formatDate(date2)
}

/** Whole calendar days from `from` to `to` (can be negative). */
export const daysBetween = (from: Date, to: Date): number => {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000)
}

/**
 * Local midnight of the first day of `date`'s week, per `firstDayOfWeek`
 * (0 = Sunday, 1 = Monday, ... - matches `Date#getDay()`; defaults to Sunday).
 */
export const startOfWeek = (date: Date, firstDayOfWeek = 0): Date => {
  const d = startOfDay(date)
  const diff = (d.getDay() - firstDayOfWeek + 7) % 7
  d.setDate(d.getDate() - diff)
  return d
}

/** `"YYYY-MM-DD"` key for the day that starts `date`'s week. */
export const weekKey = (date: Date, firstDayOfWeek = 0): string =>
  formatDate(startOfWeek(date, firstDayOfWeek))

/**
 * The cells of a month grid: leading `null`s to pad to the first weekday
 * (per `firstDayOfWeek`), then one `Date` per day of the month.
 */
export const getDaysInMonth = (date: Date, firstDayOfWeek = 0): (Date | null)[] => {
  const year = date.getFullYear()
  const month = date.getMonth()
  const startingDayOfWeek = (new Date(year, month, 1).getDay() - firstDayOfWeek + 7) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const days: (Date | null)[] = []
  for (let i = 0; i < startingDayOfWeek; i++) {
    days.push(null)
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(year, month, i))
  }

  return days
}

export const getLocaleDateString = (date: Date): string => {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export const getAdjacentMonth = (date: Date, direction: 'prev' | 'next'): Date => {
  const newDate = new Date(date)
  newDate.setDate(1)
  newDate.setMonth(date.getMonth() + (direction === 'prev' ? -1 : 1))
  return newDate
}
