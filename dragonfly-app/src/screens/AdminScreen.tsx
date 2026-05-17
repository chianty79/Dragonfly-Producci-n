import { useState, useEffect } from 'react';
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useApp } from '../context/AppContext';
import { useTimer, getTimerFromLS } from '../hooks/useTimer';
import { CATEGORIES } from '../constants/categories';
import { fmtHours, fmtHora, fmtTime, todayStr } from '../utils/time';

type Tab = 'projects' | 'reports' | 'team' | 'timer' | 'fichaje';

const TASKS_PER_BOARD = 49;

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

  const todayFichajes = allFichajes.filter(
    f => f.operatorId === operatorId && f.date === today
  );

  const openFichaje = todayFichajes.find(f => f.exitTs === null);
  const isIn = !!openFichaje;

  async function handleEntry() {
    const now = Date.now();
    await addDoc(collection(db, 'fichajes'), {
      operatorId,
      operatorName,
      date: today,
      entryTs: now,
      exitTs: null,
      ts: serverTimestamp(),
    });
  }

  async function handleExit() {
    if (!openFichaje) return;
    const now = Date.now();
    await updateDoc(doc(db, 'fichajes', openFichaje.id), {
      exitTs: now,
    });
    // Build summary
    const closedFichajes = [
      ...todayFichajes.filter(f => f.id !== openFichaje.id && f.exitTs !== null),
      { ...openFichaje, exitTs: now },
    ];
    const totalSec = closedFichajes.reduce((s, f) => {
      return s + (f.exitTs ? Math.floor((f.exitTs - f.entryTs) / 1000) : 0);
    }, 0);
    setSummaryData({ totalSec, records: closedFichajes });
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
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleEntry}>
              Entrada ↗
            </button>
          ) : (
            <button className="btn" style={{ flex: 1, background: '#fef2f2', color: '#dc2626' }} onClick={handleExit}>
              Salida ↙
            </button>
          )}
        </div>
      </div>

      {/* Summary Modal */}
      <div className={`modal-overlay${showSummary ? ' open' : ''}`} onClick={() => setShowSummary(false)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-title">Resumen de jornada</div>
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '32px', fontWeight: 700, color: '#1D9E75', textAlign: 'center', margin: '12px 0' }}>
              {fmtTime(summaryData.totalSec)}
            </div>
            {summaryData.records.map((f, i) => (
              <div key={i} className="fichaje-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span>{fmtHora(f.entryTs)} → {f.exitTs ? fmtHora(f.exitTs) : '?'}</span>
                <span style={{ color: '#64748b', fontSize: '13px' }}>
                  {f.exitTs ? fmtTime(Math.floor((f.exitTs - f.entryTs) / 1000)) : '-'}
                </span>
              </div>
            ))}
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setShowSummary(false)}>
            Cerrar
          </button>
        </div>
      </div>
    </>
  );
}

