import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

// Firebase konfiguratsiya
const firebaseConfig = {
   apiKey : "AIzaSyACHEuejKVniBAcYExQxk23A9QD84bUaB4" , 
  authDomain : "new-project-6075a.firebaseapp.com" , 
  projectId : "new-project-6075a" , 
  storageBucket : "new-project-6075a.firebasestorage.app" , 
  messagingSenderId : "974403904500" , 
  appId : "1:974403904500:web:5d4edb5db8f5432cbdcfa1" , 
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);


const showLogin = document.getElementById("showLogin");
const showRegister = document.getElementById("showRegister");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const loginError = document.getElementById("loginError");
const registerError = document.getElementById("registerError");

showRegister.onclick = () => {
  loginForm.classList.add("hidden");
  registerForm.classList.remove("hidden");
  loginError.innerText = "";
  registerError.innerText = "";
};
showLogin.onclick = () => {
  registerForm.classList.add("hidden");
  loginForm.classList.remove("hidden");
  loginError.innerText = "";
  registerError.innerText = "";
};

// Login
loginForm.onsubmit = (e) => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;
  signInWithEmailAndPassword(auth, email, password)
    .then(() => window.location.href = "dashboard.html")
    .catch(err => loginError.innerText = err.message);
};

// Register
registerForm.onsubmit = (e) => {
  e.preventDefault();
  const name = document.getElementById("registerName").value;
  const email = document.getElementById("registerEmail").value;
  const password = document.getElementById("registerPassword").value;
  if (!name) {
    registerError.innerText = "Ism kiritilishi shart!";
    return;
  }
  createUserWithEmailAndPassword(auth, email, password)
    .then(() => window.location.href = "dashboard.html")
    .catch(err => registerError.innerText = err.message);
};

// Foydalanuvchi login bo'lganini tekshirish
onAuthStateChanged(auth, (user) => {
  if (user) {
    // Agar foydalanuvchi login bo'lgan bo'lsa, to'g'ridan-to'g'ri dashboard.html ga yo'naltiriladi
    window.location.href = "dashboard.html";
  }
});
