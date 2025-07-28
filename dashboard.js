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
  query,
  where,
  onSnapshot,
  orderBy,
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
    loadAddedSearchUsers(); // <-- Qo'shildi
    
    // Check for pending permission requests and notifications
    checkPendingPermissionRequests();
    checkNotifications();
    
    // Set up real-time listener for permission requests
    setupPermissionRequestListener();
    setupNotificationListener();
    setupPermissionUpdateListener();
    
    // Update message count badge
    updateMessageCountBadge();
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
    totalAdded: amount,
    totalSubtracted: 0,
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
  await updateUserTotals(); // Update user totals
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

// 2. renderStats funksiyasini o'zgartiring:
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

  // Search orqali qo'shilgan userlar statistikasi ham qo'shilsin
  const { totalAllAdded, totalAllSub, totalAllDebt } = await getAddedSearchUsersTotals();
  totalAdded += totalAllAdded;
  totalSubtracted += totalAllSub;
  totalDebt += totalAllDebt;

  // Try to get from Firebase user doc if available
  const user = auth.currentUser;
  if (user) {
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data();
      if (typeof data.totalAdded === "number") totalAdded = data.totalAdded;
      if (typeof data.totalSubtracted === "number") totalSubtracted = data.totalSubtracted;
      if (typeof data.totalDebt === "number") totalDebt = data.totalDebt;
    }
  }

  document.getElementById("totalAdded").innerText = totalAdded + " so'm";
  document.getElementById("totalSubtracted").innerText = totalSubtracted + " so'm";
  document.getElementById("totalDebt").innerText = totalDebt + " so'm";

  // Save to localStorage for bosh-sahifa.html
  localStorage.setItem("totals", JSON.stringify({ totalAdded, totalSubtracted, totalDebt }));
}

