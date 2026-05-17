import { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useApp } from '../context/AppContext';

export default function NewOrderScreen() {
  const { setScreen } = useApp();
  const [name, setName] = useState('');
  const [qty, setQty] = useState(10);
  const [client, setClient] = useState('');
  const [model, setModel] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!name.trim()) { setError('El nombre es obligatorio'); return; }
    setSaving(true);
    setError('');
    try {
      await addDoc(collection(db, 'projects'), {
        name: name.trim(),
        qty,
        client: client.trim(),
        model: model.trim(),
        notes: notes.trim(),
        status: 'active',
        createdAt: serverTimestamp(),
      });
      setScreen('admin');
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="screen active">
      <div className="topbar">
        <button className="back-btn" onClick={() => setScreen('admin')}>←</button>
        <span className="topbar-title">Nueva orden</span>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {error && (
          <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px 12px', borderRadius: '8px', fontSize: '14px' }}>
            {error}
          </div>
        )}

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="field">
            <label>Nombre del lote / orden *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ej: Lote Junio 2025"
            />
          </div>

          <div className="field">
            <label>Cantidad de tablas</label>
            <input
              type="number"
              value={qty}
              min={1}
              max={500}
              onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
            />
          </div>

          <div className="field">
            <label>Cliente</label>
            <input
              type="text"
              value={client}
              onChange={e => setClient(e.target.value)}
              placeholder="Nombre del cliente"
            />
          </div>

          <div className="field">
            <label>Modelo</label>
            <input
              type="text"
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder="Ej: Shortboard 6'2"
            />
          </div>

          <div className="field">
            <label>Notas</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Observaciones adicionales..."
              rows={4}
            />
          </div>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
          style={{ marginTop: '8px' }}
        >
          {saving ? 'Guardando...' : 'Crear orden'}
        </button>
      </div>
    </div>
  );
}
