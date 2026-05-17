import { useState } from 'react';
import { useApp } from '../context/AppContext';

export function LoginScreen() {
  const { login, setScreen } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'operator'>('admin');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) { setError('Completá todos los campos'); return; }
    setLoading(true);
    try {
      await login(email, password, role);
    } catch (e: any) {
      setError(e.code === 'auth/invalid-credential' ? 'Email o contraseña incorrectos' : e.message);
      setLoading(false);
    }
  }

  return (
    <div className="screen active">
      <div className="login-wrap">
        <div className="login-logo">
          <div style={{ margin: '0 auto 8px', width: 200 }}>
            <div className="login-logo-mark">
              <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <div className="login-app-name" style={{ fontFamily: 'DM Sans, sans-serif' }}>Dragonfly</div>
          </div>
          <div className="login-tagline">Sistema de producción artesanal</div>
        </div>

        <div className="role-switch">
          <button className={`role-opt${role === 'admin' ? ' active' : ''}`} onClick={() => setRole('admin')}>
            Encargado
          </button>
          <button className={`role-opt${role === 'operator' ? ' active' : ''}`} onClick={() => setRole('operator')}>
            Operario
          </button>
        </div>

        {error && <div className="error-msg show">{error}</div>}

        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" />
        </div>
        <div className="field">
          <label>Contraseña</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
        </div>
        <button className="btn btn-primary" onClick={handleLogin} disabled={loading}>
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>

        <div style={{ marginTop: 28, padding: 14, background: 'var(--surface2)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
          ¿Primera vez?{' '}
          <span style={{ color: 'var(--teal)', cursor: 'pointer', fontWeight: 600 }} onClick={() => setScreen('register')}>
            Crear cuenta
          </span>
        </div>
      </div>
    </div>
  );
}
