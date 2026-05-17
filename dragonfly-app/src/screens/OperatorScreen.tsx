import { useState, useEffect } from 'react';
import {
  collection,
  addDoc,
  updateDoc,
  setDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useApp } from '../context/AppContext';
import { useTimer, getTimerFromLS } from '../hooks/useTimer';
import { CATEGORIES, CTRL_FIELDS, CTRL_CHECKS, MAT_PRESETS } from '../constants/categories';
import { fmtHours, fmtHora, fmtTime, todayStr } from '../utils/time';
import type { CtrlData } from '../types';

type Tab = 'timer' | 'fichaje' | 'qc' | 'materials';

const STAGES = [
  { key: 'ctrl1', label: 'Pre-cierre', icon: '🔲' },
  { key: 'ctrl2', label: 'Post-cierre', icon: '📦' },
  { key: 'ctrl3', label: 'Post-shape', icon: '🏄' },
  { key: 'ctrl4', label: 'Post-laminación', icon: '✨' },
] as const;

// ---- Fichaje widget ----
interface FichajeWidgetProps {
  operatorId: string;
  operatorName: string;
  allFichajes: import('../types').Fichaje[];
}

function FichajeWidget({ operatorId, operatorName, allFichajes }: FichajeWidgetProps) {
  const today = todayStr();
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState<{ totalSec: number; records: import('../types').Fichaje[] }>({ totalSec: 0, records: [] });

  const todayFichajes = allFichajes.filter(f => f.operatorId === operatorId && f.date === today);
  const openFichaje = todayFichajes.find(f => f.exitTs === null);
  const isIn = !!openFichaje;

  async function handleEntry() {
    await addDoc(collection(db, 'fichajes'), {
      operatorId,
      operatorName,
      date: today,
      entryTs: Date.now(),
      exitTs: null,
      ts: serverTimestamp(),
    });
  }

  async function handleExit() {
    if (!openFichaje) return;
    const now = Date.now();
    await updateDoc(doc(db, 'fichajes', openFichaje.id), { exitTs: now });
    const closed = [
      ...todayFichajes.filter(f => f.id !== openFichaje.id && f.exitTs !== null),
      { ...openFichaje, exitTs: now },
    ];
    const totalSec = closed.reduce((s, f) => s + (f.exitTs ? Math.floor((f.exitTs - f.entryTs) / 1000) : 0), 0);
    setSummaryData({ totalSec, records: closed });
    setShowSummary(true);
  }

  return (
    <>
      <div className="fichaje-card">
        <div className="fichaje-status">
          <div className={`fichaje-dot${isIn ? ' in' : ''}`} />
          <span>{isIn ? 'Jornada iniciada' : 'Sin fichar'}</span>
        </div>
        {openFichaje && (
          <div className="fichaje-time">Entrada: {fmtHora(openFichaje.entryTs)}</div>
        )}
        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
          {!isIn ? (
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleEntry}>Entrada ↗</button>
          ) : (
            <button className="btn" style={{ flex: 1, background: '#fef2f2', color: '#dc2626' }} onClick={handleExit}>Salida ↙</button>
          )}
        </div>
      </div>

      <div className={`modal-overlay${showSummary ? ' open' : ''}`} onClick={() => setShowSummary(false)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-title">Resumen de jornada</div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#1D9E75', textAlign: 'center', margin: '12px 0' }}>
            {fmtTime(summaryData.totalSec)}
          </div>
          {summaryData.records.map((f, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
              <span>{fmtHora(f.entryTs)} → {f.exitTs ? fmtHora(f.exitTs) : '?'}</span>
              <span style={{ color: '#64748b', fontSize: '13px' }}>
                {f.exitTs ? fmtTime(Math.floor((f.exitTs - f.entryTs) / 1000)) : '-'}
              </span>
            </div>
          ))}
          <button className="btn btn-primary" style={{ width: '100%', marginTop: '16px' }} onClick={() => setShowSummary(false)}>
            Cerrar
          </button>
        </div>
      </div>
    </>
  );
}