// Render debtors list
function renderDebtors(debtors) {
  debtors.sort((a, b) =>
    a.name.localeCompare(b.name, "uz", { sensitivity: "base" })
  );

  renderStats(debtors);
  const list = document.getElementById("debtorsList");
  list.innerHTML = "";

  // Store debtor count for bosh-sahifa (including addedSearchUsers, unique by id)
  let allDebtorIds = new Set(debtors.map(d => d.id));
  let uniqueCount = debtors.length;
  if (Array.isArray(addedSearchUsers) && addedSearchUsers.length > 0) {
    addedSearchUsers.forEach(u => {
      // Only count if not already in debtors
      if (!allDebtorIds.has(u.id)) {
        uniqueCount++;
        allDebtorIds.add(u.id);
      }
    });
  }
  localStorage.setItem("debtorCount", uniqueCount);

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
          <span class="font-semibold ${isDark ? 'text-gray-200' : 'text-gray-700'}">Umumiy qo'shilgan:</span>
          <span class="${isDark ? 'text-white' : 'text-gray-900'} font-bold">${totalAdd} so'm</span>
        </div>
        <div>
          <span class="font-semibold ${isDark ? 'text-gray-2300' : 'text-gray-700'}">Ayirilgan:</span>
          <span class="${isDark ? 'text-white' : 'text-gray-900'} font-bold">${totalSub} so'm</span>
        </div>
        <div>
          <span class="font-semibold ${isDark ? 'text-gray-200' : 'text-gray-700'}">Qolgan:</span>
          <span class="${isDark ? 'text-white' : 'text-gray-900'} font-bold">${totalAdd - totalSub} so'm</span>
        </div>
      </div>
    </div>
    <div class="flex flex-col gap-2 w-full mt-4 items-stretch">
      <button class="bg-blue-500 hover:bg-blue-600 text-white px-5 py-2 rounded-lg font-semibold shadow transition w-full" data-id="${d.id}">Batafsil</button>
      <button class="bg-red-500 hover:bg-red-600 text-white px-5 py-2 rounded-lg font-semibold shadow transition w-full" data-del="${d.id}">O'chirish</button>
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
      <div class="mb-4 font-bold">"${name}"ni o'chirishni istaysizmi?</div>
      <div class="flex gap-2 justify-center">
        <button id="delYes" class="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded">Ha, o'chirish</button>
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
  let totalAdd = 0, totalSub = 0;

  // Faqat o'zining yozganlarini ko'rsatish
  const currentUserId = auth.currentUser.uid;
  const filteredHistory = (debtor.history || []).filter(
    h => (h.authorId ? h.authorId === currentUserId : debtor.userId === currentUserId)
  );

  // Barcha harakatlarni vaqti bo'yicha saralash (eski vaqtlar avval, yangi vaqtlar keyin)
  const sortedHistory = filteredHistory.sort((a, b) => {
    const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
    const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
    return dateA - dateB;
  });

  // Barcha harakatlarni bitta ro'yxatda birlashtirish
  let combinedHistory = "";
  sortedHistory.forEach((h) => {
    const date = h.date?.toDate ? h.date.toDate() : new Date();
    const time = date.toLocaleString("uz-UZ");

    if (h.type === "add") {
      combinedHistory += `
        <div class="bg-green-100 dark:bg-green-900 rounded p-2 mb-2">
          +${h.amount} so'm 
          <span class="text-xs text-gray-500 ml-2">
            (${h.count || 1} x ${h.price || h.amount} so'm, ${h.product || debtor.product || ""})
          </span>
          <span class="text-xs text-gray-400 ml-2">${time}</span>
          <div class="text-xs text-gray-400">${h.note || ""}</div>
        </div>`;
      totalAdd += h.amount;
    }

    if (h.type === "sub") {
      combinedHistory += `
        <div class="bg-red-100 dark:bg-red-900 rounded p-2 mb-2">
          -${h.amount} so'm 
          <span class="text-xs text-gray-400 ml-2">${time}</span>
          ${h.note ? `<div class="text-xs text-gray-400 mt-1">${h.note}</div>` : ""}
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
      <div class="text-sm text-gray-400 mb-2">${debtor.product ? `${debtor.product} (${debtor.count || 1} x ${debtor.price || 0} so'm)` : ""}</div>
      <div class="text-xs text-gray-400 mb-2">${debtor.note || ""}</div>
      <div class="mb-4 text-base">
        Umumiy qarz: <span class="font-bold text-blue-700 dark:text-blue-300">${totalAdd - totalSub} so'm</span>
      </div>
      <form id="addDebtForm" class="flex flex-col gap-2 mb-3">
        <div class="grid grid-cols-1 gap-2">
          <input type="text" placeholder="Mahsulot nomi" class="p-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-900 dark:text-gray-100 transition" autocomplete="off">
          <input type="number" placeholder="Mahsulot soni" class="p-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-900 dark:text-gray-100 transition" autocomplete="off">
          <input type="number" min="1" placeholder="Mahsulot narxi" class="p-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-900 dark:text-gray-100 transition" required autocomplete="off">
          <input type="text" placeholder="Izoh (ixtiyoriy)" class="p-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-900 dark:text-gray-100 transition" autocomplete="off">
        </div>
        <button type="submit" class="bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded font-semibold shadow transition">Qo'shish</button>
      </form>
      <form id="subDebtForm" class="flex flex-col gap-2 mb-3">
        <input type="number" min="1" placeholder="Qarz ayirish (so'm)" class="p-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-red-400 text-gray-900 dark:text-gray-100 transition" required autocomplete="off">
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
        <div class="font-bold mb-2 text-gray-900 dark:text-white">Barcha harakatlar (vaqti bo'yicha)</div>
        <div class="space-y-2 max-h-96 overflow-y-auto">
          ${combinedHistory || '<div class="text-gray-400">Yo\'q</div>'}
        </div>
      </div>
    </div>
  </div>
  <div class="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
    <div class="bg-white/80 dark:bg-gray-900/60 rounded-lg p-4 flex flex-col items-center border border-gray-200 dark:border-gray-700 shadow">
      <div class="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">Jami qo'shilgan</div>
      <div class="text-2xl font-bold text-green-600 dark:text-green-400">${totalAdd}</div>
      <div class="text-green-600 dark:text-green-400 font-semibold">so'm</div>
    </div>
    <div class="bg-white/80 dark:bg-gray-900/60 rounded-lg p-4 flex flex-col items-center border border-gray-200 dark:border-gray-700 shadow">
      <div class="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">Jami ayirilgan</div>
      <div class="text-2xl font-bold text-red-500 dark:text-red-400">${totalSub}</div>
      <div class="text-red-500 dark:text-red-400 font-semibold">so'm</div>
    </div>
    <div class="bg-white/80 dark:bg-gray-900/60 rounded-lg p-4 flex flex-col items-center border border-gray-200 dark:border-gray-700 shadow">
      <div class="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">Qarzdorlik</div>
      <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">${totalAdd - totalSub}</div>
      <div class="text-blue-600 dark:text-blue-400 font-semibold">so'm</div>
    </div>
  </div>
`;

  // Add debt form handler
  modalContent.querySelector("#addDebtForm").onsubmit = async (e) => {
    e.preventDefault();
    if (!(await showConfirmDiv("Qo'shaveraymi?"))) return;
    
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
      // Jami qo'shilganni yangilash
      totalAdded: (debtor.totalAdded || 0) + amount
    });
    
    const updated = (await getDocs(collection(db, "debtors"))).docs
      .find((docu) => docu.id === debtor.id)
      .data();
      
    openDebtorModal({ ...updated, id: debtor.id });
    await updateUserTotals(); // Update user totals
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
    await updateUserTotals(); // Update user totals
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
          // O'rtacha ballni hisoblaymiz
          let avgRating = prevRating ? Math.round(((prevRating + rating) / 2) * 10) / 10 : rating;
          await updateDoc(ref, {
            history: [],
            totalAdded: 0,
            totalSubtracted: 0,
            lastRating: avgRating // O'rtacha ballni saqlash
          });
          const updated = (await getDocs(collection(db, "debtors"))).docs
            .find((docu) => docu.id === debtor.id)
            .data();
          openDebtorModal({ ...updated, id: debtor.id });
          await updateUserTotals(); // Update user totals
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

  // Sidebar'da ism, raqam, ID va rasmni chiqarish
  let sidebarUserDiv = document.getElementById("sidebarUserInfo");
  if (!sidebarUserDiv) {
    sidebarUserDiv = document.createElement("div");
    sidebarUserDiv.id = "sidebarUserInfo";
    sidebarUserDiv.className = "flex items-center gap-3 mb-4 p-3 rounded-lg bg-gray-100 dark:bg-gray-800 shadow";
    // logoutBtn tugmasidan oldin joylashtiramiz
    const logoutBtn = document.getElementById("logoutBtn");
    logoutBtn.parentNode.insertBefore(sidebarUserDiv, logoutBtn);
  }
  // Check premium status
  const isPremium = await checkPremiumStatus();
  
  // User photo
  const photoURL = user.photoURL || "https://ui-avatars.com/api/?name=" + encodeURIComponent(user.displayName || "Foydalanuvchi") + "&background=0D8ABC&color=fff&size=64";
  sidebarUserDiv.innerHTML = `
    <div class="relative">
      <img src="${photoURL}" alt="User" class="w-12 h-12 rounded-full border-2 border-blue-400 shadow" />
      ${isPremium ? `
        <div class="absolute -top-1 -right-1 w-6 h-6 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
          <svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path>
          </svg>
        </div>
      ` : ''}
    </div>
    <div>
      <div class="font-bold text-lg flex items-center gap-2">
        <span>${user.displayName || "Foydalanuvchi"}</span>
        <span class="text-blue-600 dark:text-blue-300 font-extrabold text-base">#${sidebarNumber}</span>
        ${isPremium ? `
          <span class="px-2 py-1 bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-xs rounded-full font-bold">
            PREMIUM
          </span>
        ` : ''}
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
          <button id="confirmNo" class="bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-100 px-4 py-2 rounded">Yo'q</button>
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
const searchAllDebtsInput = document.getElementById('searchAllDebtsInput');
const searchAllDebtsResult = document.getElementById('searchAllDebtsResult');

// Modalni ochish
viewDebtsBtn.addEventListener('click', () => {
  viewDebtsModal.classList.remove('hidden');
  searchByNameOrIdInput.value = '';
  searchByCodeResult.innerHTML = '';
  searchAllDebtsInput.value = '';
  searchAllDebtsResult.innerHTML = '';
  searchByNameOrIdInput.focus();
});

// Modalni yopish
closeViewDebtsModal.addEventListener('click', () => {
  viewDebtsModal.classList.add('hidden');
});

// Dashboardga qo'shilgan userlar (search orqali)
let addedSearchUsers = [];

// Barcha qarzlarni qidirish funksiyasi (asosiy sahifa uchun)
document.getElementById('searchAllDebtsInput').addEventListener('input', async function() {
  const query = this.value.trim().toLowerCase();
  const searchAllDebtsResult = document.getElementById('searchAllDebtsResult');
  if (!query) {
    searchAllDebtsResult.innerHTML = '';
    return;
  }

  // Barcha qarzdorlarni olish
  const debtorsSnap = await getDocs(collection(db, "debtors"));
  const allDebtors = debtorsSnap.docs.map(doc => ({ ...doc.data(), id: doc.id }));

  // Foydalanuvchining o'z qarzdorlari va qo'shilgan userlar (addedSearchUsers) bo'yicha qidirish
  const user = auth.currentUser;
  const myUserId = user ? user.uid : null;
  const addedUserIds = (addedSearchUsers || []).map(user => user.id);

  // Faqat o'z qarzdorlaringiz va qo'shilgan userlar qarzdorliklarini filtrlash
  const filteredDebtors = allDebtors.filter(debtor =>
    (myUserId && debtor.userId === myUserId) ||
    addedUserIds.includes(debtor.userId) ||
    addedUserIds.includes(debtor.code) ||
    addedUserIds.includes(debtor.id)
  );

  // Qidiruv natijalarini to'plash
  const searchResults = [];

  filteredDebtors.forEach(debtor => {
    // Qarzdor nomi bo'yicha qidirish
    if (debtor.name && debtor.name.toLowerCase().includes(query)) {
      searchResults.push({
        type: 'debtor_name',
        debtor: debtor,
        match: debtor.name,
        matchType: 'Qarzdor nomi'
      });
    }
    // Mahsulot nomi bo'yicha qidirish
    if (debtor.product && debtor.product.toLowerCase().includes(query)) {
      searchResults.push({
        type: 'product',
        debtor: debtor,
        match: debtor.product,
        matchType: 'Mahsulot'
      });
    }
    // Izoh bo'yicha qidirish
    if (debtor.note && debtor.note.toLowerCase().includes(query)) {
      searchResults.push({
        type: 'note',
        debtor: debtor,
        match: debtor.note,
        matchType: 'Izoh'
      });
    }
    // History ichidan qidirish
    if (debtor.history && Array.isArray(debtor.history)) {
      debtor.history.forEach((h, index) => {
        // History izohi bo'yicha
        if (h.note && h.note.toLowerCase().includes(query)) {
          searchResults.push({
            type: 'history_note',
            debtor: debtor,
            match: h.note,
            matchType: 'Tarix izohi',
            historyItem: h,
            historyIndex: index
          });
        }
        // History mahsuloti bo'yicha
        if (h.product && h.product.toLowerCase().includes(query)) {
          searchResults.push({
            type: 'history_product',
            debtor: debtor,
            match: h.product,
            matchType: 'Tarix mahsuloti',
            historyItem: h,
            historyIndex: index
          });
        }
        // Summa bo'yicha qidirish
        if (h.amount && h.amount.toString().includes(query)) {
          searchResults.push({
            type: 'amount',
            debtor: debtor,
            match: h.amount.toString(),
            matchType: 'Summa',
            historyItem: h,
            historyIndex: index
          });
        }
      });
    }
  });

  // Natijalarni ko'rsatish
  if (searchResults.length === 0) {
    searchAllDebtsResult.innerHTML = '<div class="text-center text-gray-400 mt-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">Hech qanday qarz topilmadi</div>';
  } else {
    // Duplikatlarni olib tashlash (bir xil debtor uchun bir necha natija bo'lishi mumkin)
    const uniqueResults = [];
    const seen = new Set();
    searchResults.forEach(result => {
      const key = `${result.debtor.id}-${result.type}-${result.historyIndex || 0}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueResults.push(result);
      }
    });
    searchAllDebtsResult.innerHTML = uniqueResults.map(result => {
      const debtor = result.debtor;
      // Jami qarzdorlikni hisoblash
      let totalAdded = 0, totalSub = 0;
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
      const remaining = totalAdded - totalSub;
      return `
        <div class="bg-white dark:bg-gray-800 rounded-lg p-4 mb-3 shadow border border-gray-200 dark:border-gray-700">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm">
              ${debtor.name ? debtor.name.slice(0,2).toUpperCase() : '??'}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="font-bold text-lg text-gray-900 dark:text-white">${debtor.name}</span>
                <span class="text-blue-600 dark:text-blue-300 text-sm font-mono">#${debtor.code || debtor.id}</span>
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400 mb-2">
                <span class="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-1 rounded">${result.matchType}: ${result.match}</span>
              </div>
              ${result.historyItem ? `
                <div class="text-sm text-gray-600 dark:text-gray-300 mb-2">
                  <span class="font-semibold">${result.historyItem.type === 'add' ? '+' : '-'}${result.historyItem.amount} so'm</span>
                  ${result.historyItem.product ? ` (${result.historyItem.product})` : ''}
                  ${result.historyItem.note ? `<br><span class="text-xs text-gray-500">${result.historyItem.note}</span>` : ''}
                </div>
              ` : ''}
              <div class="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Jami: <span class="font-semibold text-green-600">${totalAdded} so'm</span> | 
                Ayirilgan: <span class="font-semibold text-red-600">${totalSub} so'm</span> | 
                Qolgan: <span class="font-semibold text-blue-600">${remaining} so'm</span>
              </div>
              <button class="view-debtor-details-btn bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm" data-id="${debtor.id}">
                Batafsil ko'rish
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
    // Batafsil ko'rish tugmalariga event biriktirish
    searchAllDebtsResult.querySelectorAll('.view-debtor-details-btn').forEach(btn => {
      btn.onclick = function() {
        const debtorId = this.getAttribute('data-id');
        const debtor = allDebtors.find(d => d.id === debtorId);
        if (debtor) {
          openDebtorModal(debtor);
        }
      };
    });
  }
});

// Qidiruv funksiyasi (modal uchun, eski koddan olib tashlash mumkin)
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
          <button class="add-search-user-btn bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded shadow text-sm" data-id="${user.id}">Qo'shish</button>
        </div>
        `;
      })
      .join('');
    // Qo'shish tugmalariga event biriktirish
    document.querySelectorAll('.add-search-user-btn').forEach(btn => {
      btn.onclick = async function() {
        const userId = this.getAttribute('data-id');
        const user = allUsers.find(u => u.id === userId);
        if (!user || addedSearchUsers.some(u => u.id === user.id)) return;
        
        const currentUser = auth.currentUser;
        if (!currentUser) {
          showNotification('Avval tizimga kirishingiz kerak!', 'error');
          return;
        }
        
        // Check permission
        const hasPermission = await checkPermissionToAddUser(user);
        if (hasPermission) {
          // Direct add if user has permission
          addedSearchUsers.push(user);
          renderAddedSearchUsers();
          saveAddedSearchUsers();
          showNotification(`${user.name} muvaffaqiyatli qo'shildi!`, 'success');
        } else {
          // Request permission
          const result = await requestPermissionToAddUser(user, currentUser);
          if (result.granted) {
            addedSearchUsers.push(user);
            renderAddedSearchUsers();
            saveAddedSearchUsers();
            showNotification(`${user.name} muvaffaqiyatli qo'shildi!`, 'success');
          }
        }
      };
    });
  }
});

// Dashboardda search orqali qo'shilgan userlarni ko'rsatish
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

  // Har bir user uchun jami qo'shilganni olish va card yasash
  container.innerHTML = '';
  for (let idx = 0; idx < addedSearchUsers.length; idx++) {
    const user = addedSearchUsers[idx];
    let totalAdded = 0, totalSub = 0;
    const debtorsSnap = await getDocs(collection(db, "debtors"));
    const debtor = debtorsSnap.docs
      .map(doc => ({ ...doc.data(), id: doc.id }))
      .find(d => d.userId === user.id || d.code === user.id || d.id === user.id);

    if (debtor) {
      // Avval totalAdded va totalSubtracted maydonidan, bo'lmasa history dan hisoblab olamiz
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
            Jami qo'shilgan: <span class="text-green-600 dark:text-green-400 font-bold">${totalAdded} so'm</span>
          </div>
          <div class="mt-1 font-semibold text-base">
            <span class="text-red-600 dark:text-red-400">Jami ayirilgan: ${totalSub} so'm</span>
          </div>
          <div class="mt-1 font-semibold text-base">
            Qolgan qarzdorlik: <span class="text-blue-700 dark:text-blue-400 font-bold">${remaining} so'm</span>
          </div>
          <div class="flex flex-col sm:flex-row gap-2 mt-4 w-full">
            <button class="batafsil-search-user-btn bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded shadow text-sm w-full sm:w-auto" data-id="${user.id}">Batafsil</button>
            <button class="remove-search-user-btn bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded shadow text-sm w-full sm:w-auto" data-id="${user.id}">O'chirish</button>
          </div>
        </div>
      </div>
    `;
  }

  // O'chirish va batafsil tugmalari uchun eventlar
  container.querySelectorAll('.remove-search-user-btn').forEach(btn => {
    btn.onclick = function() {
      const userId = this.getAttribute('data-id');
      addedSearchUsers = addedSearchUsers.filter(u => u.id !== userId);
      renderAddedSearchUsers();
      saveAddedSearchUsers();
      updateDebtorCount(); // Update debtor count when removing
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
        if (await showConfirmDiv("qarz qo'shish uchun yangi qarzdor yaratilsinmi?")) {
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
  updateDebtorCount(); // Update debtor count after rendering
}

// Function to update debtor count including addedSearchUsers
function updateDebtorCount() {
  // Get current debtors count
  const debtorsList = document.getElementById('debtorsList');
  const currentDebtors = debtorsList ? debtorsList.children.length : 0;
  
  // Calculate total including addedSearchUsers
  let totalDebtorsCount = currentDebtors;
  
  // Add unique addedSearchUsers that are not already in debtors
  const existingDebtorIds = new Set();
  if (debtorsList) {
    Array.from(debtorsList.children).forEach(card => {
      const dataId = card.querySelector('[data-id]')?.getAttribute('data-id');
      if (dataId) existingDebtorIds.add(dataId);
    });
  }
  
  addedSearchUsers.forEach(user => {
    if (!existingDebtorIds.has(user.id)) {
      totalDebtorsCount++;
      existingDebtorIds.add(user.id);
    }
  });
  
  // Store in localStorage for bosh-sahifa
  localStorage.setItem("debtorCount", totalDebtorsCount);
}

// Modalni ko'rsatish uchun yordamchi funksiya
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

// Search orqali qo'shishda ham saqlash - DUPLICATE REMOVED
// Bu event listener yuqorida allaqachon qo'shilgan va permission system bilan almashtirilgan

// Permission system for adding users
let pendingPermissionRequests = new Map(); // Store pending requests

// Function to request permission to add a user
async function requestPermissionToAddUser(userToAdd, requestingUser) {
  return new Promise((resolve) => {
    // Create permission request modal
    const modal = document.createElement('div');
    modal.id = 'permissionModal';
    modal.className = 'fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50';
    modal.innerHTML = `
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6 relative border border-gray-200 dark:border-gray-700">
        <button id="closePermissionModal" class="absolute top-3 right-3 text-2xl text-gray-400 hover:text-red-500 transition">&times;</button>
        
        <div class="text-center mb-6">
          <div class="w-16 h-16 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
            </svg>
          </div>
          <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">Ruxsat so'rash</h3>
          <p class="text-gray-600 dark:text-gray-300 text-sm">Foydalanuvchiga qarzdor qo'shish uchun ruxsat so'ralmoqda</p>
        </div>

        <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-lg">
              ${userToAdd.name.slice(0,2).toUpperCase()}
            </div>
            <div class="flex-1">
              <div class="font-bold text-gray-900 dark:text-white">${userToAdd.name}</div>
              <div class="text-sm text-gray-500 dark:text-gray-400">ID: ${userToAdd.id}</div>
            </div>
          </div>
        </div>

        <div class="space-y-3">
          <button id="requestPermissionBtn" class="w-full bg-blue-500 hover:bg-blue-600 text-white px-4 py-3 rounded-lg font-semibold transition">
            Ruxsat so'rash
          </button>
          <button id="premiumUpgradeBtn" class="w-full bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-white px-4 py-3 rounded-lg font-semibold transition">
            <div class="flex items-center justify-center gap-2">
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path>
              </svg>
              Premium olish
            </div>
          </button>
          <button id="cancelPermissionBtn" class="w-full bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-3 rounded-lg font-semibold transition">
            Bekor qilish
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Event listeners
    const closeBtn = modal.querySelector('#closePermissionModal');
    const requestBtn = modal.querySelector('#requestPermissionBtn');
    const premiumBtn = modal.querySelector('#premiumUpgradeBtn');
    const cancelBtn = modal.querySelector('#cancelPermissionBtn');

    const closeModal = () => {
      modal.remove();
    };

    closeBtn.onclick = closeModal;
    cancelBtn.onclick = () => {
      closeModal();
      resolve({ granted: false, reason: 'cancelled' });
    };

    requestBtn.onclick = async () => {
      closeModal();
      const result = await sendPermissionRequest(userToAdd, requestingUser);
      resolve(result);
    };

    premiumBtn.onclick = () => {
      closeModal();
      showPremiumUpgradeModal();
      resolve({ granted: false, reason: 'premium_required' });
    };
  });
}

