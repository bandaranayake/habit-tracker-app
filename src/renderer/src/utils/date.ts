import moment from 'moment'

export const formatDate = (date: Date): string => {
  return moment(date).format('YYYY-MM-DD')
}

export const formatDisplayDate = (date: Date): string => {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

export const isToday = (date: Date): boolean => {
  const today = new Date()
  return date.toDateString() === today.toDateString()
}

export const isFutureDate = (date: Date): boolean => {
  return date.getTime() > new Date().getTime()
}

export const isSameDate = (date1: Date | null, date2: Date): boolean => {
  if (!date1) return false
  return date1.toDateString() === date2.toDateString()
}

export const getDaysInMonth = (date: Date): (Date | null)[] => {
  const days: (Date | null)[] = []
  const mDate = moment(date).startOf('month')
  const daysInMonth = mDate.daysInMonth()
  const startingDayOfWeek = mDate.day()

  for (let i = 0; i < startingDayOfWeek; i++) {
    days.push(null)
  }
  for (let i = 0; i < daysInMonth; i++) {
    days.push(mDate.clone().add(i, 'days').toDate())
  }

  return days
}

export const getLocaleDateString = (date: Date): string => {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export const getAdjacentMonth = (date: Date, direction: 'prev' | 'next'): Date => {
  const newDate = new Date(date)
  if (direction === 'prev') {
    newDate.setMonth(date.getMonth() - 1)
  } else {
    newDate.setMonth(date.getMonth() + 1)
  }
  return newDate
}