// ---- Main OperatorScreen ----
export default function OperatorScreen() {
  const {
    currentUser,
    logout,
    projects,
    allTimes,
    allTaskStatuses,
    allBoardSpecs,
    allFichajes,
    allMaterials,
  } = useApp();

  const [tab, setTab] = useState<Tab>('timer');

  // Timer
  const timer = useTimer(false);
  const [timerProjectId, setTimerProjectId] = useState('');
  const [timerBoardId, setTimerBoardId] = useState('');
  const [timerCatId, setTimerCatId] = useState('');
  const [timerTask, setTimerTask] = useState('');
  const [timerNote, setTimerNote] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [todaySavedEntries, setTodaySavedEntries] = useState<import('../types').TimeRecord[]>([]);

  // QC
  const [qcProjectId, setQcProjectId] = useState('');
  const [qcBoardId, setQcBoardId] = useState('');
  const [expandedStage, setExpandedStage] = useState<string | null>(null);
  const [ctrlData, setCtrlData] = useState<Record<string, CtrlData>>({
    ctrl1: {}, ctrl2: {}, ctrl3: {}, ctrl4: {},
  });
  const [qcSaving, setQcSaving] = useState(false);

  // Materials
  const [matProjectId, setMatProjectId] = useState('');
  const [matBoardId, setMatBoardId] = useState('');
  const [showAddMat, setShowAddMat] = useState(false);
  const [matPreset, setMatPreset] = useState('');
  const [matCustomName, setMatCustomName] = useState('');
  const [matQty, setMatQty] = useState('');
  const [matUnit, setMatUnit] = useState('u');
  const [matNotes, setMatNotes] = useState('');

  useEffect(() => {
    const saved = getTimerFromLS(false);
    if (saved) timer.resumeTimer(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load today's entries for current operator
  useEffect(() => {
    if (!currentUser) return;
    const today = todayStr();
    const entries = allTimes.filter(t => {
      if (t.operatorId !== currentUser.uid) return false;
      if (!t.ts) return false;
      return new Date(t.ts.toDate()).toISOString().slice(0, 10) === today;
    });
    setTodaySavedEntries(entries);
  }, [allTimes, currentUser]);

  // Load board spec into ctrlData when qcBoardId changes
  useEffect(() => {
    if (!qcProjectId || !qcBoardId) return;
    const spec = allBoardSpecs.find(s => s.projectId === qcProjectId && s.boardId === qcBoardId);
    if (spec) {
      setCtrlData({
        ctrl1: (spec.ctrl1 as CtrlData) ?? {},
        ctrl2: (spec.ctrl2 as CtrlData) ?? {},
        ctrl3: (spec.ctrl3 as CtrlData) ?? {},
        ctrl4: (spec.ctrl4 as CtrlData) ?? {},
      });
    } else {
      setCtrlData({ ctrl1: {}, ctrl2: {}, ctrl3: {}, ctrl4: {} });
    }
  }, [qcProjectId, qcBoardId, allBoardSpecs]);

  const activeProjects = projects.filter(p => p.status === 'active');
  const today = todayStr();

  // Timer helpers
  const timerProject = activeProjects.find(p => p.id === timerProjectId);
  const timerBoardOptions = timerProject
    ? Array.from({ length: timerProject.qty }, (_, i) => 't' + String(i + 1).padStart(2, '0'))
    : [];
  const timerCat = CATEGORIES.find(c => c.id === timerCatId);

  function getTaskStatus(task: string, catId: string) {
    return allTaskStatuses.find(
      ts => ts.task === task && ts.catId === catId && ts.projectId === timerProjectId && ts.boardId === timerBoardId
    )?.status ?? 'pending';
  }

  async function handleStopTimer() {
    const result = timer.stopTimer();
    if (!result.seconds || !result.projectId) return;
    const proj = projects.find(p => p.id === result.projectId);
    const ref = await addDoc(collection(db, 'times'), {
      projectId: result.projectId,
      projectName: proj?.name ?? '',
      boardId: result.boardId,
      catId: result.catId,
      task: result.task,
      operatorId: currentUser?.uid ?? '',
      operatorName: currentUser?.name ?? '',
      seconds: result.seconds,
      startTs: result.startTs,
      endTs: Date.now(),
      note: timerNote.trim() || null,
      ts: serverTimestamp(),
    });
    const newEntry = {
      id: ref.id,
      projectId: result.projectId ?? '',
      projectName: proj?.name ?? '',
      boardId: result.boardId ?? '',
      catId: result.catId ?? '',
      task: result.task ?? '',
      operatorId: currentUser?.uid ?? '',
      operatorName: currentUser?.name ?? '',
      seconds: result.seconds,
    } as import('../types').TimeRecord;
    setTodaySavedEntries(prev => [newEntry, ...prev]);
    setTimerNote('');
    setShowNoteInput(false);

    // Update task status to done
    if (result.projectId && result.boardId && result.catId && result.task) {
      const statusId = `${result.projectId}_${result.boardId}_${result.catId}_${result.task}`.replace(/\s+/g, '_');
      await setDoc(doc(db, 'taskStatuses', statusId), {
        task: result.task,
        catId: result.catId,
        projectId: result.projectId,
        boardId: result.boardId,
        status: 'done',
      });
    }
  }

  // QC helpers
  const qcProject = activeProjects.find(p => p.id === qcProjectId);
  const qcBoardOptions = qcProject
    ? Array.from({ length: qcProject.qty }, (_, i) => 't' + String(i + 1).padStart(2, '0'))
    : [];

  function updateCtrl(stageKey: string, fieldId: string, value: string | boolean) {
    setCtrlData(prev => ({
      ...prev,
      [stageKey]: { ...prev[stageKey], [fieldId]: value },
    }));
  }

  async function saveQC() {
    if (!qcProjectId || !qcBoardId) return;
    setQcSaving(true);
    const proj = projects.find(p => p.id === qcProjectId);
    const specId = `${qcProjectId}_${qcBoardId}`;
    await setDoc(doc(db, 'boardSpecs', specId), {
      projectId: qcProjectId,
      boardId: qcBoardId,
      projectName: proj?.name ?? '',
      ctrl1: ctrlData.ctrl1,
      ctrl2: ctrlData.ctrl2,
      ctrl3: ctrlData.ctrl3,
      ctrl4: ctrlData.ctrl4,
    }, { merge: true });
    setQcSaving(false);
  }

  function isStageComplete(stageKey: string): boolean {
    const data = ctrlData[stageKey] ?? {};
    const fieldsFilled = CTRL_FIELDS.every(f => !!data[f.id]);
    const checksDone = CTRL_CHECKS.every(c => !!data[c]);
    return fieldsFilled && checksDone;
  }

  // Materials helpers
  const matProject = activeProjects.find(p => p.id === matProjectId);
  const matBoardOptions = matProject
    ? Array.from({ length: matProject.qty }, (_, i) => 't' + String(i + 1).padStart(2, '0'))
    : [];

  const boardMaterials = allMaterials.filter(
    m => m.projectId === matProjectId && m.boardId === matBoardId
  );

  const selectedPreset = MAT_PRESETS.find(p => p.name === matPreset);

  async function handleAddMaterial() {
    if (!matProjectId || !matBoardId) return;
    const name = matPreset === 'Otro (especificar)' ? matCustomName.trim() : matPreset;
    if (!name) return;
    const proj = projects.find(p => p.id === matProjectId);
    await addDoc(collection(db, 'materials'), {
      projectId: matProjectId,
      projectName: proj?.name ?? '',
      boardId: matBoardId,
      name,
      qty: parseFloat(matQty) || 0,
      unit: matUnit,
      notes: matNotes.trim(),
      createdBy: currentUser?.uid ?? '',
      ts: serverTimestamp(),
    });
    setMatPreset('');
    setMatCustomName('');
    setMatQty('');
    setMatUnit('u');
    setMatNotes('');
    setShowAddMat(false);
  }

  const tabLabels: Record<Tab, string> = {
    timer: 'Timer',
    fichaje: 'Fichaje',
    qc: 'QC',
    materials: 'Materiales',
  };

  const myFichajes = allFichajes
    .filter(f => f.operatorId === currentUser?.uid && f.date === today)
    .sort((a, b) => b.entryTs - a.entryTs);

  return (
    <div className="screen active">
      <div className="topbar">
        <span className="topbar-title">{tabLabels[tab]}</span>
        <button className="btn" style={{ padding: '4px 10px', fontSize: '13px' }} onClick={logout}>
          Salir
        </button>
      </div>

      <div className="scroll" style={{ paddingBottom: '80px' }}>
        {/* ===== TAB: TIMER ===== */}
        {tab === 'timer' && (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="field">
                <label>Proyecto</label>
                <select
                  value={timerProjectId}
                  onChange={e => { setTimerProjectId(e.target.value); setTimerBoardId(''); setTimerCatId(''); setTimerTask(''); }}
                  disabled={timer.running}
                >
                  <option value="">-- Seleccionar --</option>
                  {activeProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              {timerProjectId && (
                <div className="field">
                  <label>Tabla</label>
                  <select
                    value={timerBoardId}
                    onChange={e => { setTimerBoardId(e.target.value); setTimerCatId(''); setTimerTask(''); }}
                    disabled={timer.running}
                  >
                    <option value="">-- Seleccionar --</option>
                    {timerBoardOptions.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              )}
            </div>

            {timerBoardId && !timer.running && (
              <div>
                <div className="section-title">Categoría</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      className="cat-btn"
                      style={{ borderColor: timerCatId === cat.id ? cat.color : 'transparent', borderWidth: 2, borderStyle: 'solid' }}
                      onClick={() => { setTimerCatId(cat.id); setTimerTask(''); }}
                    >
                      <span className="cat-dot" style={{ background: cat.color }} />
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {timerCatId && timerCat && !timer.running && (
              <div>
                <div className="section-title">Tarea</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {timerCat.tasks.map(t => {
                    const status = getTaskStatus(t.name, timerCatId);
                    const statusClass = status === 'done' ? 'status-done' : status === 'inprogress' ? 'status-inprogress' : 'status-pending';
                    return (
                      <div
                        key={t.name}
                        className="task-row"
                        style={{
                          cursor: 'pointer',
                          background: timerTask === t.name ? '#f0fdf4' : undefined,
                          border: timerTask === t.name ? '1px solid #1D9E75' : '1px solid transparent',
                          borderRadius: '8px',
                          padding: '8px',
                        }}
                        onClick={() => status !== 'done' && setTimerTask(t.name)}
                      >
                        <span className={`status-dot ${statusClass}`} />
                        <span className="task-name" style={{ opacity: status === 'done' ? 0.5 : 1 }}>{t.name}</span>
                        <span className="task-time">{t.std}min</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {(timerTask || timer.running) && (
              <div className="timer-wrap">
                <div className="timer-display">{timer.display}</div>
                {timer.running && (
                  <>
                    <div className="timer-task">{timer.task}</div>
                    <div className="timer-sub">{timer.boardId} · {CATEGORIES.find(c => c.id === timer.catId)?.label}</div>
                  </>
                )}
                {!timer.running && timerTask && (
                  <div className="timer-task">{timerTask}</div>
                )}

                {timer.running && showNoteInput && (
                  <div className="field" style={{ marginTop: '8px' }}>
                    <input
                      type="text"
                      placeholder="Nota..."
                      value={timerNote}
                      onChange={e => setTimerNote(e.target.value)}
                    />
                  </div>
                )}

                <div className="timer-btns">
                  {!timer.running ? (
                    <button
                      className="btn btn-primary"
                      disabled={!timerProjectId || !timerBoardId || !timerCatId || !timerTask}
                      onClick={() => timer.startTimer(timerProjectId, timerBoardId, timerCatId, timerTask)}
                    >
                      ▶ Iniciar
                    </button>
                  ) : (
                    <>
                      <button
                        className="btn"
                        style={{ background: '#f1f5f9', color: '#64748b' }}
                        onClick={() => setShowNoteInput(!showNoteInput)}
                      >
                        📝
                      </button>
                      <button
                        className="btn"
                        style={{ background: '#dc2626', color: '#fff', flex: 1 }}
                        onClick={handleStopTimer}
                      >
                        ⏹ Detener
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Today's entries */}
            <div>
              <div className="section-title">Mis registros de hoy</div>
              {todaySavedEntries.length === 0 ? (
                <div className="empty">
                  <div className="empty-icon">⏱️</div>
                  <div className="empty-text">Sin registros hoy</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {todaySavedEntries.map(e => (
                    <div key={e.id} className="saved-entry">
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: '14px' }}>{e.task}</div>
                        <div className="saved-meta">{e.boardId} · {CATEGORIES.find(c => c.id === e.catId)?.label ?? e.catId}</div>
                        {e.note && <div className="saved-meta">📝 {e.note}</div>}
                      </div>
                      <div style={{ fontWeight: 600, color: '#1D9E75' }}>{fmtHours(e.seconds)}</div>
                    </div>
                  ))}
                  <div style={{ textAlign: 'right', fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                    Total: {fmtHours(todaySavedEntries.reduce((s, e) => s + e.seconds, 0))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== TAB: FICHAJE ===== */}
        {tab === 'fichaje' && (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="section-title">Mi fichaje de hoy</div>
            {currentUser && (
              <FichajeWidget
                operatorId={currentUser.uid}
                operatorName={currentUser.name}
                allFichajes={allFichajes}
              />
            )}

            <div className="section-title">Mis registros</div>
            {myFichajes.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">🕐</div>
                <div className="empty-text">Sin fichajes hoy</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {myFichajes.map(f => (
                  <div key={f.id} className="fichaje-card">
                    <div className="fichaje-time">
                      Entrada: {fmtHora(f.entryTs)}
                      {f.exitTs ? ` · Salida: ${fmtHora(f.exitTs)}` : ' · En jornada'}
                    </div>
                    {f.exitTs && (
                      <div style={{ fontSize: '12px', color: '#1D9E75', marginTop: '2px' }}>
                        {fmtTime(Math.floor((f.exitTs - f.entryTs) / 1000))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== TAB: QC ===== */}
        {tab === 'qc' && (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="field">
                <label>Proyecto</label>
                <select
                  value={qcProjectId}
                  onChange={e => { setQcProjectId(e.target.value); setQcBoardId(''); }}
                >
                  <option value="">-- Seleccionar --</option>
                  {activeProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              {qcProjectId && (
                <div className="field">
                  <label>Tabla</label>
                  <select value={qcBoardId} onChange={e => setQcBoardId(e.target.value)}>
                    <option value="">-- Seleccionar --</option>
                    {qcBoardOptions.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              )}
            </div>

            {qcBoardId && STAGES.map(stage => {
              const complete = isStageComplete(stage.key);
              const isOpen = expandedStage === stage.key;
              return (
                <div key={stage.key} className="spec-stage">
                  <div
                    className="spec-stage-header"
                    onClick={() => setExpandedStage(isOpen ? null : stage.key)}
                    style={{ cursor: 'pointer' }}
                  >
                    <span>{stage.icon} {stage.label}</span>
                    <span className={`badge ${complete ? 'badge-done' : 'badge-pending'}`}>
                      {complete ? 'Completo' : 'Pendiente'}
                    </span>
                  </div>
                  <div className={`spec-stage-body${isOpen ? ' open' : ''}`}>
                    {isOpen && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px' }}>
                        {CTRL_FIELDS.map(f => (
                          <div key={f.id} className="spec-row">
                            <label className="spec-label">{f.label}</label>
                            <input
                              type="number"
                              className="spec-input"
                              value={(ctrlData[stage.key]?.[f.id] as string) ?? ''}
                              onChange={e => updateCtrl(stage.key, f.id, e.target.value)}
                            />
                            <span className="spec-unit">{f.unit}</span>
                          </div>
                        ))}
                        <div className="divider" />
                        {CTRL_CHECKS.map(check => {
                          const checked = !!(ctrlData[stage.key]?.[check]);
                          return (
                            <div
                              key={check}
                              className={`ctrl-check${checked ? ' checked' : ''}`}
                              onClick={() => updateCtrl(stage.key, check, !checked)}
                            >
                              <span>{checked ? '✅' : '⬜'}</span>
                              <span>{check}</span>
                            </div>
                          );
                        })}
                        <div className="field" style={{ marginTop: '6px' }}>
                          <label>Inspector</label>
                          <input
                            type="text"
                            value={(ctrlData[stage.key]?.inspector as string) ?? ''}
                            onChange={e => updateCtrl(stage.key, 'inspector', e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {qcBoardId && (
              <button
                className="btn btn-primary"
                style={{ position: 'sticky', bottom: '16px', width: '100%' }}
                onClick={saveQC}
                disabled={qcSaving}
              >
                {qcSaving ? 'Guardando...' : '💾 Guardar controles'}
              </button>
            )}
          </div>
        )}

        {/* ===== TAB: MATERIALS ===== */}
        {tab === 'materials' && (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="field">
                <label>Proyecto</label>
                <select
                  value={matProjectId}
                  onChange={e => { setMatProjectId(e.target.value); setMatBoardId(''); }}
                >
                  <option value="">-- Seleccionar --</option>
                  {activeProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              {matProjectId && (
                <div className="field">
                  <label>Tabla</label>
                  <select value={matBoardId} onChange={e => setMatBoardId(e.target.value)}>
                    <option value="">-- Seleccionar --</option>
                    {matBoardOptions.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              )}
            </div>

            {matBoardId && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="section-title" style={{ margin: 0 }}>Materiales registrados</div>
                  <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '13px' }} onClick={() => setShowAddMat(true)}>
                    + Agregar
                  </button>
                </div>

                {boardMaterials.length === 0 ? (
                  <div className="empty">
                    <div className="empty-icon">📦</div>
                    <div className="empty-text">Sin materiales registrados</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {boardMaterials.map(m => (
                      <div key={m.id} className="card">
                        <div style={{ fontWeight: 600 }}>{m.name}</div>
                        <div style={{ fontSize: '13px', color: '#64748b' }}>
                          {m.qty} {m.unit}
                          {m.notes ? ` · ${m.notes}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ===== TAB BAR ===== */}
      <div className="tabbar">
        {([
          { id: 'timer', icon: (
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="13" r="8" /><path d="M12 9v4l3 3M9 3h6" />
            </svg>
          ), label: 'Timer' },
          { id: 'fichaje', icon: (
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
          ), label: 'Fichaje' },
          { id: 'qc', icon: (
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
            </svg>
          ), label: 'QC' },
          { id: 'materials', icon: (
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
              <circle cx="7" cy="7" r="1.5" />
            </svg>
          ), label: 'Materiales' },
        ] as { id: Tab; icon: React.ReactNode; label: string }[]).map(t => (
          <button
            key={t.id}
            className={`tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Add material modal */}
      <div className={`modal-overlay${showAddMat ? ' open' : ''}`} onClick={() => setShowAddMat(false)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div className="modal-title">Agregar material</div>
            <button className="modal-close" onClick={() => setShowAddMat(false)}>✕</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="field">
              <label>Material</label>
              <select value={matPreset} onChange={e => {
                setMatPreset(e.target.value);
                const preset = MAT_PRESETS.find(p => p.name === e.target.value);
                if (preset) setMatUnit(preset.unit);
              }}>
                <option value="">-- Seleccionar --</option>
                {MAT_PRESETS.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
            </div>
            {matPreset === 'Otro (especificar)' && (
              <div className="field">
                <label>Nombre</label>
                <input type="text" value={matCustomName} onChange={e => setMatCustomName(e.target.value)} />
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <div className="field" style={{ flex: 2 }}>
                <label>Cantidad</label>
                <input type="number" value={matQty} onChange={e => setMatQty(e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Unidad</label>
                <input type="text" value={selectedPreset ? selectedPreset.unit : matUnit} onChange={e => setMatUnit(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>Notas</label>
              <input type="text" value={matNotes} onChange={e => setMatNotes(e.target.value)} placeholder="Opcional" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn" style={{ flex: 1 }} onClick={() => setShowAddMat(false)}>Cancelar</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleAddMaterial}>Guardar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