// Function to send permission request to user owner
async function sendPermissionRequest(userToAdd, requestingUser) {
  try {
    // Create a permission request document
    const permissionRequest = {
      requestingUserId: requestingUser.uid,
      requestingUserName: requestingUser.displayName || requestingUser.email,
      targetUserId: userToAdd.id,
      targetUserName: userToAdd.name,
      status: 'pending',
      timestamp: new Date(),
      type: 'add_debtor'
    };

    // Save to Firebase
    const requestRef = await addDoc(collection(db, "permissionRequests"), permissionRequest);
    
    // Show success message
    showNotification('Ruxsat so\'rovi yuborildi! Foydalanuvchi tasdiqlagandan so\'ng xabar beramiz.', 'success');
    
    // Store the request ID for tracking
    pendingPermissionRequests.set(userToAdd.id, requestRef.id);
    
    return { granted: false, reason: 'pending_approval', requestId: requestRef.id };
  } catch (error) {
    console.error('Error sending permission request:', error);
    showNotification('Xatolik yuz berdi. Qaytadan urinib ko\'ring.', 'error');
    return { granted: false, reason: 'error' };
  }
}

// Function to show premium upgrade modal
function showPremiumUpgradeModal() {
  const modal = document.createElement('div');
  modal.id = 'premiumModal';
  modal.className = 'fixed inset-0 z-[70] flex items-center justify-center bg-black bg-opacity-50';
  modal.innerHTML = `
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg p-8 relative border border-gray-200 dark:border-gray-700">
      <button id="closePremiumModal" class="absolute top-3 right-3 text-2xl text-gray-400 hover:text-red-500 transition">&times;</button>
      
      <div class="text-center mb-6">
        <div class="w-20 h-20 rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 flex items-center justify-center text-white font-bold text-3xl mx-auto mb-4">
          <svg class="w-10 h-10" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path>
          </svg>
        </div>
        <h3 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Premium a'zolik</h3>
        <p class="text-gray-600 dark:text-gray-300">Cheksiz qarzdor qo'shish imkoniyati</p>
      </div>

      <div class="space-y-4 mb-6">
        <div class="flex items-center gap-3 text-left">
          <div class="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <span class="text-gray-700 dark:text-gray-300">Cheksiz qarzdor qo'shish</span>
        </div>
        <div class="flex items-center gap-3 text-left">
          <div class="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <span class="text-gray-700 dark:text-gray-300">Ruxsatsiz qo'shish</span>
        </div>
        <div class="flex items-center gap-3 text-left">
          <div class="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <span class="text-gray-700 dark:text-gray-300">Barcha funksiyalar</span>
        </div>
      </div>

      <div class="text-center">
        <div class="text-3xl font-bold text-gray-900 dark:text-white mb-2">99,000 so'm</div>
        <div class="text-sm text-gray-500 dark:text-gray-400 mb-6">oyiga</div>
        
        <button id="upgradeToPremiumBtn" class="w-full bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-white px-6 py-4 rounded-lg font-bold text-lg transition">
          Premium olish
        </button>
        
        <button id="closePremiumModalBtn" class="w-full mt-3 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition">
          Keyinroq
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeBtn = modal.querySelector('#closePremiumModal');
  const closeBtn2 = modal.querySelector('#closePremiumModalBtn');
  const upgradeBtn = modal.querySelector('#upgradeToPremiumBtn');

  const closeModal = () => modal.remove();

  closeBtn.onclick = closeModal;
  closeBtn2.onclick = closeModal;
  upgradeBtn.onclick = async () => {
    closeModal();
    await upgradeToPremium();
  };
}

// Function to show notifications
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `fixed top-4 right-4 z-[80] p-4 rounded-lg shadow-lg max-w-sm transition-all duration-300 transform translate-x-full`;
  
  const colors = {
    success: 'bg-green-500 text-white',
    error: 'bg-red-500 text-white',
    info: 'bg-blue-500 text-white',
    warning: 'bg-yellow-500 text-white'
  };
  
  notification.className += ` ${colors[type]}`;
  notification.innerHTML = `
    <div class="flex items-center gap-3">
      <div class="flex-1">${message}</div>
      <button class="text-white hover:text-gray-200 text-xl">&times;</button>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // Animate in
  setTimeout(() => {
    notification.classList.remove('translate-x-full');
  }, 100);
  
  // Auto remove after 5 seconds
  setTimeout(() => {
    notification.classList.add('translate-x-full');
    setTimeout(() => notification.remove(), 300);
  }, 5000);
  
  // Manual close
  notification.querySelector('button').onclick = () => {
    notification.classList.add('translate-x-full');
    setTimeout(() => notification.remove(), 300);
  };
}

