import { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useApp } from '../context/AppContext';

export default function EditProjectScreen() {
  const { setScreen, selectedProjectId, projects } = useApp();
  const project = projects.find(p => p.id === selectedProjectId);

  const [name, setName] = useState('');
  const [qty, setQty] = useState(10);
  const [client, setClient] = useState('');
  const [model, setModel] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  useEffect(() => {
    if (project) {
      setName(project.name ?? '');
      setQty(project.qty ?? 10);
      setClient(project.client ?? '');
      setModel(project.model ?? '');
      setNotes(project.notes ?? '');
    }
  }, [project]);

  if (!project) {
    return (
      <div className="screen active">
        <div className="topbar">
          <button className="back-btn" onClick={() => setScreen('project-detail')}>←</button>
          <span className="topbar-title">Editar proyecto</span>
        </div>
        <div className="empty">
          <div className="empty-icon">⚠️</div>
          <div className="empty-text">Proyecto no encontrado</div>
        </div>
      </div>
    );
  }

  async function handleSave() {
    if (!name.trim()) { setError('El nombre es obligatorio'); return; }
    if (!selectedProjectId) return;
    setSaving(true);
    setError('');
    try {
      await updateDoc(doc(db, 'projects', selectedProjectId), {
        name: name.trim(),
        qty,
        client: client.trim(),
        model: model.trim(),
        notes: notes.trim(),
      });
      setScreen('project-detail');
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function handleClose() {
    if (!selectedProjectId) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'projects', selectedProjectId), { status: 'closed' });
      setScreen('admin');
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Error al cerrar');
    } finally {
      setSaving(false);
      setShowCloseConfirm(false);
    }
  }

  return (
    <div className="screen active">
      <div className="topbar">
        <button className="back-btn" onClick={() => setScreen('project-detail')}>←</button>
        <span className="topbar-title">Editar proyecto</span>
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
            />
          </div>

          <div className="field">
            <label>Modelo</label>
            <input
              type="text"
              value={model}
              onChange={e => setModel(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Notas</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={4}
            />
          </div>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>

        <div className="divider" />

        <button
          className="btn"
          style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}
          onClick={() => setShowCloseConfirm(true)}
          disabled={saving}
        >
          🔒 Cerrar proyecto
        </button>
      </div>

      {/* Confirm close modal */}
      <div className={`modal-overlay${showCloseConfirm ? ' open' : ''}`} onClick={() => setShowCloseConfirm(false)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-title">¿Cerrar proyecto?</div>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '8px 0 20px' }}>
            El proyecto se marcará como cerrado y no aparecerá en la lista activa. Esta acción se puede revertir.
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn"
              style={{ flex: 1 }}
              onClick={() => setShowCloseConfirm(false)}
            >
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 1, background: '#dc2626' }}
              onClick={handleClose}
              disabled={saving}
            >
              {saving ? 'Cerrando...' : 'Sí, cerrar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
