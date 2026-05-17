import type { Timestamp } from 'firebase/firestore';

export type Role = 'admin' | 'operator';
export type Screen =
  | 'login'
  | 'register'
  | 'admin'
  | 'operator'
  | 'new-order'
  | 'project-detail'
  | 'edit-project'
  | 'board-spec'
  | 'materials';

export interface AppUser {
  uid: string;
  email: string;
  name: string;
  role: Role;
}

export interface Project {
  id: string;
  name: string;
  qty: number;
  client: string;
  model: string;
  notes: string;
  status: 'active' | 'closed';
  createdAt?: Timestamp;
}

export interface TimeRecord {
  id: string;
  projectId: string;
  projectName: string;
  boardId: string;
  catId: string;
  task: string;
  operatorId: string;
  operatorName: string;
  seconds: number;
  startTs?: number;
  endTs?: number;
  manual?: boolean;
  note?: string;
  ts?: Timestamp;
}

export interface TaskStatus {
  id: string;
  task: string;
  catId: string;
  projectId: string;
  boardId: string;
  status: 'pending' | 'inprogress' | 'done';
}

export interface Standard {
  id: string;
  catId: string;
  task: string;
  minutes: number;
}

export interface CtrlData {
  [key: string]: string | boolean;
}

export interface BoardSpec {
  id: string;
  projectId: string;
  boardId: string;
  projectName: string;
  model?: string;
  shaper?: string;
  date_start?: string;
  tail?: string;
  nose?: string;
  fins?: string;
  obs?: string;
  dims?: {
    length_mm?: number;
    width_mm?: number;
    thick_mm?: number;
    rocker_nose?: string;
    rocker_tail?: string;
    nose_w_mm?: number;
    tail_w_mm?: number;
    weight?: string;
  };
  ctrl1?: CtrlData;
  ctrl2?: CtrlData;
  ctrl3?: CtrlData;
  ctrl4?: CtrlData;
}

export interface Fichaje {
  id: string;
  operatorId: string;
  operatorName: string;
  date: string;
  entryTs: number;
  exitTs: number | null;
  manual?: boolean;
  ts?: Timestamp;
}

export interface Material {
  id: string;
  projectId: string;
  projectName: string;
  boardId: string;
  name: string;
  qty: number;
  unit: string;
  notes: string;
  createdBy: string;
}

export interface TimerState {
  running: boolean;
  startTs: number | null;
  elapsed: number;
  projectId: string | null;
  boardId: string | null;
  catId: string | null;
  task: string | null;
}