// Function to check if user has permission to add another user
async function checkPermissionToAddUser(userToAdd) {
  const currentUser = auth.currentUser;
  if (!currentUser) return false;
  
  // Check if user is premium
  const isPremium = await checkPremiumStatus();
  if (isPremium) {
    return true;
  }
  
  // Check if user owns the target user
  if (userToAdd.userId === currentUser.uid || userToAdd.id === currentUser.uid) {
    return true;
  }
  
  return false;
}

// "Mening qarzlarim" tugmasi bosilganda sizga yozilgan qarzlarni ko'rsatish
document.getElementById('myDebtsBtn').onclick = async () => {
  const user = auth.currentUser;
  if (!user) return;

  // Foydalanuvchi ma'lumotlarini olish (sidebarUserCode uchun)
  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);
  const sidebarUserCode = userSnap.exists() ? (userSnap.data().sidebarUserCode || user.uid) : user.uid;

  // Sizga yozilgan qarzlarni topamiz (faqat o'zining ID yoki sidebarUserCode bo'yicha)
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
              <b>${h.type === "add" ? "+" : "-"}${h.amount} so'm</b>
              <span class="text-xs text-gray-500 ml-2">${h.date && h.date.toDate ? h.date.toDate().toLocaleString("uz-UZ") : ""}</span>
              <div class="text-xs text-gray-400">${h.note || ""}</div>
              <div class="text-xs text-gray-500">Kim yozgan: <b>${authorName}</b></div>
            </div>
          `;
        }).join("");
        return `
          <div class="p-3 rounded bg-gray-100 dark:bg-gray-700 mb-4">
            <div class="text-xs text-gray-400 mb-1">ID: <b>${d.code || d.userId || "-"}</b></div>
            <div class="mt-2">${historyHtml || "<span class='text-gray-400'>Tarix yo'q</span>"}</div>
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

