import { useState } from 'react';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useApp } from '../context/AppContext';
import { MAT_PRESETS } from '../constants/categories';
import type { Material } from '../types';

export default function MaterialsScreen() {
  const {
    setScreen,
    selectedProjectId,
    projects,
    allMaterials,
    currentUser,
  } = useApp();

  const project = projects.find(p => p.id === selectedProjectId);

  // Modal: add/edit
  const [showModal, setShowModal] = useState(false);
  const [editingMat, setEditingMat] = useState<Material | null>(null);
  const [matPreset, setMatPreset] = useState('');
  const [matCustomName, setMatCustomName] = useState('');
  const [matQty, setMatQty] = useState('');
  const [matUnit, setMatUnit] = useState('u');
  const [matNotes, setMatNotes] = useState('');
  const [matBoardTarget, setMatBoardTarget] = useState('lote');
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null);

  if (!project) {
    return (
      <div className="screen active">
        <div className="topbar">
          <button className="back-btn" onClick={() => setScreen('project-detail')}>←</button>
          <span className="topbar-title">Materiales</span>
        </div>
        <div className="empty">
          <div className="empty-icon">⚠️</div>
          <div className="empty-text">Proyecto no encontrado</div>
        </div>
      </div>
    );
  }

  const projMaterials = allMaterials.filter(m => m.projectId === selectedProjectId);
  const loteMaterials = projMaterials.filter(m => m.boardId === 'lote');

  const boards = Array.from({ length: project.qty }, (_, i) => {
    const boardId = 't' + String(i + 1).padStart(2, '0');
    const mats = projMaterials.filter(m => m.boardId === boardId);
    return { boardId, mats, num: i + 1 };
  }).filter(b => b.mats.length > 0);

  const boardOptions = Array.from({ length: project.qty }, (_, i) => 't' + String(i + 1).padStart(2, '0'));

  function openAddModal() {
    setEditingMat(null);
    setMatPreset('');
    setMatCustomName('');
    setMatQty('');
    setMatUnit('u');
    setMatNotes('');
    setMatBoardTarget('lote');
    setShowModal(true);
  }

  function openEditModal(mat: Material) {
    setEditingMat(mat);
    setMatPreset(MAT_PRESETS.find(p => p.name === mat.name) ? mat.name : 'Otro (especificar)');
    setMatCustomName(MAT_PRESETS.find(p => p.name === mat.name) ? '' : mat.name);
    setMatQty(String(mat.qty));
    setMatUnit(mat.unit);
    setMatNotes(mat.notes ?? '');
    setMatBoardTarget(mat.boardId);
    setShowModal(true);
  }

  async function handleSave() {
    if (!selectedProjectId || !project) return;
    const name = matPreset === 'Otro (especificar)' ? matCustomName.trim() : matPreset;
    if (!name) return;
    setSaving(true);
    try {
      if (editingMat) {
        await updateDoc(doc(db, 'materials', editingMat.id), {
          name,
          qty: parseFloat(matQty) || 0,
          unit: matUnit,
          notes: matNotes.trim(),
          boardId: matBoardTarget,
        });
      } else {
        await addDoc(collection(db, 'materials'), {
          projectId: selectedProjectId,
          projectName: project.name,
          boardId: matBoardTarget,
          name,
          qty: parseFloat(matQty) || 0,
          unit: matUnit,
          notes: matNotes.trim(),
          createdBy: currentUser?.uid ?? '',
          ts: serverTimestamp(),
        });
      }
      setShowModal(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(mat: Material) {
    await deleteDoc(doc(db, 'materials', mat.id));
    setDeleteTarget(null);
  }

  const selectedPreset = MAT_PRESETS.find(p => p.name === matPreset);

  return (
    <div className="screen active">
      <div className="topbar">
        <button className="back-btn" onClick={() => setScreen('project-detail')}>←</button>
        <span className="topbar-title">Materiales · {project.name}</span>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Add button */}
        <button className="btn btn-primary" onClick={openAddModal}>
          + Agregar material
        </button>

        {/* Lot materials */}
        <div>
          <div className="section-title">Materiales del lote</div>
          {loteMaterials.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">📦</div>
              <div className="empty-text">Sin materiales del lote registrados</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {loteMaterials.map(m => (
                <div key={m.id} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '15px' }}>{m.name}</div>
                      <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
                        {m.qty} {m.unit}
                        {m.notes ? ` · ${m.notes}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', marginLeft: '8px' }}>
                      <button
                        className="btn"
                        style={{ padding: '4px 8px', fontSize: '14px' }}
                        onClick={() => openEditModal(m)}
                      >
                        ✏️
                      </button>
                      <button
                        className="btn"
                        style={{ padding: '4px 8px', fontSize: '14px', background: '#fef2f2', color: '#dc2626' }}
                        onClick={() => setDeleteTarget(m)}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Per board summary */}
        {boards.length > 0 && (
          <div>
            <div className="section-title">Por tabla</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {boards.map(b => (
                <div key={b.boardId} className="card">
                  <div style={{ fontWeight: 600, marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Tabla {String(b.num).padStart(2, '0')}</span>
                    <span className="badge">{b.mats.length} ítem{b.mats.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {b.mats.map(m => (
                      <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px' }}>
                        <span style={{ color: '#374151' }}>{m.name}</span>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <span style={{ color: '#64748b' }}>{m.qty} {m.unit}</span>
                          <button
                            className="btn"
                            style={{ padding: '2px 6px', fontSize: '12px' }}
                            onClick={() => openEditModal(m)}
                          >
                            ✏️
                          </button>
                          <button
                            className="btn"
                            style={{ padding: '2px 6px', fontSize: '12px', background: '#fef2f2', color: '#dc2626' }}
                            onClick={() => setDeleteTarget(m)}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {projMaterials.length === 0 && (
          <div className="empty">
            <div className="empty-icon">📦</div>
            <div className="empty-text">Sin materiales registrados para este proyecto</div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <div className={`modal-overlay${showModal ? ' open' : ''}`} onClick={() => setShowModal(false)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div className="modal-title">{editingMat ? 'Editar material' : 'Agregar material'}</div>
            <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="field">
              <label>Material</label>
              <select
                value={matPreset}
                onChange={e => {
                  setMatPreset(e.target.value);
                  const preset = MAT_PRESETS.find(p => p.name === e.target.value);
                  if (preset && preset.name !== 'Otro (especificar)') setMatUnit(preset.unit);
                }}
              >
                <option value="">-- Seleccionar --</option>
                {MAT_PRESETS.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
            </div>

            {matPreset === 'Otro (especificar)' && (
              <div className="field">
                <label>Nombre del material</label>
                <input
                  type="text"
                  value={matCustomName}
                  onChange={e => setMatCustomName(e.target.value)}
                  placeholder="Especificar..."
                />
              </div>
            )}

            <div className="field">
              <label>Asignar a</label>
              <select value={matBoardTarget} onChange={e => setMatBoardTarget(e.target.value)}>
                <option value="lote">Lote completo</option>
                {boardOptions.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <div className="field" style={{ flex: 2 }}>
                <label>Cantidad</label>
                <input
                  type="number"
                  value={matQty}
                  onChange={e => setMatQty(e.target.value)}
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Unidad</label>
                <input
                  type="text"
                  value={selectedPreset && selectedPreset.name !== 'Otro (especificar)' ? selectedPreset.unit : matUnit}
                  onChange={e => setMatUnit(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label>Notas</label>
              <input
                type="text"
                value={matNotes}
                onChange={e => setMatNotes(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn" style={{ flex: 1 }} onClick={() => setShowModal(false)}>
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={handleSave}
              disabled={saving || (!matPreset)}
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirm Modal */}
      <div className={`modal-overlay${deleteTarget ? ' open' : ''}`} onClick={() => setDeleteTarget(null)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-title">¿Eliminar material?</div>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '8px 0 20px' }}>
            Se eliminará <strong>{deleteTarget?.name}</strong> ({deleteTarget?.qty} {deleteTarget?.unit}). Esta acción no se puede deshacer.
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn" style={{ flex: 1 }} onClick={() => setDeleteTarget(null)}>
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 1, background: '#dc2626' }}
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              Eliminar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
