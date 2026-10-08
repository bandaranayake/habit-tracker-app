import { FormEvent, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useSettings } from '@/context/SettingsContext'
import { DATE_FORMAT_OPTIONS, FIRST_DAY_OF_WEEK_OPTIONS, THEME_OPTIONS } from '@/utils/constant'
import { errorMessage, habitAPI } from '@/lib/native'

const MIN_PASSWORD_LENGTH = 8

interface SettingsViewProps {
  onBack: () => void
}

/** Full-page settings screen: appearance, calendar preferences, and re-keying the database. */
export const SettingsView = ({ onBack }: SettingsViewProps): JSX.Element => {
  const { theme, setTheme, firstDayOfWeek, setFirstDayOfWeek, dateFormat, setDateFormat } =
    useSettings()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)

  const handleChangePassword = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess(false)

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match')
      return
    }

    try {
      setChangingPassword(true)
      const { success, error } = await habitAPI.changePassword(currentPassword, newPassword)
      if (success) {
        setPasswordSuccess(true)
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        setPasswordError(error ?? 'Failed to change password')
      }
    } catch (err: unknown) {
      setPasswordError(errorMessage(err, 'Failed to change password'))
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <h2 className="text-xl font-semibold">Settings</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-medium mb-2">Theme</p>
          <div className="flex gap-2">
            {THEME_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={theme === opt.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTheme(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Calendar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">First day of week</p>
            <div className="flex gap-2">
              {FIRST_DAY_OF_WEEK_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  variant={firstDayOfWeek === opt.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFirstDayOfWeek(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium mb-2">Date format</p>
            <div className="flex flex-wrap gap-2">
              {DATE_FORMAT_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  variant={dateFormat === opt.value ? 'default' : 'outline'}
                  size="sm"
                  title={opt.sample}
                  onClick={() => setDateFormat(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Change Password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="flex flex-col gap-3 max-w-sm">
            <Input
              type="password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={changingPassword}
            />
            <Input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={changingPassword}
            />
            <Input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={changingPassword}
            />
            {passwordError && <div className="text-destructive text-sm">{passwordError}</div>}
            {passwordSuccess && (
              <div className="text-sm text-green-600">Password changed successfully.</div>
            )}
            <Button type="submit" disabled={changingPassword} className="w-full">
              {changingPassword ? 'Changing...' : 'Change Password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
