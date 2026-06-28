interface FieldProps {
  label: string
  error?: string
  children: React.ReactNode
}

export function Field({ label, error, children }: FieldProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', letterSpacing: '.4px', textTransform: 'uppercase' }}>
        {label}
      </label>
      {children}
      {error && <span style={{ fontSize: 11, color: 'var(--amber-text)' }}>{error}</span>}
    </div>
  )
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean
}

export function Input({ mono, style, ...props }: InputProps) {
  return (
    <input
      {...props}
      style={{
        background: 'var(--bg-2)', border: '1px solid var(--border-2)',
        borderRadius: 8, color: 'var(--ink-1)', padding: '10px 12px',
        fontSize: 14, outline: 'none', width: '100%',
        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-ui)',
        ...style,
      }}
    />
  )
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export function Select({ style, children, ...props }: SelectProps) {
  return (
    <select
      {...props}
      style={{
        background: 'var(--bg-2)', border: '1px solid var(--border-2)',
        borderRadius: 8, color: 'var(--ink-1)', padding: '10px 12px',
        fontSize: 14, outline: 'none', width: '100%',
        fontFamily: 'var(--font-ui)', appearance: 'none',
        backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\'%3E%3Cpath d=\'M1 1l5 5 5-5\' stroke=\'%238892a8\' stroke-width=\'1.5\' fill=\'none\'/%3E%3C/svg%3E")',
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
        ...style,
      }}
    >
      {children}
    </select>
  )
}

interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger'
  fullWidth?: boolean
}

export function Btn({ variant = 'primary', fullWidth, style, children, ...props }: BtnProps) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: 'var(--amber)', color: '#000', border: 'none' },
    secondary: { background: 'var(--bg-3)', color: 'var(--ink-2)', border: '1px solid var(--border-2)' },
    danger: { background: 'var(--bg-3)', color: '#ef4444', border: '1px solid #7f1d1d' },
  }
  return (
    <button
      {...props}
      style={{
        padding: '12px 0', borderRadius: 10, fontSize: 14, fontWeight: 700,
        cursor: props.disabled ? 'default' : 'pointer', fontFamily: 'var(--font-ui)',
        width: fullWidth ? '100%' : undefined, opacity: props.disabled ? .5 : 1,
        transition: 'opacity .15s',
        ...styles[variant], ...style,
      }}
    >
      {children}
    </button>
  )
}
