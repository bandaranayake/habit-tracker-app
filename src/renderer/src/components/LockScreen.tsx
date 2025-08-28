import React, { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from './ui/input'

interface LockScreenProps {
  onUnlock: () => void
}

const LockScreen: React.FC<LockScreenProps> = ({ onUnlock }) => {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'create' | 'unlock' | null>(null)

  React.useEffect(() => {
    ; (async (): Promise<void> => {
      const saltExists = await window.habitAPI.saltExists()
      const dbExists = await window.habitAPI.dbExists()

      if (!saltExists && !dbExists) {
        setMode('create')
      } else if (saltExists) {
        setMode('unlock')
      }
    })()
  }, [])

  const handleCreate = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()

    if (!password) {
      setError('Password cannot be empty')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    try {
      setLoading(true)

      await window.habitAPI.createSalt()

      const key = await window.habitAPI.deriveKey(password)
      if (!key) throw new Error('Failed to derive key')

      const { success, error } = await window.habitAPI.createEncryptedDb(key)

      if (success) {
        setError('')
        onUnlock()
      } else {
        setError(error ?? 'Failed to create database')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create database')
    } finally {
      setLoading(false)
    }
  }

  const handleUnlock = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()

    if (!password) {
      setError('Password cannot be empty')
      return
    }

    try {
      setLoading(true)

      const key = await window.habitAPI.deriveKey(password)
      if (!key) throw new Error('Failed to derive key')

      const { success, error } = await window.habitAPI.openEncryptedDb(key)

      if (success) {
        setError('')
        onUnlock()
      } else {
        setError(error ?? 'Failed to open database')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to open database')
    } finally {
      setLoading(false)
    }
  }

  if (!mode) return null

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center">
            {mode === 'create' ? 'Create Password' : 'Unlock App'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {mode === 'create' ? (
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <Input
                type="password"
                placeholder="Create password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                disabled={loading}
              />
              <Input
                type="password"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
              />
              {error && <div className="text-destructive text-sm text-center">{error}</div>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Creating...' : 'Create'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleUnlock} className="flex flex-col gap-4">
              <Input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                disabled={loading}
              />
              {error && <div className="text-destructive text-sm text-center">{error}</div>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Unlocking...' : 'Unlock'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default LockScreen
