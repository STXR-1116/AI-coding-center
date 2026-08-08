import { useState, type CSSProperties } from 'react'
import { LoaderCircle, LogIn } from 'lucide-react'
import { Button } from '../components/ui'
import { login } from '../api/auth'

const pageStyle: CSSProperties = {
  minHeight: '100dvh',
  display: 'grid',
  placeItems: 'center',
  padding: '32px 20px',
  background: 'var(--canvas)',
}

const cardStyle: CSSProperties = {
  width: '100%',
  maxWidth: 384,
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
  padding: '34px 30px 30px',
  borderRadius: 'var(--radius-panel)',
  background: 'var(--surface-strong)',
  border: '1px solid var(--line)',
  boxShadow: 'var(--shadow)',
}

const brandStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 12,
  textAlign: 'center',
}

const brandMarkStyle: CSSProperties = {
  width: 52,
  height: 52,
  display: 'grid',
  placeItems: 'center',
  borderRadius: 'var(--radius-control)',
  background: 'var(--emerald-soft)',
}

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const inputStyle: CSSProperties = {
  width: '100%',
  height: 42,
  padding: '0 14px',
  borderRadius: 'var(--radius-control)',
  border: '1px solid var(--line-strong)',
  background: 'var(--surface-solid)',
  color: 'var(--text)',
  font: 'inherit',
  fontSize: 15,
}

const errorStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  color: 'var(--red)',
  fontSize: 13,
  lineHeight: 1.4,
  minHeight: 18,
}

export function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      await login(username.trim(), password)
      window.location.href = '/tasks'
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请稍后重试。')
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page" style={pageStyle}>
      <form className="login-card" style={cardStyle} onSubmit={handleSubmit}>
        <div className="login-brand" style={brandStyle}>
          <span className="login-mark" style={brandMarkStyle}>
            <img src="/coding-center-mark.svg" alt="" width={30} height={30} />
          </span>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>CodingCenter</h1>
        </div>

        <label className="login-field" style={fieldStyle}>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>用户名</span>
          <input
            style={inputStyle}
            type="text"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="请输入用户名"
            required
            disabled={submitting}
          />
        </label>

        <label className="login-field" style={fieldStyle}>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>密码</span>
          <input
            style={inputStyle}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="请输入密码"
            required
            disabled={submitting}
          />
        </label>

        <div className="login-error" style={errorStyle} role={error ? 'alert' : undefined}>
          {error ? error : null}
        </div>

        <Button
          type="submit"
          variant="primary"
          size="md"
          icon={submitting ? <LoaderCircle size={15} className="spin" /> : <LogIn size={15} />}
          disabled={submitting}
        >
          {submitting ? '登录中…' : '登录'}
        </Button>
      </form>
    </main>
  )
}

export default LoginPage