// Bu kod noto'g'ri joyda ekan, uni o'chiramiz
// if (typeof d.totalAdded !== "number") {
//   let totalAdd = 0;
//   (d.history || []).forEach(h => { if (h.type === "add") totalAdd += h.amount || 0; });
//   d.totalAdded = totalAdd;
//   // Istasangiz, Firebase'ga ham yozib qo'ying:
//   updateDoc(doc(db, "debtors", d.id), { totalAdded: totalAdd });
// }

// Ball berish cardi funksiyasi
function showRatingCard(onRated) {
  // Eski card bo'lsa o'chiramiz
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
      <div class="text-xs text-gray-500">Ball berilgandan so'ng bu oynacha yopiladi.</div>
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

// Function to update user totals in Firebase
async function updateUserTotals() {
  const user = auth.currentUser;
  if (!user) return;

  // Get all debtors for this user
  const snapshot = await getDocs(collection(db, "debtors"));
  let totalAdded = 0, totalSubtracted = 0, totalDebt = 0;
  
  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data.userId === user.uid) {
      // Use stored totals if available, otherwise calculate from history
      if (typeof data.totalAdded === "number") {
        totalAdded += data.totalAdded;
      } else {
        (data.history || []).forEach(h => {
          if (h.type === "add") totalAdded += h.amount || 0;
        });
      }
      
      if (typeof data.totalSubtracted === "number") {
        totalSubtracted += data.totalSubtracted;
      } else {
        (data.history || []).forEach(h => {
          if (h.type === "sub") totalSubtracted += h.amount || 0;
        });
      }
    }
  });

  // Add search users totals
  const { totalAllAdded, totalAllSub, totalAllDebt } = await getAddedSearchUsersTotals();
  totalAdded += totalAllAdded;
  totalSubtracted += totalAllSub;
  totalDebt = totalAdded - totalSubtracted;

  // Update user document with totals
  const userRef = doc(db, "users", user.uid);
  await updateDoc(userRef, {
    totalAdded,
    totalSubtracted,
    totalDebt,
    lastUpdated: Timestamp.now()
  });

  return { totalAdded, totalSubtracted, totalDebt };
}

