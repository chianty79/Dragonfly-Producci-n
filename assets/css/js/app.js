import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, setDoc, getDoc, getDocs, onSnapshot, query, orderBy, where, serverTimestamp, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { CATEGORIES, MAT_PRESETS, CTRL_CHECKS, CTRL_FIELDS } from "./config.js";
// ─────────────────────────────────────────────
//  ⚠️  REEMPLAZÁ CON TUS CREDENCIALES FIREBASE
// ─────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCpgerpVO60GnOlCt-g8jBmsMSh54Y1FsM",
  authDomain: "dragonfly-produccion.firebaseapp.com",
  projectId: "dragonfly-produccion",
  storageBucket: "dragonfly-produccion.firebasestorage.app",
  messagingSenderId: "565125962524",
  appId: "1:565125962524:web:c2a6a05d6a51906534b8d9"
};
// ─────────────────────────────────────────────


// Helper: get task name array for a category (backward compat)
function catTaskNames(cat) { return cat.tasks.map(t=>t.name); }
function getStdMin(catId, taskName) {
  const cat = CATEGORIES.find(c=>c.id===catId);
  if(!cat) return null;
  const t = cat.tasks.find(t=>t.name===taskName);
  return t ? t.std : null;
}

// Check for interrupted timer immediately (before Firebase connects)
setTimeout(checkLocalTimer, 100);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ── STATE ──
let currentUser = null;
let currentRole = null;
let selectedRole = 'admin';
let timerInterval = null;
let timerRunning = false;
let timerStartTs = null;
let timerElapsed = 0;
let selectedCat = null;
let selectedTask = null;
let selectedProject = null;
let selectedBoard = null;
let projects = [];
let allTimes = [];
let allTaskStatuses = [];
let allStandards = [];
let allBoardSpecs = [];
let unsubProjects = null;
let unsubTimes = null;
let modalTask = null;
let editingRecordId = null;
let currentSpecProjectId = null;
let currentSpecBoardId = null;


// ── LOCAL TIMER PERSISTENCE (survives browser background/reload) ──
const LS_KEY = 'df_active_timer';
const LS_KEY_ADM = 'df_active_timer_adm';

function saveTimerToLS(isAdm) {
  const key = isAdm ? LS_KEY_ADM : LS_KEY;
  const data = isAdm ? {
    projectId:admSelectedProject, boardId:admSelectedBoard,
    catId:admSelectedCat, task:admSelectedTask,
    startTs:admTimerStartTs, isAdm:true
  } : {
    projectId:selectedProject, boardId:selectedBoard,
    catId:selectedCat, task:selectedTask,
    startTs:timerStartTs, isAdm:false
  };
  try { localStorage.setItem(key, JSON.stringify(data)); } catch(e) {}
}

function clearTimerFromLS(isAdm) {
  try { localStorage.removeItem(isAdm ? LS_KEY_ADM : LS_KEY); } catch(e) {}
}

