import { useState } from 'react';
import { useApp } from '../context/AppContext';

export function RegisterScreen() {
  const { register, setScreen } = useApp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('operator');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (!name || !email || !password) { setError('Completá todos los campos'); return; }
    setLoading(true);
    try {
      await register(name, email, password, role);
    } catch (e: any) {
      setError(e.code === 'auth/email-already-in-use' ? 'Este email ya está registrado' : e.message);
      setLoading(false);
    }
  }

  return (
    <div className="screen active">
      <div className="topbar">
        <button className="back-btn" onClick={() => setScreen('login')}>←</button>
        <div className="topbar-info">
          <div className="topbar-title">Nueva cuenta</div>
        </div>
      </div>
      <div className="scroll">
        {error && <div className="error-msg show">{error}</div>}
        <div className="field"><label>Nombre completo</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Juan García" /></div>
        <div className="field"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" /></div>
        <div className="field"><label>Contraseña</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" /></div>
        <div className="field">
          <label>Rol</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="operator">Operario</option>
            <option value="admin">Encargado</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={handleRegister} disabled={loading}>
          {loading ? 'Creando cuenta...' : 'Crear cuenta'}
        </button>
      </div>
    </div>
  );
}
