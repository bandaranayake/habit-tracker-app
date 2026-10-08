import React, { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from './ui/input'
import { errorMessage, habitAPI } from '@/lib/native'

interface LockScreenProps {
  onUnlock: () => void
}

const MIN_PASSWORD_LENGTH = 8

const LockScreen: React.FC<LockScreenProps> = ({ onUnlock }) => {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'create' | 'unlock' | null>(null)

  React.useEffect(() => {
    ;(async (): Promise<void> => {
      const saltExists = await habitAPI.saltExists()
      const dbExists = await habitAPI.dbExists()

      if (dbExists && saltExists) {
        setMode('unlock')
      } else {
        setMode('create')
      }
    })()
  }, [])

  const handleCreate = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    try {
      setLoading(true)
      const { success, error } = await habitAPI.createDatabase(password)

      if (success) {
        setError('')
        onUnlock()
      } else {
        setError(error ?? 'Failed to create database')
      }
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to create database'))
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
      const { success, error } = await habitAPI.unlockDatabase(password)

      if (success) {
        setError('')
        onUnlock()
      } else {
        setError(error ?? 'Failed to open database')
      }
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to open database'))
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
              <p className="text-muted-foreground text-xs text-center">
                Your data is encrypted with this password and cannot be recovered if you forget it.
              </p>
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
