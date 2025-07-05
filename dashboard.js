import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  updateDoc,
  doc,
  arrayUnion,
  Timestamp,
  deleteDoc,
  getDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyACHEuejKVniBAcYExQxk23A9QD84bUaB4",
  authDomain: "new-project-6075a.firebaseapp.com",
  projectId: "new-project-6075a",
  storageBucket: "new-project-6075a.appspot.com",
  messagingSenderId: "974403904500",
  appId: "1:974403904500:web:5d4edb5db8f5432cbdcfa1",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Authentication state listener
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    showSidebarUser();
    loadDebtors();
    loadAddedSearchUsers(); // <-- Qo‘shildi
  }
});

// Sidebar functionality
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");
document.getElementById("openSidebar").onclick = () => {
  sidebar.classList.remove("-translate-x-full");
  sidebarOverlay.classList.remove("hidden");
};
document.getElementById("closeSidebar").onclick = closeSidebar;
sidebarOverlay.onclick = closeSidebar;

function closeSidebar() {
  sidebar.classList.add("-translate-x-full");
  sidebarOverlay.classList.add("hidden");
}

// Logout functionality
document.getElementById("logoutBtn").onclick = () => {
  signOut(auth).then(() => (window.location.href = "index.html"));
};

// Debtor management
const debtorForm = document.getElementById("debtorForm");

// Generate unique debtor code
function generateUniqueDebtorCode(existingCodes = []) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (existingCodes.includes(code));
  return code;
}

// Add new debtor
debtorForm.onsubmit = async (e) => {
  e.preventDefault();
  const name = document.getElementById("debtorName").value.trim();
  const product = document.getElementById("debtorProduct").value.trim();
  let count = parseInt(document.getElementById("debtorCount").value);
  let price = parseInt(document.getElementById("debtorPrice").value);
  const note = document.getElementById("debtorNote").value.trim();
  
  if (!name || !price) return;

  // Calculate amount
  price = price * 1;
  let amount;
  if (!count || count <= 0) {
    count = 1;
    amount = price;
  } else {
    amount = count * price;
  }

  if (price <= 0) {
    price = 1;
    amount = price;
  }

  const user = auth.currentUser;
  if (!user) return;

  // Check if debtor already exists
  const snapshot = await getDocs(collection(db, "debtors"));
  const exists = snapshot.docs.some((doc) => {
    const data = doc.data();
    return (
      data.userId === user.uid && data.name.toLowerCase() === name.toLowerCase()
    );
  });
  
  if (exists) {
    alert("Bu ismli qarzdor allaqachon mavjud!");
    return;
  }

  // Generate unique code
  const existingCodes = snapshot.docs.map(doc => doc.data().code).filter(Boolean);
  const code = generateUniqueDebtorCode(existingCodes);

  // Add new debtor
  await addDoc(collection(db, "debtors"), {
    name,
    product,
    count,
    price,
    note,
    userId: user.uid,
    code,
    history: [{
      type: "add",
      amount,
      count,
      price,
      product,
      note,
      date: Timestamp.now(),
    }],
  });
  
  debtorForm.reset();
  loadDebtors();
};

// Search functionality
document.getElementById("searchInput").oninput = loadDebtors;

// Load and render debtors
async function loadDebtors() {
  const user = auth.currentUser;
  if (!user) return;
  
  const search = document.getElementById("searchInput").value.toLowerCase();
  const snapshot = await getDocs(collection(db, "debtors"));
  
  let debtors = [];
  snapshot.forEach((doc) => {
    let data = doc.data();
    data.id = doc.id;
    if (data.userId === user.uid) {
      debtors.push(data);
    }
  });
  
  if (search) {
    debtors = debtors.filter((d) => d.name.toLowerCase().includes(search));
  }
  
  renderDebtors(debtors);
}

// 1. Umumiy search user statistikani olish uchun yordamchi funksiya
async function getAddedSearchUsersTotals() {
  let totalAllAdded = 0, totalAllSub = 0, totalAllDebt = 0;
  for (let idx = 0; idx < addedSearchUsers.length; idx++) {
    const user = addedSearchUsers[idx];
    let totalAdded = 0, totalSub = 0;
    const debtorsSnap = await getDocs(collection(db, "debtors"));
    const debtor = debtorsSnap.docs
      .map(doc => ({ ...doc.data(), id: doc.id }))
      .find(d => d.userId === user.id || d.code === user.id || d.id === user.id);

    if (debtor) {
      if (typeof debtor.totalAdded === "number") {
        totalAdded = debtor.totalAdded;
      } else {
        (debtor.history || []).forEach(h => {
          if (h.type === "add") totalAdded += h.amount || 0;
        });
      }
      if (typeof debtor.totalSubtracted === "number") {
        totalSub = debtor.totalSubtracted;
      } else {
        (debtor.history || []).forEach(h => {
          if (h.type === "sub") totalSub += h.amount || 0;
        });
      }
    }
    const remaining = totalAdded - totalSub;
    totalAllAdded += totalAdded;
    totalAllSub += totalSub;
    totalAllDebt += remaining;
  }
  return { totalAllAdded, totalAllSub, totalAllDebt };
}