// Function to check for pending permission requests
async function checkPendingPermissionRequests() {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  try {
    const requestsRef = collection(db, "permissionRequests");
    const q = query(requestsRef, where("targetUserId", "==", currentUser.uid));
    const querySnapshot = await getDocs(q);
    
    querySnapshot.forEach((doc) => {
      const request = doc.data();
      if (request.status === "pending") {
        showPermissionRequestNotification(request, doc.id);
      }
    });
  } catch (error) {
    console.error('Error checking pending requests:', error);
  }
}

// Function to show permission request notification
function showPermissionRequestNotification(request, requestId) {
  const notification = document.createElement('div');
  notification.className = 'fixed top-4 right-4 z-[90] p-4 rounded-lg shadow-lg max-w-sm bg-blue-500 text-white transition-all duration-300 transform translate-x-full';
  notification.innerHTML = `
    <div class="flex items-start gap-3">
      <div class="flex-1">
        <div class="font-bold mb-1">Ruxsat so'rovi</div>
        <div class="text-sm mb-3">${request.requestingUserName} sizga qarzdor qo'shish uchun ruxsat so'rayapti</div>
        <div class="flex gap-2">
          <button id="approveBtn" class="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm transition">Tasdiqlash</button>
          <button id="rejectBtn" class="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm transition">Rad etish</button>
        </div>
      </div>
      <button id="closeNotification" class="text-white hover:text-gray-200 text-xl">&times;</button>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // Animate in
  setTimeout(() => {
    notification.classList.remove('translate-x-full');
  }, 100);
  
  // Event listeners
  const closeBtn = notification.querySelector('#closeNotification');
  const approveBtn = notification.querySelector('#approveBtn');
  const rejectBtn = notification.querySelector('#rejectBtn');
  
  const closeNotification = () => {
    notification.classList.add('translate-x-full');
    setTimeout(() => notification.remove(), 300);
  };
  
  closeBtn.onclick = closeNotification;
  
  approveBtn.onclick = async () => {
    await updatePermissionRequest(requestId, 'approved');
    closeNotification();
    showNotification('Ruxsat berildi!', 'success');
    
    // Ruxsat berilgandan so'ng qarzdorni avtomatik qo'shish
    const userToAdd = allUsers.find(u => u.id === request.targetUserId);
    if (userToAdd) {
      // Qarzdorni qo'shish
      if (!addedSearchUsers.some(u => u.id === userToAdd.id)) {
        addedSearchUsers.push(userToAdd);
        renderAddedSearchUsers();
        saveAddedSearchUsers();
        showNotification(`${userToAdd.name} avtomatik qo'shildi!`, 'success');
      }
    }
  };
  
  rejectBtn.onclick = async () => {
    await updatePermissionRequest(requestId, 'rejected');
    closeNotification();
    showNotification('Ruxsat rad etildi', 'info');
  };
  
  // Auto remove after 30 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      closeNotification();
    }
  }, 30000);
}

// Function to update permission request status
async function updatePermissionRequest(requestId, status) {
  try {
    const requestRef = doc(db, "permissionRequests", requestId);
    await updateDoc(requestRef, { 
      status: status,
      respondedAt: new Date()
    });
    
    // If approved, notify the requesting user and auto-add the user
    if (status === 'approved') {
      const requestSnap = await getDoc(requestRef);
      const request = requestSnap.data();
      
      // Create a notification for the requesting user
      const notificationRef = await addDoc(collection(db, "notifications"), {
        userId: request.requestingUserId,
        type: 'permission_approved',
        message: `${request.targetUserName} sizning ruxsat so'rovingizni tasdiqladi va ${request.targetUserName} avtomatik qo'shildi`,
        timestamp: new Date(),
        read: false
      });
      
      // Auto-add the user to the current user's list
      const userToAdd = allUsers.find(u => u.id === request.targetUserId);
      if (userToAdd && !addedSearchUsers.some(u => u.id === userToAdd.id)) {
        addedSearchUsers.push(userToAdd);
        renderAddedSearchUsers();
        saveAddedSearchUsers();
        showNotification(`${userToAdd.name} ruxsat berilgandan so'ng avtomatik qo'shildi!`, 'success');
      }
    }
  } catch (error) {
    console.error('Error updating permission request:', error);
  }
}