function getTimerFromLS(isAdm) {
  try {
    const raw = localStorage.getItem(isAdm ? LS_KEY_ADM : LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
}

// Called immediately on page load — before Firebase even connects
function checkLocalTimer() {
  const t = getTimerFromLS(false) || getTimerFromLS(true);
  if(!t) return;
  const elapsed = Math.floor((Date.now() - t.startTs) / 1000);
  if(elapsed > 86400) { clearTimerFromLS(false); clearTimerFromLS(true); return; }
  // Show a recovery banner immediately
  const banner = document.createElement('div');
  banner.id = 'timer-recovery-banner';
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#0F6E56;color:#fff;padding:12px 16px;font-size:14px;display:flex;justify-content:space-between;align-items:center;font-family:DM Sans,sans-serif';
  banner.innerHTML = `<span>⏱ Timer activo: <strong>${fmtTimeSimple(elapsed)}</strong> — ${t.task||''}</span><button onclick="dismissRecoveryBanner()" style="background:rgba(255,255,255,0.2);border:none;color:#fff;padding:4px 10px;border-radius:4px;cursor:pointer">Retomar</button>`;
  document.body.appendChild(banner);
  // Update banner every second
  const bannerInterval = setInterval(()=>{
    const el = document.getElementById('timer-recovery-banner');
    if(!el){ clearInterval(bannerInterval); return; }
    const s = Math.floor((Date.now() - t.startTs) / 1000);
    el.querySelector('span').innerHTML = `⏱ Timer activo: <strong>${fmtTimeSimple(s)}</strong> — ${t.task||''}`;
  }, 1000);
  window._recoveryData = t;
  window._recoveryInterval = bannerInterval;
}

function fmtTimeSimple(s) {
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

window.dismissRecoveryBanner = function() {
  if(window._recoveryInterval) clearInterval(window._recoveryInterval);
  const banner = document.getElementById('timer-recovery-banner');
  if(banner) banner.remove();
  // The resume will happen via resumeActiveTimer after Firebase loads
};

// ── HELPERS ──
function fmtTime(s) {
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}
function fmtHours(s) {
  return (s/3600).toFixed(1)+'h';
}
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function showLoading(v) {
  document.getElementById('loading-overlay').classList.toggle('hidden', !v);
}
function showError(elId, msg) {
  const el = document.getElementById(elId);
  el.textContent = msg; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 4000);
}
window.goBack = function(to) { showScreen(to); };

// ── ROLE SELECT ──
window.selectRole = function(r) {
  selectedRole = r;
  document.getElementById('role-admin').classList.toggle('active', r==='admin');
  document.getElementById('role-operator').classList.toggle('active', r==='operator');
};

// ── AUTH ──
window.showRegister = function() { showScreen('screen-register'); };
window.showLogin = function() { showScreen('screen-login'); };

window.doLogin = async function() {
  const email = document.getElementById('login-email').value.trim();
  const pw = document.getElementById('login-password').value;
  if (!email || !pw) { showError('login-error','Completá todos los campos'); return; }
  document.getElementById('btn-login').disabled = true;
  try {
    await signInWithEmailAndPassword(auth, email, pw);
  } catch(e) {
    showError('login-error', e.code==='auth/invalid-credential'?'Email o contraseña incorrectos':e.message);
    document.getElementById('btn-login').disabled = false;
  }
};

window.doRegister = async function() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pw = document.getElementById('reg-password').value;
  const role = document.getElementById('reg-role').value;
  if (!name||!email||!pw) { showError('reg-error','Completá todos los campos'); return; }
  try {
    showLoading(true);
    const cred = await createUserWithEmailAndPassword(auth, email, pw);
    await setDoc(doc(db,'users',cred.user.uid), { name, email, role, createdAt: serverTimestamp() });
    showLoading(false);
  } catch(e) {
    showLoading(false);
    showError('reg-error', e.code==='auth/email-already-in-use'?'Este email ya está registrado':e.message);
  }
};

window.doLogout = async function() {
  if(unsubProjects) unsubProjects();
  if(unsubTimes) unsubTimes();
  projects = []; allTimes = [];
  await signOut(auth);
};

// ── AUTH STATE ──
onAuthStateChanged(auth, async user => {
  showLoading(true);
  if (user) {
    currentUser = user;
    const snap = await getDoc(doc(db,'users',user.uid));
    if (snap.exists()) {
      const data = snap.data();
      currentRole = data.role;
      if (currentRole==='admin') {
        document.getElementById('admin-sub').textContent = data.name + ' · Encargado';
        initAdmin();
        showScreen('screen-admin');
      } else {
        document.getElementById('op-sub').textContent = data.name + ' · Operario';
        initOperator();
        showScreen('screen-operator');
      }
    } else {
      // User exists in Auth but not Firestore — show register
      await signOut(auth);
      showScreen('screen-login');
    }
  } else {
    currentUser = null; currentRole = null;
    showScreen('screen-login');
    document.getElementById('btn-login').disabled = false;
  }
  showLoading(false);
});

// ── PROJECTS REALTIME ──
function listenProjects(cb) {
  const q = query(collection(db,'projects'), orderBy('createdAt','desc'));
  return onSnapshot(q, snap => {
    projects = snap.docs.map(d => ({id:d.id,...d.data()}));
    cb(projects);
  });
}
function listenTimes(cb) {
  const q = query(collection(db,'times'), orderBy('ts','desc'));
  return onSnapshot(q, snap => {
    allTimes = snap.docs.map(d => ({id:d.id,...d.data()}));
    cb(allTimes);
  });
}

function listenTaskStatuses(cb) {
  return onSnapshot(collection(db,'taskStatuses'), snap => {
    allTaskStatuses = snap.docs.map(d=>({id:d.id,...d.data()}));
    cb(allTaskStatuses);
  });
}
function listenStandards(cb) {
  return onSnapshot(collection(db,'standards'), snap => {
    allStandards = snap.docs.map(d=>({id:d.id,...d.data()}));
    cb(allStandards);
  });
}
function listenBoardSpecs(cb) {
  return onSnapshot(collection(db,'boardSpecs'), snap => {
    allBoardSpecs = snap.docs.map(d=>({id:d.id,...d.data()}));
    cb(allBoardSpecs);
  });
}

// ── RESUME ACTIVE TIMER ON LOGIN ──
async function resumeActiveTimer() {
  // Dismiss recovery banner if still showing
  window.dismissRecoveryBanner && window.dismissRecoveryBanner();
  try {
    // First try localStorage (instant, no network needed)
    const lsData = getTimerFromLS(currentRole==='admin') || getTimerFromLS(currentRole!=='admin');
    let at = lsData;
    if(!at) {
      // Fallback to Firestore
      const snap = await getDoc(doc(db,'activeTimers',currentUser.uid));
      if(!snap.exists()) return;
      at = snap.data();
    }
    const elapsed = Math.floor((Date.now() - at.startTs) / 1000);
    if(elapsed > 86400) { // Older than 24h — discard
      await deleteDoc(doc(db,'activeTimers',currentUser.uid));
      return;
    }
    // Restore state
    const isAdmin = currentRole === 'admin';
    if(isAdmin) {
      admSelectedProject = at.projectId;
      admSelectedBoard = at.boardId;
      admSelectedCat = at.catId;
      admSelectedTask = at.task;
      admTimerStartTs = at.startTs;
      admTimerElapsed = elapsed;
      admTimerRunning = true;
      // Switch to timer tab and show task
      adminTab('timer');
      document.getElementById('adm-timer-task-label').textContent = at.task;
      document.getElementById('adm-timer-section').style.display='block';
      document.getElementById('adm-timer-display').textContent=fmtTime(elapsed);
      document.getElementById('adm-timer-sub').textContent='⚠️ Retomando timer activo...';
      document.getElementById('adm-btn-start').disabled=true;
      document.getElementById('adm-btn-stop').disabled=false;
      admTimerInterval=setInterval(()=>{
        admTimerElapsed=Math.floor((Date.now()-admTimerStartTs)/1000);
        document.getElementById('adm-timer-display').textContent=fmtTime(admTimerElapsed);
      },1000);
    } else {
      selectedProject = at.projectId;
      selectedBoard = at.boardId;
      selectedCat = at.catId;
      selectedTask = at.task;
      timerStartTs = at.startTs;
      timerElapsed = elapsed;
      timerRunning = true;
      // Update UI
      const opSel = document.getElementById('op-project');
      if(opSel) { opSel.value = at.projectId; onProjectChange(); }
      setTimeout(()=>{
        const bSel = document.getElementById('op-board');
        if(bSel) { bSel.value = at.boardId; selectedBoard = at.boardId; }
        selectCat(at.catId);
        setTimeout(()=>{
          selectTask(at.task);
          document.getElementById('timer-sub').textContent='⚠️ Retomando timer activo...';
          document.getElementById('btn-start').disabled=true;
          document.getElementById('btn-stop').disabled=false;
          timerInterval=setInterval(()=>{
            timerElapsed=Math.floor((Date.now()-timerStartTs)/1000);
            document.getElementById('timer-display').textContent=fmtTime(timerElapsed);
          },1000);
        },500);
      },800);
    }
  } catch(e) { console.error('Resume timer error:', e); }
}

// ── ADMIN ──
function initAdmin() {
  unsubProjects = listenProjects(ps => {
    renderProjectList(ps);
    updateStats(ps);
    initAdminTimer();
  });
  unsubTimes = listenTimes(ts => {
    updateStats(projects);
    renderReports(ts);
    renderTeam(ts);
  });
  listenFichajes(()=>{
    if(document.getElementById('admin-view-fichaje').style.display!=='none') renderAdminFichaje();
  });
  listenTaskStatuses(()=>{});
  listenStandards(()=>{});
  listenBoardSpecs(()=>{});
  listenMaterials(()=>{
    const matScreen = document.getElementById('screen-materials');
    if(matScreen && matScreen.classList.contains('active')) renderMatAdmin();
  });
  resumeActiveTimer();
}

function updateStats(ps) {
  const active = ps.filter(p=>p.status==='active').length;
  const boards = ps.filter(p=>p.status==='active').reduce((a,p)=>a+p.qty,0);
  const totalSec = allTimes.reduce((a,t)=>a+t.seconds,0);
  const today = new Date().toDateString();
  const todayCount = allTimes.filter(t => t.ts && new Date(t.ts.seconds*1000).toDateString()===today).length;
  document.getElementById('s-active').textContent = active;
  document.getElementById('s-boards').textContent = boards;
  document.getElementById('s-hours').textContent = fmtHours(totalSec);
  document.getElementById('s-today').textContent = todayCount;
}

function renderProjectList(ps) {
  const el = document.getElementById('project-list');
  if (!ps.length) { el.innerHTML='<div class="empty"><div class="empty-icon">📋</div><div class="empty-text">Sin órdenes aún</div></div>'; return; }
  el.innerHTML = ps.map(p => {
    const times = allTimes.filter(t=>t.projectId===p.id);
    const doneTasks = new Set(times.map(t=>t.boardId+'_'+t.task)).size;
    const totalTasks = p.qty * 49;
    const pct = Math.min(100, Math.round(doneTasks/totalTasks*100));
    return `<div class="card card-pressable" onclick="showProjectDetail('${p.id}')">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div style="font-size:14px;font-weight:600">${p.name}</div>
        <span class="badge badge-active">Activo</span>
      </div>
      <div style="font-size:12px;color:var(--text2)">${p.qty} tabla${p.qty>1?'s':''} · ${p.client}</div>
      <div class="progress"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px">${pct}% completado</div>
    </div>`;
  }).join('');
}

function populateRepFilters() {
  const sel = document.getElementById('rep-filter-project');
  if(!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todos los proyectos</option>' +
    projects.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
  if(cur) sel.value = cur;
}

window.onRepFilterChange = function() {
  const pid = document.getElementById('rep-filter-project').value;
  const bsel = document.getElementById('rep-filter-board');
  if(pid) {
    const p = projects.find(x=>x.id===pid);
    bsel.innerHTML = '<option value="">Todas las tablas</option>' +
      (p ? Array.from({length:p.qty},(_,i)=>`<option value="t${i+1}">Tabla ${String(i+1).padStart(2,'0')}</option>`).join('') : '');
  } else {
    bsel.innerHTML = '<option value="">Todas las tablas</option>';
  }
  renderReports(allTimes);
};

function renderReports(ts) {
  populateRepFilters();
  const filterProject = document.getElementById('rep-filter-project')?.value || '';
  const filterBoard = document.getElementById('rep-filter-board')?.value || '';
  let filtered = ts;
  if(filterProject) filtered = filtered.filter(t=>t.projectId===filterProject);
  if(filterBoard) filtered = filtered.filter(t=>t.boardId===filterBoard);

  // By category — now clickable to expand task list
  const catTotals = {};
  CATEGORIES.forEach(c => catTotals[c.id]=0);
  filtered.forEach(t => { if(catTotals[t.catId]!==undefined) catTotals[t.catId]+=t.seconds; });
  const totalAll = Object.values(catTotals).reduce((a,b)=>a+b,0)||1;

  document.getElementById('rep-cats').innerHTML = CATEGORIES.map(c=>{
    const pct = Math.round(catTotals[c.id]/totalAll*100);
    const doneTasks = c.tasks.filter(taskObj=>{
      const status = allTaskStatuses.find(s=>
        s.task===taskObj.name && s.catId===c.id &&
        (!filterProject||s.projectId===filterProject) &&
        (!filterBoard||s.boardId===filterBoard)
      );
      return status?.status==='done';
    }).length;
    return `
      <div class="rep-cat-block" id="repcat-${c.id}">
        <div class="rep-cat-header" onclick="toggleRepCat('${c.id}')" style="cursor:pointer">
          <div style="flex:1">
            <div class="rep-bar-header">
              <span class="rep-bar-label" style="display:flex;align-items:center;gap:6px">
                <span style="width:8px;height:8px;border-radius:50%;background:${c.color};display:inline-block;flex-shrink:0"></span>
                ${c.label}
              </span>
              <span style="display:flex;align-items:center;gap:8px">
                <span style="font-size:11px;color:var(--text3)">${doneTasks}/${c.tasks.length} tareas</span>
                <span class="rep-bar-val">${fmtHours(catTotals[c.id])} (${pct}%)</span>
                <span id="repcat-arrow-${c.id}" style="color:var(--text3);font-size:13px;transition:transform 0.2s">▸</span>
              </span>
            </div>
            <div class="rep-bar" style="margin-top:6px"><div class="rep-bar-fill" style="width:${pct}%;background:${c.color}"></div></div>
          </div>
        </div>
        <div class="rep-cat-detail" id="repcat-detail-${c.id}" style="display:none;margin-top:8px;border-top:1px solid var(--border);padding-top:8px">
          ${buildCatTaskList(c, filtered, filterProject, filterBoard)}
        </div>
      </div>`;
  }).join('');

  // By operator
  const opTotals = {}, opNames = {};
  filtered.forEach(t => {
    opTotals[t.operatorId] = (opTotals[t.operatorId]||0) + t.seconds;
    opNames[t.operatorId] = t.operatorName||'—';
  });
  const opList = Object.entries(opTotals).sort((a,b)=>b[1]-a[1]);
  document.getElementById('rep-ops').innerHTML = opList.length ? opList.map(([uid,sec])=>`
    <div class="op-row">
      <div class="op-avatar">${(opNames[uid]||'?')[0].toUpperCase()}</div>
      <div class="op-name">${opNames[uid]}</div>
      <div class="op-time">${fmtHours(sec)}</div>
    </div>`).join('') : '<div class="empty"><div class="empty-text">Sin datos aún</div></div>';

  // By board
  const boardTotals = {}, boardNames = {};
  filtered.forEach(t => {
    const key = t.projectId+'_'+t.boardId;
    boardTotals[key] = (boardTotals[key]||0)+t.seconds;
    const p = projects.find(x=>x.id===t.projectId);
    const bNum = t.boardId.replace('t','');
    boardNames[key] = (t.projectName||'?')+' · Tabla '+String(parseInt(bNum)).padStart(2,'0');
  });
  const boardList = Object.entries(boardTotals).sort((a,b)=>b[1]-a[1]).slice(0,30);
  document.getElementById('rep-boards').innerHTML = boardList.length ? boardList.map(([k,sec])=>`
    <div class="saved-entry">
      <span style="font-size:13px">${boardNames[k]}</span>
      <span class="saved-meta">${fmtHours(sec)}</span>
    </div>`).join('') : '<div class="empty"><div class="empty-text">Sin datos aún</div></div>';
}

function buildCatTaskList(cat, filtered, filterProject, filterBoard) {
  const rows = cat.tasks.map(taskObj=>{
    const t = taskObj.name;
    const times = filtered.filter(x=>x.task===t&&x.catId===cat.id);
    const totalSec = times.reduce((a,b)=>a+b.seconds,0);

    // Status
    const statusRec = allTaskStatuses.find(s=>
      s.task===t && s.catId===cat.id &&
      (!filterProject||s.projectId===filterProject) &&
      (!filterBoard||s.boardId===filterBoard)
    );
    const isDone = statusRec?.status==='done';
    const hasTime = totalSec > 0;
    const status = isDone ? 'done' : hasTime ? 'inprogress' : 'pending';

    // Deviation
    const override = allStandards.find(s=>s.task===t&&s.catId===cat.id);
    const stdSec = (override ? override.minutes : (getStdMin(cat.id,t)||0)) * 60;
    let devTag = '';
    if(totalSec && stdSec) {
      const diffMin = Math.round((totalSec - stdSec) / 60);
      const over = totalSec > stdSec * 1.5;
      devTag = `<span class="dev-tag ${over?'dev-over':'dev-ok'}">${diffMin>0?'+':''}${diffMin}m</span>`;
    }

    // Note
    const hasNote = allTimes.some(x=>x.task===t&&(!filterProject||x.projectId===filterProject)&&x.note);
    const noteIcon = hasNote ? '<span style="font-size:12px">📝</span>' : '';

    const dotClass = isDone?'status-done':hasTime?'status-inprogress':'status-pending';
    const nameStyle = isDone ? 'color:var(--text3);text-decoration:line-through' : '';

    return {status, row: `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
        <span class="status-dot ${dotClass}"></span>
        <span style="flex:1;font-size:13px;${nameStyle}">${t}</span>
        ${noteIcon}
        ${devTag}
        <span style="font-size:12px;font-family:'DM Mono',monospace;color:var(--text2);min-width:48px;text-align:right">${totalSec?fmtTime(totalSec):'—'}</span>
      </div>`};
  });

  // Sort: done last
  const sorted = [...rows.filter(r=>r.status!=='done'), ...rows.filter(r=>r.status==='done')];
  const doneCount = rows.filter(r=>r.status==='done').length;
  const inProgCount = rows.filter(r=>r.status==='inprogress').length;

  return `
    <div style="display:flex;gap:12px;margin-bottom:8px;font-size:12px">
      <span style="color:var(--teal-mid)">● ${doneCount} completadas</span>
      <span style="color:var(--amber)">● ${inProgCount} en curso</span>
      <span style="color:var(--text3)">● ${cat.tasks.length-doneCount-inProgCount} pendientes</span>
    </div>
    <div style="padding:0 4px">
      ${sorted.map(r=>r.row).join('')}
    </div>`;
}

window.toggleRepCat = function(cid) {
  const detail = document.getElementById('repcat-detail-'+cid);
  const arrow = document.getElementById('repcat-arrow-'+cid);
  const isOpen = detail.style.display !== 'none';
  detail.style.display = isOpen ? 'none' : 'block';
  arrow.style.transform = isOpen ? '' : 'rotate(90deg)';
  // Rebuild content on open to get fresh data
  if(!isOpen) {
    const filterProject = document.getElementById('rep-filter-project')?.value||'';
    const filterBoard = document.getElementById('rep-filter-board')?.value||'';
    let filtered = allTimes;
    if(filterProject) filtered = filtered.filter(t=>t.projectId===filterProject);
    if(filterBoard) filtered = filtered.filter(t=>t.boardId===filterBoard);
    const cat = CATEGORIES.find(c=>c.id===cid);
    detail.innerHTML = buildCatTaskList(cat, filtered, filterProject, filterBoard);
  }
};

function renderTeam(ts) {
  const opMap = {};
  ts.forEach(t=>{ opMap[t.operatorId]={name:t.operatorName||'—',uid:t.operatorId}; });
  const list = Object.values(opMap);
  document.getElementById('team-list').innerHTML = list.length ? list.map(op=>`
    <div class="op-row">
      <div class="op-avatar">${op.name[0].toUpperCase()}</div>
      <div class="op-name">${op.name}</div>
      <span class="badge badge-active">Activo</span>
    </div>`).join('') : '<div class="empty"><div class="empty-text">Sin operarios aún</div></div>';
}

window.adminTab = function(t) {
  ['projects','timer','fichaje','reports','team'].forEach(v => {
    document.getElementById('admin-view-'+v).style.display = v===t?'block':'none';
  });
  document.getElementById('tab-proj').classList.toggle('active',t==='projects');
  document.getElementById('tab-timer').classList.toggle('active',t==='timer');
  document.getElementById('tab-fich').classList.toggle('active',t==='fichaje');
  document.getElementById('tab-rep').classList.toggle('active',t==='reports');
  document.getElementById('tab-team').classList.toggle('active',t==='team');
  if(t==='fichaje') renderAdminFichaje();
};

window.showNewOrder = function() { showScreen('screen-new-order'); };

window.createOrder = async function() {
  const name = document.getElementById('no-name').value.trim();
  const qty = parseInt(document.getElementById('no-qty').value)||1;
  const client = document.getElementById('no-client').value.trim()||'Sin especificar';
  const model = document.getElementById('no-model').value.trim();
  const notes = document.getElementById('no-notes').value.trim();
  if(!name){alert('Ingresá un nombre para la orden'); return;}
  try {
    await addDoc(collection(db,'projects'), {
      name, qty, client, model, notes,
      status:'active',
      createdBy: currentUser.uid,
      createdAt: serverTimestamp()
    });
    goBack('screen-admin');
  } catch(e) { alert('Error al crear: '+e.message); }
};

window.showProjectDetail = function(pid) {
  currentSpecProjectId = pid;
  const p = projects.find(x=>x.id===pid);
  if(!p) return;
  document.getElementById('detail-header').innerHTML = `
    <div class="topbar-title">${p.name}</div>
    <div class="topbar-sub">${p.qty} tabla${p.qty>1?'s':''} · ${p.client}</div>`;
  const timesForProject = allTimes.filter(t=>t.projectId===pid);
  const totalTasksPerBoard = CATEGORIES.reduce((a,c)=>a+c.tasks.length,0);
  document.getElementById('detail-content').innerHTML = `
    <div class="section-title">Tablas del lote</div>
    ${Array.from({length:p.qty},(_,i)=>{
      const bid = 't'+(i+1);
      const bt = timesForProject.filter(t=>t.boardId===bid);
      const sec = bt.reduce((a,t)=>a+t.seconds,0);
      const doneTasks = allTaskStatuses.filter(s=>s.projectId===pid&&s.boardId===bid&&s.status==='done').length;
      const pct = Math.min(100, Math.round(doneTasks/totalTasksPerBoard*100));
      const hasSpec = allBoardSpecs.some(s=>s.projectId===pid&&s.boardId===bid);
      return `<div class="card" style="cursor:pointer" onclick="openBoardSpec('${pid}','${bid}')">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
          <div style="font-size:14px;font-weight:500">Tabla ${String(i+1).padStart(2,'0')}</div>
          <div style="display:flex;align-items:center;gap:8px">
            ${hasSpec?'<span style="font-size:12px">📐</span>':''}
            <span style="font-size:12px;font-family:\'DM Mono\',monospace;color:var(--text2)">${sec?fmtHours(sec):'—'}</span>
          </div>
        </div>
        <div class="progress"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">${doneTasks}/${totalTasksPerBoard} tareas · ${pct}% completado</div>
      </div>`;
    }).join('')}
    <button class="btn" onclick="openMatAdmin('${pid}')" style="margin-top:4px;border-color:var(--blue);color:var(--blue)">📦 Gestionar materiales del lote</button>`;
  showScreen('screen-project-detail');
};

// ── ADMIN TIMER (mirrors operator logic) ──
let admSelectedCat = null, admSelectedTask = null, admSelectedProject = null, admSelectedBoard = null;
let admTimerInterval = null, admTimerRunning = false, admTimerStartTs = null, admTimerElapsed = 0;

function initAdminTimer() {
  // populate project selector for admin timer tab
  const sel = document.getElementById('adm-project');
  sel.innerHTML = '<option value="">— Elegir proyecto —</option>' +
    projects.filter(p=>p.status==='active').map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
  renderAdmCats();
}

window.admOnProjectChange = function() {
  admSelectedProject = document.getElementById('adm-project').value;
  const p = projects.find(x=>x.id===admSelectedProject);
  const bsel = document.getElementById('adm-board');
  if(p) {
    bsel.innerHTML = '<option value="">— Elegir tabla —</option>' +
      Array.from({length:p.qty},(_,i)=>`<option value="t${i+1}">Tabla ${String(i+1).padStart(2,'0')}</option>`).join('');
    if(p.qty===1) { bsel.value='t1'; admSelectedBoard='t1'; bsel.style.display='none'; }
    else { bsel.style.display=''; bsel.onchange = () => { admSelectedBoard = bsel.value; }; }
  } else {
    bsel.innerHTML = '<option value="">— Elegir tabla —</option>';
    bsel.style.display='';
  }
};

function renderAdmCats() {
  document.getElementById('adm-cat-list').innerHTML = CATEGORIES.map(c=>`
    <button class="cat-btn" id="admcatbtn-${c.id}" onclick="admSelectCat('${c.id}')">
      <span class="cat-dot" style="background:${c.color}"></span>
      <span style="flex:1">${c.label}</span>
      <span class="cat-count">${c.tasks.length}</span>
    </button>`).join('');
}

window.admSelectCat = function(cid) {
  admSelectedCat = cid;
  CATEGORIES.forEach(c => {
    const btn = document.getElementById('admcatbtn-'+c.id);
    if(c.id===cid){btn.classList.add('selected');btn.style.borderColor=c.color;btn.style.background='var(--surface2)';}
    else{btn.classList.remove('selected');btn.style.borderColor='';btn.style.background='';}
  });
  const cat = CATEGORIES.find(c=>c.id===cid);
  document.getElementById('adm-task-section').style.display='block';
  document.getElementById('adm-task-section-title').textContent=cat.label;
  document.getElementById('adm-timer-section').style.display='none';
  const tasksForCat = allTimes.filter(t=>t.catId===cid&&t.projectId===admSelectedProject&&t.boardId===admSelectedBoard);
  document.getElementById('adm-task-list').innerHTML = cat.tasks.map(taskObj=>{
    const t = taskObj.name;
    const total = tasksForCat.filter(x=>x.task===t).reduce((a,b)=>a+b.seconds,0);
    const status = getTaskStatusLocal(t,cid,admSelectedProject,admSelectedBoard);
    const hasNote = allTimes.some(x=>x.task===t&&x.projectId===admSelectedProject&&x.boardId===admSelectedBoard&&x.note);
    return `<div class="task-row" onclick="admSelectTask('${t.replace(/'/g,"\\'")}')">
      ${statusDot(status)}
      <div class="task-name" style="${status==='done'?'color:var(--text3);text-decoration:line-through':''}">${t}</div>
      ${hasNote?'<span style="font-size:13px">📝</span>':''}
      <div class="task-time">${total?fmtTime(total):'—'}</div>
    </div>`;
  }).join('');
};

window.admSelectTask = function(t) {
  admSelectedTask = t;
  document.getElementById('adm-timer-task-label').textContent = t;
  document.getElementById('adm-timer-section').style.display='block';
  document.getElementById('adm-timer-display').textContent='00:00:00';
  document.getElementById('adm-timer-sub').textContent='Presioná Iniciar para comenzar';
  admTimerElapsed = 0;
  if(admTimerInterval){clearInterval(admTimerInterval);admTimerInterval=null;admTimerRunning=false;}
  document.getElementById('adm-btn-start').disabled=false;
  document.getElementById('adm-btn-stop').disabled=true;
  // Note bubble
  const noteEl2 = document.getElementById('adm-task-note-bubble');
  if(noteEl2) noteEl2.style.display='none';
  // Sequence warning
  const cat = CATEGORIES.find(c=>c.id===admSelectedCat);
  const taskIdx = cat ? cat.tasks.findIndex(tk=>tk.name===t) : -1;
  let seqWarning='';
  if(taskIdx>0){
    const prevTask=cat.tasks[taskIdx-1].name;
    const prevHasTimes=allTimes.some(x=>x.task===prevTask&&x.catId===admSelectedCat&&x.projectId===admSelectedProject&&x.boardId===admSelectedBoard);
    if(!prevHasTimes) seqWarning=`<div class="seq-warning">⚠️ La tarea anterior <strong>${prevTask}</strong> no tiene registros. ¿Ya fue realizada?</div>`;
  }
  const seqEl=document.getElementById('adm-task-seq-warning');
  if(seqEl) seqEl.innerHTML=seqWarning;
  // Mark done button
  const status=getTaskStatusLocal(t,admSelectedCat,admSelectedProject,admSelectedBoard);
  const doneEl=document.getElementById('adm-btn-mark-done');
  if(doneEl){
    if(status==='done'){doneEl.textContent='✓ Marcada como completada';doneEl.className='btn';doneEl.style.color='var(--teal)';doneEl.disabled=true;}
    else{doneEl.textContent='✓ Marcar como completada';doneEl.className='btn btn-outline';doneEl.disabled=false;}
  }
  renderSavedTimes(allTimes, 'admin');
  setTimeout(()=>document.getElementById('adm-timer-section').scrollIntoView({behavior:'smooth'}),100);
};

window.admStartTimer = async function() {
  if(admTimerRunning) return;
  if(!admSelectedProject||!admSelectedBoard){alert('Seleccioná proyecto y tabla primero'); return;}
  const startTs = Date.now();
  admTimerStartTs = startTs;
  admTimerRunning = true;
  admTimerElapsed = 0;
  document.getElementById('adm-btn-start').disabled=true;
  document.getElementById('adm-btn-stop').disabled=false;
  document.getElementById('adm-timer-sub').textContent='Corriendo...';
  saveTimerToLS(true);
  // Start visual timer immediately
  admTimerInterval=setInterval(()=>{
    admTimerElapsed=Math.floor((Date.now()-admTimerStartTs)/1000);
    document.getElementById('adm-timer-display').textContent=fmtTime(admTimerElapsed);
  },1000);
  // Persist to Firestore in background
  try {
    const p = projects.find(x=>x.id===admSelectedProject);
    const snap = await getDoc(doc(db,'users',currentUser.uid));
    const operatorName = snap.exists()?snap.data().name:currentUser.email;
    await setDoc(doc(db,'activeTimers',currentUser.uid), {
      projectId:admSelectedProject, projectName:p?p.name:'—',
      boardId:admSelectedBoard, catId:admSelectedCat, task:admSelectedTask,
      operatorId:currentUser.uid, operatorName,
      startTs, ts:serverTimestamp()
    });
  } catch(e) {
    console.warn('activeTimers write failed:', e.message);
    document.getElementById('adm-timer-sub').textContent='Corriendo (sin respaldo en nube — verificar conexión)';
  }
};

window.admStopTimer = async function() {
  if(!admTimerRunning) return;
  clearInterval(admTimerInterval);admTimerInterval=null;admTimerRunning=false;
  const seconds=admTimerElapsed;
  const startTs=admTimerStartTs;
  const endTs=Date.now();
  document.getElementById('adm-btn-start').disabled=false;
  document.getElementById('adm-btn-stop').disabled=true;
  document.getElementById('adm-timer-sub').textContent='Guardando...';
  const p = projects.find(x=>x.id===admSelectedProject);
  try {
    const snap = await getDoc(doc(db,'users',currentUser.uid));
    const operatorName = snap.exists()?snap.data().name:currentUser.email;
    await addDoc(collection(db,'times'), {
      projectId:admSelectedProject, projectName:p?p.name:'—',
      boardId:admSelectedBoard, catId:admSelectedCat, task:admSelectedTask,
      operatorId:currentUser.uid, operatorName, seconds, startTs, endTs,
      note: pendingNote,
      ts:serverTimestamp()
    });
    pendingNote = '';
    clearTimerFromLS(true);
    try{ await deleteDoc(doc(db,'activeTimers',currentUser.uid)); }catch(e){}
    admTimerElapsed=0;
    document.getElementById('adm-timer-display').textContent='00:00:00';
    document.getElementById('adm-timer-sub').textContent='Guardado ✓';
    const cat = CATEGORIES.find(c=>c.id===admSelectedCat);
    const tasksForCat = allTimes.filter(t=>t.catId===admSelectedCat&&t.projectId===admSelectedProject&&t.boardId===admSelectedBoard);
    document.getElementById('adm-task-list').innerHTML = cat.tasks.map(taskObj=>{
      const t = taskObj.name;
      const total = tasksForCat.filter(x=>x.task===t).reduce((a,b)=>a+b.seconds,0);
      const status = getTaskStatusLocal(t,admSelectedCat,admSelectedProject,admSelectedBoard);
      const hasNote = allTimes.some(x=>x.task===t&&x.projectId===admSelectedProject&&x.boardId===admSelectedBoard&&x.note);
      return `<div class="task-row" onclick="admSelectTask('${t.replace(/'/g,"\\'")}')">
        ${statusDot(status)}
        <div class="task-name" style="${status==='done'?'color:var(--text3);text-decoration:line-through':''}">${t}</div>
        ${hasNote?'<span style="font-size:14px">📝</span>':''}
        <div class="task-time">${total?fmtTime(total):'—'}</div>
      </div>`;
    }).join('');
    renderSavedTimes(allTimes, 'admin');
  } catch(e) { document.getElementById('adm-timer-sub').textContent='Error: '+e.message; }
};

// ── OPERATOR ──
function initOperator() {
  unsubProjects = listenProjects(ps => {
    const sel = document.getElementById('op-project');
    const cur = sel.value;
    sel.innerHTML = '<option value="">— Elegir proyecto —</option>' +
      ps.filter(p=>p.status==='active').map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
    if(cur) sel.value = cur;
  });
  unsubTimes = listenTimes(ts => {
    if(selectedTask) renderSavedTimes(ts, 'operator');
  });
  listenFichajes(()=>{ renderOperatorFichaje(); });
  listenTaskStatuses(()=>{});
  listenStandards(()=>{});
  listenBoardSpecs(()=>{});
  listenMaterials(()=>{});
  renderCats();
  // Resume active timer if exists
  resumeActiveTimer();
}

window.onProjectChange = function() {
  selectedProject = document.getElementById('op-project').value;
  const p = projects.find(x=>x.id===selectedProject);
  const bsel = document.getElementById('op-board');
  if(p) {
    bsel.innerHTML = '<option value="">— Elegir tabla —</option>' +
      Array.from({length:p.qty},(_,i)=>`<option value="t${i+1}">Tabla ${String(i+1).padStart(2,'0')}</option>`).join('');
    if(p.qty===1) { bsel.value='t1'; selectedBoard='t1'; bsel.style.display='none'; }
    else { bsel.style.display=''; bsel.onchange = () => { selectedBoard = bsel.value; }; }
  } else {
    bsel.innerHTML = '<option value="">— Elegir tabla —</option>';
    bsel.style.display='';
  }
};

function renderCats() {
  document.getElementById('cat-list').innerHTML = CATEGORIES.map(c=>`
    <button class="cat-btn" id="catbtn-${c.id}" onclick="selectCat('${c.id}')">
      <span class="cat-dot" style="background:${c.color}"></span>
      <span style="flex:1">${c.label}</span>
      <span class="cat-count">${c.tasks.length}</span>
    </button>`).join('');
}

// ── TASK STATUS HELPERS ──
function getTaskStatusLocal(taskName, catId, projectId, boardId) {
  const s = allTaskStatuses.find(x=>x.task===taskName&&x.catId===catId&&x.projectId===projectId&&x.boardId===boardId);
  if(s) return s.status; // 'done'
  const hasTimes = allTimes.some(x=>x.task===taskName&&x.catId===catId&&x.projectId===projectId&&x.boardId===boardId);
  return hasTimes ? 'inprogress' : 'pending';
}
function statusDot(status) {
  const cls = status==='done'?'status-done':status==='inprogress'?'status-inprogress':'status-pending';
  return `<span class="status-dot ${cls}"></span>`;
}
function getTaskDeviation(taskName, catId, projectId, boardId) {
  const times = allTimes.filter(x=>x.task===taskName&&x.catId===catId&&x.projectId===projectId&&x.boardId===boardId);
  if(!times.length) return null;
  const totalSec = times.reduce((a,b)=>a+b.seconds,0);
  // Use overridden standard from allStandards, fallback to CATEGORIES default
  const override = allStandards.find(s=>s.task===taskName&&s.catId===catId);
  const stdSec = override ? override.minutes*60 : (getStdMin(catId,taskName)||0)*60;
  if(!stdSec) return null;
  const ratio = totalSec/stdSec;
  const diffMin = Math.round((totalSec-stdSec)/60);
  return {ratio, diffMin, over: ratio>1.5};
}

window.selectCat = function(cid) {
  selectedCat = cid;
  CATEGORIES.forEach(c => {
    const btn = document.getElementById('catbtn-'+c.id);
    if(c.id===cid){btn.classList.add('selected');btn.style.borderColor=c.color;btn.style.background='var(--surface2)';}
    else{btn.classList.remove('selected');btn.style.borderColor='';btn.style.background='';}
  });
  const cat = CATEGORIES.find(c=>c.id===cid);
  document.getElementById('task-section').style.display='block';
  document.getElementById('task-section-title').textContent=cat.label;
  document.getElementById('timer-section').style.display='none';
  document.getElementById('task-list').innerHTML = cat.tasks.map(taskObj=>{
    const t = taskObj.name;
    const times = allTimes.filter(x=>x.task===t&&x.catId===cid&&x.projectId===selectedProject&&x.boardId===selectedBoard);
    const total = times.reduce((a,b)=>a+b.seconds,0);
    const status = getTaskStatusLocal(t,cid,selectedProject,selectedBoard);
    const dev = getTaskDeviation(t,cid,selectedProject,selectedBoard);
    const hasNote = allTimes.some(x=>x.task===t&&x.projectId===selectedProject&&x.boardId===selectedBoard&&x.note);
    let devTag='';
    if(dev) devTag=`<span class="dev-tag ${dev.over?'dev-over':'dev-ok'}">${dev.diffMin>0?'+':''}${dev.diffMin}m</span>`;
    return `<div class="task-row" onclick="selectTask('${t.replace(/'/g,"\\'")}')">
      ${statusDot(status)}
      <div class="task-name" style="${status==='done'?'color:var(--text3);text-decoration:line-through':''}">${t}</div>
      ${hasNote?'<span style="font-size:13px">📝</span>':''}
      ${devTag}
      <div class="task-time">${total?fmtTime(total):'—'}</div>
    </div>`;
  }).join('');
};

window.selectTask = function(t) {
  selectedTask = t;
  document.getElementById('timer-task-label').textContent = t;
  document.getElementById('timer-section').style.display='block';
  document.getElementById('timer-display').textContent='00:00:00';
  document.getElementById('timer-sub').textContent='Presioná Iniciar para comenzar';
  timerElapsed = 0;
  if(timerInterval){clearInterval(timerInterval);timerInterval=null;timerRunning=false;}
  document.getElementById('btn-start').disabled=false;
  document.getElementById('btn-stop').disabled=true;
  // Note bubble hidden (notes are now per-record, visible in saved times list)
  const noteEl = document.getElementById('task-note-bubble');
  if(noteEl) noteEl.style.display='none';
  // Sequence warning
  const cat = CATEGORIES.find(c=>c.id===selectedCat);
  const taskIdx = cat.tasks.findIndex(tk=>tk.name===t);
  let seqWarning='';
  if(taskIdx>0) {
    const prevTask = cat.tasks[taskIdx-1].name;
    const prevHasTimes = allTimes.some(x=>x.task===prevTask&&x.catId===selectedCat&&x.projectId===selectedProject&&x.boardId===selectedBoard);
    if(!prevHasTimes) seqWarning=`<div class="seq-warning">⚠️ La tarea anterior <strong>${prevTask}</strong> no tiene registros. ¿Ya fue realizada?</div>`;
  }
  const seqEl = document.getElementById('task-seq-warning');
  if(seqEl) seqEl.innerHTML = seqWarning;
  // Mark done button
  const status = getTaskStatusLocal(t,selectedCat,selectedProject,selectedBoard);
  const doneEl = document.getElementById('btn-mark-done');
  if(doneEl) {
    if(status==='done') { doneEl.textContent='✓ Marcada como completada'; doneEl.className='btn'; doneEl.style.color='var(--teal)'; doneEl.disabled=true; }
    else { doneEl.textContent='✓ Marcar como completada'; doneEl.className='btn btn-outline'; doneEl.disabled=false; }
  }
  renderSavedTimes(allTimes,'operator');
  setTimeout(()=>document.getElementById('timer-section').scrollIntoView({behavior:'smooth'}),100);
};

window.markTaskDone = async function() {
  const task=selectedTask, catId=selectedCat, projectId=selectedProject, boardId=selectedBoard;
  if(!task||!projectId||!boardId) return;
  const snap = await getDoc(doc(db,'users',currentUser.uid));
  const operatorName = snap.exists()?snap.data().name:currentUser.email;
  const statusId = (projectId+'_'+boardId+'_'+task).replace(/[^a-zA-Z0-9]/g,'_').slice(0,100);
  await setDoc(doc(db,'taskStatuses',statusId),{task,catId,projectId,boardId,status:'done',markedBy:currentUser.uid,markedByName:operatorName,markedAt:serverTimestamp()});
  selectTask(task);
};

window.markTaskDoneAdm = async function() {
  const task=admSelectedTask,catId=admSelectedCat,projectId=admSelectedProject,boardId=admSelectedBoard;
  if(!task||!projectId||!boardId) return;
  const snap = await getDoc(doc(db,'users',currentUser.uid));
  const operatorName = snap.exists()?snap.data().name:currentUser.email;
  const statusId = (projectId+'_'+boardId+'_'+task).replace(/[^a-zA-Z0-9]/g,'_').slice(0,100);
  await setDoc(doc(db,'taskStatuses',statusId),{task,catId,projectId,boardId,status:'done',markedBy:currentUser.uid,markedByName:operatorName,markedAt:serverTimestamp()});
  admSelectTask(task);
};

window.startTimer = async function() {
  if(timerRunning) return;
  if(!selectedProject||!selectedBoard){alert('Seleccioná proyecto y tabla primero'); return;}
  const startTs = Date.now();
  timerStartTs = startTs;
  timerRunning = true;
  timerElapsed = 0;
  document.getElementById('btn-start').disabled=true;
  document.getElementById('btn-stop').disabled=false;
  document.getElementById('timer-sub').textContent='Corriendo...';
  // Save to localStorage immediately for instant recovery on reload
  saveTimerToLS(false);
  // Start visual timer immediately — don't wait for Firestore
  timerInterval=setInterval(()=>{
    timerElapsed=Math.floor((Date.now()-timerStartTs)/1000);
    document.getElementById('timer-display').textContent=fmtTime(timerElapsed);
  },1000);
  // Persist to Firestore in background (non-blocking)
  try {
    const p = projects.find(x=>x.id===selectedProject);
    const snap = await getDoc(doc(db,'users',currentUser.uid));
    const operatorName = snap.exists()?snap.data().name:currentUser.email;
    await setDoc(doc(db,'activeTimers',currentUser.uid), {
      projectId:selectedProject, projectName:p?p.name:'—',
      boardId:selectedBoard, catId:selectedCat, task:selectedTask,
      operatorId:currentUser.uid, operatorName,
      startTs, ts:serverTimestamp()
    });
  } catch(e) {
    // Timer still running locally — warn but don't stop
    console.warn('activeTimers write failed:', e.message);
    document.getElementById('timer-sub').textContent='Corriendo (sin respaldo en nube — verificar conexión)';
  }
};

window.stopTimer = async function() {
  if(!timerRunning) return;
  clearInterval(timerInterval); timerInterval=null; timerRunning=false;
  const seconds=timerElapsed;
  const startTs=timerStartTs;
  const endTs=Date.now();
  document.getElementById('btn-start').disabled=false;
  document.getElementById('btn-stop').disabled=true;
  document.getElementById('timer-sub').textContent='Guardando...';
  const p = projects.find(x=>x.id===selectedProject);
  try {
    const snap = await getDoc(doc(db,'users',currentUser.uid));
    const operatorName = snap.exists()?snap.data().name:currentUser.email;
    await addDoc(collection(db,'times'), {
      projectId:selectedProject, projectName:p?p.name:'—',
      boardId:selectedBoard, catId:selectedCat, task:selectedTask,
      operatorId:currentUser.uid, operatorName, seconds, startTs, endTs,
      note: pendingNote,
      ts:serverTimestamp()
    });
    pendingNote = '';
    // Reset note button label
    const noteBtns = document.querySelectorAll('button[onclick="openNoteModal()"]');
    noteBtns.forEach(b=>b.textContent='📝 Agregar nota al próximo registro');
    // Remove active timer
    clearTimerFromLS(false);
    try{ await deleteDoc(doc(db,'activeTimers',currentUser.uid)); }catch(e){}
    timerElapsed=0;
    document.getElementById('timer-display').textContent='00:00:00';
    document.getElementById('timer-sub').textContent='Guardado ✓';
    const cat = CATEGORIES.find(c=>c.id===selectedCat);
    const tasksForCat = allTimes.filter(t=>t.catId===selectedCat&&t.projectId===selectedProject&&t.boardId===selectedBoard);
    document.getElementById('task-list').innerHTML = cat.tasks.map(taskObj=>{
      const t = taskObj.name;
      const total = tasksForCat.filter(x=>x.task===t).reduce((a,b)=>a+b.seconds,0);
      const status = getTaskStatusLocal(t,selectedCat,selectedProject,selectedBoard);
      const hasNote = allTimes.some(x=>x.task===t&&x.projectId===selectedProject&&x.boardId===selectedBoard&&x.note);
      return `<div class="task-row" onclick="selectTask('${t.replace(/'/g,"\\'")}')">
        ${statusDot(status)}
        <div class="task-name" style="${status==='done'?'color:var(--text3);text-decoration:line-through':''}">${t}</div>
        ${hasNote?'<span style="font-size:14px">📝</span>':''}
        <div class="task-time">${total?fmtTime(total):'—'}</div>
      </div>`;
    }).join('');
    renderSavedTimes(allTimes, 'operator');
  } catch(e) {
    document.getElementById('timer-sub').textContent='Error al guardar: '+e.message;
  }
};

function renderSavedTimes(ts, context) {
  const task = context==='admin' ? admSelectedTask : selectedTask;
  const project = context==='admin' ? admSelectedProject : selectedProject;
  const board = context==='admin' ? admSelectedBoard : selectedBoard;
  const elId = context==='admin' ? 'adm-saved-times' : 'saved-times';
  const relevant = (ts||allTimes).filter(x=>x.task===task&&x.projectId===project&&x.boardId===board);
  const el = document.getElementById(elId);
  if(!el) return;
  if(!relevant.length){el.innerHTML='';return;}
  const total = relevant.reduce((a,b)=>a+b.seconds,0);
  el.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div class="section-title" style="margin:0">Registros (${relevant.length})</div>
      <div style="font-size:13px;font-family:'DM Mono',monospace;color:var(--text2)">Total: ${fmtTime(total)}</div>
    </div>
    <div class="card" style="padding:0 16px">
    ${relevant.slice(0,10).map(r=>`
      <div class="time-row-edit" style="flex-wrap:wrap">
        <div class="time-info" style="min-width:0">
          <div class="time-info-name">${r.operatorName||'—'}</div>
          <div class="time-info-meta">${fmtRecordDate(r)}</div>
          ${r.note?`<div style="font-size:12px;color:var(--amber);margin-top:3px;font-style:italic">📝 ${r.note}</div>`:''}
        </div>
        <div class="time-duration">${fmtTime(r.seconds)}</div>
        ${canEditRecord(r) ? `
          <button class="icon-btn" onclick="openEditModal('${r.id}')" title="Editar tiempo">✏️</button>
          <button class="icon-btn" onclick="openNoteOnRecord('${r.id}')" title="Editar nota" style="font-size:16px">📝</button>
          <button class="icon-btn danger" onclick="deleteRecord('${r.id}')" title="Eliminar">🗑</button>
        ` : ''}
      </div>`).join('')}
    </div>`;
}

function fmtRecordDate(r) {
  if(r.startTs) {
    const d = new Date(r.startTs);
    return d.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'}) + ' ' + d.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
  }
  if(r.ts?.seconds) {
    const d = new Date(r.ts.seconds*1000);
    return d.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'}) + ' ' + d.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
  }
  return '—';
}

function canEditRecord(r) {
  if(currentRole==='admin') return true;
  return r.operatorId === currentUser.uid;
}

// ── MODAL: RECORDS + MANUAL ENTRY ──
let modalContext = 'operator';
window.openRecordsModal = async function(taskArg, contextArg) {
  // Detect context from which panel has active task
  const context = contextArg || (admSelectedTask && admSelectedProject ? 'admin' : 'operator');
  const task = taskArg || (context==='admin' ? admSelectedTask : selectedTask);
  if(!task) { alert('Seleccioná una tarea primero'); return; }
  modalTask = task;
  modalContext = context;
  document.getElementById('modal-task-name').textContent = task;
  const today = todayStr();
  document.getElementById('man-date').value = today;
  document.getElementById('man-start').value = '';
  document.getElementById('man-end').value = '';
  // Load users into dropdown
  const sel = document.getElementById('man-operator');
  sel.innerHTML = '<option value="">— Elegir —</option>';
  try {
    const snap = await getDocs(collection(db,'users'));
    snap.forEach(d => {
      const u = d.data();
      const opt = document.createElement('option');
      opt.value = u.name;
      opt.textContent = u.name + (u.role==='admin'?' (admin)':'');
      sel.appendChild(opt);
    });
  } catch(e) { console.error('Error cargando usuarios:', e); }
  document.getElementById('modal-records').classList.add('open');
};

window.closeModal = function() {
  document.getElementById('modal-records').classList.remove('open');
};

window.saveManualRecord = async function() {
  const dateVal = document.getElementById('man-date').value;
  const startVal = document.getElementById('man-start').value;
  const endVal = document.getElementById('man-end').value;
  const opName = document.getElementById('man-operator').value.trim();
  if(!dateVal||!startVal||!endVal||!opName){alert('Completá todos los campos'); return;}
  const startTs = new Date(dateVal+'T'+startVal).getTime();
  const endTs = new Date(dateVal+'T'+endVal).getTime();
  if(endTs<=startTs){alert('La hora de fin debe ser mayor a la de inicio'); return;}
  const seconds = Math.floor((endTs-startTs)/1000);
  const proj = modalContext==='admin' ? admSelectedProject : selectedProject;
  const board = modalContext==='admin' ? admSelectedBoard : selectedBoard;
  const cat = modalContext==='admin' ? admSelectedCat : selectedCat;
  const p = projects.find(x=>x.id===proj);
  try {
    await addDoc(collection(db,'times'), {
      projectId: proj, projectName: p?p.name:'—',
      boardId: board, catId: cat,
      task: modalTask,
      operatorId: currentUser.uid, operatorName: opName,
      seconds, startTs, endTs, manual: true,
      ts: serverTimestamp()
    });
    closeModal();
  } catch(e) { alert('Error al guardar: '+e.message); }
};
// ── MODAL: EDIT RECORD ──
window.openEditModal = function(recordId) {
  const r = allTimes.find(x=>x.id===recordId);
  if(!r) return;
  editingRecordId = recordId;

  // Reconstruct start/end from whatever data is available
  let startMs, endMs;
  if(r.startTs && r.endTs) {
    startMs = r.startTs;
    endMs = r.endTs;
  } else if(r.startTs) {
    startMs = r.startTs;
    endMs = r.startTs + r.seconds * 1000;
  } else if(r.ts?.seconds) {
    // cronómetro: ts es cuando se detuvo, retrocedemos por seconds
    endMs = r.ts.seconds * 1000;
    startMs = endMs - r.seconds * 1000;
  } else {
    startMs = Date.now() - r.seconds * 1000;
    endMs = Date.now();
  }

  const toLocalISO = ms => {
    const d = new Date(ms);
    const pad = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  };
  const toLocalTime = ms => {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  document.getElementById('edit-date').value = toLocalISO(startMs);
  document.getElementById('edit-start').value = toLocalTime(startMs);
  document.getElementById('edit-end').value = toLocalTime(endMs);
  updateEditDuration();

  // Add live update listeners
  ['edit-date','edit-start','edit-end'].forEach(id => {
    const el = document.getElementById(id);
    el.oninput = updateEditDuration;
  });

  document.getElementById('modal-edit').classList.add('open');
};

function updateEditDuration() {
  const d = document.getElementById('edit-date').value;
  const s = document.getElementById('edit-start').value;
  const e = document.getElementById('edit-end').value;
  if(d&&s&&e) {
    const diff = new Date(d+'T'+e) - new Date(d+'T'+s);
    if(diff>0) { document.getElementById('edit-duration').textContent = fmtTime(Math.floor(diff/1000)); return; }
  }
  document.getElementById('edit-duration').textContent = '—';
}

window.closeEditModal = function() {
  document.getElementById('modal-edit').classList.remove('open');
  editingRecordId = null;
};

window.saveEditRecord = async function() {
  if(!editingRecordId) return;
  const d = document.getElementById('edit-date').value;
  const s = document.getElementById('edit-start').value;
  const e = document.getElementById('edit-end').value;
  if(!d||!s||!e){alert('Completá todos los campos'); return;}
  const startTs = new Date(d+'T'+s).getTime();
  const endTs = new Date(d+'T'+e).getTime();
  if(endTs<=startTs){alert('La hora de fin debe ser mayor a la de inicio'); return;}
  const seconds = Math.floor((endTs-startTs)/1000);
  try {
    await updateDoc(doc(db,'times',editingRecordId), { startTs, endTs, seconds, editedAt: serverTimestamp(), editedBy: currentUser.uid });
    closeEditModal();
  } catch(e) { alert('Error al guardar: '+e.message); }
};

window.deleteRecord = async function(recordId) {
  const r = allTimes.find(x=>x.id===recordId);
  if(!r) return;
  if(!canEditRecord(r)){alert('No tenés permiso para eliminar este registro'); return;}
  if(!confirm('¿Eliminar este registro?')) return;
  try {
    await deleteDoc(doc(db,'times',recordId));
  } catch(e) { alert('Error al eliminar: '+e.message); }
};

// ── OPERATOR TAB ──
window.opTab = function(t) {
  document.getElementById('op-view-timer').style.display = t==='timer'?'block':'none';
  document.getElementById('op-view-fichaje').style.display = t==='fichaje'?'block':'none';
  document.getElementById('op-tab-timer').classList.toggle('active',t==='timer');
  document.getElementById('op-tab-fichaje').classList.toggle('active',t==='fichaje');
  document.getElementById('op-title').textContent = t==='timer'?'Registrar tiempo':'Fichaje';
  if(t==='fichaje') renderOperatorFichaje();
};

// ── NOTES — per-record comments ──
// Notes are now stored directly on the time record (times collection)
// The note modal pre-fills for the NEXT timer stop, or edits an existing record
let pendingNote = ''; // note to attach to next stopTimer

window.openNoteModal = function() {
  const task = selectedTask || admSelectedTask;
  if(!task){ alert('Seleccioná una tarea primero'); return; }
  document.getElementById('modal-note-title').textContent = task;
  document.getElementById('note-text').value = pendingNote;
  document.getElementById('modal-note').classList.add('open');
};

window.saveNote = function() {
  pendingNote = document.getElementById('note-text').value.trim();
  document.getElementById('modal-note').classList.remove('open');
  // Visual confirmation
  const btn = document.querySelector('button[onclick="openNoteModal()"]');
  if(btn) btn.textContent = pendingNote ? '📝 Nota lista: guardará al detener' : '📝 Agregar nota al próximo registro';
};

window.openNoteOnRecord = async function(recordId) {
  const r = allTimes.find(x=>x.id===recordId);
  if(!r) return;
  document.getElementById('modal-note-title').textContent = r.task||'Nota';
  document.getElementById('note-text').value = r.note||'';
  document.getElementById('modal-note').dataset.recordId = recordId;
  document.getElementById('modal-note').classList.add('open');
};

window.saveNoteOnRecord = async function() {
  const recordId = document.getElementById('modal-note').dataset.recordId;
  const text = document.getElementById('note-text').value.trim();
  if(recordId) {
    await updateDoc(doc(db,'times',recordId), {note: text});
  } else {
    // fallback: pending note for next record
    pendingNote = text;
  }
  document.getElementById('modal-note').classList.remove('open');
  delete document.getElementById('modal-note').dataset.recordId;
};

// Override saveNote button to route correctly


// ── FICHAJE ──
let allFichajes = [];
let fichTimerInterval = null;

function listenFichajes(cb) {
  const q = query(collection(db,'fichajes'), orderBy('entryTs','desc'));
  return onSnapshot(q, snap => {
    allFichajes = snap.docs.map(d=>({id:d.id,...d.data()}));
    cb(allFichajes);
  });
}

function todayStr() {
  const d = new Date();
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function fmtHora(ms) {
  const d=new Date(ms);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function getTodayFichaje(uid) {
  return allFichajes.find(f=>f.operatorId===uid && f.date===todayStr());
}

window.doFichaje = async function(context) {
  const fich = getTodayFichaje(currentUser.uid);
  const snap = await getDoc(doc(db,'users',currentUser.uid));
  const operatorName = snap.exists()?snap.data().name:currentUser.email;
  const now = Date.now();
  if(!fich) {
    await addDoc(collection(db,'fichajes'), {
      operatorId: currentUser.uid, operatorName,
      date: todayStr(), entryTs: now, exitTs: null, ts: serverTimestamp()
    });
  } else if(!fich.exitTs) {
    await updateDoc(doc(db,'fichajes',fich.id), { exitTs: now });
  }
};

function renderOperatorFichaje() {
  const fich = getTodayFichaje(currentUser.uid);
  const dot = document.getElementById('fich-dot');
  const statusText = document.getElementById('fich-status-text');
  const btn = document.getElementById('fich-btn');
  const elapsed = document.getElementById('fich-elapsed');
  if(fichTimerInterval){clearInterval(fichTimerInterval);fichTimerInterval=null;}
  btn.disabled = false;
  if(!fich) {
    dot.className='fichaje-dot';
    statusText.textContent='Sin fichar hoy';
    btn.textContent='▶ Registrar entrada';
    btn.className='btn btn-success';
    elapsed.textContent='—';
  } else if(!fich.exitTs) {
    dot.className='fichaje-dot in';
    statusText.textContent='En el taller desde '+fmtHora(fich.entryTs);
    btn.textContent='■ Registrar salida';
    btn.className='btn btn-danger';
    fichTimerInterval=setInterval(()=>{
      elapsed.textContent=fmtTime(Math.floor((Date.now()-fich.entryTs)/1000));
    },1000);
    elapsed.textContent=fmtTime(Math.floor((Date.now()-fich.entryTs)/1000));
  } else {
    dot.className='fichaje-dot';
    statusText.textContent='Jornada completada · '+fmtHora(fich.entryTs)+' – '+fmtHora(fich.exitTs);
    btn.textContent='Jornada cerrada';
    btn.className='btn';
    btn.disabled=true;
    elapsed.textContent=fmtTime(Math.floor((fich.exitTs-fich.entryTs)/1000));
  }
  const myFichs = allFichajes.filter(f=>f.operatorId===currentUser.uid).slice(0,14);
  document.getElementById('fich-history').innerHTML = myFichs.length ? myFichs.map(f=>`
    <div class="fichaje-row">
      <span style="flex:1;font-size:13px">${f.date}</span>
      <span style="color:var(--teal);font-size:13px">${fmtHora(f.entryTs)}</span>
      <span style="color:var(--text3)">→</span>
      <span style="color:var(--danger);font-size:13px">${f.exitTs?fmtHora(f.exitTs):'—'}</span>
      <span style="font-family:'DM Mono',monospace;font-size:12px;color:var(--text2)">${f.exitTs?fmtTime(Math.floor((f.exitTs-f.entryTs)/1000)):'...'}</span>
    </div>`).join('') : '<div class="empty"><div class="empty-text">Sin registros</div></div>';
}

function renderAdminFichaje() {
  // Admin personal widget
  const admFich = getTodayFichaje(currentUser.uid);
  const dot = document.getElementById('adm-fich-dot');
  const statusText = document.getElementById('adm-fich-status-text');
  const btn = document.getElementById('adm-fich-btn');
  const elapsed = document.getElementById('adm-fich-elapsed');
  if(dot && btn) {
    btn.disabled = false;
    if(!admFich) {
      dot.className='fichaje-dot';
      statusText.textContent='Sin fichar hoy';
      btn.textContent='▶ Registrar entrada';
      btn.className='btn btn-success';
      elapsed.textContent='—';
    } else if(!admFich.exitTs) {
      dot.className='fichaje-dot in';
      statusText.textContent='En el taller desde '+fmtHora(admFich.entryTs);
      btn.textContent='■ Registrar salida';
      btn.className='btn btn-danger';
      elapsed.textContent=fmtTime(Math.floor((Date.now()-admFich.entryTs)/1000));
    } else {
      dot.className='fichaje-dot';
      statusText.textContent='Jornada completada · '+fmtHora(admFich.entryTs)+' – '+fmtHora(admFich.exitTs);
      btn.textContent='Jornada cerrada';
      btn.className='btn';
      btn.disabled=true;
      elapsed.textContent=fmtTime(Math.floor((admFich.exitTs-admFich.entryTs)/1000));
    }
  }
  // Team today
  const today = todayStr();
  const todayFichs = allFichajes.filter(f=>f.date===today);
  document.getElementById('adm-fichaje-today').innerHTML = todayFichs.length ? todayFichs.map(f=>`
    <div class="fichaje-row">
      <span style="font-weight:500;flex:1">${f.operatorName}</span>
      <span style="color:var(--teal);font-size:13px">${fmtHora(f.entryTs)}</span>
      <span style="color:var(--text3)">→</span>
      <span style="color:var(--danger);font-size:13px">${f.exitTs?fmtHora(f.exitTs):'en taller'}</span>
      <span style="font-family:'DM Mono',monospace;font-size:12px;min-width:48px;text-align:right">${f.exitTs?fmtTime(Math.floor((f.exitTs-f.entryTs)/1000)):'...'}</span>
      <button class="icon-btn" onclick="openEditFichaje('${f.id}')">✏️</button>
      <button class="icon-btn danger" onclick="deleteFichaje('${f.id}')">🗑</button>
    </div>`).join('') : '<div class="empty"><div class="empty-text">Sin fichajes hoy</div></div>';
  const byDate = {};
  allFichajes.forEach(f=>{if(!byDate[f.date])byDate[f.date]=[];byDate[f.date].push(f);});
  const dates = Object.keys(byDate).sort().reverse().slice(0,14);
  document.getElementById('adm-fichaje-history').innerHTML = dates.map(d=>`
    <div class="section-title">${d}</div>
    <div class="card" style="padding:0 16px">
      ${byDate[d].map(f=>`
        <div class="fichaje-row">
          <span style="font-weight:500;flex:1;font-size:13px">${f.operatorName}</span>
          <span style="color:var(--teal);font-size:13px">${fmtHora(f.entryTs)}</span>
          <span style="color:var(--text3)">→</span>
          <span style="color:var(--danger);font-size:13px">${f.exitTs?fmtHora(f.exitTs):'—'}</span>
          <span style="font-family:'DM Mono',monospace;font-size:12px;min-width:48px;text-align:right">${f.exitTs?fmtTime(Math.floor((f.exitTs-f.entryTs)/1000)):'—'}</span>
          <button class="icon-btn" onclick="openEditFichaje('${f.id}')">✏️</button>
          <button class="icon-btn danger" onclick="deleteFichaje('${f.id}')">🗑</button>
        </div>`).join('')}
    </div>`).join('');
}

window.deleteFichaje = async function(id) {
  if(!confirm('¿Eliminar este fichaje?')) return;
  await deleteDoc(doc(db,'fichajes',id));
};

let editingFichajeId = null;
window.openEditFichaje = function(id) {
  const f = allFichajes.find(x=>x.id===id);
  if(!f) return;
  editingFichajeId = id;
  document.getElementById('fich-man-date').value = f.date;
  document.getElementById('fich-man-in').value = fmtHora(f.entryTs);
  document.getElementById('fich-man-out').value = f.exitTs ? fmtHora(f.exitTs) : '';
  loadFichajeOperators(f.operatorId);
  document.getElementById('modal-fichaje-manual').classList.add('open');
};

window.openFichajeManual = async function() {
  editingFichajeId = null;
  document.getElementById('fich-man-date').value = todayStr();
  document.getElementById('fich-man-in').value = '';
  document.getElementById('fich-man-out').value = '';
  await loadFichajeOperators(null);
  document.getElementById('modal-fichaje-manual').classList.add('open');
};

async function loadFichajeOperators(selectedUid) {
  const sel = document.getElementById('fich-man-operator');
  sel.innerHTML = '<option value="">— Elegir —</option>';
  const snap = await getDocs(collection(db,'users'));
  snap.forEach(d=>{
    const u=d.data();
    const opt=document.createElement('option');
    opt.value=d.id+'||'+u.name;
    opt.textContent=u.name+(u.role==='admin'?' (admin)':'');
    if(d.id===selectedUid) opt.selected=true;
    sel.appendChild(opt);
  });
}

window.saveFichajeManual = async function() {
  const opVal = document.getElementById('fich-man-operator').value;
  const dateVal = document.getElementById('fich-man-date').value;
  const inVal = document.getElementById('fich-man-in').value;
  const outVal = document.getElementById('fich-man-out').value;
  if(!opVal||!dateVal||!inVal){alert('Completá operario, fecha y entrada'); return;}
  const [opId, opName] = opVal.split('||');
  const entryTs = new Date(dateVal+'T'+inVal).getTime();
  const exitTs = outVal ? new Date(dateVal+'T'+outVal).getTime() : null;
  if(exitTs && exitTs<=entryTs){alert('La salida debe ser posterior a la entrada'); return;}
  if(editingFichajeId) {
    await updateDoc(doc(db,'fichajes',editingFichajeId),{entryTs,exitTs,operatorId:opId,operatorName:opName,date:dateVal});
  } else {
    await addDoc(collection(db,'fichajes'),{operatorId:opId,operatorName:opName,date:dateVal,entryTs,exitTs,manual:true,ts:serverTimestamp()});
  }
  document.getElementById('modal-fichaje-manual').classList.remove('open');
  renderAdminFichaje();
};

// ── IMPERIAL → MM CONVERSION ──
window.calcDims = function() {
  const toMm = (inVal, fracVal) => {
    const inches = (parseFloat(inVal)||0) + (parseFloat(fracVal)||0);
    return inches ? Math.round(inches * 25.4) : '';
  };
  const ftToMm = (ft, inVal, fracVal) => {
    const totalIn = (parseFloat(ft)||0)*12 + (parseFloat(inVal)||0) + (parseFloat(fracVal)||0);
    return totalIn ? Math.round(totalIn * 25.4) : '';
  };
  document.getElementById('sp-length-mm').value = ftToMm(
    document.getElementById('sp-ft')?.value,
    document.getElementById('sp-in')?.value,
    document.getElementById('sp-frac')?.value
  );
  document.getElementById('sp-width-mm').value = toMm(
    document.getElementById('sp-w-in')?.value,
    document.getElementById('sp-w-frac')?.value
  );
  document.getElementById('sp-thick-mm').value = toMm(
    document.getElementById('sp-t-in')?.value,
    document.getElementById('sp-t-frac')?.value
  );
  document.getElementById('sp-nose-w-mm').value = toMm(
    document.getElementById('sp-nw-in')?.value,
    document.getElementById('sp-nw-frac')?.value
  );
  document.getElementById('sp-tail-w-mm').value = toMm(
    document.getElementById('sp-tw-in')?.value,
    document.getElementById('sp-tw-frac')?.value
  );
};

function mmToImperial(mm) {
  if(!mm) return {ft:0,inch:0,frac:'0'};
  const totalIn = mm / 25.4;
  const ft = Math.floor(totalIn / 12);
  const remIn = totalIn - ft*12;
  const inch = Math.floor(remIn);
  const fracVal = remIn - inch;
  const fracs = [0,0.125,0.25,0.375,0.5,0.625,0.75,0.875];
  const closest = fracs.reduce((a,b)=>Math.abs(b-fracVal)<Math.abs(a-fracVal)?b:a);
  return {ft, inch, frac: String(closest)};
}

// ── BOARD SPEC ──
window.openBoardSpec = function(projectId, boardId) {
  currentSpecProjectId = projectId;
  currentSpecBoardId = boardId;
  const p = projects.find(x=>x.id===projectId);
  const bNum = parseInt(boardId.replace('t',''));
  document.getElementById('spec-header').innerHTML = `
    <div class="topbar-title">${p?p.name:'—'} · Tabla ${String(bNum).padStart(2,'0')}</div>
    <div class="topbar-sub">Planilla técnica</div>`;
  document.getElementById('spec-print-header').innerHTML = `
    <h2>${p?p.name:'—'} · Tabla ${String(bNum).padStart(2,'0')}</h2>
    <p>Planilla técnica · ${new Date().toLocaleDateString('es-AR')}</p>`;
  document.getElementById('spec-board-title').textContent = `Controles — Tabla ${String(bNum).padStart(2,'0')}`;

  // Load LOTE general data (shared across all boards in project)
  const loteSpec = allBoardSpecs.find(s=>s.projectId===projectId&&s.boardId==='lote') || {};
  const loteExists = allBoardSpecs.some(s=>s.projectId===projectId&&s.boardId==='lote');
  const notice = document.getElementById('spec-lote-notice');
  if(loteExists && boardId!=='lote') {
    notice.style.display='block';
    notice.textContent='ℹ️ Datos generales compartidos con todo el lote. Editar acá los actualiza para todas las tablas.';
  } else { notice.style.display='none'; }

  // Populate general fields
  document.getElementById('sp-model').value = loteSpec.model||'';
  document.getElementById('sp-shaper').value = loteSpec.shaper||'';
  document.getElementById('sp-date-start').value = loteSpec.date_start||'';
  document.getElementById('sp-tail').value = loteSpec.tail||'';
  document.getElementById('sp-nose').value = loteSpec.nose||'';
  document.getElementById('sp-fins').value = loteSpec.fins||'';
  document.getElementById('sp-obs').value = loteSpec.obs||'';

  // Populate imperial dimension fields
  const dims = loteSpec.dims || {};
  if(dims.length_mm) {
    const l = mmToImperial(dims.length_mm);
    document.getElementById('sp-ft').value = l.ft||'';
    document.getElementById('sp-in').value = l.inch||'';
    document.getElementById('sp-frac').value = l.frac||'0';
    document.getElementById('sp-length-mm').value = dims.length_mm;
  }
  if(dims.width_mm) {
    const w = mmToImperial(dims.width_mm);
    document.getElementById('sp-w-in').value = w.inch + w.ft*12||'';
    document.getElementById('sp-w-frac').value = w.frac||'0';
    document.getElementById('sp-width-mm').value = dims.width_mm;
  }
  if(dims.thick_mm) {
    const t = mmToImperial(dims.thick_mm);
    document.getElementById('sp-t-in').value = t.inch||'';
    document.getElementById('sp-t-frac').value = t.frac||'0';
    document.getElementById('sp-thick-mm').value = dims.thick_mm;
  }
  document.getElementById('sp-rocker-nose').value = dims.rocker_nose||'';
  document.getElementById('sp-rocker-tail').value = dims.rocker_tail||'';
  if(dims.nose_w_mm) {
    const nw = mmToImperial(dims.nose_w_mm);
    document.getElementById('sp-nw-in').value = nw.inch + nw.ft*12||'';
    document.getElementById('sp-nw-frac').value = nw.frac||'0';
    document.getElementById('sp-nose-w-mm').value = dims.nose_w_mm;
  }
  if(dims.tail_w_mm) {
    const tw = mmToImperial(dims.tail_w_mm);
    document.getElementById('sp-tw-in').value = tw.inch + tw.ft*12||'';
    document.getElementById('sp-tw-frac').value = tw.frac||'0';
    document.getElementById('sp-tail-w-mm').value = dims.tail_w_mm;
  }
  document.getElementById('sp-weight').value = dims.weight||'';

  // Load board-specific control data
  const boardSpec = allBoardSpecs.find(s=>s.projectId===projectId&&s.boardId===boardId) || {};
  [1,2,3,4].forEach(stage => renderCtrlStage(stage, boardSpec['ctrl'+stage]||{}));

  showScreen('screen-board-spec');
};

window.saveSpec = async function() {
  if(!currentSpecProjectId||!currentSpecBoardId) return;
  const p = projects.find(x=>x.id===currentSpecProjectId);

  // Save LOTE general data
  const dims = {
    length_mm: parseInt(document.getElementById('sp-length-mm')?.value)||0,
    width_mm: parseInt(document.getElementById('sp-width-mm')?.value)||0,
    thick_mm: parseInt(document.getElementById('sp-thick-mm')?.value)||0,
    rocker_nose: document.getElementById('sp-rocker-nose')?.value||'',
    rocker_tail: document.getElementById('sp-rocker-tail')?.value||'',
    nose_w_mm: parseInt(document.getElementById('sp-nose-w-mm')?.value)||0,
    tail_w_mm: parseInt(document.getElementById('sp-tail-w-mm')?.value)||0,
    weight: document.getElementById('sp-weight')?.value||''
  };
  const loteData = {
    projectId: currentSpecProjectId, boardId: 'lote',
    projectName: p?p.name:'—',
    model: document.getElementById('sp-model')?.value||'',
    shaper: document.getElementById('sp-shaper')?.value||'',
    date_start: document.getElementById('sp-date-start')?.value||'',
    tail: document.getElementById('sp-tail')?.value||'',
    nose: document.getElementById('sp-nose')?.value||'',
    fins: document.getElementById('sp-fins')?.value||'',
    obs: document.getElementById('sp-obs')?.value||'',
    dims,
    updatedAt: serverTimestamp()
  };
  await setDoc(doc(db,'boardSpecs',currentSpecProjectId+'_lote'), loteData);

  // Save board-specific control data
  const boardData = {
    projectId: currentSpecProjectId, boardId: currentSpecBoardId,
    projectName: p?p.name:'—', updatedAt: serverTimestamp()
  };
  [1,2,3,4].forEach(stage=>{
    const ctrl={};
    CTRL_FIELDS.forEach(f=>{ ctrl[f.id]=document.getElementById(`ctrl${stage}-${f.id}`)?.value||''; });
    CTRL_CHECKS.forEach((_,i)=>{ ctrl['chk'+i]=document.getElementById(`ctrl${stage}-chk${i}`)?.classList.contains('checked')||false; });
    ctrl.inspector=document.getElementById(`ctrl${stage}-inspector`)?.value||'';
    boardData['ctrl'+stage]=ctrl;
  });
  await setDoc(doc(db,'boardSpecs',currentSpecProjectId+'_'+currentSpecBoardId), boardData);
  alert('Planilla guardada ✓');
};

// ── EDIT PROJECT ──
let editingProjectId = null;
window.openEditProject = function() {
  const proj = projects.find(x=>x.id===currentSpecProjectId);
  if(!proj) return;
  editingProjectId = proj.id;
  document.getElementById('ep-name').value = proj.name||'';
  document.getElementById('ep-qty').value = proj.qty||10;
  document.getElementById('ep-client').value = proj.client||'';
  document.getElementById('ep-model').value = proj.model||'';
  document.getElementById('ep-notes').value = proj.notes||'';
  showScreen('screen-edit-project');
};

window.saveEditProject = async function() {
  if(!editingProjectId) return;
  const name = document.getElementById('ep-name').value.trim();
  if(!name){alert('El nombre no puede estar vacío'); return;}
  await updateDoc(doc(db,'projects',editingProjectId),{
    name, qty: parseInt(document.getElementById('ep-qty').value)||1,
    client: document.getElementById('ep-client').value.trim(),
    model: document.getElementById('ep-model').value.trim(),
    notes: document.getElementById('ep-notes').value.trim()
  });
  goBack('screen-project-detail');
};

window.closeProject = async function() {
  if(!editingProjectId) return;
  if(!confirm('¿Marcar este proyecto como cerrado? Seguirá visible en reportes.')) return;
  await updateDoc(doc(db,'projects',editingProjectId),{status:'closed'});
  goBack('screen-admin');
};


// ── CTRL STAGE RENDERING ──
function renderCtrlStage(stage, data) {
  const container = document.getElementById(`ctrl${stage}-fields`);
  const badge = document.getElementById(`ctrl${stage}-badge`);
  let allDone = true;
  container.innerHTML = CTRL_FIELDS.map(f=>`
    <div class="spec-row">
      <span class="spec-label">${f.label}</span>
      <input class="spec-input" id="ctrl${stage}-${f.id}" value="${data[f.id]||''}" placeholder="—">
      <span class="spec-unit">${f.unit}</span>
    </div>`).join('') +
    `<div style="margin-top:10px;font-size:12px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">Verificaciones</div>` +
    CTRL_CHECKS.map((c,i)=>{
      const checked = data['chk'+i]===true;
      if(!checked) allDone=false;
      return `<div class="spec-row" onclick="toggleCtrlCheck(${stage},${i})" style="cursor:pointer">
        <span class="spec-label">${c}</span>
        <div class="ctrl-check ${checked?'checked':''}" id="ctrl${stage}-chk${i}">${checked?'✓':''}</div>
      </div>`;
    }).join('') +
    `<div class="spec-row">
      <span class="spec-label">Inspector / fecha</span>
      <input class="spec-input" style="width:160px" id="ctrl${stage}-inspector" value="${data.inspector||''}" placeholder="Nombre · fecha">
    </div>`;
  const allMeasures = CTRL_FIELDS.every(f=>data[f.id]);
  badge.textContent = allMeasures&&allDone?'Completo':'Pendiente';
  badge.className = 'badge '+(allMeasures&&allDone?'badge-active':'badge-pending');
}

window.toggleCtrlCheck = function(stage, idx) {
  const el = document.getElementById(`ctrl${stage}-chk${idx}`);
  const checked = el.classList.contains('checked');
  el.classList.toggle('checked',!checked);
  el.textContent = !checked?'✓':'';
};

window.toggleStage = function(id) {
  const body = document.getElementById(id);
  body.classList.toggle('open');
};

window.printSpec = function() {
  buildPrintTable();
  setTimeout(()=>window.print(), 300);
};

function buildPrintTable() {
  const logo = document.querySelector('.print-header img');
  const pid = currentSpecProjectId;
  const bid = currentSpecBoardId;
  const p = projects.find(x=>x.id===pid);
  const loteSpec = allBoardSpecs.find(s=>s.projectId===pid&&s.boardId==='lote')||{};
  const boardSpec = allBoardSpecs.find(s=>s.projectId===pid&&s.boardId===bid)||{};
  const dims = loteSpec.dims||{};

  // Dimension rows: [label, nominal value, field_id_in_ctrl]
  const DIM_ROWS = [
    ['Largo total', dims.length_mm ? dims.length_mm+'mm' : '—', 'length'],
    ['Ancho máximo', dims.width_mm ? dims.width_mm+'mm' : '—', 'width'],
    ['Espesor máximo', dims.thick_mm ? dims.thick_mm+'mm' : '—', 'thick'],
    ['Rocker nose', dims.rocker_nose ? dims.rocker_nose+'mm' : '—', 'rocker_nose'],
    ['Rocker tail', dims.rocker_tail ? dims.rocker_tail+'mm' : '—', 'rocker_tail'],
    ['Ancho nose (12")', dims.nose_w_mm ? dims.nose_w_mm+'mm' : '—', 'nose_w'],
    ['Ancho tail (12")', dims.tail_w_mm ? dims.tail_w_mm+'mm' : '—', 'tail_w'],
    ['Peso', loteSpec.weight ? loteSpec.weight+'kg' : '—', 'weight'],
  ];

  const STAGE_LABELS = ['Pre-cierre','Post-cierre','Post-shape','Post-laminación'];

  const headerRow = `<tr>
    <th class="col-label">Medida</th>
    <th class="col-nom">Nominal</th>
    ${STAGE_LABELS.map(l=>`<th class="col-ctrl">${l}</th>`).join('')}
  </tr>`;

  const dataRows = DIM_ROWS.map(([label, nom, fid])=>{
    const cells = [1,2,3,4].map(stage=>{
      const ctrl = boardSpec['ctrl'+stage]||{};
      const val = ctrl[fid]||'';
      return `<td class="td-input">${val||'&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}</td>`;
    }).join('');
    return `<tr><td class="td-label">${label}</td><td class="td-val">${nom}</td>${cells}</tr>`;
  }).join('');

  // Checks section
  const checksCols = STAGE_LABELS.map((label,i)=>{
    const stage = i+1;
    const ctrl = boardSpec['ctrl'+stage]||{};
    const items = CTRL_CHECKS.map((c,j)=>{
      const checked = ctrl['chk'+j]===true;
      return `<div class="print-check-item">
        <span class="print-check-box ${checked?'checked':''}">${checked?'✓':''}</span>
        <span>${c}</span>
      </div>`;
    }).join('');
    return `<div class="print-check-col"><h4>${label}</h4>${items}</div>`;
  }).join('');

  // Inspector row
  const inspRow = [1,2,3,4].map((stage,i)=>{
    const ctrl = boardSpec['ctrl'+stage]||{};
    return `<div class="print-inspector-cell">
      <div class="print-inspector-label">${STAGE_LABELS[i]}</div>
      <div>${ctrl.inspector||'_________________'}</div>
    </div>`;
  }).join('');

  // General info for print header
  const logoSrc = document.querySelector('#spec-print-header img')?.src || '';
  document.getElementById('print-table-wrap').innerHTML = `
    <table class="print-ctrl-table">
      <thead>${headerRow}</thead>
      <tbody>${dataRows}</tbody>
    </table>
    <div class="print-checks">${checksCols}</div>
    <div class="print-inspector-row">${inspRow}</div>
  `;

  // Update print header with general info
  document.getElementById('spec-print-header').innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:3mm">
      <div style="display:flex;align-items:center;gap:8mm">
        ${logoSrc?`<img src="${logoSrc}" style="height:12mm;width:auto" alt="Dragonfly">`:''}
        <div>
          <div style="font-size:14pt;font-weight:700;font-family:'Nifty',sans-serif">${p?p.name:'—'} · Tabla ${String(parseInt(bid.replace('t',''))).padStart(2,'0')}</div>
          <div style="font-size:8.5pt;color:#555;margin-top:1mm">Planilla técnica · ${new Date().toLocaleDateString('es-AR')}</div>
        </div>
      </div>
      <div style="font-size:8pt;color:#555;text-align:right;line-height:1.6">
        <div><b>Modelo:</b> ${loteSpec.model||'—'} &nbsp; <b>Cola:</b> ${loteSpec.tail||'—'} &nbsp; <b>Nose:</b> ${loteSpec.nose||'—'}</div>
        <div><b>Quillas:</b> ${loteSpec.fins||'—'} &nbsp; <b>Shaper:</b> ${loteSpec.shaper||'—'}</div>
        ${loteSpec.obs?`<div><b>Obs:</b> ${loteSpec.obs}</div>`:''}
      </div>
    </div>`;
};

// ── STANDARDS ──
window.openStandards = function() {
  const list = document.getElementById('standards-list');
  list.innerHTML = CATEGORIES.map(cat=>`
    <div style="margin-bottom:14px">
      <div style="font-size:12px;font-weight:600;color:${cat.color};text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">${cat.label}</div>
      ${cat.tasks.map(t=>{
        const override = allStandards.find(s=>s.task===t.name&&s.catId===cat.id);
        const val = override ? override.minutes : t.std;
        return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border)">
          <span style="flex:1;font-size:13px">${t.name}</span>
          <input type="number" style="width:64px;padding:4px 8px;border:1px solid var(--border2);border-radius:4px;font-size:13px;text-align:right"
            id="std-${cat.id}-${t.name.replace(/[^a-zA-Z0-9]/g,'_').slice(0,30)}" value="${val}">
          <span style="font-size:12px;color:var(--text3)">min</span>
        </div>`;
      }).join('')}
    </div>`).join('');
  document.getElementById('modal-standards').classList.add('open');
};