// 2. renderStats funksiyasini o‘zgartiring:
async function renderStats(debtors) {
  let totalAdded = 0, totalSubtracted = 0, totalDebt = 0;

  debtors.forEach((d) => {
    let add = 0, sub = 0;
    d.history?.forEach((h) => {
      if (h.type === "add") add += h.amount;
      if (h.type === "sub") sub += h.amount;
    });
    totalAdded += add;
    totalSubtracted += sub;
    totalDebt += add - sub;
  });

  // Search orqali qo‘shilgan userlar statistikasi ham qo‘shilsin
  const { totalAllAdded, totalAllSub, totalAllDebt } = await getAddedSearchUsersTotals();
  totalAdded += totalAllAdded;
  totalSubtracted += totalAllSub;
  totalDebt += totalAllDebt;

  document.getElementById("totalAdded").innerText = totalAdded + " so‘m";
  document.getElementById("totalSubtracted").innerText = totalSubtracted + " so‘m";
  document.getElementById("totalDebt").innerText = totalDebt + " so‘m";
}

// Render debtors list
function renderDebtors(debtors) {
  debtors.sort((a, b) =>
    a.name.localeCompare(b.name, "uz", { sensitivity: "base" })
  );

  renderStats(debtors);
  const list = document.getElementById("debtorsList");
  list.innerHTML = "";

  // Loader va "Qarzdorlar topilmadi" divlarini olish
  const loader = document.querySelector('.loader');
  const noDebtorsDiv = document.getElementById("noDebtorsFound");

  if (debtors.length === 0) {
    if (noDebtorsDiv) noDebtorsDiv.classList.remove("hidden");
    if (loader) loader.classList.remove("hidden");
    return;
  } else {
    if (noDebtorsDiv) noDebtorsDiv.classList.add("hidden");
    if (loader) loader.classList.add("hidden"); // <-- Cardlar chiqqanda loaderni yashirish
  }

  debtors.forEach((d) => {
    const productSum = (d.count || 0) * (d.price || 0);
    let totalAdd = 0, totalSub = 0;
    
    (d.history || []).forEach((h) => {
      if (h.type === "add") totalAdd += h.amount || 0;
      if (h.type === "sub") totalSub += h.amount || 0;
    });
    
    const totalAdded = productSum + totalAdd;
    const totalDebt = totalAdded - totalSub;

    // Dark mode aniqlash
    const isDark = document.documentElement.classList.contains('dark');

    const card = document.createElement("div");
    card.className = `
      rounded-2xl p-6 shadow-2xl border
      ${isDark ? 'border-[#374151] bg-[#232c39]/90' : 'border-white/40 bg-white/60'}
      backdrop-blur-2xl flex flex-col justify-between gap-6 relative z-0
      transition hover:scale-[1.025] hover:shadow-2xl mb-4
      text-gray-500
    `.replace(/\s+/g, ' ');

    card.innerHTML = `
  <div class="flex flex-col gap-2">
    <div>
      <div class="font-bold text-2xl mb-1 flex items-center gap-2">
        <span class="${isDark ? 'text-white' : 'text-gray-900'}">${d.name}</span>
        <span class="${isDark ? 'text-blue-300' : 'text-blue-500'} text-base font-bold">#${d.code || d.id || ""}</span>
        ${d.lastRating ? `
          <span class="ml-2 px-4 py-1 rounded-full font-bold text-sm flex items-center gap-2 shadow rating-badge"
            style="background: linear-gradient(90deg,#fbbf24,#f59e42); color: #fff; border: 1.5px solid #f59e42; min-width:48px; justify-content:center;">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="#fff" style="filter: drop-shadow(0 1px 2px #f59e42);">
              <polygon points="10,2 12.5,7.5 18,8 13.5,12 15,18 10,14.5 5,18 6.5,12 2,8 7.5,7.5" stroke="#fff" stroke-width="0.5"/>
            </svg>
            ${Number(d.lastRating).toFixed(1).replace(/\.0$/, "")}
          </span>
        ` : ""}
      </div>
      <div class="text-xs ${isDark ? 'text-gray-400' : 'text-blue-600'} mb-2 font-mono">Kod: <span>${d.code || ''}</span></div>
      <div class="text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-2">${d.note || ""}</div>
      ${d.moveComment ? `<div class="text-xs ${isDark ? 'text-purple-400' : 'text-purple-600'} mt-1">Izoh: ${d.moveComment}</div>` : ""}
      <div class="mt-2 text-base leading-7 space-y-1">
        <div>
          <span class="font-semibold ${isDark ? 'text-gray-200' : 'text-gray-700'}">Umumiy qo‘shilgan:</span>
          <span class="${isDark ? 'text-white' : 'text-gray-900'} font-bold">${totalAdd} so‘m</span>
        </div>
        <div>
          <span class="font-semibold ${isDark ? 'text-gray-2300' : 'text-gray-700'}">Ayirilgan:</span>
          <span class="${isDark ? 'text-white' : 'text-gray-900'} font-bold">${totalSub} so‘m</span>
        </div>
        <div>
          <span class="font-semibold ${isDark ? 'text-gray-200' : 'text-gray-700'}">Qolgan:</span>
          <span class="${isDark ? 'text-white' : 'text-gray-900'} font-bold">${totalAdd - totalSub} so‘m</span>
        </div>
      </div>
    </div>
    <div class="flex flex-col gap-2 w-full mt-4 items-stretch">
      <button class="bg-blue-500 hover:bg-blue-600 text-white px-5 py-2 rounded-lg font-semibold shadow transition w-full" data-id="${d.id}">Batafsil</button>
      <button class="bg-red-500 hover:bg-red-600 text-white px-5 py-2 rounded-lg font-semibold shadow transition w-full" data-del="${d.id}">O‘chirish</button>
    </div>
  </div>
`;

    card.querySelector("[data-id]").onclick = () => openDebtorModal(d);
    card.querySelector("[data-del]").onclick = () => confirmDeleteDebtor(d.id, d.name);
    list.appendChild(card);
  });
}