// ---- Main AdminScreen ----
export default function AdminScreen() {
  const {
    currentUser,
    logout,
    setScreen,
    setSelectedProjectId,
    projects,
    allTimes,
    allTaskStatuses,
    allFichajes,
  } = useApp();

  const [tab, setTab] = useState<Tab>('projects');

  // Reports filters
  const [reportProjectId, setReportProjectId] = useState('');
  const [reportBoardId, setReportBoardId] = useState('');
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  // Timer tab
  const timer = useTimer(true);
  const [timerProjectId, setTimerProjectId] = useState('');
  const [timerBoardId, setTimerBoardId] = useState('');
  const [timerCatId, setTimerCatId] = useState('');
  const [timerTask, setTimerTask] = useState('');
  const [timerNote, setTimerNote] = useState('');
  const [savedEntries, setSavedEntries] = useState<import('../types').TimeRecord[]>([]);

  // Fichaje tab
  const [showManualFichaje, setShowManualFichaje] = useState(false);
  const [manualEntry, setManualEntry] = useState('');
  const [manualExit, setManualExit] = useState('');
  const [manualOp, setManualOp] = useState('');
  const [fichajeHistoryDate, setFichajeHistoryDate] = useState(todayStr());

  // Resume timer from localStorage on mount
  useEffect(() => {
    const saved = getTimerFromLS(true);
    if (saved) timer.resumeTimer(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeProjects = projects.filter(p => p.status === 'active');
  const today = todayStr();

  // ---- Stats ----
  const totalSeconds = allTimes.reduce((s, t) => s + t.seconds, 0);
  const totalQty = projects.filter(p => p.status === 'active').reduce((s, p) => s + p.qty, 0);
  const todayRecords = allTimes.filter(t => {
    if (!t.ts) return false;
    const d = new Date(t.ts.toDate()).toISOString().slice(0, 10);
    return d === today;
  }).length;

  // ---- Timer stop ----
  async function handleStopTimer() {
    const result = timer.stopTimer();
    if (!result.seconds || !result.projectId) return;
    const proj = projects.find(p => p.id === result.projectId);
    const entry: Omit<import('../types').TimeRecord, 'id'> = {
      projectId: result.projectId ?? '',
      projectName: proj?.name ?? '',
      boardId: result.boardId ?? '',
      catId: result.catId ?? '',
      task: result.task ?? '',
      operatorId: currentUser?.uid ?? '',
      operatorName: currentUser?.name ?? '',
      seconds: result.seconds,
      startTs: result.startTs ?? undefined,
      endTs: Date.now(),
      note: timerNote.trim() || undefined,
      ts: undefined,
    };
    const ref = await addDoc(collection(db, 'times'), { ...entry, ts: serverTimestamp() });
    setSavedEntries(prev => [{ ...entry, id: ref.id } as import('../types').TimeRecord, ...prev]);
    setTimerNote('');
  }

  // ---- Reports data ----
  const reportProject = projects.find(p => p.id === reportProjectId);
  const reportBoards = reportProject
    ? Array.from({ length: reportProject.qty }, (_, i) => 't' + String(i + 1).padStart(2, '0'))
    : [];
  const reportTimes = allTimes.filter(t => {
    if (!reportProjectId) return false;
    if (t.projectId !== reportProjectId) return false;
    if (reportBoardId && t.boardId !== reportBoardId) return false;
    return true;
  });
  const totalReportSec = reportTimes.reduce((s, t) => s + t.seconds, 0);

  // By category
  const catData = CATEGORIES.map(cat => {
    const catTimes = reportTimes.filter(t => t.catId === cat.id);
    const secs = catTimes.reduce((s, t) => s + t.seconds, 0);
    const pct = totalReportSec > 0 ? Math.round((secs / totalReportSec) * 100) : 0;
    const statuses = allTaskStatuses.filter(ts =>
      ts.projectId === reportProjectId &&
      ts.catId === cat.id &&
      (!reportBoardId || ts.boardId === reportBoardId)
    );
    return { cat, secs, pct, statuses };
  }).filter(d => d.secs > 0);

  // By operator
  const opMap = new Map<string, { name: string; secs: number }>();
  reportTimes.forEach(t => {
    const cur = opMap.get(t.operatorId) ?? { name: t.operatorName, secs: 0 };
    opMap.set(t.operatorId, { ...cur, secs: cur.secs + t.seconds });
  });
  const opData = [...opMap.values()].sort((a, b) => b.secs - a.secs);

  // By board
  const boardMap = new Map<string, number>();
  reportTimes.forEach(t => {
    boardMap.set(t.boardId, (boardMap.get(t.boardId) ?? 0) + t.seconds);
  });
  const boardData = [...boardMap.entries()].sort((a, b) => b[1] - a[1]);

  // ---- Team ----
  const teamMap = new Map<string, { name: string; secs: number; tasks: number }>();
  allTimes.forEach(t => {
    const cur = teamMap.get(t.operatorId) ?? { name: t.operatorName, secs: 0, tasks: 0 };
    teamMap.set(t.operatorId, { ...cur, secs: cur.secs + t.seconds, tasks: cur.tasks + 1 });
  });
  const teamData = [...teamMap.values()].sort((a, b) => b.secs - a.secs);

  // ---- Fichaje ----
  const todayFichajes = allFichajes.filter(f => f.date === today);
  const historyFichajes = allFichajes.filter(f => f.date === fichajeHistoryDate);

  async function saveManualFichaje() {
    if (!manualOp || !manualEntry) return;
    const entryTs = new Date(`${today}T${manualEntry}`).getTime();
    const exitTs = manualExit ? new Date(`${today}T${manualExit}`).getTime() : null;
    await addDoc(collection(db, 'fichajes'), {
      operatorId: 'manual',
      operatorName: manualOp,
      date: today,
      entryTs,
      exitTs,
      manual: true,
      ts: serverTimestamp(),
    });
    setManualEntry('');
    setManualExit('');
    setManualOp('');
    setShowManualFichaje(false);
  }

  // ---- Timer board options ----
  const timerProject = activeProjects.find(p => p.id === timerProjectId);
  const timerBoardOptions = timerProject
    ? Array.from({ length: timerProject.qty }, (_, i) => 't' + String(i + 1).padStart(2, '0'))
    : [];
  const timerCat = CATEGORIES.find(c => c.id === timerCatId);

  const tabLabels: Record<Tab, string> = {
    projects: 'Proyectos',
    reports: 'Reportes',
    team: 'Equipo',
    timer: 'Timer',
    fichaje: 'Fichaje',
  };

  return (
    <div className="screen active">
      <div className="topbar">
        <span className="topbar-title">{tabLabels[tab]}</span>
        <button className="btn" style={{ padding: '4px 10px', fontSize: '13px' }} onClick={logout}>
          Salir
        </button>
      </div>

      <div className="scroll" style={{ paddingBottom: '80px' }}>
        {/* ===== TAB: PROJECTS ===== */}
        {tab === 'projects' && (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value">{activeProjects.length}</div>
                <div className="stat-label">Proyectos activos</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{totalQty}</div>
                <div className="stat-label">Tablas</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{fmtHours(totalSeconds)}</div>
                <div className="stat-label">Horas registradas</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{todayRecords}</div>
                <div className="stat-label">Registros hoy</div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="section-title" style={{ margin: 0 }}>Órdenes activas</div>
              <button className="btn btn-primary" style={{ padding: '6px 14px' }} onClick={() => setScreen('new-order')}>
                + Nueva orden
              </button>
            </div>

            {activeProjects.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">📋</div>
                <div className="empty-text">No hay proyectos activos</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {activeProjects.map(p => {
                  const pTimes = allTimes.filter(t => t.projectId === p.id);
                  const pStatuses = allTaskStatuses.filter(ts => ts.projectId === p.id);
                  const doneTasks = pStatuses.filter(ts => ts.status === 'done').length;
                  const totalTasks = p.qty * TASKS_PER_BOARD;
                  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

                  return (
                    <div
                      key={p.id}
                      className="card"
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setSelectedProjectId(p.id);
                        setScreen('project-detail');
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 600 }}>{p.name}</span>
                        <span className="badge badge-active">{p.qty} tablas</span>
                      </div>
                      {p.client && (
                        <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>{p.client}</div>
                      )}
                      <div className="progress">
                        <div className="progress-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{pct}% completado</span>
                        <span>{fmtHours(pTimes.reduce((s, t) => s + t.seconds, 0))}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ===== TAB: REPORTS ===== */}
        {tab === 'reports' && (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="field">
                <label>Proyecto</label>
                <select value={reportProjectId} onChange={e => { setReportProjectId(e.target.value); setReportBoardId(''); }}>
                  <option value="">-- Todos --</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              {reportProjectId && (
                <div className="field">
                  <label>Tabla</label>
                  <select value={reportBoardId} onChange={e => setReportBoardId(e.target.value)}>
                    <option value="">-- Todas --</option>
                    {reportBoards.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              )}
            </div>

            {!reportProjectId ? (
              <div className="empty">
                <div className="empty-icon">📊</div>
                <div className="empty-text">Selecciona un proyecto para ver reportes</div>
              </div>
            ) : (
              <>
                {/* By category */}
                <div className="section-title">Por categoría</div>
                {catData.length === 0 ? (
                  <div className="empty"><div className="empty-text">Sin registros</div></div>
                ) : catData.map(({ cat, secs, pct, statuses }) => (
                  <div key={cat.id}>
                    <div
                      className="rep-bar"
                      style={{ cursor: 'pointer' }}
                      onClick={() => setExpandedCat(expandedCat === cat.id ? null : cat.id)}
                    >
                      <div className="rep-bar-header">
                        <span className="rep-bar-label">{cat.label}</span>
                        <span className="rep-bar-val">{fmtHours(secs)} · {pct}%</span>
                      </div>
                      <div className="rep-bar-fill" style={{ width: `${pct}%`, background: cat.color }} />
                    </div>
                    {expandedCat === cat.id && (
                      <div className="card" style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {cat.tasks.map(t => {
                          const st = statuses.find(s => s.task === t.name);
                          const statusClass = st?.status === 'done' ? 'status-done' : st?.status === 'inprogress' ? 'status-inprogress' : 'status-pending';
                          return (
                            <div key={t.name} className="task-row">
                              <span className={`status-dot ${statusClass}`} />
                              <span className="task-name">{t.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}

                {/* By operator */}
                <div className="section-title">Por operario</div>
                {opData.length === 0 ? (
                  <div className="empty"><div className="empty-text">Sin registros</div></div>
                ) : opData.map(op => (
                  <div key={op.name} className="op-row">
                    <div className="op-avatar">{op.name.charAt(0).toUpperCase()}</div>
                    <div className="op-name">{op.name}</div>
                    <div className="op-time">{fmtHours(op.secs)}</div>
                  </div>
                ))}

                {/* By board */}
                <div className="section-title">Por tabla</div>
                {boardData.length === 0 ? (
                  <div className="empty"><div className="empty-text">Sin registros</div></div>
                ) : boardData.map(([bId, secs]) => (
                  <div key={bId} className="rep-bar">
                    <div className="rep-bar-header">
                      <span className="rep-bar-label">{bId}</span>
                      <span className="rep-bar-val">{fmtHours(secs)}</span>
                    </div>
                    <div
                      className="rep-bar-fill"
                      style={{ width: `${totalReportSec > 0 ? Math.round((secs / totalReportSec) * 100) : 0}%` }}
                    />
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* ===== TAB: TEAM ===== */}
        {tab === 'team' && (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="section-title">Equipo</div>
            {teamData.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">👥</div>
                <div className="empty-text">Sin datos de equipo aún</div>
              </div>
            ) : teamData.map(op => (
              <div key={op.name} className="card">
                <div className="op-row" style={{ padding: 0 }}>
                  <div className="op-avatar">{op.name.charAt(0).toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <div className="op-name">{op.name}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{op.tasks} registros</div>
                  </div>
                  <div className="op-time">{fmtHours(op.secs)}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ===== TAB: TIMER ===== */}
        {tab === 'timer' && (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Selectors */}
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

            {/* Category selector */}
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

            {/* Task list */}
            {timerCatId && timerCat && !timer.running && (
              <div>
                <div className="section-title">Tarea</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {timerCat.tasks.map(t => (
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
                      onClick={() => setTimerTask(t.name)}
                    >
                      <span className="task-name">{t.name}</span>
                      <span className="task-time">{t.std}min</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timer display */}
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
                {timer.running && (
                  <div className="field" style={{ marginTop: '8px' }}>
                    <input
                      type="text"
                      placeholder="Nota opcional..."
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
                    <button className="btn" style={{ background: '#dc2626', color: '#fff' }} onClick={handleStopTimer}>
                      ⏹ Detener
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Saved entries */}
            {savedEntries.length > 0 && (
              <div>
                <div className="section-title">Registros de esta sesión</div>
                {savedEntries.map((e, i) => (
                  <div key={i} className="saved-entry">
                    <div className="saved-meta">{e.boardId} · {e.task}</div>
                    <div style={{ fontWeight: 600, color: '#1D9E75' }}>{fmtHours(e.seconds)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== TAB: FICHAJE ===== */}
        {tab === 'fichaje' && (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="section-title">Mi fichaje</div>
            {currentUser && (
              <FichajeWidget
                operatorId={currentUser.uid}
                operatorName={currentUser.name}
                allFichajes={allFichajes}
              />
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="section-title" style={{ margin: 0 }}>Equipo hoy</div>
              <button className="btn" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => setShowManualFichaje(true)}>
                + Manual
              </button>
            </div>

            {todayFichajes.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">🕐</div>
                <div className="empty-text">Sin fichajes hoy</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {todayFichajes.map(f => (
                  <div key={f.id} className="fichaje-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 600 }}>{f.operatorName}</div>
                      <div className={`fichaje-dot${f.exitTs === null ? ' in' : ''}`} />
                    </div>
                    <div className="fichaje-time">
                      Entrada: {fmtHora(f.entryTs)}
                      {f.exitTs ? ` · Salida: ${fmtHora(f.exitTs)}` : ' · En jornada'}
                    </div>
                    {f.exitTs && (
                      <div style={{ fontSize: '12px', color: '#1D9E75', marginTop: '2px' }}>
                        Total: {fmtTime(Math.floor((f.exitTs - f.entryTs) / 1000))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Historial */}
            <div className="section-title">Historial</div>
            <div className="field">
              <label>Fecha</label>
              <input type="date" value={fichajeHistoryDate} onChange={e => setFichajeHistoryDate(e.target.value)} />
            </div>
            {historyFichajes.length === 0 ? (
              <div className="empty"><div className="empty-text">Sin registros para esta fecha</div></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {historyFichajes.map(f => (
                  <div key={f.id} className="fichaje-card">
                    <div style={{ fontWeight: 600 }}>{f.operatorName}</div>
                    <div className="fichaje-time">
                      {fmtHora(f.entryTs)} → {f.exitTs ? fmtHora(f.exitTs) : 'Sin salida'}
                      {f.exitTs && ` (${fmtTime(Math.floor((f.exitTs - f.entryTs) / 1000))})`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===== TAB BAR ===== */}
      <div className="tabbar">
        {([
          { id: 'projects', icon: (
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M3 7h18M3 12h18M3 17h18" />
            </svg>
          ), label: 'Proyectos' },
          { id: 'reports', icon: (
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M3 3v18h18M7 16l4-4 4 4 4-6" />
            </svg>
          ), label: 'Reportes' },
          { id: 'team', icon: (
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="9" cy="7" r="3" /><circle cx="15" cy="7" r="3" />
              <path d="M3 21c0-4 2.7-7 6-7h6c3.3 0 6 3 6 7" />
            </svg>
          ), label: 'Equipo' },
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

      {/* Manual fichaje modal */}
      <div className={`modal-overlay${showManualFichaje ? ' open' : ''}`} onClick={() => setShowManualFichaje(false)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div className="modal-title">Fichaje manual</div>
            <button className="modal-close" onClick={() => setShowManualFichaje(false)}>✕</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="field">
              <label>Operario</label>
              <input type="text" value={manualOp} onChange={e => setManualOp(e.target.value)} placeholder="Nombre" />
            </div>
            <div className="field">
              <label>Hora entrada</label>
              <input type="time" value={manualEntry} onChange={e => setManualEntry(e.target.value)} />
            </div>
            <div className="field">
              <label>Hora salida (opcional)</label>
              <input type="time" value={manualExit} onChange={e => setManualExit(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn" style={{ flex: 1 }} onClick={() => setShowManualFichaje(false)}>Cancelar</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={saveManualFichaje}>Guardar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