window.saveStandards = async function() {
  const batch = [];
  CATEGORIES.forEach(cat=>{
    cat.tasks.forEach(t=>{
      const elId='std-'+cat.id+'-'+t.name.replace(/[^a-zA-Z0-9]/g,'_').slice(0,30);
      const el=document.getElementById(elId);
      if(el&&el.value){
        const stdId=(cat.id+'_'+t.name).replace(/[^a-zA-Z0-9]/g,'_').slice(0,100);
        batch.push(setDoc(doc(db,'standards',stdId),{catId:cat.id,task:t.name,minutes:parseInt(el.value)||t.std}));
      }
    });
  });
  await Promise.all(batch);
  document.getElementById('modal-standards').classList.remove('open');
  alert('Estándares guardados ✓');
};

// ── DAY SUMMARY (shown on clock-out) ──
async function showDaySummary(uid, operatorName) {
  const today = todayStr();
  const todayTimes = allTimes.filter(t=>{
    if(!t.ts?.seconds) return false;
    const td = new Date(t.ts.seconds*1000);
    const pad = n => String(n).padStart(2,'0');
    const tds = `${td.getFullYear()}-${pad(td.getMonth()+1)}-${pad(td.getDate())}`;
    return t.operatorId===uid && tds===today;
  });
  const totalSec = todayTimes.reduce((a,b)=>a+b.seconds,0);
  // Group by task
  const byTask={};
  todayTimes.forEach(t=>{byTask[t.task]=(byTask[t.task]||0)+t.seconds;});
  const rows = Object.entries(byTask).sort((a,b)=>b[1]-a[1]).slice(0,10);
  document.getElementById('day-summary-content').innerHTML = `
    <div style="font-size:13px;color:var(--text2);margin-bottom:12px">Jornada de hoy · ${operatorName}</div>
    ${rows.length ? rows.map(([task,sec])=>`
      <div class="summary-row">
        <span style="font-size:13px;flex:1">${task}</span>
        <span style="font-family:'DM Mono',monospace;font-size:13px">${fmtTime(sec)}</span>
      </div>`).join('') : '<div style="color:var(--text3);font-size:13px;text-align:center;padding:16px">Sin registros de tareas hoy</div>'}
    <div class="summary-total">Total jornada: ${fmtTime(totalSec)}</div>`;
  document.getElementById('modal-day-summary').classList.add('open');
}