// Confirm debtor deletion
function confirmDeleteDebtor(id, name) {
  const div = document.createElement("div");
  div.className = 'modal-backdrop fixed inset-0 z-[100] flex items-center justify-center';
  div.innerHTML = `
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-full max-w-xs text-center">
      <div class="mb-4 font-bold">"${name}"ni o‘chirishni istaysizmi?</div>
      <div class="flex gap-2 justify-center">
        <button id="delYes" class="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded">Ha, o‘chirish</button>
        <button id="delNo" class="bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-100 px-4 py-2 rounded">Bekor qilish</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(div);
  div.querySelector("#delNo").onclick = () => div.remove();
  div.querySelector("#delYes").onclick = async () => {
    await deleteDoc(doc(db, "debtors", id));
    div.remove();
    loadDebtors();
  };
}

// Debtor modal
const debtorModal = document.getElementById("debtorModal");
const modalContent = document.getElementById("modalContent");
document.getElementById("closeModal").onclick = () => debtorModal.classList.add("hidden");

function openDebtorModal(debtor) {
  debtorModal.classList.remove("hidden");
  let addHistory = "", subHistory = "";
  let totalAdd = 0, totalSub = 0;

  // Faqat o'zining yozganlarini ko'rsatish
  const currentUserId = auth.currentUser.uid;
  const filteredHistory = (debtor.history || []).filter(
    h => (h.authorId ? h.authorId === currentUserId : debtor.userId === currentUserId)
  );

  filteredHistory.forEach((h) => {
    const date = h.date?.toDate ? h.date.toDate() : new Date();
    const time = date.toLocaleString("uz-UZ");

    if (h.type === "add") {
      addHistory += `
        <div class="bg-green-100 dark:bg-green-900 rounded p-2 mb-2">
          +${h.amount} so‘m 
          <span class="text-xs text-gray-500 ml-2">
            (${h.count || 1} x ${h.price || h.amount} so‘m, ${h.product || debtor.product || ""})
          </span>
          <span class="text-xs text-gray-400 ml-2">${time}</span>
          <div class="text-xs text-gray-400">${h.note || ""}</div>
        </div>`;
      totalAdd += h.amount;
    }

    if (h.type === "sub") {
      subHistory += `
        <div class="bg-red-100 dark:bg-red-900 rounded p-2 mb-2">
          -${h.amount} so‘m 
          <span class="text-xs text-gray-400 ml-2">${time}</span>
        </div>`;
      totalSub += h.amount;
    }
  });
  
  modalContent.innerHTML = `
  <div class="flex flex-col md:flex-row gap-6 mb-4">
    <div class="flex-1 bg-gray-50 dark:bg-gray-800 rounded-xl p-5 shadow border border-gray-200 dark:border-gray-700">
      <div class="font-bold text-2xl mb-1 flex items-center gap-2 text-gray-900 dark:text-white">
        ${debtor.name}
      </div>
      <div class="text-sm text-gray-400 mb-2">${debtor.product ? `${debtor.product} (${debtor.count || 1} x ${debtor.price || 0} so‘m)` : ""}</div>
      <div class="text-xs text-gray-400 mb-2">${debtor.note || ""}</div>
      <div class="mb-4 text-base">
        Umumiy qarz: <span class="font-bold text-blue-700 dark:text-blue-300">${totalAdd - totalSub} so‘m</span>
      </div>
      <form id="addDebtForm" class="flex flex-col gap-2 mb-3">
        <div class="grid grid-cols-1 gap-2">
          <input type="text" placeholder="Mahsulot nomi" class="p-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-900 dark:text-gray-100 transition" autocomplete="off">
          <input type="number" placeholder="Mahsulot soni" class="p-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-900 dark:text-gray-100 transition" autocomplete="off">
          <input type="number" min="1" placeholder="Mahsulot narxi" class="p-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-900 dark:text-gray-100 transition" required autocomplete="off">
          <input type="text" placeholder="Izoh (ixtiyoriy)" class="p-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-900 dark:text-gray-100 transition" autocomplete="off">
        </div>
        <button type="submit" class="bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded font-semibold shadow transition">Qo‘shish</button>
      </form>
      <form id="subDebtForm" class="flex flex-col gap-2 mb-3">
        <input type="number" min="1" placeholder="Qarz ayirish (so‘m)" class="p-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-red-400 text-gray-900 dark:text-gray-100 transition" required autocomplete="off">
        <input type="text" placeholder="Izoh (ixtiyoriy)" class="p-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-red-400 text-gray-900 dark:text-gray-100 transition" autocomplete="off">
        <button type="submit" class="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded font-semibold shadow transition">Ayirish</button>
      </form>
      ${
        (totalAdd - totalSub) > 0
          ? `<button id="finishDebtBtn" class="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded mt-2 w-full font-semibold shadow transition">Qarz tugatish</button>`
          : ""
      }
    </div>
    <div class="flex-1 flex flex-col gap-4">
      <div>
        <div class="font-bold mb-2 text-gray-900 dark:text-white">Qo‘shilganlar</div>
        <div class="space-y-2">
          ${addHistory || '<div class="text-gray-400">Yo‘q</div>'}
        </div>
      </div>
      <div>
        <div class="font-bold mb-2 mt-2 text-gray-900 dark:text-white">Ayirilganlar</div>
        <div class="space-y-2">
          ${subHistory || '<div class="text-gray-400">Yo‘q</div>'}
        </div>
      </div>
    </div>
  </div>
  <div class="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
    <div class="bg-white/80 dark:bg-gray-900/60 rounded-lg p-4 flex flex-col items-center border border-gray-200 dark:border-gray-700 shadow">
      <div class="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">Jami qo‘shilgan</div>
      <div class="text-2xl font-bold text-green-600 dark:text-green-400">${totalAdd}</div>
      <div class="text-green-600 dark:text-green-400 font-semibold">so‘m</div>
    </div>
    <div class="bg-white/80 dark:bg-gray-900/60 rounded-lg p-4 flex flex-col items-center border border-gray-200 dark:border-gray-700 shadow">
      <div class="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">Jami ayirilgan</div>
      <div class="text-2xl font-bold text-red-500 dark:text-red-400">${totalSub}</div>
      <div class="text-red-500 dark:text-red-400 font-semibold">so‘m</div>
    </div>
    <div class="bg-white/80 dark:bg-gray-900/60 rounded-lg p-4 flex flex-col items-center border border-gray-200 dark:border-gray-700 shadow">
      <div class="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">Qarzdorlik</div>
      <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">${totalAdd - totalSub}</div>
      <div class="text-blue-600 dark:text-blue-400 font-semibold">so‘m</div>
    </div>
  </div>
`;

  // Add debt form handler
  modalContent.querySelector("#addDebtForm").onsubmit = async (e) => {
    e.preventDefault();
    if (!(await showConfirmDiv("Qo‘shaveraymi?"))) return;
    
    Array.from(e.target.elements).forEach(el => {
      if (el.tagName === "INPUT" || el.tagName === "BUTTON") el.style.display = "none";
    });
    
    const product = e.target[0].value.trim();
    let count = parseInt(e.target[1].value);
    let price = parseInt(e.target[2].value);
    const note = e.target[3].value.trim();

    price = price * 1;
    let amount;
    if (!count || count <= 0) {
      count = 1;
      amount = price;
    } else {
      amount = count * price;
    }

    if (price <= 0) {
      price = 1;
      amount = price;
    }

    if (!price) return;

    const ref = doc(db, "debtors", debtor.id);
    await updateDoc(ref, {
      history: arrayUnion({
        type: "add",
        amount,
        count,
        price,
        product,
        note,
        date: Timestamp.now(),
        authorId: auth.currentUser.uid
      }),
      // Jami qo‘shilganni yangilash
      totalAdded: (debtor.totalAdded || 0) + amount
    });
    
    const updated = (await getDocs(collection(db, "debtors"))).docs
      .find((docu) => docu.id === debtor.id)
      .data();
      
    openDebtorModal({ ...updated, id: debtor.id });
    loadDebtors();
  };

  // Subtract debt form handler
  modalContent.querySelector("#subDebtForm").onsubmit = async (e) => {
    e.preventDefault();
    if (!(await showConfirmDiv("Ayiraveraymi?"))) return;
    
    Array.from(e.target.elements).forEach(el => {
      if (el.tagName === "INPUT" || el.tagName === "BUTTON") el.style.display = "none";
    });
    
    const val = parseInt(e.target[0].value);
    const note = e.target[1].value.trim();
    
    if (!val) return;
    
    const ref = doc(db, "debtors", debtor.id);
    await updateDoc(ref, {
      history: arrayUnion({
        type: "sub",
        amount: val,
        note,
        date: Timestamp.now(),
        authorId: auth.currentUser.uid
      }),
      // Jami ayirilganni yangilash
      totalSubtracted: (debtor.totalSubtracted || 0) + val
    });
    
    const updated = (await getDocs(collection(db, "debtors"))).docs
      .find((docu) => docu.id === debtor.id)
      .data();
      
    openDebtorModal({ ...updated, id: debtor.id });
    loadDebtors();
  };

  // Qarz tugatish tugmasi uchun event
  if ((totalAdd - totalSub) > 0) {
    const finishBtn = modalContent.querySelector("#finishDebtBtn");
    if (finishBtn) {
      finishBtn.onclick = async () => {
        if (!(await showConfirmDiv("Qarz tugatilsinmi?"))) return;
        showRatingCard(async (rating) => {
          const ref = doc(db, "debtors", debtor.id);
          // Oldingi ballni olamiz
          let prevRating = 0;
          const docSnap = await getDoc(ref);
          if (docSnap.exists() && typeof docSnap.data().lastRating === "number") {
            prevRating = docSnap.data().lastRating;
          }
          // O‘rtacha ballni hisoblaymiz
          let avgRating = prevRating ? Math.round(((prevRating + rating) / 2) * 10) / 10 : rating;
          await updateDoc(ref, {
            history: [],
            totalAdded: 0,
            totalSubtracted: 0,
            lastRating: avgRating // O‘rtacha ballni saqlash
          });
          const updated = (await getDocs(collection(db, "debtors"))).docs
            .find((docu) => docu.id === debtor.id)
            .data();
          openDebtorModal({ ...updated, id: debtor.id });
          loadDebtors();
        });
      };
    }
  }
}

// Sidebar user info
async function showSidebarUser() {
  const user = auth.currentUser;
  if (!user) return;

  const userRef = doc(db, "users", user.uid);
  let userSnap = await getDoc(userRef);

  // 8 ta belgili random ID generator
  function generateUserCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  let sidebarNumber, sidebarUserCode;
  if (!userSnap.exists()) {
    sidebarNumber = Math.floor(Math.random() * 999) + 1;
    sidebarUserCode = generateUserCode();
    await setDoc(userRef, {
      name: user.displayName || "Foydalanuvchi",
      sidebarNumber,
      sidebarUserCode,
    });
  } else {
    const data = userSnap.data();
    if (!data.sidebarNumber) {
      sidebarNumber = Math.floor(Math.random() * 999) + 1;
      await setDoc(userRef, { ...data, sidebarNumber });
    } else {
      sidebarNumber = data.sidebarNumber;
    }
    if (!data.sidebarUserCode) {
      sidebarUserCode = generateUserCode();
      await setDoc(userRef, { ...data, sidebarUserCode });
    } else {
      sidebarUserCode = data.sidebarUserCode;
    }
  }

  // Sidebar’da ism, raqam, ID va rasmni chiqarish
  let sidebarUserDiv = document.getElementById("sidebarUserInfo");
  if (!sidebarUserDiv) {
    sidebarUserDiv = document.createElement("div");
    sidebarUserDiv.id = "sidebarUserInfo";
    sidebarUserDiv.className = "flex items-center gap-3 mb-4 p-3 rounded-lg bg-gray-100 dark:bg-gray-800 shadow";
    // logoutBtn tugmasidan oldin joylashtiramiz
    const logoutBtn = document.getElementById("logoutBtn");
    logoutBtn.parentNode.insertBefore(sidebarUserDiv, logoutBtn);
  }
  // User photo
  const photoURL = user.photoURL || "https://ui-avatars.com/api/?name=" + encodeURIComponent(user.displayName || "Foydalanuvchi") + "&background=0D8ABC&color=fff&size=64";
  sidebarUserDiv.innerHTML = `
    <img src="${photoURL}" alt="User" class="w-12 h-12 rounded-full border-2 border-blue-400 shadow" />
    <div>
      <div class="font-bold text-lg flex items-center gap-2">
        <span>${user.displayName || "Foydalanuvchi"}</span>
        <span class="text-blue-600 dark:text-blue-300 font-extrabold text-base">#${sidebarNumber}</span>
      </div>
      <div class="text-xs font-mono text-gray-500 dark:text-gray-400 mt-1">ID: <span class="tracking-widest">${sidebarUserCode}</span></div>
    </div>
  `;
}

// Custom confirmation dialog
function showConfirmDiv(message) {
  return new Promise((resolve) => {
    document.getElementById('customConfirmDiv')?.remove();

    const div = document.createElement('div');
    div.id = 'customConfirmDiv';
    div.className = 'fixed inset-0 z-[100] flex items-center justify-center bg-gray-800 bg-opacity-60';
    div.innerHTML = `
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 w-full max-w-xs text-center border border-gray-300 dark:border-gray-700">
        <div class="mb-4 font-bold text-lg">${message}</div>
        <div class="flex gap-2 justify-center">
          <button id="confirmYes" class="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded">Ha</button>
          <button id="confirmNo" class="bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-100 px-4 py-2 rounded">Yo‘q</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(div);
    div.querySelector('#confirmYes').onclick = () => {
      div.remove();
      resolve(true);
    };
    div.querySelector('#confirmNo').onclick = () => {
      div.remove();
      resolve(false);
    };
  });
}

