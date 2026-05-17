import { useState, useEffect } from 'react';
import { setDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useApp } from '../context/AppContext';
import { CTRL_FIELDS, CTRL_CHECKS } from '../constants/categories';
import { mmToImperial } from '../utils/time';
import type { CtrlData } from '../types';

const STAGES = [
  { key: 'ctrl1' as const, label: 'Pre-cierre', icon: '🔲' },
  { key: 'ctrl2' as const, label: 'Post-cierre', icon: '📦' },
  { key: 'ctrl3' as const, label: 'Post-shape', icon: '🏄' },
  { key: 'ctrl4' as const, label: 'Post-laminación', icon: '✨' },
];

const FRACS = ['0', '1/16', '1/8', '3/16', '1/4', '5/16', '3/8', '7/16', '1/2', '9/16', '5/8', '11/16', '3/4', '13/16', '7/8', '15/16'];
const FRAC_VALUES: Record<string, number> = {
  '0': 0, '1/16': 1/16, '1/8': 1/8, '3/16': 3/16, '1/4': 1/4, '5/16': 5/16,
  '3/8': 3/8, '7/16': 7/16, '1/2': 1/2, '9/16': 9/16, '5/8': 5/8,
  '11/16': 11/16, '3/4': 3/4, '13/16': 13/16, '7/8': 7/8, '15/16': 15/16,
};

function imperialToMm(ft: number, inch: number, frac: string): number {
  const totalIn = ft * 12 + inch + (FRAC_VALUES[frac] ?? 0);
  return Math.round(totalIn * 25.4);
}

function imperialInchToMm(inch: number, frac: string): number {
  const totalIn = inch + (FRAC_VALUES[frac] ?? 0);
  return Math.round(totalIn * 25.4);
}

interface DimInput {
  lengthFt: number;
  lengthIn: number;
  lengthFrac: string;
  widthIn: number;
  widthFrac: string;
  thickIn: number;
  thickFrac: string;
  rockerNose: string;
  rockerTail: string;
  noseWIn: number;
  noseWFrac: string;
  tailWIn: number;
  tailWFrac: string;
  weight: string;
}