// Override doFichaje to show summary on exit
window.doFichaje = async function(context) {
  const fich = getTodayFichaje(currentUser.uid);
  const snap = await getDoc(doc(db,'users',currentUser.uid));
  const operatorName = snap.exists()?snap.data().name:currentUser.email;
  const now = Date.now();
  if(!fich) {
    await addDoc(collection(db,'fichajes'),{
      operatorId:currentUser.uid,operatorName,
      date:todayStr(),entryTs:now,exitTs:null,ts:serverTimestamp()
    });
  } else if(!fich.exitTs) {
    await updateDoc(doc(db,'fichajes',fich.id),{exitTs:now});
    // Show day summary on clock-out
    await showDaySummary(currentUser.uid, operatorName);
  }
};

// ── OPERATOR TAB UPDATE ──
window.opTab = function(t) {
  ['timer','qc','materials','fichaje'].forEach(v=>{
    const el = document.getElementById('op-view-'+v);
    if(el) el.style.display = v===t?'block':'none';
  });
  ['timer','qc','materials','fichaje'].forEach(v=>{
    const btn = document.getElementById('op-tab-'+v);
    if(btn) btn.classList.toggle('active', v===t);
  });
  const titles = {timer:'Registrar tiempo',qc:'Control de calidad',materials:'Materiales',fichaje:'Fichaje'};
  document.getElementById('op-title').textContent = titles[t]||'';
  if(t==='fichaje') renderOperatorFichaje();
  if(t==='qc') initOpQcSelectors();
  if(t==='materials') initOpMatSelectors();
};