// Userlar ro'yxatini Firebase'dan olish
let allUsers = [];
async function loadAllUsers() {
  const usersSnap = await getDocs(collection(db, "users"));
  allUsers = usersSnap.docs.map(doc => {
    const data = doc.data();
    return {
      id: data.sidebarUserCode || doc.id,
      name: data.name || "Noma'lum",
      number: data.sidebarNumber || "",
    };
  });
}
loadAllUsers();

// Userlar ro'yxati (namuna uchun, backenddan yoki localStorage dan olishingiz mumkin)
const sampleUsers = [
  { id: 'X4E33CYX', name: 'kamoliddin' },
  { id: 'A1B2C3D4', name: 'Ali' },
  { id: 'B2C3D4E5', name: 'Vali' },
  { id: 'C3D4E5F6', name: 'Sardor' },
  // ... boshqa userlar ...
];

// Modal va input elementlari
const viewDebtsBtn = document.getElementById('viewDebtsBtn');
const viewDebtsModal = document.getElementById('viewDebtsModal');
const closeViewDebtsModal = document.getElementById('closeViewDebtsModal');
const searchByNameOrIdInput = document.getElementById('searchByNameOrIdInput');
const searchByCodeResult = document.getElementById('searchByCodeResult');

// Modalni ochish
viewDebtsBtn.addEventListener('click', () => {
  viewDebtsModal.classList.remove('hidden');
  searchByNameOrIdInput.value = '';
  searchByCodeResult.innerHTML = '';
  searchByNameOrIdInput.focus();
});

