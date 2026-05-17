import { useState, useEffect, useRef, useCallback } from 'react';
import { fmtTime } from '../utils/time';

const LS_KEY = 'df_active_timer';
const LS_KEY_ADM = 'df_active_timer_adm';

export interface TimerData {
  projectId: string;
  boardId: string;
  catId: string;
  task: string;
  startTs: number;
  isAdm: boolean;
}

function saveToLS(data: TimerData, isAdm: boolean) {
  try { localStorage.setItem(isAdm ? LS_KEY_ADM : LS_KEY, JSON.stringify(data)); } catch {}
}

function clearLS(isAdm: boolean) {
  try { localStorage.removeItem(isAdm ? LS_KEY_ADM : LS_KEY); } catch {}
}

export function getTimerFromLS(isAdm: boolean): TimerData | null {
  try {
    const raw = localStorage.getItem(isAdm ? LS_KEY_ADM : LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function useTimer(isAdmin: boolean) {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [startTs, setStartTs] = useState<number | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [catId, setCatId] = useState<string | null>(null);
  const [task, setTask] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const display = fmtTime(elapsed);

  const startTimer = useCallback((proj: string, board: string, cat: string, taskName: string) => {
    const ts = Date.now();
    setProjectId(proj);
    setBoardId(board);
    setCatId(cat);
    setTask(taskName);
    setStartTs(ts);
    setElapsed(0);
    setRunning(true);
    saveToLS({ projectId: proj, boardId: board, catId: cat, task: taskName, startTs: ts, isAdm: isAdmin }, isAdmin);
  }, [isAdmin]);

  const stopTimer = useCallback(() => {
    setRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    clearLS(isAdmin);
    const finalElapsed = elapsed;
    return { projectId, boardId, catId, task, startTs, seconds: finalElapsed };
  }, [elapsed, projectId, boardId, catId, task, startTs, isAdmin]);

  const resumeTimer = useCallback((data: TimerData) => {
    const el = Math.floor((Date.now() - data.startTs) / 1000);
    setProjectId(data.projectId);
    setBoardId(data.boardId);
    setCatId(data.catId);
    setTask(data.task);
    setStartTs(data.startTs);
    setElapsed(el);
    setRunning(true);
  }, []);

  useEffect(() => {
    if (running && startTs) {
      intervalRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTs) / 1000));
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, startTs]);

  return {
    running,
    elapsed,
    display,
    projectId, setProjectId,
    boardId, setBoardId,
    catId, setCatId,
    task, setTask,
    startTimer,
    stopTimer,
    resumeTimer,
  };
}