// ── MATERIALS CONSTANTS ──


let allMaterials = []; // {id, projectId, boardId:'lote'|'tN', name, qty, unit, notes, createdBy}
let currentMatProjectId = null;
let editingMatItemId = null;

function listenMaterials(cb) {
  return onSnapshot(collection(db,'materials'), snap=>{
    allMaterials = snap.docs.map(d=>({id:d.id,...d.data()}));
    cb(allMaterials);
  });
}

// ── ADMIN: OPEN MATERIALS ──
window.openMatAdmin = function(pid) {
  currentMatProjectId = pid;
  currentSpecProjectId = pid;
  const p = projects.find(x=>x.id===pid);
  document.getElementById('mat-header').innerHTML = `
    <div class="topbar-title">Materiales · ${p?p.name:'—'}</div>`;
  showScreen('screen-materials');
  renderMatAdmin();
};

function renderMatAdmin() {
  const pid = currentMatProjectId;
  if(!pid) return;
  const base = allMaterials.filter(m=>m.projectId===pid&&m.boardId==='lote');
  const p = projects.find(x=>x.id===pid);

  document.getElementById('mat-base-list').innerHTML = base.length ? base.map(m=>`
    <div class="card" style="padding:12px 14px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px">
        <div style="flex:1">
          <div style="font-size:14px;font-weight:500">${m.name}</div>
          ${m.notes?`<div style="font-size:12px;color:var(--text2)">${m.notes}</div>`:''}
        </div>
        <div style="font-family:'DM Mono',monospace;font-size:13px;color:var(--text2)">${m.qty} ${m.unit}</div>
        <button class="icon-btn" onclick="openMatItemModal('${m.id}','lote')">✏️</button>
        <button class="icon-btn danger" onclick="deleteMatItem('${m.id}')">🗑</button>
      </div>
    </div>`).join('') :
    '<div class="empty" style="padding:16px 0"><div class="empty-icon">📦</div><div class="empty-text">Sin materiales definidos aún.<br>Tocá + Agregar material.</div></div>';

  if(!p) { document.getElementById('mat-board-summary').innerHTML=''; return; }

  const boardRows = Array.from({length:p.qty},(_,i)=>{
    const bid='t'+(i+1);
    const boardMats=allMaterials.filter(m=>m.projectId===pid&&m.boardId===bid);
    return `<div class="card" style="margin-bottom:8px;padding:12px 14px">
      <div style="font-size:13px;font-weight:600;margin-bottom:6px">Tabla ${String(i+1).padStart(2,'0')}
        <span style="font-weight:400;color:var(--text3)">${boardMats.length?' · '+boardMats.length+' ítem(s)':' · Sin registros'}</span>
      </div>
      ${boardMats.map(m=>`
        <div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid var(--border)">
          <span>${m.name}${m.notes?' <span style="color:var(--text3)">· '+m.notes+'</span>':''}</span>
          <span style="font-family:'DM Mono',monospace;color:var(--teal)">${m.qty} ${m.unit}</span>
        </div>`).join('')}
    </div>`;
  }).join('');
  document.getElementById('mat-board-summary').innerHTML = boardRows;
}