// Modalni yopish
closeViewDebtsModal.addEventListener('click', () => {
  viewDebtsModal.classList.add('hidden');
});

// Dashboardga qo‘shilgan userlar (search orqali)
let addedSearchUsers = [];

// Qidiruv funksiyasi (yangilangan)
searchByNameOrIdInput.addEventListener('input', async function () {
  const query = this.value.trim().toLowerCase();
  if (!query) {
    searchByCodeResult.innerHTML = '';
    return;
  }
  const results = allUsers.filter(
    user =>
      user.name.toLowerCase().includes(query) ||
      user.id.toLowerCase().includes(query)
  );

  // Qarzdorlarni olish (ball uchun)
  const debtorsSnap = await getDocs(collection(db, "debtors"));
  const debtorsArr = debtorsSnap.docs.map(doc => ({ ...doc.data(), id: doc.id }));

  if (results.length === 0) {
    searchByCodeResult.innerHTML = '<div class="text-center text-gray-400 mt-4">Hech narsa topilmadi</div>';
  } else {
    searchByCodeResult.innerHTML = results
      .map(user => {
        // Qarzdorni topamiz
        const debtor = debtorsArr.find(
          d => d.userId === user.id || d.code === user.id || d.id === user.id
        );
        // Ball badge HTML
        const ratingBadge = debtor && debtor.lastRating ? `
          <span class="ml-2 px-3 py-1 rounded-full font-bold text-sm flex items-center gap-1 shadow rating-badge"
            style="background: linear-gradient(90deg,#fbbf24,#f59e42); color: #fff; border: 1.5px solid #f59e42;">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="#fff" style="filter: drop-shadow(0 1px 2px #f59e42);">
              <polygon points="10,2 12.5,7.5 18,8 13.5,12 15,18 10,14.5 5,18 6.5,12 2,8 7.5,7.5" stroke="#fff" stroke-width="0.5"/>
            </svg>
            ${Number(debtor.lastRating).toFixed(1).replace(/\.0$/, "")}
          </span>
        ` : "";

        return `
        <div class="flex items-center gap-3 bg-[#232c39] rounded p-3 mb-2 shadow border border-gray-700">
          <div class="w-12 h-12 rounded-full bg-[#1976b2] flex items-center justify-center text-white font-bold text-lg border-4 border-[#60a5fa]">
            ${user.name.slice(0,2).toUpperCase()}
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-bold text-lg flex items-center gap-2 text-gray-900 dark:text-white mb-1">
              <span class="truncate">${user.name}</span>
              <span class="text-blue-300 font-mono text-base">#${user.number || user.id.slice(-3)}</span>
              ${ratingBadge}
            </div>
            <div class="text-xs text-gray-400 font-mono">ID: ${user.id}</div>
          </div>
          <button class="add-search-user-btn bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded shadow text-sm" data-id="${user.id}">Qo‘shish</button>
        </div>
        `;
      })
      .join('');
    // Qo‘shish tugmalariga event biriktirish
    document.querySelectorAll('.add-search-user-btn').forEach(btn => {
      btn.onclick = function() {
        const userId = this.getAttribute('data-id');
        const user = allUsers.find(u => u.id === userId);
        if (user && !addedSearchUsers.some(u => u.id === user.id)) {
          addedSearchUsers.push(user);
          renderAddedSearchUsers();
          saveAddedSearchUsers();
        }
      };
    });
  }
});

