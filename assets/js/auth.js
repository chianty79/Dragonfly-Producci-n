import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
  } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
  
  import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp
  } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
  
  import { auth, db } from "./firebase.js";
  import { showScreen, showLoading, showError } from "./ui.js";
  
  export function initAuth({
    getUnsubProjects,
    getUnsubTimes,
    setProjects,
    setAllTimes,
    setCurrentUser,
    setCurrentRole,
    initAdmin,
    initOperator
  }) {
    window.showRegister = function() {
      showScreen('screen-register');
    };
  
    window.showLogin = function() {
      showScreen('screen-login');
    };
  
    window.doLogin = async function() {
      const email = document.getElementById('login-email').value.trim();
      const pw = document.getElementById('login-password').value;
  
      if (!email || !pw) {
        showError('login-error', 'Completá todos los campos');
        return;
      }
  
      document.getElementById('btn-login').disabled = true;
  
      try {
        await signInWithEmailAndPassword(auth, email, pw);
      } catch(e) {
        showError(
          'login-error',
          e.code === 'auth/invalid-credential'
            ? 'Email o contraseña incorrectos'
            : e.message
        );
        document.getElementById('btn-login').disabled = false;
      }
    };
  
    window.doRegister = async function() {
      const name = document.getElementById('reg-name').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const pw = document.getElementById('reg-password').value;
      const role = document.getElementById('reg-role').value;
  
      if (!name || !email || !pw) {
        showError('reg-error', 'Completá todos los campos');
        return;
      }
  
      try {
        showLoading(true);
        const cred = await createUserWithEmailAndPassword(auth, email, pw);
  
        await setDoc(doc(db, 'users', cred.user.uid), {
          name,
          email,
          role,
          createdAt: serverTimestamp()
        });
  
        showLoading(false);
      } catch(e) {
        showLoading(false);
        showError(
          'reg-error',
          e.code === 'auth/email-already-in-use'
            ? 'Este email ya está registrado'
            : e.message
        );
      }
    };
  
    window.doLogout = async function() {
      const unsubProjects = getUnsubProjects();
      const unsubTimes = getUnsubTimes();
  
      if (unsubProjects) unsubProjects();
      if (unsubTimes) unsubTimes();
  
      setProjects([]);
      setAllTimes([]);
  
      await signOut(auth);
    };
  
    onAuthStateChanged(auth, async user => {
      showLoading(true);
  
      if (user) {
        setCurrentUser(user);
  
        const snap = await getDoc(doc(db, 'users', user.uid));
  
        if (snap.exists()) {
          const data = snap.data();
  
          setCurrentRole(data.role);
  
          if (data.role === 'admin') {
            document.getElementById('admin-sub').textContent = data.name + ' · Encargado';
            initAdmin();
            showScreen('screen-admin');
          } else {
            document.getElementById('op-sub').textContent = data.name + ' · Operario';
            initOperator();
            showScreen('screen-operator');
          }
        } else {
          await signOut(auth);
          showScreen('screen-login');
        }
      } else {
        setCurrentUser(null);
        setCurrentRole(null);
        showScreen('screen-login');
        document.getElementById('btn-login').disabled = false;
      }
  
      showLoading(false);
    });
  }