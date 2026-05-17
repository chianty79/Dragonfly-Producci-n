import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import type {
  AppUser,
  Project,
  TimeRecord,
  TaskStatus,
  Standard,
  BoardSpec,
  Fichaje,
  Material,
  Screen,
} from '../types';

interface AppContextValue {
  // Auth
  currentUser: AppUser | null;
  authLoading: boolean;
  login: (email: string, password: string, role: string) => Promise<void>;
  register: (name: string, email: string, password: string, role: string) => Promise<void>;
  logout: () => Promise<void>;

  // Navigation
  currentScreen: Screen;
  setScreen: (screen: Screen) => void;

  // Data
  projects: Project[];
  allTimes: TimeRecord[];
  allTaskStatuses: TaskStatus[];
  allStandards: Standard[];
  allBoardSpecs: BoardSpec[];
  allFichajes: Fichaje[];
  allMaterials: Material[];

  // Selected context
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
  selectedBoardId: string | null;
  setSelectedBoardId: (id: string | null) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentScreen, setCurrentScreen] = useState<Screen>('login');
  const [projects, setProjects] = useState<Project[]>([]);
  const [allTimes, setAllTimes] = useState<TimeRecord[]>([]);
  const [allTaskStatuses, setAllTaskStatuses] = useState<TaskStatus[]>([]);
  const [allStandards, setAllStandards] = useState<Standard[]>([]);
  const [allBoardSpecs, setAllBoardSpecs] = useState<BoardSpec[]>([]);
  const [allFichajes, setAllFichajes] = useState<Fichaje[]>([]);
  const [allMaterials, setAllMaterials] = useState<Material[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);

  // Firestore listeners (set up when user logs in)
  useEffect(() => {
    if (!currentUser) return;

    const unsubs: (() => void)[] = [];

    unsubs.push(
      onSnapshot(query(collection(db, 'projects'), orderBy('createdAt', 'desc')), (snap) => {
        setProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Project)));
      })
    );

    unsubs.push(
      onSnapshot(query(collection(db, 'times'), orderBy('ts', 'desc')), (snap) => {
        setAllTimes(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TimeRecord)));
      })
    );

    unsubs.push(
      onSnapshot(collection(db, 'taskStatuses'), (snap) => {
        setAllTaskStatuses(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TaskStatus)));
      })
    );

    unsubs.push(
      onSnapshot(collection(db, 'standards'), (snap) => {
        setAllStandards(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Standard)));
      })
    );

    unsubs.push(
      onSnapshot(collection(db, 'boardSpecs'), (snap) => {
        setAllBoardSpecs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as BoardSpec)));
      })
    );

    unsubs.push(
      onSnapshot(query(collection(db, 'fichajes'), orderBy('entryTs', 'desc')), (snap) => {
        setAllFichajes(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Fichaje)));
      })
    );

    unsubs.push(
      onSnapshot(collection(db, 'materials'), (snap) => {
        setAllMaterials(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Material)));
      })
    );

    return () => unsubs.forEach((u) => u());
  }, [currentUser]);

  // Auth state observer
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setAuthLoading(true);
      if (firebaseUser) {
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (snap.exists()) {
          const data = snap.data();
          const user: AppUser = {
            uid: firebaseUser.uid,
            email: firebaseUser.email ?? '',
            name: data.name,
            role: data.role,
          };
          setCurrentUser(user);
          setCurrentScreen(data.role === 'admin' ? 'admin' : 'operator');
        } else {
          await signOut(auth);
          setCurrentScreen('login');
        }
      } else {
        setCurrentUser(null);
        setCurrentScreen('login');
      }
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  const login = useCallback(async (email: string, password: string, _role: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string, role: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, 'users', cred.user.uid), {
      name,
      email,
      role,
      createdAt: serverTimestamp(),
    });
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    setProjects([]);
    setAllTimes([]);
  }, []);

  const setScreen = useCallback((screen: Screen) => setCurrentScreen(screen), []);

  return (
    <AppContext.Provider
      value={{
        currentUser,
        authLoading,
        login,
        register,
        logout,
        currentScreen,
        setScreen,
        projects,
        allTimes,
        allTaskStatuses,
        allStandards,
        allBoardSpecs,
        allFichajes,
        allMaterials,
        selectedProjectId,
        setSelectedProjectId,
        selectedBoardId,
        setSelectedBoardId,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