let matBaseTempRows = [];
window.addMatBaseRow = function() {
  openMatItemModal(null,'lote');
};

window.openMatItemModal = function(matId, boardId) {
  editingMatItemId = matId;
  const mat = matId ? allMaterials.find(m=>m.id===matId) : null;
  document.getElementById('modal-mat-title').textContent = mat ? 'Editar material' : 'Agregar material';

  // Populate name select
  const sel = document.getElementById('mat-item-name');
  sel.innerHTML = '<option value="">— Elegir —</option>' +
    MAT_PRESETS.map(p=>`<option value="${p.name}" data-unit="${p.unit}">${p.name}</option>`).join('');
  if(mat) {
    const preset = MAT_PRESETS.find(p=>p.name===mat.name);
    sel.value = preset ? mat.name : 'Otro (especificar)';
    document.getElementById('mat-item-custom').value = preset ? '' : mat.name;
    document.getElementById('mat-item-custom-wrap').style.display = preset ? 'none' : 'block';
    document.getElementById('mat-item-qty').value = mat.qty||'';
    document.getElementById('mat-item-unit').value = mat.unit||'m²';
    document.getElementById('mat-item-notes').value = mat.notes||'';
  } else {
    sel.value = '';
    document.getElementById('mat-item-custom').value = '';
    document.getElementById('mat-item-custom-wrap').style.display = 'none';
    document.getElementById('mat-item-qty').value = '';
    document.getElementById('mat-item-unit').value = 'm²';
    document.getElementById('mat-item-notes').value = '';
  }
  document.getElementById('modal-mat-item').classList.add('open');
  // Store target board
  document.getElementById('modal-mat-item').dataset.boardId = boardId||'lote';
};

