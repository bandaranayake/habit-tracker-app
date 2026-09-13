import { useState } from 'react'
import LockScreen from './components/LockScreen'
import { SettingsProvider } from '@/context/SettingsContext'
import AuthenticatedApp from './AuthenticatedApp'

function App(): JSX.Element {
  const [unlocked, setUnlocked] = useState(false)

  if (!unlocked) {
    return <LockScreen onUnlock={() => setUnlocked(true)} />
  }

  // Mounted only after unlock, so it can load settings (and everything that
  // depends on them) without racing the encrypted database being opened.
  return (
    <SettingsProvider>
      <AuthenticatedApp />
    </SettingsProvider>
  )
}

export default App