// Dashboardda search orqali qo‘shilgan userlarni ko‘rsatish
async function renderAddedSearchUsers() {
  // Loader va "Qarzdorlar topilmadi" divlarini olish
  const loader = document.querySelector('.loader');
  const noDebtorsDiv = document.getElementById("noDebtorsFound");
  if (addedSearchUsers.length > 0) {
    if (noDebtorsDiv) noDebtorsDiv.classList.add("hidden");
    if (loader) loader.classList.add("hidden");
  }

  let container = document.getElementById('addedSearchUsersList');
  if (!container) {
    container = document.createElement('div');
    container.id = 'addedSearchUsersList';
    container.className = 'w-full max-w-3xl space-y-4 px-4 mb-6';
    const debtorsList = document.getElementById('debtorsList');
    debtorsList.parentNode.insertBefore(container, debtorsList);
  }

  // Har bir user uchun jami qo‘shilganni olish va card yasash
  container.innerHTML = '';
  for (let idx = 0; idx < addedSearchUsers.length; idx++) {
    const user = addedSearchUsers[idx];
    let totalAdded = 0, totalSub = 0;
    const debtorsSnap = await getDocs(collection(db, "debtors"));
    const debtor = debtorsSnap.docs
      .map(doc => ({ ...doc.data(), id: doc.id }))
      .find(d => d.userId === user.id || d.code === user.id || d.id === user.id);

    if (debtor) {
      // Avval totalAdded va totalSubtracted maydonidan, bo‘lmasa history dan hisoblab olamiz
      if (typeof debtor.totalAdded === "number") {
        totalAdded = debtor.totalAdded;
      } else {
        (debtor.history || []).forEach(h => {
          if (h.type === "add") totalAdded += h.amount || 0;
        });
      }
      if (typeof debtor.totalSubtracted === "number") {
        totalSub = debtor.totalSubtracted;
      } else {
        (debtor.history || []).forEach(h => {
          if (h.type === "sub") totalSub += h.amount || 0;
        });
      }
    }

    const remaining = totalAdded - totalSub;

    container.innerHTML += `
      <div class="flex flex-col sm:flex-row items-center gap-4 rounded-2xl p-5 shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/80 backdrop-blur-xl" style="z-index:10; position:relative;">
        <div class="w-14 h-14 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-200 font-bold text-2xl shadow mb-2 sm:mb-0">
          ${user.name.slice(0,2).toUpperCase()}
        </div>
        <div class="flex-1 min-w-0 w-full">
          <div class="font-bold text-lg flex items-center gap-2 text-gray-900 dark:text-white mb-1">
            <span class="truncate">${user.name}</span>
            <span class="text-gray-400 font-mono text-base">#${user.id}</span>
            ${debtor && debtor.lastRating ? `
              <span class="ml-2 px-4 py-1 rounded-full font-bold text-sm flex items-center gap-2 shadow rating-badge"
                style="background: linear-gradient(90deg,#fbbf24,#f59e42); color: #fff; border: 1.5px solid #f59e42; min-width:48px; justify-content:center;">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="#fff" style="filter: drop-shadow(0 1px 2px #f59e42);">
                  <polygon points="10,2 12.5,7.5 18,8 13.5,12 15,18 10,14.5 5,18 6.5,12 2,8 7.5,7.5" stroke="#fff" stroke-width="0.5"/>
                </svg>
                ${debtor.lastRating}
              </span>
            ` : ""}
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400 font-mono mb-1">ID: ${user.id}</div>
          <div class="mt-1 font-semibold text-base text-gray-700 dark:text-gray-200">
            Jami qo‘shilgan: <span class="text-green-600 dark:text-green-400 font-bold">${totalAdded} so‘m</span>
          </div>
          <div class="mt-1 font-semibold text-base">
            <span class="text-red-600 dark:text-red-400">Jami ayirilgan: ${totalSub} so‘m</span>
          </div>
          <div class="mt-1 font-semibold text-base">
            Qolgan qarzdorlik: <span class="text-blue-700 dark:text-blue-400 font-bold">${remaining} so‘m</span>
          </div>
          <div class="flex flex-col sm:flex-row gap-2 mt-4 w-full">
            <button class="batafsil-search-user-btn bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded shadow text-sm w-full sm:w-auto" data-id="${user.id}">Batafsil</button>
            <button class="remove-search-user-btn bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded shadow text-sm w-full sm:w-auto" data-id="${user.id}">O‘chirish</button>
          </div>
        </div>
      </div>
    `;
  }

  // O‘chirish va batafsil tugmalari uchun eventlar
  container.querySelectorAll('.remove-search-user-btn').forEach(btn => {
    btn.onclick = function() {
      const userId = this.getAttribute('data-id');
      addedSearchUsers = addedSearchUsers.filter(u => u.id !== userId);
      renderAddedSearchUsers();
      saveAddedSearchUsers();
    };
  });
  container.querySelectorAll('.batafsil-search-user-btn').forEach(btn => {
    btn.onclick = async function() {
      const userId = this.getAttribute('data-id');
      const userName = (addedSearchUsers.find(u => u.id === userId)?.name ?? "Foydalanuvchi");
      const debtorsSnap = await getDocs(collection(db, "debtors"));
      const debtor = debtorsSnap.docs
        .map(doc => ({ ...doc.data(), id: doc.id }))
        .find(d => d.userId === userId || d.code === userId || d.id === userId);

      if (debtor) {
        openDebtorModal(debtor);
      } else {
        if (await showConfirmDiv("qarz qo‘shish uchun yangi qarzdor yaratilsinmi?")) {
          const user = auth.currentUser;
          if (!user) return;
          const newDebtorRef = await addDoc(collection(db, "debtors"), {
            name: userName,
            userId: userId,
            code: userId,
            product: "",
            count: 1,
            price: 0,
            note: "",
            history: [],
          });
          const newDebtorDoc = await getDoc(newDebtorRef);
          const newDebtor = { ...newDebtorDoc.data(), id: newDebtorRef.id };
          openDebtorModal(newDebtor);
          loadDebtors();
        }
      }
    };
  });
  saveAddedSearchUsers();
}

