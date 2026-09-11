import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react'
import {
  DateFormatPreference,
  DEFAULT_DATE_FORMAT,
  DEFAULT_FIRST_DAY_OF_WEEK,
  DEFAULT_THEME,
  SETTINGS_KEYS,
  ThemePreference
} from '@/utils/constant'

interface SettingsContextValue {
  theme: ThemePreference
  firstDayOfWeek: number
  dateFormat: DateFormatPreference
  /** False until the persisted settings have been fetched at least once. */
  isLoaded: boolean
  setTheme: (theme: ThemePreference) => void
  setFirstDayOfWeek: (day: number) => void
  setDateFormat: (format: DateFormatPreference) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

const isThemePreference = (value: string): value is ThemePreference =>
  value === 'light' || value === 'dark' || value === 'system'

const isDateFormatPreference = (value: string): value is DateFormatPreference =>
  value === 'long' || value === 'iso' || value === 'us' || value === 'eu'

/** Apply (or remove) the `.dark` class that the Tailwind palette keys off. */
const applyDarkClass = (dark: boolean): void => {
  document.documentElement.classList.toggle('dark', dark)
}

/**
 * Loads app preferences from the main-process `settings` table once (mounted
 * only after the database is unlocked) and keeps the `.dark` class on
 * `<html>` in sync with the theme preference, including live OS theme changes
 * while "system" is selected.
 */
export const SettingsProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const [theme, setThemeState] = useState<ThemePreference>(DEFAULT_THEME)
  const [firstDayOfWeek, setFirstDayOfWeekState] = useState(DEFAULT_FIRST_DAY_OF_WEEK)
  const [dateFormat, setDateFormatState] = useState<DateFormatPreference>(DEFAULT_DATE_FORMAT)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.habitAPI
      .getAllSettings()
      .then((all) => {
        if (cancelled) return
        const savedTheme = all[SETTINGS_KEYS.theme]
        if (savedTheme && isThemePreference(savedTheme)) setThemeState(savedTheme)
        const savedFirstDay = all[SETTINGS_KEYS.firstDayOfWeek]
        if (savedFirstDay != null) setFirstDayOfWeekState(Number(savedFirstDay))
        const savedFormat = all[SETTINGS_KEYS.dateFormat]
        if (savedFormat && isDateFormatPreference(savedFormat)) setDateFormatState(savedFormat)
      })
      .catch((error) => console.error(error))
      .finally(() => {
        if (!cancelled) setIsLoaded(true)
      })
    return (): void => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (theme === 'system') {
      const media = window.matchMedia('(prefers-color-scheme: dark)')
      applyDarkClass(media.matches)
      const onChange = (e: MediaQueryListEvent): void => applyDarkClass(e.matches)
      media.addEventListener('change', onChange)
      return (): void => media.removeEventListener('change', onChange)
    }
    applyDarkClass(theme === 'dark')
    return undefined
  }, [theme])

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next)
    window.habitAPI.setSetting(SETTINGS_KEYS.theme, next).catch((error) => console.error(error))
  }, [])

  const setFirstDayOfWeek = useCallback((next: number) => {
    setFirstDayOfWeekState(next)
    window.habitAPI
      .setSetting(SETTINGS_KEYS.firstDayOfWeek, String(next))
      .catch((error) => console.error(error))
  }, [])

  const setDateFormat = useCallback((next: DateFormatPreference) => {
    setDateFormatState(next)
    window.habitAPI
      .setSetting(SETTINGS_KEYS.dateFormat, next)
      .catch((error) => console.error(error))
  }, [])

  const value = useMemo<SettingsContextValue>(
    () => ({
      theme,
      firstDayOfWeek,
      dateFormat,
      isLoaded,
      setTheme,
      setFirstDayOfWeek,
      setDateFormat
    }),
    [theme, firstDayOfWeek, dateFormat, isLoaded, setTheme, setFirstDayOfWeek, setDateFormat]
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export const useSettings = (): SettingsContextValue => {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider')
  return ctx
}
