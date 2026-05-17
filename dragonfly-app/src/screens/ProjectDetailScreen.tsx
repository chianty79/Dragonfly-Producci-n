import { useApp } from '../context/AppContext';
import { fmtHours, todayStr } from '../utils/time';
import { CATEGORIES } from '../constants/categories';

const TASKS_PER_BOARD = 49;

export default function ProjectDetailScreen() {
  const {
    setScreen,
    selectedProjectId,
    setSelectedBoardId,
    projects,
    allTimes,
    allTaskStatuses,
  } = useApp();

  const project = projects.find(p => p.id === selectedProjectId);
  if (!project) {
    return (
      <div className="screen active">
        <div className="topbar">
          <button className="back-btn" onClick={() => setScreen('admin')}>←</button>
          <span className="topbar-title">Proyecto</span>
        </div>
        <div className="empty">
          <div className="empty-icon">⚠️</div>
          <div className="empty-text">Proyecto no encontrado</div>
        </div>
      </div>
    );
  }

  const projTimes = allTimes.filter(t => t.projectId === selectedProjectId);
  const totalSeconds = projTimes.reduce((s, t) => s + t.seconds, 0);
  const today = todayStr();
  const todayCount = projTimes.filter(t => t.ts && new Date(t.ts.toDate()).toISOString().slice(0, 10) === today).length;

  // Count completed tasks across all boards
  const projStatuses = allTaskStatuses.filter(ts => ts.projectId === selectedProjectId);
  const doneTasks = projStatuses.filter(ts => ts.status === 'done').length;

  // Count boards in progress (has at least one time record)
  const boardsInProgress = new Set(projTimes.map(t => t.boardId)).size;

  const boards = Array.from({ length: project.qty }, (_, i) => {
    const boardId = 't' + String(i + 1).padStart(2, '0');
    const boardTimes = projTimes.filter(t => t.boardId === boardId);
    const boardStatuses = projStatuses.filter(ts => ts.boardId === boardId);
    const boardDone = boardStatuses.filter(ts => ts.status === 'done').length;
    const pct = Math.round((boardDone / TASKS_PER_BOARD) * 100);
    const hasActivity = boardTimes.length > 0;
    const allDone = boardDone === TASKS_PER_BOARD;

    let badgeClass = 'badge';
    let badgeLabel = 'Pendiente';
    if (allDone) { badgeClass = 'badge badge-done'; badgeLabel = 'Completa'; }
    else if (hasActivity) { badgeClass = 'badge badge-running'; badgeLabel = 'En proceso'; }

    return { boardId, boardDone, pct, badgeClass, badgeLabel, num: i + 1 };
  });

  // Unique operators
  const operators = [...new Set(projTimes.map(t => t.operatorName))];

  return (
    <div className="screen active">
      <div className="topbar">
        <button className="back-btn" onClick={() => setScreen('admin')}>←</button>
        <span className="topbar-title" style={{ flex: 1 }}>{project.name}</span>
        <button
          className="btn"
          style={{ padding: '4px 10px', fontSize: '18px' }}
          onClick={() => setScreen('edit-project')}
        >✏️</button>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{boardsInProgress}</div>
            <div className="stat-label">En proceso</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{fmtHours(totalSeconds)}</div>
            <div className="stat-label">Horas registradas</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{doneTasks}</div>
            <div className="stat-label">Tareas completadas</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{todayCount}</div>
            <div className="stat-label">Registros hoy</div>
          </div>
        </div>

        {/* Info */}
        {(project.client || project.model) && (
          <div className="card" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {project.client && (
              <div>
                <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>CLIENTE</div>
                <div style={{ fontWeight: 600 }}>{project.client}</div>
              </div>
            )}
            {project.model && (
              <div>
                <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>MODELO</div>
                <div style={{ fontWeight: 600 }}>{project.model}</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>TABLAS</div>
              <div style={{ fontWeight: 600 }}>{project.qty}</div>
            </div>
          </div>
        )}

        {/* Boards list */}
        <div>
          <div className="section-title">Tablas del lote</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {boards.map(b => (
              <div
                key={b.boardId}
                className="card"
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setSelectedBoardId(b.boardId);
                  setScreen('board-spec');
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 600 }}>Tabla {String(b.num).padStart(2, '0')}</span>
                  <span className={b.badgeClass}>{b.badgeLabel}</span>
                </div>
                <div className="progress">
                  <div className="progress-fill" style={{ width: `${b.pct}%` }} />
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  {b.boardDone} / {TASKS_PER_BOARD} tareas · {b.pct}%
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Materiales button */}
        <button
          className="btn"
          style={{ width: '100%' }}
          onClick={() => setScreen('materials')}
        >
          📦 Materiales del lote
        </button>

        {/* Operators */}
        {operators.length > 0 && (
          <div>
            <div className="section-title">Equipo</div>
            <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {operators.map(op => (
                <span key={op} className="badge badge-active">{op}</span>
              ))}
            </div>
          </div>
        )}

        {/* Recent time records */}
        <div>
          <div className="section-title">Registros recientes</div>
          {projTimes.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">⏱️</div>
              <div className="empty-text">Sin registros de tiempo aún</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {projTimes.slice(0, 20).map(t => {
                const cat = CATEGORIES.find(c => c.id === t.catId);
                return (
                  <div key={t.id} className="saved-entry">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '14px' }}>{t.task}</div>
                        <div className="saved-meta">
                          {t.operatorName} · {t.boardId} · {cat?.label ?? t.catId}
                        </div>
                      </div>
                      <div style={{ fontWeight: 600, fontSize: '14px', color: '#1D9E75' }}>
                        {fmtHours(t.seconds)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