window.onMatNameChange = function() {
  const sel = document.getElementById('mat-item-name');
  const isOther = sel.value === 'Otro (especificar)';
  document.getElementById('mat-item-custom-wrap').style.display = isOther?'block':'none';
  // Auto-set unit from preset
  const opt = sel.options[sel.selectedIndex];
  if(opt && opt.dataset.unit) document.getElementById('mat-item-unit').value = opt.dataset.unit;
};
// ── OPERATOR: MATERIALS ──
window.saveMatItem = async function() {
  const sel = document.getElementById('mat-item-name');
  let name = sel.value;
  if(name==='Otro (especificar)') name = document.getElementById('mat-item-custom').value.trim();
  const qty = parseFloat(document.getElementById('mat-item-qty').value)||0;
  const unit = document.getElementById('mat-item-unit').value;
  const notes = document.getElementById('mat-item-notes').value.trim();
  const boardId = document.getElementById('modal-mat-item').dataset.boardId || 'lote';
  const pid = currentMatProjectId || currentSpecProjectId;
  if(!name){alert('Elegí un material'); return;}
  const p = projects.find(x=>x.id===pid);
  const data = {
    projectId:pid, projectName:p?p.name:'—',
    boardId, name, qty, unit, notes,
    createdBy:currentUser.uid, updatedAt:serverTimestamp()
  };
  if(editingMatItemId) {
    await updateDoc(doc(db,'materials',editingMatItemId), data);
  } else {
    await addDoc(collection(db,'materials'), data);
  }
  document.getElementById('modal-mat-item').classList.remove('open');
  if(currentRole==='admin') renderMatAdmin();
  else loadMaterials();
};