// Modalni ko‘rsatish uchun yordamchi funksiya
function showUserDetailModal(user) {
  // Modal yaratish yoki mavjudini olish
  let modal = document.getElementById('userDetailModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'userDetailModal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40';
    modal.innerHTML = `
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-full max-w-xs text-center relative">
        <button id="closeUserDetailModal" class="absolute top-2 right-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl">&times;</button>
        <div class="flex flex-col items-center gap-3">
          <div class="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-2xl mb-2">
            ${user.name.slice(0,2).toUpperCase()}
          </div>
          <div class="font-bold text-xl mb-1">${user.name}</div>
          <div class="text-blue-600 font-bold mb-1">#${user.id}</div>
          <div class="text-xs text-gray-500 mb-2">ID: ${user.id}</div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  } else {
    modal.querySelector('.font-bold.text-xl').innerText = user.name;
    modal.querySelector('.text-blue-600.font-bold').innerText = `#${user.id}`;
    modal.querySelector('.text-xs.text-gray-500').innerText = `ID: ${user.id}`;
    modal.querySelector('.w-16.h-16').innerText = user.name.slice(0,2).toUpperCase();
    modal.classList.remove('hidden');
  }
  modal.querySelector('#closeUserDetailModal').onclick = () => modal.remove();
}

// addedSearchUsers massivini Firebase'da saqlash va olish
async function saveAddedSearchUsers() {
  const user = auth.currentUser;
  if (!user) return;
  const userRef = doc(db, "users", user.uid);
  await updateDoc(userRef, { addedSearchUsers });
}

async function loadAddedSearchUsers() {
  const user = auth.currentUser;
  if (!user) return;
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  if (snap.exists() && Array.isArray(snap.data().addedSearchUsers)) {
    addedSearchUsers = snap.data().addedSearchUsers;
    renderAddedSearchUsers();
  }
}