// Function to check for notifications
async function checkNotifications() {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  try {
    const notificationsRef = collection(db, "notifications");
    const q = query(notificationsRef, where("userId", "==", currentUser.uid));
    const querySnapshot = await getDocs(q);
    
    querySnapshot.forEach((doc) => {
      const notification = doc.data();
      if (!notification.read) {
        showNotification(notification.message, 'success');
        
        // Mark as read
        updateDoc(doc.ref, { read: true });
      }
    });
  } catch (error) {
    console.error('Error checking notifications:', error);
  }
}

// Function to set up real-time listener for permission requests
function setupPermissionRequestListener() {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  const requestsRef = collection(db, "permissionRequests");
  const q = query(requestsRef, where("targetUserId", "==", currentUser.uid));
  
  onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        const request = change.doc.data();
        if (request.status === "pending") {
          showPermissionRequestNotification(request, change.doc.id);
        }
        
        // Update messages modal if it's open
        if (!messagesModal.classList.contains('hidden')) {
          loadPermissionRequests();
        }
        
        // Update message count badge
        updateMessageCountBadge();
      }
    });
  });
}

// Function to set up real-time listener for notifications
function setupNotificationListener() {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  const notificationsRef = collection(db, "notifications");
  const q = query(notificationsRef, where("userId", "==", currentUser.uid));
  
  onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        const notification = change.doc.data();
        if (!notification.read) {
          showNotification(notification.message, 'success');
          
          // Mark as read after showing
          setTimeout(() => {
            updateDoc(change.doc.ref, { read: true });
          }, 2000);
          
          // Update messages modal if it's open
          if (!messagesModal.classList.contains('hidden')) {
            loadNotifications();
          }
          
          // Update message count badge
          updateMessageCountBadge();
        }
      }
    });
  });
}

// Function to set up real-time listener for permission request updates
function setupPermissionUpdateListener() {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  const requestsRef = collection(db, "permissionRequests");
  const q = query(requestsRef, where("requestingUserId", "==", currentUser.uid));
  
  onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "modified") {
        const request = change.doc.data();
        if (request.status === "approved") {
          showNotification(`Ruxsat berildi! ${request.targetUserName} sizga qo'shildi.`, 'success');
        } else if (request.status === "rejected") {
          showNotification(`Ruxsat rad etildi.`, 'warning');
        }
      }
    });
  });
}

// Function to upgrade user to premium
async function upgradeToPremium() {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    showNotification('Avval tizimga kirishingiz kerak!', 'error');
    return;
  }
  
  try {
    const userRef = doc(db, "users", currentUser.uid);
    await updateDoc(userRef, {
      isPremium: true,
      premiumUpgradedAt: new Date(),
      premiumExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
    });
    
    showNotification('Tabriklaymiz! Siz premium a\'zo bo\'ldingiz!', 'success');
    
    // Reload user data to reflect premium status
    showSidebarUser();
  } catch (error) {
    console.error('Error upgrading to premium:', error);
    showNotification('Xatolik yuz berdi. Qaytadan urinib ko\'ring.', 'error');
  }
}

// Function to check if user's premium is still valid
async function checkPremiumStatus() {
  const currentUser = auth.currentUser;
  if (!currentUser) return false;
  
  try {
    const userRef = doc(db, "users", currentUser.uid);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      const userData = userSnap.data();
      if (userData.isPremium && userData.premiumExpiresAt) {
        const expiresAt = userData.premiumExpiresAt.toDate ? userData.premiumExpiresAt.toDate() : new Date(userData.premiumExpiresAt);
        if (expiresAt > new Date()) {
          return true;
        } else {
          // Premium expired, update status
          await updateDoc(userRef, { isPremium: false });
          return false;
        }
      }
    }
    return false;
  } catch (error) {
    console.error('Error checking premium status:', error);
    return false;
  }
}

// Messages modal functionality
const messagesBtn = document.getElementById('messagesBtn');
const messagesModal = document.getElementById('messagesModal');
const closeMessagesModal = document.getElementById('closeMessagesModal');
const permissionRequestsTab = document.getElementById('permissionRequestsTab');
const notificationsTab = document.getElementById('notificationsTab');
const permissionRequestsContent = document.getElementById('permissionRequestsContent');
const notificationsContent = document.getElementById('notificationsContent');
const emptyMessagesState = document.getElementById('emptyMessagesState');

// Open messages modal
messagesBtn.addEventListener('click', () => {
  messagesModal.classList.remove('hidden');
  loadPermissionRequests();
  loadNotifications();
});

// Close messages modal
closeMessagesModal.addEventListener('click', () => {
  messagesModal.classList.add('hidden');
});

// Tab switching
permissionRequestsTab.addEventListener('click', () => {
  permissionRequestsTab.classList.add('text-orange-600', 'border-b-2', 'border-orange-600');
  permissionRequestsTab.classList.remove('text-gray-500');
  notificationsTab.classList.remove('text-orange-600', 'border-b-2', 'border-orange-600');
  notificationsTab.classList.add('text-gray-500');
  
  permissionRequestsContent.classList.remove('hidden');
  notificationsContent.classList.add('hidden');
});

notificationsTab.addEventListener('click', () => {
  notificationsTab.classList.add('text-orange-600', 'border-b-2', 'border-orange-600');
  notificationsTab.classList.remove('text-gray-500');
  permissionRequestsTab.classList.remove('text-orange-600', 'border-b-2', 'border-orange-600');
  permissionRequestsTab.classList.add('text-gray-500');
  
  notificationsContent.classList.remove('hidden');
  permissionRequestsContent.classList.add('hidden');
});

