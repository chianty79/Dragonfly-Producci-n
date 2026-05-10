import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCpgerpVO60GnOlCt-g8jBmsMSh54Y1FsM",
  authDomain: "dragonfly-produccion.firebaseapp.com",
  projectId: "dragonfly-produccion",
  storageBucket: "dragonfly-produccion.firebasestorage.app",
  messagingSenderId: "565125962524",
  appId: "1:565125962524:web:c2a6a05d6a51906534b8d9"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);