export default function BoardSpecScreen() {
  const {
    setScreen,
    selectedProjectId,
    selectedBoardId,
    projects,
    allBoardSpecs,
  } = useApp();

  const project = projects.find(p => p.id === selectedProjectId);
  const boardNum = selectedBoardId ? selectedBoardId.replace('t', '') : '01';

  // General lot fields
  const [genModel, setGenModel] = useState('');
  const [shaper, setShaper] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [tailType, setTailType] = useState('');
  const [noseType, setNoseType] = useState('');
  const [fins, setFins] = useState('');
  const [obs, setObs] = useState('');

  // Dimensions (imperial inputs)
  const [dims, setDims] = useState<DimInput>({
    lengthFt: 6, lengthIn: 0, lengthFrac: '0',
    widthIn: 20, widthFrac: '0',
    thickIn: 2, thickFrac: '1/2',
    rockerNose: '', rockerTail: '',
    noseWIn: 11, noseWFrac: '0',
    tailWIn: 14, tailWFrac: '0',
    weight: '',
  });

  // Computed mm
  const lengthMm = imperialToMm(dims.lengthFt, dims.lengthIn, dims.lengthFrac);
  const widthMm = imperialInchToMm(dims.widthIn, dims.widthFrac);
  const thickMm = imperialInchToMm(dims.thickIn, dims.thickFrac);
  const noseWMm = imperialInchToMm(dims.noseWIn, dims.noseWFrac);
  const tailWMm = imperialInchToMm(dims.tailWIn, dims.tailWFrac);

  // Per-board controls
  const [ctrlData, setCtrlData] = useState<Record<string, CtrlData>>({
    ctrl1: {}, ctrl2: {}, ctrl3: {}, ctrl4: {},
  });
  const [expandedStage, setExpandedStage] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  // Load existing spec
  useEffect(() => {
    if (!selectedProjectId || !selectedBoardId) return;
    const spec = allBoardSpecs.find(
      s => s.projectId === selectedProjectId && s.boardId === selectedBoardId
    );
    if (spec) {
      setGenModel(spec.model ?? '');
      setShaper(spec.shaper ?? '');
      setDateStart(spec.date_start ?? '');
      setTailType(spec.tail ?? '');
      setNoseType(spec.nose ?? '');
      setFins(spec.fins ?? '');
      setObs(spec.obs ?? '');
      if (spec.dims) {
        const d = spec.dims;
        // Convert mm back to imperial for display
        if (d.length_mm) {
          const imp = mmToImperial(d.length_mm);
          setDims(prev => ({
            ...prev,
            lengthFt: imp.ft,
            lengthIn: imp.inch,
            lengthFrac: imp.frac in FRAC_VALUES ? imp.frac : '0',
          }));
        }
        if (d.width_mm) {
          const imp = mmToImperial(d.width_mm);
          setDims(prev => ({
            ...prev,
            widthIn: imp.inch + imp.ft * 12,
            widthFrac: imp.frac in FRAC_VALUES ? imp.frac : '0',
          }));
        }
        if (d.thick_mm) {
          const imp = mmToImperial(d.thick_mm);
          setDims(prev => ({
            ...prev,
            thickIn: imp.inch + imp.ft * 12,
            thickFrac: imp.frac in FRAC_VALUES ? imp.frac : '0',
          }));
        }
        if (d.nose_w_mm) {
          const imp = mmToImperial(d.nose_w_mm);
          setDims(prev => ({
            ...prev,
            noseWIn: imp.inch + imp.ft * 12,
            noseWFrac: imp.frac in FRAC_VALUES ? imp.frac : '0',
          }));
        }
        if (d.tail_w_mm) {
          const imp = mmToImperial(d.tail_w_mm);
          setDims(prev => ({
            ...prev,
            tailWIn: imp.inch + imp.ft * 12,
            tailWFrac: imp.frac in FRAC_VALUES ? imp.frac : '0',
          }));
        }
        setDims(prev => ({
          ...prev,
          rockerNose: d.rocker_nose ?? '',
          rockerTail: d.rocker_tail ?? '',
          weight: d.weight ?? '',
        }));
      }
      setCtrlData({
        ctrl1: (spec.ctrl1 as CtrlData) ?? {},
        ctrl2: (spec.ctrl2 as CtrlData) ?? {},
        ctrl3: (spec.ctrl3 as CtrlData) ?? {},
        ctrl4: (spec.ctrl4 as CtrlData) ?? {},
      });
    }
  }, [selectedProjectId, selectedBoardId, allBoardSpecs]);

  function updateCtrl(stageKey: string, fieldId: string, value: string | boolean) {
    setCtrlData(prev => ({
      ...prev,
      [stageKey]: { ...prev[stageKey], [fieldId]: value },
    }));
  }

  function isStageComplete(stageKey: string): boolean {
    const data = ctrlData[stageKey] ?? {};
    return CTRL_FIELDS.every(f => !!data[f.id]) && CTRL_CHECKS.every(c => !!data[c]);
  }

  async function handleSave() {
    if (!selectedProjectId || !selectedBoardId) return;
    setSaving(true);
    const specId = `${selectedProjectId}_${selectedBoardId}`;
    await setDoc(doc(db, 'boardSpecs', specId), {
      projectId: selectedProjectId,
      boardId: selectedBoardId,
      projectName: project?.name ?? '',
      model: genModel,
      shaper,
      date_start: dateStart,
      tail: tailType,
      nose: noseType,
      fins,
      obs,
      dims: {
        length_mm: lengthMm,
        width_mm: widthMm,
        thick_mm: thickMm,
        rocker_nose: dims.rockerNose,
        rocker_tail: dims.rockerTail,
        nose_w_mm: noseWMm,
        tail_w_mm: tailWMm,
        weight: dims.weight,
      },
      ctrl1: ctrlData.ctrl1,
      ctrl2: ctrlData.ctrl2,
      ctrl3: ctrlData.ctrl3,
      ctrl4: ctrlData.ctrl4,
    }, { merge: true });
    setSaving(false);
  }

  if (!project) {
    return (
      <div className="screen active">
        <div className="topbar">
          <button className="back-btn" onClick={() => setScreen('project-detail')}>←</button>
          <span className="topbar-title">Planilla técnica</span>
        </div>
        <div className="empty">
          <div className="empty-icon">⚠️</div>
          <div className="empty-text">Proyecto no encontrado</div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen active">
      <div className="topbar">
        <button className="back-btn" onClick={() => setScreen('project-detail')}>←</button>
        <div style={{ flex: 1 }}>
          <div className="topbar-title">{project.name}</div>
          <div className="topbar-sub">Tabla {boardNum.padStart(2, '0')}</div>
        </div>
        <button
          className="btn"
          style={{ padding: '4px 10px', fontSize: '13px' }}
          onClick={() => window.print()}
        >
          🖨️
        </button>
      </div>

      <div className="scroll" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '80px' }}>

        {/* ===== GENERAL LOT INFO ===== */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="section-title" style={{ marginBottom: '4px' }}>Información general del lote</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div className="field">
              <label>Modelo</label>
              <input type="text" value={genModel} onChange={e => setGenModel(e.target.value)} placeholder="Ej: Shortboard 6'2" />
            </div>
            <div className="field">
              <label>Shaper</label>
              <input type="text" value={shaper} onChange={e => setShaper(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label>Fecha inicio</label>
            <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            <div className="field">
              <label>Tipo de cola</label>
              <select value={tailType} onChange={e => setTailType(e.target.value)}>
                <option value="">--</option>
                <option>Squash</option>
                <option>Round</option>
                <option>Pin</option>
                <option>Swallow</option>
                <option>Bat tail</option>
                <option>Fish</option>
              </select>
            </div>
            <div className="field">
              <label>Tipo de nose</label>
              <select value={noseType} onChange={e => setNoseType(e.target.value)}>
                <option value="">--</option>
                <option>Round</option>
                <option>Pointed</option>
                <option>Flat</option>
              </select>
            </div>
            <div className="field">
              <label>Quillas</label>
              <select value={fins} onChange={e => setFins(e.target.value)}>
                <option value="">--</option>
                <option>Single</option>
                <option>2+1</option>
                <option>Thruster</option>
                <option>Quad</option>
                <option>5-fin</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label>Observaciones</label>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={3} />
          </div>
        </div>

        {/* ===== DIMENSIONS ===== */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="section-title" style={{ marginBottom: '4px' }}>Dimensiones objetivo</div>

          {/* Length */}
          <div>
            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px', fontWeight: 500 }}>Largo</div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="spec-row" style={{ flex: '0 0 auto' }}>
                <input
                  type="number"
                  className="spec-input"
                  value={dims.lengthFt}
                  onChange={e => setDims(d => ({ ...d, lengthFt: parseInt(e.target.value) || 0 }))}
                  style={{ width: '50px' }}
                />
                <span className="spec-unit">ft</span>
              </div>
              <div className="spec-row" style={{ flex: '0 0 auto' }}>
                <input
                  type="number"
                  className="spec-input"
                  value={dims.lengthIn}
                  onChange={e => setDims(d => ({ ...d, lengthIn: parseInt(e.target.value) || 0 }))}
                  style={{ width: '50px' }}
                />
                <span className="spec-unit">in</span>
              </div>
              <div className="spec-row" style={{ flex: '0 0 auto' }}>
                <select
                  className="spec-input"
                  value={dims.lengthFrac}
                  onChange={e => setDims(d => ({ ...d, lengthFrac: e.target.value }))}
                  style={{ width: '70px' }}
                >
                  {FRACS.map(f => <option key={f} value={f}>{f}"</option>)}
                </select>
              </div>
              <div style={{ fontSize: '13px', color: '#1D9E75', fontWeight: 600, marginLeft: '4px' }}>
                = {lengthMm} mm
              </div>
            </div>
          </div>

          {/* Width */}
          <div>
            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px', fontWeight: 500 }}>Ancho máximo</div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="spec-row" style={{ flex: '0 0 auto' }}>
                <input
                  type="number"
                  className="spec-input"
                  value={dims.widthIn}
                  onChange={e => setDims(d => ({ ...d, widthIn: parseInt(e.target.value) || 0 }))}
                  style={{ width: '50px' }}
                />
                <span className="spec-unit">in</span>
              </div>
              <div className="spec-row" style={{ flex: '0 0 auto' }}>
                <select
                  className="spec-input"
                  value={dims.widthFrac}
                  onChange={e => setDims(d => ({ ...d, widthFrac: e.target.value }))}
                  style={{ width: '70px' }}
                >
                  {FRACS.map(f => <option key={f} value={f}>{f}"</option>)}
                </select>
              </div>
              <div style={{ fontSize: '13px', color: '#1D9E75', fontWeight: 600, marginLeft: '4px' }}>
                = {widthMm} mm
              </div>
            </div>
          </div>

          {/* Thickness */}
          <div>
            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px', fontWeight: 500 }}>Espesor máximo</div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="spec-row" style={{ flex: '0 0 auto' }}>
                <input
                  type="number"
                  className="spec-input"
                  value={dims.thickIn}
                  onChange={e => setDims(d => ({ ...d, thickIn: parseInt(e.target.value) || 0 }))}
                  style={{ width: '50px' }}
                />
                <span className="spec-unit">in</span>
              </div>
              <div className="spec-row" style={{ flex: '0 0 auto' }}>
                <select
                  className="spec-input"
                  value={dims.thickFrac}
                  onChange={e => setDims(d => ({ ...d, thickFrac: e.target.value }))}
                  style={{ width: '70px' }}
                >
                  {FRACS.map(f => <option key={f} value={f}>{f}"</option>)}
                </select>
              </div>
              <div style={{ fontSize: '13px', color: '#1D9E75', fontWeight: 600, marginLeft: '4px' }}>
                = {thickMm} mm
              </div>
            </div>
          </div>

          {/* Rockers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div className="spec-row">
              <label className="spec-label">Rocker nose</label>
              <input
                type="number"
                className="spec-input"
                value={dims.rockerNose}
                onChange={e => setDims(d => ({ ...d, rockerNose: e.target.value }))}
              />
              <span className="spec-unit">mm</span>
            </div>
            <div className="spec-row">
              <label className="spec-label">Rocker tail</label>
              <input
                type="number"
                className="spec-input"
                value={dims.rockerTail}
                onChange={e => setDims(d => ({ ...d, rockerTail: e.target.value }))}
              />
              <span className="spec-unit">mm</span>
            </div>
          </div>

          {/* Nose width 12" */}
          <div>
            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px', fontWeight: 500 }}>Ancho nose 12"</div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="spec-row" style={{ flex: '0 0 auto' }}>
                <input
                  type="number"
                  className="spec-input"
                  value={dims.noseWIn}
                  onChange={e => setDims(d => ({ ...d, noseWIn: parseInt(e.target.value) || 0 }))}
                  style={{ width: '50px' }}
                />
                <span className="spec-unit">in</span>
              </div>
              <div className="spec-row" style={{ flex: '0 0 auto' }}>
                <select
                  className="spec-input"
                  value={dims.noseWFrac}
                  onChange={e => setDims(d => ({ ...d, noseWFrac: e.target.value }))}
                  style={{ width: '70px' }}
                >
                  {FRACS.map(f => <option key={f} value={f}>{f}"</option>)}
                </select>
              </div>
              <div style={{ fontSize: '13px', color: '#1D9E75', fontWeight: 600, marginLeft: '4px' }}>
                = {noseWMm} mm
              </div>
            </div>
          </div>

          {/* Tail width 12" */}
          <div>
            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px', fontWeight: 500 }}>Ancho tail 12"</div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="spec-row" style={{ flex: '0 0 auto' }}>
                <input
                  type="number"
                  className="spec-input"
                  value={dims.tailWIn}
                  onChange={e => setDims(d => ({ ...d, tailWIn: parseInt(e.target.value) || 0 }))}
                  style={{ width: '50px' }}
                />
                <span className="spec-unit">in</span>
              </div>
              <div className="spec-row" style={{ flex: '0 0 auto' }}>
                <select
                  className="spec-input"
                  value={dims.tailWFrac}
                  onChange={e => setDims(d => ({ ...d, tailWFrac: e.target.value }))}
                  style={{ width: '70px' }}
                >
                  {FRACS.map(f => <option key={f} value={f}>{f}"</option>)}
                </select>
              </div>
              <div style={{ fontSize: '13px', color: '#1D9E75', fontWeight: 600, marginLeft: '4px' }}>
                = {tailWMm} mm
              </div>
            </div>
          </div>

          {/* Weight */}
          <div className="spec-row">
            <label className="spec-label">Peso objetivo</label>
            <input
              type="number"
              className="spec-input"
              value={dims.weight}
              onChange={e => setDims(d => ({ ...d, weight: e.target.value }))}
            />
            <span className="spec-unit">kg</span>
          </div>
        </div>

        {/* ===== CONTROLS PER BOARD (4 stages) ===== */}
        <div>
          <div className="section-title">Controles · Tabla {boardNum.padStart(2, '0')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {STAGES.map(stage => {
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
                      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
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

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {CTRL_CHECKS.map(check => {
                            const checked = !!(ctrlData[stage.key]?.[check]);
                            return (
                              <div
                                key={check}
                                className={`ctrl-check${checked ? ' checked' : ''}`}
                                onClick={() => updateCtrl(stage.key, check, !checked)}
                              >
                                <span style={{ fontSize: '16px' }}>{checked ? '✅' : '⬜'}</span>
                                <span>{check}</span>
                              </div>
                            );
                          })}
                        </div>

                        <div className="field">
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
          </div>
        </div>
      </div>

      {/* Sticky save button */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '12px 16px', background: '#fff', borderTop: '1px solid #e2e8f0' }}>
        <button
          className="btn btn-primary"
          style={{ width: '100%' }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Guardando...' : '💾 Guardar planilla'}
        </button>
      </div>
    </div>
  );
}
