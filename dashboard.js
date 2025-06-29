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

// Render statistics
function renderStats(debtors) {
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
    
    const card = document.createElement("div");
    card.className = "bg-white dark:bg-gray-700 rounded-lg shadow p-4 flex items-center justify-between gap-2 relative z-0"; // z-0 bo‘ldi
    card.innerHTML = `
      <div>
        <div class="font-bold text-lg ">${d.name}</div>
        <div class="text-xs text-gray-400 mb-1">Kod: <span class="font-mono">${d.code || ''}</span></div>
        <div class="text-sm text-gray-500 dark:text-gray-300">${d.product} (${d.count} x ${d.price} so‘m)</div>
        <div class="text-xs text-gray-400">${d.note || ""}</div>
        ${d.moveComment ? `<div class="text-xs text-purple-600 dark:text-purple-300 mt-1">Izoh: ${d.moveComment}</div>` : ""}
        <div class="mt-2 text-xs">
          <span class="font-semibold">Umumiy qo‘shilgan: </span> ${totalAdd} so‘m<br>
          <span class="font-semibold">Ayirilgan: </span>${totalSub} so‘m<br>
          <span class="font-semibold">Qolgan: </span>${totalAdd - totalSub} so‘m
        </div>
      </div>
      <div class="flex gap-2">
        <button class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded transition" data-id="${d.id}">Batafsil</button>
        <button class="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded transition" data-del="${d.id}">O‘chirish</button>
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
  div.className = "fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50";
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
  
  (debtor.history || []).forEach((h) => {
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
    <div class="flex flex-col md:flex-row gap-4 mb-4">
      <div class="flex-1">
        <div class="font-bold text-xl mb-2">${debtor.name}</div>
        <div class="text-gray-500 dark:text-gray-300 mb-2">${debtor.product} (${debtor.count} x ${debtor.price} so‘m)</div>
        <div class="text-xs text-gray-400 mb-2">${debtor.note || ""}</div>
        <div class="mb-2">Umumiy qarz: <span class="font-bold">${totalAdd - totalSub} so‘m</span></div>
        
        <form id="addDebtForm" class="flex flex-col gap-2 mb-2">
          <div class="grid grid-cols-1 gap-2">
            <input type="text" placeholder="Mahsulot nomi" class="p-2 border border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-900 dark:text-gray-100">
            <input type="number" minlength="" placeholder="Mahsulot soni" class="p-2 border border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-900 dark:text-gray-100">
            <input type="number" min="1" placeholder="Mahsulot narxi" class="p-2 border border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-900 dark:text-gray-100" required>
            <input type="text" placeholder="Izoh (ixtiyoriy)" class="p-2 border border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-900 dark:text-gray-100">
          </div>
          <button type="submit" class="bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded">Qo‘shish</button>
        </form>
        
        <form id="subDebtForm" class="flex flex-col gap-2 mb-2">
          <input type="number" min="1" placeholder="Qarz ayirish (so‘m)" 
            class="p-2 border border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-red-400 text-gray-900 dark:text-gray-100" required>
          <input type="text" placeholder="Izoh (ixtiyoriy)" 
            class="p-2 border border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-red-400 text-gray-900 dark:text-gray-100">
          <button type="submit" class="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded">Ayirish</button>
        </form>
      </div>
      
      <div class="flex-1">
        <div class="font-bold mb-2">Qo‘shilganlar</div>
        ${addHistory || '<div class="text-gray-400">Yo‘q</div>'}
        <div class="font-bold mb-2 mt-4">Ayirilganlar</div>
        ${subHistory || '<div class="text-gray-400">Yo‘q</div>'}
      </div>
    </div>
    
    <div class="mt-4 flex flex-col md:flex-row justify-between font-bold gap-2">
      <span>Jami qo‘shilgan: ${totalAdd} so‘m</span>
      <span>Jami ayirilgan: ${totalSub} so‘m</span>
      <span>Qarzdorlik: ${totalAdd - totalSub} so‘m</span>
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
      }),
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
      }),
    });
    
    const updated = (await getDocs(collection(db, "debtors"))).docs
      .find((docu) => docu.id === debtor.id)
      .data();
      
    openDebtorModal({ ...updated, id: debtor.id });
    loadDebtors();
  };
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
    div.className = 'fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-40';
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
searchByNameOrIdInput.addEventListener('input', function () {
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
  if (results.length === 0) {
    searchByCodeResult.innerHTML = '<div class="text-center text-gray-400 mt-4">Hech narsa topilmadi</div>';
  } else {
    searchByCodeResult.innerHTML = results
      .map(
        user => `
        <div class="flex items-center gap-3 bg-gray-100 dark:bg-gray-700 rounded p-3 mb-2 shadow">
          <div class="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-lg">
            ${user.name.slice(0,2).toUpperCase()}
          </div>
          <div class="flex-1">
            <div class="font-bold">${user.name} <span class="text-blue-400">#${user.id.slice(-2)}</span></div>
            <div class="text-xs text-gray-500">ID: ${user.id}</div>
          </div>
          <button class="add-search-user-btn bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded" data-id="${user.id}">Qo‘shish</button>
        </div>
      `
      )
      .join('');
    // Qo‘shish tugmalariga event biriktirish
    document.querySelectorAll('.add-search-user-btn').forEach(btn => {
      btn.onclick = function() {
        const userId = this.getAttribute('data-id');
        const user = allUsers.find(u => u.id === userId);
        if (user && !addedSearchUsers.some(u => u.id === user.id)) {
          addedSearchUsers.push(user);
          renderAddedSearchUsers();
        }
      };
    });
  }
});

// Dashboardda search orqali qo‘shilgan userlarni ko‘rsatish
function renderAddedSearchUsers() {
  // Dashboardda alohida cardlar chiqishi uchun
  let container = document.getElementById('addedSearchUsersList');
  if (!container) {
    container = document.createElement('div');
    container.id = 'addedSearchUsersList';
    container.className = 'w-full max-w-3xl space-y-4 px-4 mb-6';
    // Qarzdorlar ro‘yxatidan oldin joylashtiramiz
    const debtorsList = document.getElementById('debtorsList');
    debtorsList.parentNode.insertBefore(container, debtorsList);
  }
  container.innerHTML = addedSearchUsers.map((user, idx) => `
    <div class="flex items-center gap-3 bg-purple-100 dark:bg-purple-900 border-2 border-purple-400 rounded-lg p-4 shadow-lg">
      <div class="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-xl">
        ${user.name.slice(0,2).toUpperCase()}
      </div>
      <div class="flex-1">
        <div class="font-bold text-lg flex items-center gap-2">
          <span>${user.name}</span>
          <span class="text-blue-600">#${idx + 1}</span>
        </div>
        <div class="text-xs text-gray-500">ID: ${user.id}</div>
      </div>
      <button class="remove-search-user-btn bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded" data-id="${user.id}">O‘chirish</button>
    </div>
  `).join('');
  // O‘chirish tugmasi
  container.querySelectorAll('.remove-search-user-btn').forEach(btn => {
    btn.onclick = function() {
      const userId = this.getAttribute('data-id');
      addedSearchUsers = addedSearchUsers.filter(u => u.id !== userId);
      renderAddedSearchUsers();
    };
  });
}