window.saveMatBase = async function() {
  // Just close — items are saved individually
  goBack('screen-project-detail');
};

window.deleteMatItem = async function(id) {
  if(!confirm('¿Eliminar este material?')) return;
  await deleteDoc(doc(db,'materials',id));
  if(currentRole==='admin') renderMatAdmin();
  else loadMaterials();
};

// ── OPERATOR: QC ──
function initOpQcSelectors() {
  const sel = document.getElementById('op-qc-project');
  sel.innerHTML = '<option value="">— Elegir proyecto —</option>' +
    projects.filter(p=>p.status==='active').map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
}

window.onQcProjectChange = function() {
  const pid = document.getElementById('op-qc-project').value;
  const p = projects.find(x=>x.id===pid);
  const bsel = document.getElementById('op-qc-board');
  if(p){
    bsel.innerHTML = '<option value="">— Elegir tabla —</option>'+
      Array.from({length:p.qty},(_,i)=>`<option value="t${i+1}">Tabla ${String(i+1).padStart(2,'0')}</option>`).join('');
    if(p.qty===1){bsel.value='t1';bsel.style.display='none';loadQcSpec();}
    else bsel.style.display='';
  } else {
    bsel.innerHTML='<option value="">— Elegir tabla —</option>';
    bsel.style.display='';
  }
  document.getElementById('op-qc-content').innerHTML = '<div class="empty" style="padding:32px 0"><div class="empty-text">Seleccioná tabla</div></div>';
};

window.loadQcSpec = function() {
  const pid = document.getElementById('op-qc-project').value;
  const bid = document.getElementById('op-qc-board').value;
  if(!pid||!bid) return;
  const loteSpec = allBoardSpecs.find(s=>s.projectId===pid&&s.boardId==='lote')||{};
  const boardSpec = allBoardSpecs.find(s=>s.projectId===pid&&s.boardId===bid)||{};
  const dims = loteSpec.dims||{};

  // Build read-only general info + editable controls
  const dimRows = [
    ['Largo',dims.length_mm?dims.length_mm+'mm':'—'],
    ['Ancho',dims.width_mm?dims.width_mm+'mm':'—'],
    ['Espesor',dims.thick_mm?dims.thick_mm+'mm':'—'],
    ['Rocker nose',dims.rocker_nose?dims.rocker_nose+'mm':'—'],
    ['Rocker tail',dims.rocker_tail?dims.rocker_tail+'mm':'—'],
  ].map(([l,v])=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px">
    <span style="color:var(--text2)">${l}</span><span style="font-family:'DM Mono',monospace">${v}</span>
  </div>`).join('');

  const stageNames = ['Pre-cierre','Post-cierre','Post-shape','Post-laminación'];
  const stagesHtml = [1,2,3,4].map(stage=>{
    const ctrl = boardSpec['ctrl'+stage]||{};
    const label = stageNames[stage-1];
    return `<div class="spec-stage" style="margin-bottom:10px">
      <div class="spec-stage-header" onclick="toggleStage('op-ctrl${stage}')">
        <span class="spec-stage-title">${label}</span>
        <span id="op-ctrl${stage}-badge" class="badge badge-pending">Pendiente</span>
      </div>
      <div class="spec-stage-body" id="op-ctrl${stage}">
        ${CTRL_FIELDS.map(f=>`
          <div class="spec-row">
            <span class="spec-label">${f.label}</span>
            <input class="spec-input" id="op-ctrl${stage}-${f.id}" value="${ctrl[f.id]||''}" placeholder="—" oninput="updateOpCtrlBadge(${stage})">
            <span class="spec-unit">${f.unit}</span>
          </div>`).join('')}
        <div style="margin-top:8px;font-size:12px;font-weight:600;color:var(--text3);text-transform:uppercase;margin-bottom:4px">Verificaciones</div>
        ${CTRL_CHECKS.map((c,i)=>`
          <div class="spec-row" onclick="toggleOpCtrlCheck(${stage},${i})" style="cursor:pointer">
            <span class="spec-label">${c}</span>
            <div class="ctrl-check ${ctrl['chk'+i]?'checked':''}" id="op-ctrl${stage}-chk${i}">${ctrl['chk'+i]?'✓':''}</div>
          </div>`).join('')}
        <div class="spec-row">
          <span class="spec-label">Inspector / fecha</span>
          <input class="spec-input" style="width:160px" id="op-ctrl${stage}-inspector" value="${ctrl.inspector||''}" placeholder="Nombre · fecha">
        </div>
      </div>
    </div>`;
  }).join('');

  document.getElementById('op-qc-content').innerHTML = `
    <div class="section-title">Nominales del lote (solo lectura)</div>
    <div class="card" style="padding:8px 16px;margin-bottom:12px">${dimRows||'<div class="empty"><div class="empty-text">Sin datos nominales</div></div>'}</div>
    <div class="section-title">Controles de la tabla</div>
    ${stagesHtml}
    <button class="btn btn-primary" onclick="saveOpQcSpec('${pid}','${bid}')" style="margin-top:8px">Guardar controles</button>`;

  // Update badges
  [1,2,3,4].forEach(s=>updateOpCtrlBadge(s));
};

window.toggleOpCtrlCheck = function(stage, idx) {
  const el = document.getElementById(`op-ctrl${stage}-chk${idx}`);
  const checked = el.classList.contains('checked');
  el.classList.toggle('checked',!checked);
  el.textContent = !checked?'✓':'';
  updateOpCtrlBadge(stage);
};

window.updateOpCtrlBadge = function(stage) {
  const badge = document.getElementById(`op-ctrl${stage}-badge`);
  if(!badge) return;
  const allFilled = CTRL_FIELDS.every(f=>{
    const el = document.getElementById(`op-ctrl${stage}-${f.id}`);
    return el && el.value;
  });
  const allChecked = CTRL_CHECKS.every((_,i)=>{
    const el = document.getElementById(`op-ctrl${stage}-chk${i}`);
    return el && el.classList.contains('checked');
  });
  badge.textContent = allFilled&&allChecked?'Completo':'Pendiente';
  badge.className = 'badge '+(allFilled&&allChecked?'badge-active':'badge-pending');
};

window.saveOpQcSpec = async function(pid, bid) {
  const p = projects.find(x=>x.id===pid);
  const boardData = {projectId:pid, boardId:bid, projectName:p?p.name:'—', updatedAt:serverTimestamp()};
  [1,2,3,4].forEach(stage=>{
    const ctrl={};
    CTRL_FIELDS.forEach(f=>{ctrl[f.id]=document.getElementById(`op-ctrl${stage}-${f.id}`)?.value||'';});
    CTRL_CHECKS.forEach((_,i)=>{ctrl['chk'+i]=document.getElementById(`op-ctrl${stage}-chk${i}`)?.classList.contains('checked')||false;});
    ctrl.inspector=document.getElementById(`op-ctrl${stage}-inspector`)?.value||'';
    boardData['ctrl'+stage]=ctrl;
  });
  await setDoc(doc(db,'boardSpecs',pid+'_'+bid), boardData);
  alert('Controles guardados ✓');
};

// ── OPERATOR: MATERIALS ──
function initOpMatSelectors() {
  const sel = document.getElementById('op-mat-project');
  sel.innerHTML = '<option value="">— Elegir proyecto —</option>' +
    projects.filter(p=>p.status==='active').map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
}

window.onMatProjectChange = function() {
  const pid = document.getElementById('op-mat-project').value;
  currentMatProjectId = pid;
  const p = projects.find(x=>x.id===pid);
  const bsel = document.getElementById('op-mat-board');
  if(p){
    bsel.innerHTML='<option value="">— Elegir tabla —</option>'+
      Array.from({length:p.qty},(_,i)=>`<option value="t${i+1}">Tabla ${String(i+1).padStart(2,'0')}</option>`).join('');
    if(p.qty===1){bsel.value='t1';bsel.style.display='none';loadMaterials();}
    else bsel.style.display='';
  } else {
    bsel.innerHTML='<option value="">— Elegir tabla —</option>';
    bsel.style.display='';
  }
};

window.loadMaterials = function() {
  const pid = document.getElementById('op-mat-project').value;
  const bid = document.getElementById('op-mat-board').value;
  if(!pid||!bid){return;}
  currentMatProjectId = pid;
  const base = allMaterials.filter(m=>m.projectId===pid&&m.boardId==='lote');
  const boardMats = allMaterials.filter(m=>m.projectId===pid&&m.boardId===bid);

  const baseRows = base.map(m=>{
    const used = boardMats.find(b=>b.name===m.name);
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="flex:1">
        <div style="font-size:13px;font-weight:500">${m.name}</div>
        <div style="font-size:11px;color:var(--text3)">Base: ${m.qty} ${m.unit}${m.notes?' · '+m.notes:''}</div>
      </div>
      ${used?`<div style="font-size:13px;font-family:'DM Mono',monospace;color:var(--teal)">${used.qty} ${used.unit}</div>
        <button class="icon-btn" onclick="openMatItemModal('${used.id}','${bid}')">✏️</button>`
      :`<button class="btn" style="padding:6px 10px;font-size:12px;width:auto" onclick="openOpMatModal('${m.name}','${m.unit}','${pid}','${bid}')">+ Registrar</button>`}
    </div>`;
  }).join('');

  const extraRows = boardMats.filter(m=>!base.find(b=>b.name===m.name)).map(m=>`
    <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="flex:1">
        <div style="font-size:13px;font-weight:500">${m.name} <span class="badge badge-info" style="font-size:10px">Extra</span></div>
        ${m.notes?`<div style="font-size:11px;color:var(--text3)">${m.notes}</div>`:''}
      </div>
      <div style="font-size:13px;font-family:'DM Mono',monospace">${m.qty} ${m.unit}</div>
      <button class="icon-btn" onclick="openMatItemModal('${m.id}','${bid}')">✏️</button>
      <button class="icon-btn danger" onclick="deleteMatItem('${m.id}')">🗑</button>
    </div>`).join('');

  document.getElementById('op-mat-content').innerHTML = `
    <div class="section-title">Materiales del lote</div>
    <div class="card" style="padding:0 16px">
      ${baseRows||'<div class="empty" style="padding:12px 0"><div class="empty-text">El admin no definió materiales base aún</div></div>'}
    </div>
    ${extraRows?`<div class="section-title">Extras registrados</div><div class="card" style="padding:0 16px">${extraRows}</div>`:''}
    <button class="btn btn-outline" onclick="openOpMatModal('','','${pid}','${bid}')" style="margin-top:12px">+ Agregar material extra</button>`;
};

window.openOpMatModal = function(name, unit, pid, bid) {
  currentMatProjectId = pid;
  document.getElementById('modal-mat-item').dataset.boardId = bid;
  editingMatItemId = null;
  const sel = document.getElementById('mat-item-name');
  sel.innerHTML = '<option value="">— Elegir —</option>' +
    MAT_PRESETS.map(p=>`<option value="${p.name}" data-unit="${p.unit}">${p.name}</option>`).join('');
  sel.value = name||'';
  document.getElementById('mat-item-custom').value = '';
  document.getElementById('mat-item-custom-wrap').style.display = 'none';
  document.getElementById('mat-item-qty').value = '';
  document.getElementById('mat-item-unit').value = unit||'m²';
  document.getElementById('mat-item-notes').value = '';
  document.getElementById('modal-mat-title').textContent = 'Registrar material';
  document.getElementById('modal-mat-item').classList.add('open');
};