// Search orqali qo‘shishda ham saqlash
document.querySelectorAll('.add-search-user-btn').forEach(btn => {
  btn.onclick = function() {
    const userId = this.getAttribute('data-id');
    const user = allUsers.find(u => u.id === userId);
    if (user && !addedSearchUsers.some(u => u.id === user.id)) {
      addedSearchUsers.push(user);
      renderAddedSearchUsers();
      saveAddedSearchUsers(); // <-- Qo‘shildi
    }
  };
});

// "Mening qarzlarim" tugmasi bosilganda sizga yozilgan qarzlarni ko‘rsatish
document.getElementById('myDebtsBtn').onclick = async () => {
  const user = auth.currentUser;
  if (!user) return;

  // Foydalanuvchi ma'lumotlarini olish (sidebarUserCode uchun)
  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);
  const sidebarUserCode = userSnap.exists() ? (userSnap.data().sidebarUserCode || user.uid) : user.uid;

  // Sizga yozilgan qarzlarni topamiz (faqat o‘zining ID yoki sidebarUserCode bo‘yicha)
  const debtorsSnap = await getDocs(collection(db, "debtors"));
  const myDebts = [];
  debtorsSnap.forEach(docu => {
    const d = docu.data();
    if (
      (d.code && d.code === sidebarUserCode) ||
      (d.userId && d.userId === sidebarUserCode)
    ) {
      myDebts.push({ ...d, id: docu.id });
    }
  });

  // Kim yozganini aniqlash uchun barcha userlarni yuklab olamiz
  const usersSnap = await getDocs(collection(db, "users"));
  const usersMap = {};
  usersSnap.forEach(u => {
    usersMap[u.id] = u.data().name || "Noma'lum";
    if (u.data().sidebarUserCode) {
      usersMap[u.data().sidebarUserCode] = u.data().name || "Noma'lum";
    }
  });

  // Modalga chiqaramiz
  const myDebtsList = document.getElementById('myDebtsList');
  myDebtsList.innerHTML = myDebts.length
    ? myDebts.map(d => {
        // Tarixini chiqarish va har bir harakatni kim yozganini aniqlash
        const historyHtml = (d.history || []).map(h => {
          // Harakatni yozgan userId
          const authorId = h.authorId || d.userId;
          const authorName = usersMap[authorId] || authorId || "-";
          return `
            <div class="p-2 rounded mb-1 ${h.type === "add" ? "bg-green-100 dark:bg-green-900" : "bg-red-100 dark:bg-red-900"}">
              <b>${h.type === "add" ? "+" : "-"}${h.amount} so‘m</b>
              <span class="text-xs text-gray-500 ml-2">${h.date && h.date.toDate ? h.date.toDate().toLocaleString("uz-UZ") : ""}</span>
              <div class="text-xs text-gray-400">${h.note || ""}</div>
              <div class="text-xs text-gray-500">Kim yozgan: <b>${authorName}</b></div>
            </div>
          `;
        }).join("");
        return `
          <div class="p-3 rounded bg-gray-100 dark:bg-gray-700 mb-4">
            <div class="text-xs text-gray-400 mb-1">ID: <b>${d.code || d.userId || "-"}</b></div>
            <div class="mt-2">${historyHtml || "<span class='text-gray-400'>Tarix yo‘q</span>"}</div>
          </div>
        `;
      }).join("")
    : `<div class="text-center text-gray-500">Sizga yozilgan qarzlar topilmadi.</div>`;

  document.getElementById('myDebtsModal').classList.remove('hidden');
};

// Modalni yopish
document.getElementById('closeMyDebtsModal').onclick = () => {
  document.getElementById('myDebtsModal').classList.add('hidden');
};

if (typeof d.totalAdded !== "number") {
  let totalAdd = 0;
  (d.history || []).forEach(h => { if (h.type === "add") totalAdd += h.amount || 0; });
  d.totalAdded = totalAdd;
  // Istasangiz, Firebase'ga ham yozib qo‘ying:
  updateDoc(doc(db, "debtors", d.id), { totalAdded: totalAdd });
}

// Ball berish cardi funksiyasi
function showRatingCard(onRated) {
  // Eski card bo‘lsa o‘chiramiz
  document.getElementById('ratingCardDiv')?.remove();
  const div = document.createElement('div');
  div.id = 'ratingCardDiv';
  div.className = 'fixed inset-0 z-[200] flex items-center justify-center bg-black bg-opacity-40';
  div.innerHTML = `
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 w-full max-w-xs text-center border border-gray-300 dark:border-gray-700">
      <div class="mb-4 font-bold text-lg">Qarz tugatildi! Qarzdorga baho bering:</div>
      <div class="flex justify-center gap-2 mb-4">
        ${[1,2,3,4,5].map(i => `
          <button class="rating-btn bg-gray-200 hover:bg-yellow-400 text-xl rounded-full w-10 h-10 font-bold" data-rating="${i}">${i}</button>
        `).join('')}
      </div>
      <div class="text-xs text-gray-500">Ball berilgandan so‘ng bu oynacha yopiladi.</div>
    </div>
  `;
  document.body.appendChild(div);
  div.querySelectorAll('.rating-btn').forEach(btn => {
    btn.onclick = () => {
      const rating = parseInt(btn.getAttribute('data-rating'));
      div.remove();
      if (typeof onRated === "function") onRated(rating);
    };
  });
}