// Load permission requests
async function loadPermissionRequests() {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  try {
    const requestsRef = collection(db, "permissionRequests");
    const q = query(requestsRef, where("targetUserId", "==", currentUser.uid));
    const querySnapshot = await getDocs(q);
    
    const requestsList = document.getElementById('permissionRequestsList');
    const requests = [];
    
    querySnapshot.forEach((doc) => {
      const request = { ...doc.data(), id: doc.id };
      requests.push(request);
    });
    
    // Sort by timestamp in JavaScript (newest first)
    requests.sort((a, b) => {
      const timeA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
      const timeB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
      return timeB - timeA;
    });
    
    if (requests.length === 0) {
      requestsList.innerHTML = `
        <div class="text-center py-8 text-gray-500">
          <svg class="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <p class="text-sm">Ruxsat so'rovlari yo'q</p>
        </div>
      `;
      return;
    }
    
    requestsList.innerHTML = requests.map(request => {
      const timestamp = request.timestamp?.toDate ? request.timestamp.toDate() : new Date(request.timestamp);
      const timeAgo = getTimeAgo(timestamp);
      const statusColor = request.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 
                         request.status === 'approved' ? 'bg-green-100 text-green-800' : 
                         'bg-red-100 text-red-800';
      const statusText = request.status === 'pending' ? 'Kutilmoqda' : 
                        request.status === 'approved' ? 'Tasdiqlangan' : 'Rad etilgan';
      
      return `
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-3 mb-2">
                <div class="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm">
                  ${request.requestingUserName?.slice(0,2).toUpperCase() || '??'}
                </div>
                <div>
                  <div class="font-semibold text-gray-900 dark:text-white">
                    ${request.requestingUserName || 'Noma\'lum foydalanuvchi'}
                  </div>
                  <div class="text-sm text-gray-500 dark:text-gray-400">
                    ${request.targetUserName} uchun ruxsat so'rayapti
                  </div>
                </div>
              </div>
              <div class="flex items-center justify-between">
                <div class="text-xs text-gray-400">${timeAgo}</div>
                <span class="px-2 py-1 text-xs font-medium rounded-full ${statusColor}">
                  ${statusText}
                </span>
              </div>
            </div>
            ${request.status === 'pending' ? `
              <div class="flex gap-2 ml-4">
                <button onclick="approveRequest('${request.id}')" class="px-3 py-1 bg-green-500 hover:bg-green-600 text-white text-xs rounded transition">
                  Tasdiqlash
                </button>
                <button onclick="rejectRequest('${request.id}')" class="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded transition">
                  Rad etish
                </button>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
    
  } catch (error) {
    console.error('Error loading permission requests:', error);
  }
}

// Load notifications
async function loadNotifications() {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  try {
    const notificationsRef = collection(db, "notifications");
    const q = query(notificationsRef, where("userId", "==", currentUser.uid));
    const querySnapshot = await getDocs(q);
    
    const notificationsList = document.getElementById('notificationsList');
    const notifications = [];
    
    querySnapshot.forEach((doc) => {
      const notification = { ...doc.data(), id: doc.id };
      notifications.push(notification);
    });
    
    // Sort by timestamp in JavaScript (newest first)
    notifications.sort((a, b) => {
      const timeA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
      const timeB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
      return timeB - timeA;
    });
    
    if (notifications.length === 0) {
      notificationsList.innerHTML = `
        <div class="text-center py-8 text-gray-500">
          <svg class="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-5 5v-5z"></path>
          </svg>
          <p class="text-sm">Bildirishnomalar yo'q</p>
        </div>
      `;
      return;
    }
    
    notificationsList.innerHTML = notifications.map(notification => {
      const timestamp = notification.timestamp?.toDate ? notification.timestamp.toDate() : new Date(notification.timestamp);
      const timeAgo = getTimeAgo(timestamp);
      
      return `
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
          <div class="flex items-start gap-3">
            <div class="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <div class="flex-1">
              <div class="text-sm text-gray-900 dark:text-white mb-1">
                ${notification.message}
              </div>
              <div class="text-xs text-gray-400">${timeAgo}</div>
            </div>
            <button onclick="markNotificationAsRead('${notification.id}')" class="text-gray-400 hover:text-gray-600">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
    
  } catch (error) {
    console.error('Error loading notifications:', error);
  }
}

// Helper function to get time ago
function getTimeAgo(date) {
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  
  if (diffInSeconds < 60) return 'Hozirgina';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} daqiqa oldin`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} soat oldin`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} kun oldin`;
  
  return date.toLocaleDateString('uz-UZ');
}

// Global functions for buttons
window.approveRequest = async function(requestId) {
  await updatePermissionRequest(requestId, 'approved');
  loadPermissionRequests(); // Reload the list
  updateMessageCountBadge(); // Update badge
  showNotification('Ruxsat berildi!', 'success');
};

window.rejectRequest = async function(requestId) {
  await updatePermissionRequest(requestId, 'rejected');
  loadPermissionRequests(); // Reload the list
  updateMessageCountBadge(); // Update badge
  showNotification('Ruxsat rad etildi', 'info');
};

window.markNotificationAsRead = async function(notificationId) {
  try {
    const notificationRef = doc(db, "notifications", notificationId);
    await updateDoc(notificationRef, { read: true });
    loadNotifications(); // Reload the list
    updateMessageCountBadge(); // Update badge
  } catch (error) {
    console.error('Error marking notification as read:', error);
  }
};

// Function to update message count badge
async function updateMessageCountBadge() {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  try {
    // Count pending permission requests
    const requestsRef = collection(db, "permissionRequests");
    const requestsQuery = query(requestsRef, where("targetUserId", "==", currentUser.uid));
    const requestsSnapshot = await getDocs(requestsQuery);
    const pendingRequestsCount = requestsSnapshot.docs.filter(doc => doc.data().status === "pending").length;
    
    // Count unread notifications
    const notificationsRef = collection(db, "notifications");
    const notificationsQuery = query(notificationsRef, where("userId", "==", currentUser.uid));
    const notificationsSnapshot = await getDocs(notificationsQuery);
    const unreadNotificationsCount = notificationsSnapshot.docs.filter(doc => doc.data().read === false).length;
    
    const totalCount = pendingRequestsCount + unreadNotificationsCount;
    
    // Update or create badge
    const messagesBtn = document.getElementById('messagesBtn');
    if (!messagesBtn) return; // Button doesn't exist yet
    
    let badge = messagesBtn.querySelector('.message-badge');
    if (totalCount > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'message-badge absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-6 w-6 flex items-center justify-center font-bold';
        messagesBtn.style.position = 'relative';
        messagesBtn.appendChild(badge);
      }
      badge.textContent = totalCount > 99 ? '99+' : totalCount;
    } else if (badge) {
      badge.remove();
    }
  } catch (error) {
    console.error('Error updating message count badge:', error);
  }
}


