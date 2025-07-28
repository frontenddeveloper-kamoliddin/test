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

// Initialize Firebase with error handling
let app, auth, db;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (error) {
  console.error('Firebase initialization error:', error);
  showNotification('Firebase sozlamalarida xatolik. Iltimos, sahifani yangilang.', 'error');
}

// Global variables
let addedSearchUsers = [];
let allUsers = [];

// Global variable to track if debt has been written
let debtWritten = false;

// Cyrillic to Latin conversion mapping
const cyrillicToLatin = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
  'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
  'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'x', 'ц': 'ts',
  'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
  'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo', 'Ж': 'Zh',
  'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N', 'О': 'O',
  'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U', 'Ф': 'F', 'Х': 'X', 'Ц': 'Ts',
  'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Shch', 'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
};

// Convert Cyrillic to Latin
function convertCyrillicToLatin(text) {
  if (!text) return '';
  return text.split('').map(char => cyrillicToLatin[char] || char).join('');
}

// Enhanced search function that handles both Cyrillic and Latin
function enhancedSearch(text, searchTerm) {
  if (!text || !searchTerm) return false;
  
  const textLower = text.toLowerCase();
  const searchLower = searchTerm.toLowerCase();
  
  // Direct search
  if (textLower.includes(searchLower)) return true;
  
  // Convert search term to Latin and search
  const searchLatin = convertCyrillicToLatin(searchLower);
  if (searchLatin !== searchLower) {
    if (textLower.includes(searchLatin)) return true;
  }
  
  // Convert text to Latin and search
  const textLatin = convertCyrillicToLatin(textLower);
  if (textLatin !== textLower) {
    if (textLatin.includes(searchLower)) return true;
    if (searchLatin !== searchLower && textLatin.includes(searchLatin)) return true;
  }
  
  return false;
}

// Check network connectivity
function checkNetworkConnectivity() {
  return navigator.onLine;
}

// Show network error notification
function showNetworkError() {
  showNotification('Internet aloqasi yo\'q. Iltimos, internet aloqasini tekshiring.', 'error');
}

// Retry Firebase operation with exponential backoff
async function retryFirebaseOperation(operation, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      console.error(`Firebase operation attempt ${attempt} failed:`, error);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Wait before retrying (exponential backoff)
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Authentication state listener with error handling
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    try {
      showSidebarUser(user);
      loadUserTotals(); // Load totals from Firebase first
      loadDebtors();
      loadAddedSearchUsers();
      loadAllUsers();
      checkPendingPermissionRequests();
      checkNotifications();
      setupPermissionRequestListener();
      setupNotificationListener();
      setupPermissionUpdateListener();
      updateMessageCountBadge();
    } catch (error) {
      console.error('Authentication error:', error);
      if (!checkNetworkConnectivity()) {
        showNetworkError();
      }
    }
  }
}, (error) => {
  console.error('Auth state change error:', error);
  if (!checkNetworkConnectivity()) {
    showNetworkError();
  }
});

// Network status listeners
window.addEventListener('online', () => {
  showNotification('Internet aloqasi tiklandi!', 'success');
  // Reload data when connection is restored
  if (auth.currentUser) {
    loadDebtors();
    loadAllUsers();
  }
});

window.addEventListener('offline', () => {
  showNetworkError();
});

// Sidebar functionality
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");
const openSidebarBtn = document.getElementById("openSidebar");
const closeSidebarBtn = document.getElementById("closeSidebar");

if (openSidebarBtn) {
  openSidebarBtn.onclick = () => {
    if (sidebar) sidebar.classList.remove("-translate-x-full");
    if (sidebarOverlay) sidebarOverlay.classList.remove("hidden");
  };
}

if (closeSidebarBtn) {
  closeSidebarBtn.onclick = closeSidebar;
}

if (sidebarOverlay) {
  sidebarOverlay.onclick = closeSidebar;
}

function closeSidebar() {
  sidebar.classList.add("-translate-x-full");
  sidebarOverlay.classList.add("hidden");
}

// Logout functionality
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.onclick = () => {
    signOut(auth).then(() => (window.location.href = "index.html"));
  };
}

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
const debtorForm = document.getElementById("debtorForm");
if (debtorForm) {
  debtorForm.onsubmit = async (e) => {
  e.preventDefault();
  const name = document.getElementById("debtorName").value.trim();
  const product = document.getElementById("debtorProduct").value.trim();
  let count = parseInt(document.getElementById("debtorCount").value);
  let price = parseInt(document.getElementById("debtorPrice").value);
  const note = document.getElementById("debtorNote").value.trim();
  const deadline = document.getElementById("debtorDeadline").value;
  
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
    showNotification("Bu ismli qarzdor allaqachon mavjud!", "error");
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
    deadline,
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
  
  document.getElementById("debtorForm").reset();
  await updateUserTotals();
  loadDebtors();
  showNotification("Yangi qarzdor muvaffaqiyatli qo'shildi!", "success");
  document.getElementById("addDebtorModal").classList.add("hidden");
  };
}

// Load and render debtors
async function loadDebtors() {
  const user = auth.currentUser;
  if (!user) return;
  
        const searchInput = document.getElementById("searchInput");
  const filterSelect = document.getElementById("filterSelect");
  
  const search = searchInput ? searchInput.value.toLowerCase() : "";
  const filterType = filterSelect ? filterSelect.value : "";
    const snapshot = await retryFirebaseOperation(() => getDocs(collection(db, "debtors")));
  
  let debtors = [];
  snapshot.forEach((doc) => {
    let data = doc.data();
    data.id = doc.id;
    if (data.userId === user.uid) {
      debtors.push(data);
    }
  });
  
  // Add search users
  addedSearchUsers.forEach(user => {
    const debtor = snapshot.docs
      .map(doc => ({ ...doc.data(), id: doc.id }))
      .find(d => d.userId === user.id || d.code === user.id || d.id === user.id);
    if (debtor && !debtors.some(d => d.id === debtor.id)) {
      debtors.push(debtor);
    }
  });
  
  if (search) {
    debtors = debtors.filter((d) => enhancedSearch(d.name, search));
  }
  
  // Apply filters
  debtors = filterDebtors(debtors, filterType);
  
  renderDebtors(debtors);
  
  // Update totals after loading debtors
  await updateUserTotals();
  

}

// Filter debtors
function filterDebtors(debtors, filterType) {
  switch(filterType) {
    case 'debt_high':
      return debtors.filter(d => {
        const total = calculateTotalDebt(d);
        return total > 0;
      }).sort((a, b) => calculateTotalDebt(b) - calculateTotalDebt(a));
    case 'debt_low':
      return debtors.filter(d => {
        const total = calculateTotalDebt(d);
        return total > 0;
      }).sort((a, b) => calculateTotalDebt(a) - calculateTotalDebt(b));
    case 'recent':
      // Most recent first
      return [...debtors].sort((a, b) => {
        const aDate = a.history && a.history.length ? a.history[a.history.length-1].date : new Date(0);
        const bDate = b.history && b.history.length ? b.history[b.history.length-1].date : new Date(0);
        return bDate - aDate;
      });
    default:
      return debtors;
  }
}

// Calculate total debt for a debtor
function calculateTotalDebt(debtor) {
  let totalAdd = 0, totalSub = 0;
  
  (debtor.history || []).forEach((h) => {
    if (h.type === "add") totalAdd += h.amount || 0;
    if (h.type === "sub") totalSub += h.amount || 0;
  });
  
  return totalAdd - totalSub;
}

// Render debtors list
function renderDebtors(debtors) {
  const loader = document.getElementById('loader');
  const noDebtorsDiv = document.getElementById('noDebtorsFound');
  const debtorsList = document.getElementById('debtorsList');
  const debtorsCountText = document.getElementById('debtorsCountText');
  
  if (loader) loader.classList.add('hidden');
  if (debtorsCountText) debtorsCountText.textContent = `${debtors.length} ta qarzdor`;
  
  if (debtors.length === 0) {
    if (noDebtorsDiv) noDebtorsDiv.classList.remove('hidden');
    if (debtorsList) debtorsList.innerHTML = '';
    return;
  } else {
    if (noDebtorsDiv) noDebtorsDiv.classList.add('hidden');
  }
  
  if (debtorsList) {
    debtorsList.innerHTML = '';
  
    debtors.forEach((debtor, index) => {
      const totalDebt = calculateTotalDebt(debtor);
      const totalAdded = (debtor.history || []).reduce((sum, h) => h.type === 'add' ? sum + (h.amount || 0) : sum, 0);
      const totalSubtracted = (debtor.history || []).reduce((sum, h) => h.type === 'sub' ? sum + (h.amount || 0) : sum, 0);
      
      // Calculate progress percentage
      const progress = totalAdded > 0 ? (totalSubtracted / totalAdded) * 100 : 0;
      
      // Check if deadline is approaching
      const deadlineWarning = debtor.deadline ? checkDeadline(debtor.deadline) : null;
      
      const card = document.createElement('div');
      card.className = 'card animate-card p-5';
      card.style.animationDelay = `${index * 0.05}s`;
      
      card.innerHTML = `
        <div class="flex items-start gap-4 mb-4">
          <div class="debtor-avatar bg-gradient-to-r from-indigo-500 to-purple-600">
            ${debtor.name.charAt(0)}
          </div>
          <div class="flex-1">
            <div class="flex items-center justify-between">
              <h3 class="font-bold text-lg text-slate-800 dark:text-white">${debtor.name}</h3>
              <span class="text-sm font-mono bg-indigo-100 dark:bg-slate-700 text-indigo-800 dark:text-indigo-300 px-2 py-1 rounded">
                #${debtor.code || debtor.id.slice(0, 6)}
              </span>
            </div>
            ${debtor.product ? `<div class="text-sm text-slate-600 dark:text-slate-400 mt-1">${debtor.product}</div>` : ''}
            
            ${deadlineWarning ? `
              <div class="mt-2 text-xs px-3 py-1 rounded-full ${deadlineWarning.color} inline-flex items-center gap-1">
                <i class="fas ${deadlineWarning.icon}"></i>
                ${deadlineWarning.text}
              </div>
            ` : ''}
          </div>
        </div>
        
        <div class="mb-4">
          <div class="flex justify-between items-center mb-1">
            <span class="text-sm text-slate-600 dark:text-slate-400">To'langan</span>
            <span class="text-sm font-medium">${Math.round(progress)}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill bg-gradient-to-r from-green-500 to-emerald-500" style="width: ${Math.min(progress, 100)}%"></div>
          </div>
        </div>
        
        <div class="grid grid-cols-3 gap-3 mb-4">
          <div class="text-center">
            <div class="text-sm text-slate-600 dark:text-slate-400">Qo'shilgan</div>
            <div class="font-bold text-indigo-600 dark:text-indigo-400">${formatMoney(totalAdded)}</div>
          </div>
          <div class="text-center">
            <div class="text-sm text-slate-600 dark:text-slate-400">Ayirilgan</div>
            <div class="font-bold text-emerald-600 dark:text-emerald-400">${formatMoney(totalSubtracted)}</div>
          </div>
          <div class="text-center">
            <div class="text-sm text-slate-600 dark:text-slate-400">Qolgan</div>
            <div class="font-bold ${totalDebt > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}">${formatMoney(totalDebt)}</div>
          </div>
        </div>
        
        <div class="flex gap-2">
          <button class="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm transition batafsil-btn" data-id="${debtor.id}">
            <i class="fas fa-info-circle mr-1"></i> Batafsil
          </button>
          <button class="bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-white px-3 py-2 rounded-lg text-sm transition" data-pay="${debtor.id}">
            <i class="fas fa-money-bill-wave mr-1"></i> To'lash
          </button>
          <button class="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg text-sm transition delete-btn" data-delete="${debtor.id}">
            <i class="fas fa-trash mr-1"></i> O'chirish
          </button>
        </div>
      `;
      
      debtorsList.appendChild(card);
    });
    
    // Add event listeners to buttons
    document.querySelectorAll('.batafsil-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const debtorId = btn.getAttribute('data-id');
        const snapshot = await getDocs(collection(db, "debtors"));
        const debtor = snapshot.docs
          .map(doc => ({ ...doc.data(), id: doc.id }))
          .find(d => d.id === debtorId);
        
        if (debtor) {
          openDebtorModal(debtor);
        }
      });
    });

    // Add event listeners to payment buttons
    document.querySelectorAll('[data-pay]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const debtorId = btn.getAttribute('data-pay');
        const snapshot = await getDocs(collection(db, "debtors"));
        const debtor = snapshot.docs
          .map(doc => ({ ...doc.data(), id: doc.id }))
          .find(d => d.id === debtorId);
        
        if (debtor) {
          showPaymentModal(debtor);
        }
      });
    });

    // Add event listeners to delete buttons
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const debtorId = btn.getAttribute('data-delete');
        const snapshot = await getDocs(collection(db, "debtors"));
        const debtor = snapshot.docs
          .map(doc => ({ ...doc.data(), id: doc.id }))
          .find(d => d.id === debtorId);
        
        if (debtor) {
          showDeleteConfirmationModal(debtor);
        }
      });
    });
  }
}

// Format money
function formatMoney(amount) {
  return new Intl.NumberFormat('uz-UZ').format(amount);
}

// Check deadline status
function checkDeadline(deadline) {
  const today = new Date();
  const deadlineDate = new Date(deadline);
  const diffTime = deadlineDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) {
    return {
      text: `Muddati ${Math.abs(diffDays)} kun o'tib ketgan`,
      icon: 'fa-exclamation-triangle',
      color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
    };
  } else if (diffDays <= 3) {
    return {
      text: `${diffDays} kun qoldi`,
      icon: 'fa-clock',
      color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
    };
  } else if (diffDays <= 7) {
    return {
      text: `${diffDays} kun qoldi`,
      icon: 'fa-calendar-check',
      color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
    };
  }
  return null;
}

// Show payment modal
function showPaymentModal(debtor) {
  const modal = document.createElement('div');
  modal.id = 'paymentModal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50';
  
  let totalAdd = 0, totalSub = 0;
  (debtor.history || []).forEach((h) => {
    if (h.type === "add") totalAdd += h.amount || 0;
    if (h.type === "sub") totalSub += h.amount || 0;
  });
  
  const totalDebt = totalAdd - totalSub;
  
  if (totalDebt <= 0) {
    showNotification('Bu qarzdorda qarz yo\'q!', 'info');
    return;
  }
  
  modal.innerHTML = `
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6 relative">
      <button id="closePaymentModal" class="absolute top-4 right-4 text-2xl text-gray-400 hover:text-red-500 transition">&times;</button>
      
      <div class="text-center mb-6">
        <div class="w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <i class="fas fa-money-bill-wave text-white text-2xl"></i>
        </div>
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Qarzdorlikni tozalash</h2>
        <p class="text-gray-600 dark:text-gray-400">${debtor.name} uchun barcha qarzlar to'liq tozalanadi</p>
      </div>
      
      <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6">
        <div class="flex justify-between items-center mb-2">
          <span class="text-gray-600 dark:text-gray-400">To'lanadigan qarz:</span>
          <span class="font-bold text-xl text-red-600 dark:text-red-400">${formatMoney(totalDebt)}</span>
        </div>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          Jami qo'shilgan: ${formatMoney(totalAdd)} | Jami to'langan: ${formatMoney(totalSub)}
        </div>
      </div>
      
      <div class="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4 mb-6">
        <div class="flex items-center gap-2">
          <i class="fas fa-exclamation-triangle text-yellow-600 dark:text-yellow-400"></i>
          <span class="text-yellow-800 dark:text-yellow-200 font-medium">Diqqat!</span>
        </div>
        <p class="text-yellow-700 dark:text-yellow-300 text-sm mt-1">
          Bu amal barcha qo'shilgan va ayirilgan qarzlar tarixini to'liq o'chiradi va qarzdorlik to'liq tozalaydi. Bu amalni qaytara olmaysiz.
        </p>
      </div>
      
      <form id="paymentForm" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Izoh (ixtiyoriy)
          </label>
          <input 
            type="text" 
            id="paymentNote" 
            placeholder="To'lov haqida izoh..."
            class="w-full p-3 bg-gray-100 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-900 dark:text-gray-100 transition"
          >
        </div>
        
        <div class="flex gap-3 pt-4">
          <button 
            type="button" 
            id="cancelPayment" 
            class="flex-1 bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-200 px-4 py-3 rounded-lg font-semibold transition"
          >
            Bekor qilish
          </button>
          <button 
            type="submit" 
            class="flex-1 bg-green-500 hover:bg-green-600 text-white px-4 py-3 rounded-lg font-semibold transition"
          >
            <i class="fas fa-trash mr-2"></i>Barcha qarzni tozalash
          </button>
        </div>
      </form>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close modal
  modal.querySelector('#closePaymentModal').onclick = () => modal.remove();
  modal.querySelector('#cancelPayment').onclick = () => modal.remove();
  
  // Close modal when clicking outside
  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      modal.remove();
    }
  });
  
  // Payment form handler
  modal.querySelector('#paymentForm').onsubmit = async (e) => {
    e.preventDefault();
    
    const note = document.getElementById('paymentNote').value.trim();
    
    try {
      const ref = doc(db, "debtors", debtor.id);
      await updateDoc(ref, {
        history: [],
        totalAdded: 0,
        totalSubtracted: 0
      });
      
      showNotification(`${debtor.name} uchun barcha qarzlar to'liq tozalandi!`, 'success');
      modal.remove();
      loadDebtors();
      await updateUserTotals();
    } catch (error) {
      console.error('Error clearing debt:', error);
      showNotification('Xatolik yuz berdi!', 'error');
    }
  };
}

// Show notification
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm transition-all duration-300 transform translate-x-full ${type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-indigo-500'} text-white`;
  
  notification.innerHTML = `
    <div class="flex items-center gap-3">
      <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'} text-xl"></i>
      <div class="flex-1">${message}</div>
      <button class="text-white hover:text-gray-200">
        <i class="fas fa-times"></i>
      </button>
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

// Show delete confirmation modal
function showDeleteConfirmationModal(debtor) {
  const modal = document.createElement('div');
  modal.id = 'deleteConfirmationModal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50';
  
  modal.innerHTML = `
    <div class="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
          <i class="fas fa-exclamation-triangle text-red-600 dark:text-red-400 text-xl"></i>
        </div>
        <div>
          <h3 class="text-lg font-semibold text-slate-900 dark:text-white">Qarzdorni o'chirish</h3>
          <p class="text-sm text-slate-600 dark:text-slate-400">Bu amalni qaytarib bo'lmaydi</p>
        </div>
      </div>
      
      <div class="mb-6">
        <p class="text-slate-700 dark:text-slate-300">
          <strong>${debtor.name}</strong> qarzdorni o'chirishni xohlaysizmi?
        </p>
        <p class="text-sm text-slate-600 dark:text-slate-400 mt-2">
          Barcha qarz ma'lumotlari va tarix o'chiriladi.
        </p>
      </div>
      
      <div class="flex gap-3">
        <button id="cancelDelete" class="flex-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-white px-4 py-2 rounded-lg transition">
          Bekor qilish
        </button>
        <button id="confirmDelete" class="flex-1 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition">
          <i class="fas fa-trash mr-1"></i> O'chirish
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close modal
  modal.querySelector('#cancelDelete').onclick = () => modal.remove();
  
  // Close modal when clicking outside
  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      modal.remove();
    }
  });
  
  // Confirm delete
  modal.querySelector('#confirmDelete').onclick = async () => {
    try {
      const ref = doc(db, "debtors", debtor.id);
      await deleteDoc(ref);
      
      showNotification(`${debtor.name} qarzdor muvaffaqiyatli o'chirildi!`, 'success');
      modal.remove();
      loadDebtors();
      await updateUserTotals();
    } catch (error) {
      console.error('Error deleting debtor:', error);
      showNotification('Qarzdorni o\'chirishda xatolik yuz berdi!', 'error');
    }
  };
}

// Sidebar user info
async function showSidebarUser(user) {
  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);
  
  let sidebarNumber, sidebarUserCode, userName;
  if (userSnap.exists()) {
    const data = userSnap.data();
    sidebarNumber = data.sidebarNumber || Math.floor(Math.random() * 999) + 1;
    sidebarUserCode = data.sidebarUserCode || generateUserCode();
    userName = data.name || user.displayName || "Foydalanuvchi";
    
    // Update if missing
    if (!data.sidebarNumber || !data.sidebarUserCode) {
      await updateDoc(userRef, {
        sidebarNumber,
        sidebarUserCode,
        name: userName
      });
    }
  } else {
    sidebarNumber = Math.floor(Math.random() * 999) + 1;
    sidebarUserCode = generateUserCode();
    userName = user.displayName || "Foydalanuvchi";
    await setDoc(userRef, {
      name: userName,
      sidebarNumber,
      sidebarUserCode,
      addedSearchUsers: []
    });
  }
  
  // Check premium status
  const isPremium = await checkPremiumStatus();
  
  // Update sidebar UI
  const sidebarUserDiv = document.getElementById("sidebarUserInfo");
  if (sidebarUserDiv) {
    sidebarUserDiv.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="relative">
          <div class="w-12 h-12 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
            ${userName.charAt(0)}
          </div>
          ${isPremium ? `
            <div class="absolute -top-1 -right-1 w-6 h-6 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
              <i class="fas fa-crown text-xs text-white"></i>
            </div>
          ` : ''}
        </div>
        <div>
          <div class="font-bold text-lg flex items-center gap-2">
            <span class="truncate max-w-[120px]">${userName}</span>
            <span class="text-blue-600 dark:text-blue-300 font-extrabold text-base">#${sidebarNumber}</span>
            ${isPremium ? `
              <span class="px-2 py-1 bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-xs rounded-full font-bold">
                PREMIUM
              </span>
            ` : ''}
          </div>
          <div class="text-xs font-mono text-gray-500 dark:text-gray-400 mt-1">ID: <span class="tracking-widest">${sidebarUserCode}</span></div>
        </div>
      </div>
    `;
  }
}

// Generate user code
function generateUserCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Check premium status
async function checkPremiumStatus() {
  const user = auth.currentUser;
  if (!user) return false;
  
  try {
    const userRef = doc(db, "users", user.uid);
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

// Initialize the application
function initApp() {
  // Set up event listeners
  document.getElementById('searchInput')?.addEventListener('input', loadDebtors);
  document.getElementById('filterSelect')?.addEventListener('change', loadDebtors);
  document.getElementById('addDebtorBtn')?.addEventListener('click', () => {
    document.getElementById('addDebtorModal').classList.remove('hidden');
  });
  document.getElementById('viewDebtsBtn')?.addEventListener('click', () => {
    document.getElementById('viewDebtsModal').classList.remove('hidden');
    setupViewDebtsModal();
  });
  document.getElementById('myDebtsBtn')?.addEventListener('click', () => {
    document.getElementById('myDebtsModal').classList.remove('hidden');
    loadMyDebts();
  });
  document.getElementById('messagesBtn')?.addEventListener('click', () => {
    document.getElementById('messagesModal').classList.remove('hidden');
    loadMessages();
  });
  document.getElementById('premiumBtn')?.addEventListener('click', showPremiumModal);
  document.getElementById('notificationBtn')?.addEventListener('click', toggleNotifications);
  
  // Setup search functionality
  setupSearchFunctionality();
  
  // Setup modal close buttons
  setupModalCloseButtons();
  

}

// Setup search functionality
function setupSearchFunctionality() {
  const searchByNameOrIdInput = document.getElementById('searchByNameOrIdInput');
  const searchByCodeResult = document.getElementById('searchByCodeResult');
  
  if (searchByNameOrIdInput) {
    searchByNameOrIdInput.addEventListener('input', async function() {
      const query = this.value.trim().toLowerCase();
      if (!query) {
        if (searchByCodeResult) searchByCodeResult.innerHTML = '';
        return;
      }
      
      const results = allUsers.filter(user =>
        enhancedSearch(user.name, query) ||
        enhancedSearch(user.id, query)
      );

      if (searchByCodeResult) {
        if (results.length === 0) {
          searchByCodeResult.innerHTML = '<div class="text-center text-gray-400 mt-4">Hech narsa topilmadi</div>';
        } else {
          searchByCodeResult.innerHTML = results.map(user => {
            const isAlreadyAdded = addedSearchUsers.some(u => u.id === user.id);
            return `
              <div class="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-lg p-4 mb-3 shadow border border-gray-200 dark:border-gray-700">
                <div class="w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                  ${user.name.slice(0,2).toUpperCase()}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-bold text-lg flex items-center gap-2 text-gray-900 dark:text-white mb-1">
                    <span class="truncate">${user.name}</span>
                    <span class="text-blue-600 dark:text-blue-300 font-mono text-base">#${user.number || user.id.slice(-3)}</span>
                  </div>
                  <div class="text-xs text-gray-500 dark:text-gray-400 font-mono">ID: ${user.id}</div>
                </div>
                ${isAlreadyAdded ? 
                  '<span class="px-3 py-1 bg-green-100 text-green-800 text-xs rounded-full">#' + addedSearchUsers.length + '</span>' :
                  `<button class="add-search-user-btn bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded shadow text-sm transition" data-id="${user.id}" data-name="${user.name}">Qo'shish</button>`
                }
              </div>
            `;
          }).join('');
          
          // Add event listeners to buttons
          searchByCodeResult.querySelectorAll('.add-search-user-btn').forEach(btn => {
            btn.onclick = async function() {
              const userId = this.getAttribute('data-id');
              const userName = this.getAttribute('data-name');
              await addUserWithPermission({ id: userId, name: userName });
            };
          });
        }
      }
    });
  }
}

// Add user with permission system
async function addUserWithPermission(userToAdd) {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    showNotification('Avval tizimga kirishingiz kerak!', 'error');
    return;
  }
  
  // Check if already added
  if (addedSearchUsers.some(u => u.id === userToAdd.id)) {
    showNotification('Bu foydalanuvchi allaqachon qo\'shilgan!', 'warning');
    return;
  }
  
  // Check if user is premium
  const isPremium = await checkPremiumStatus();
  if (isPremium) {
    // Direct add for premium users
    addedSearchUsers.push(userToAdd);
    renderAddedSearchUsers();
    saveAddedSearchUsers();
    showNotification(`${userToAdd.name} muvaffaqiyatli qo'shildi!`, 'success');
    return;
  }
  
  // Check if user owns the target user
  if (userToAdd.userId === currentUser.uid || userToAdd.id === currentUser.uid) {
    addedSearchUsers.push(userToAdd);
    renderAddedSearchUsers();
    saveAddedSearchUsers();
    showNotification(`${userToAdd.name} muvaffaqiyatli qo'shildi!`, 'success');
    return;
  }
  
  // Request permission
  const result = await showPermissionRequestModal(userToAdd, currentUser);
  if (result.granted) {
    addedSearchUsers.push(userToAdd);
    renderAddedSearchUsers();
    saveAddedSearchUsers();
    showNotification(`${userToAdd.name} muvaffaqiyatli qo'shildi!`, 'success');
  }
}

// Show permission request modal
function showPermissionRequestModal(userToAdd, requestingUser) {
  return new Promise((resolve) => {
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
      showPremiumModal();
      resolve({ granted: false, reason: 'premium_required' });
    };
  });
}

// Send permission request
async function sendPermissionRequest(userToAdd, requestingUser) {
  try {
    // Get requesting user info
    const requestingUserRef = doc(db, "users", requestingUser.uid);
    const requestingUserSnap = await getDoc(requestingUserRef);
    const requestingUserName = requestingUserSnap.exists() ? 
      requestingUserSnap.data().name : requestingUser.displayName || requestingUser.email;

    // Create a permission request document
    const permissionRequest = {
      requestingUserId: requestingUser.uid,
      requestingUserName: requestingUserName,
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
    
    return { granted: false, reason: 'pending_approval', requestId: requestRef.id };
  } catch (error) {
    console.error('Error sending permission request:', error);
    showNotification('Xatolik yuz berdi. Qaytadan urinib ko\'ring.', 'error');
    return { granted: false, reason: 'error' };
  }
}

// Setup modal close buttons
function setupModalCloseButtons() {
  // Close buttons for all modals
  const closeButtons = [
    { id: 'closeViewDebtsModal', modal: 'viewDebtsModal' },
    { id: 'closeMyDebtsModal', modal: 'myDebtsModal' },
    { id: 'closeMessagesModal', modal: 'messagesModal' },
    { id: 'closeAddDebtorModal', modal: 'addDebtorModal' }
  ];
  
  closeButtons.forEach(({ id, modal }) => {
    const btn = document.getElementById(id);
    const modalEl = document.getElementById(modal);
    if (btn && modalEl) {
      btn.onclick = () => modalEl.classList.add('hidden');
    }
  });
}

// Setup view debts modal
function setupViewDebtsModal() {
  const searchAllDebtsInput = document.getElementById('searchAllDebtsInput');
  const searchAllDebtsResult = document.getElementById('searchAllDebtsResult');
  
  if (searchAllDebtsInput) {
    searchAllDebtsInput.addEventListener('input', async function() {
      const query = this.value.trim().toLowerCase();
      if (!query) {
        if (searchAllDebtsResult) searchAllDebtsResult.innerHTML = '';
        return;
      }

      // Get all debtors
      const debtorsSnap = await getDocs(collection(db, "debtors"));
      const allDebtors = debtorsSnap.docs.map(doc => ({ ...doc.data(), id: doc.id }));

      // Filter debtors (user's own + added search users)
      const user = auth.currentUser;
      const myUserId = user ? user.uid : null;
      const addedUserIds = (addedSearchUsers || []).map(user => user.id);

      const filteredDebtors = allDebtors.filter(debtor =>
        (myUserId && debtor.userId === myUserId) ||
        addedUserIds.includes(debtor.userId) ||
        addedUserIds.includes(debtor.code) ||
        addedUserIds.includes(debtor.id)
      );

      // Search results
      const searchResults = [];

      filteredDebtors.forEach(debtor => {
        if (debtor.name && enhancedSearch(debtor.name, query)) {
          searchResults.push({
            type: 'debtor_name',
            debtor: debtor,
            match: debtor.name,
            matchType: 'Qarzdor nomi'
          });
        }
        if (debtor.product && enhancedSearch(debtor.product, query)) {
          searchResults.push({
            type: 'product',
            debtor: debtor,
            match: debtor.product,
            matchType: 'Mahsulot'
          });
        }
        if (debtor.note && enhancedSearch(debtor.note, query)) {
          searchResults.push({
            type: 'note',
            debtor: debtor,
            match: debtor.note,
            matchType: 'Izoh'
          });
        }
      });

      if (searchAllDebtsResult) {
        if (searchResults.length === 0) {
          searchAllDebtsResult.innerHTML = '<div class="text-center text-gray-400 mt-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">Hech qanday qarz topilmadi</div>';
        } else {
          searchAllDebtsResult.innerHTML = searchResults.map(result => {
            const debtor = result.debtor;
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
                    <div class="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      Jami: <span class="font-semibold text-green-600">${totalAdded} so'm</span> | 
                      Ayirilgan: <span class="font-semibold text-red-600">${totalSub} so'm</span> | 
                      Qolgan: <span class="font-semibold text-blue-600">${remaining} so'm</span>
                    </div>
                    <button class="view-debtor-details-btn bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm transition" data-id="${debtor.id}">
                      Batafsil ko'rish
                    </button>
                  </div>
                </div>
              </div>
            `;
          }).join('');
          
          // Add event listeners to buttons
          searchAllDebtsResult.querySelectorAll('.view-debtor-details-btn').forEach(btn => {
            btn.onclick = function() {
              const debtorId = this.getAttribute('data-id');
              const debtor = allDebtors.find(d => d.id === debtorId);
              if (debtor) {
                openDebtorModal(debtor);
                document.getElementById('viewDebtsModal').classList.add('hidden');
              }
            };
          });
        }
      }
    });
  }
}

// Load my debts
async function loadMyDebts() {
  const user = auth.currentUser;
  if (!user) return;

  try {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    const sidebarUserCode = userSnap.exists() ? (userSnap.data().sidebarUserCode || user.uid) : user.uid;

    const debtorsSnap = await getDocs(collection(db, "debtors"));
    const myDebts = [];
    
    debtorsSnap.forEach(docu => {
      const d = docu.data();
      if ((d.code && d.code === sidebarUserCode) || (d.userId && d.userId === sidebarUserCode)) {
        myDebts.push({ ...d, id: docu.id });
      }
    });

    const usersSnap = await getDocs(collection(db, "users"));
    const usersMap = {};
    usersSnap.forEach(u => {
      usersMap[u.id] = u.data().name || "Noma'lum";
      if (u.data().sidebarUserCode) {
        usersMap[u.data().sidebarUserCode] = u.data().name || "Noma'lum";
      }
    });

    const myDebtsList = document.getElementById('myDebtsList');
    if (myDebtsList) {
      if (myDebts.length === 0) {
        myDebtsList.innerHTML = '<div class="text-center text-gray-500">Sizga yozilgan qarzlar topilmadi.</div>';
      } else {
        myDebtsList.innerHTML = myDebts.map(d => {
          const historyHtml = (d.history || []).map(h => {
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
        }).join("");
      }
    }
  } catch (error) {
    console.error('Error loading my debts:', error);
  }
}

// Load messages
async function loadMessages() {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  try {
    // Load permission requests
    const requestsRef = collection(db, "permissionRequests");
    const requestsQuery = query(requestsRef, where("targetUserId", "==", currentUser.uid));
    const requestsSnapshot = await getDocs(requestsQuery);
    
    const requestsList = document.getElementById('permissionRequestsList');
    if (requestsList) {
      const requests = [];
      requestsSnapshot.forEach((doc) => {
        const request = { ...doc.data(), id: doc.id };
        requests.push(request);
      });
      
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
      } else {
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
      }
    }
    
    // Load notifications
    const notificationsRef = collection(db, "notifications");
    const notificationsQuery = query(notificationsRef, where("userId", "==", currentUser.uid));
    const notificationsSnapshot = await getDocs(notificationsQuery);
    
    const notificationsList = document.getElementById('notificationsList');
    if (notificationsList) {
      const notifications = [];
      notificationsSnapshot.forEach((doc) => {
        const notification = { ...doc.data(), id: doc.id };
        notifications.push(notification);
      });
      
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
      } else {
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
      }
    }
    
  } catch (error) {
    console.error('Error loading messages:', error);
  }
}

// Toggle notifications dropdown
function toggleNotifications() {
  const dropdown = document.getElementById('notificationDropdown');
  if (dropdown) {
    dropdown.classList.toggle('hidden');
    
    if (!dropdown.classList.contains('hidden')) {
      loadNotifications();
    }
  }
}

// Load notifications
async function loadNotifications() {
  const dropdown = document.getElementById('notificationDropdown');
  if (!dropdown) return;
  
  dropdown.innerHTML = `
    <div class="p-4 text-center">
      <div class="loader mx-auto"></div>
    </div>
  `;
  
  // Simulate loading
  setTimeout(async () => {
    // In real app, we would fetch notifications from Firebase
    const notifications = [
      { id: 1, title: "Yangi qarzdor", message: "Sizga yangi qarzdor qo'shildi", time: "5 min oldin", read: false },
      { id: 2, title: "To'lov eslatma", message: "Ali Valiyevning qarz muddati tugayapti", time: "1 soat oldin", read: true },
      { id: 3, title: "Premium taklif", message: "Premium a'zolik 50% chegirmada", time: "1 kun oldin", read: true }
    ];
    
    dropdown.innerHTML = '';
    
    if (notifications.length === 0) {
      dropdown.innerHTML = `
        <div class="p-4 text-center text-slate-500">
          <i class="fas fa-bell-slash text-3xl mb-3"></i>
          <p>Bildirishnomalar yo'q</p>
        </div>
      `;
      return;
    }
    
    notifications.forEach(notif => {
      const notifEl = document.createElement('div');
      notifEl.className = `p-4 border-b border-slate-200 dark:border-slate-700 ${notif.read ? '' : 'bg-blue-50 dark:bg-slate-700'}`;
      notifEl.innerHTML = `
        <div class="flex gap-3">
          <div class="w-10 h-10 rounded-full bg-indigo-100 dark:bg-slate-700 flex items-center justify-center text-indigo-500 dark:text-indigo-300">
            <i class="fas fa-bell"></i>
          </div>
          <div class="flex-1">
            <h4 class="font-bold text-slate-800 dark:text-white">${notif.title}</h4>
            <p class="text-sm text-slate-600 dark:text-slate-400">${notif.message}</p>
            <div class="text-xs text-slate-500 dark:text-slate-400 mt-1">${notif.time}</div>
          </div>
          ${!notif.read ? `<span class="w-2 h-2 rounded-full bg-indigo-500"></span>` : ''}
        </div>
      `;
      dropdown.appendChild(notifEl);
    });
    
    dropdown.innerHTML += `
      <div class="p-3 text-center">
        <button class="text-indigo-600 dark:text-indigo-400 text-sm font-medium">
          Barchasini ko'rish
        </button>
      </div>
    `;
  }, 1000);
}

// Show premium modal
function showPremiumModal() {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50';
  modal.innerHTML = `
    <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg p-8 relative">
      <button class="absolute top-4 right-4 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white">
        <i class="fas fa-times"></i>
      </button>
      
      <div class="text-center mb-6">
        <div class="w-20 h-20 rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 flex items-center justify-center text-white text-3xl mx-auto mb-4">
          <i class="fas fa-crown"></i>
        </div>
        <h3 class="text-2xl font-bold text-slate-800 dark:text-white mb-2">Premium A'zolik</h3>
        <p class="text-slate-600 dark:text-slate-400">Cheksiz imkoniyatlar faqat premium a'zolar uchun</p>
      </div>
      
      <div class="space-y-4 mb-6">
        <div class="flex items-center gap-3 p-4 rounded-lg bg-slate-100 dark:bg-slate-700">
          <div class="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white">
            <i class="fas fa-check"></i>
          </div>
          <span class="text-slate-800 dark:text-white">Cheksiz qarzdor qo'shish</span>
        </div>
        
        <div class="flex items-center gap-3 p-4 rounded-lg bg-slate-100 dark:bg-slate-700">
          <div class="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white">
            <i class="fas fa-check"></i>
          </div>
          <span class="text-slate-800 dark:text-white">Ruxsatsiz qo'shish</span>
        </div>
        
        <div class="flex items-center gap-3 p-4 rounded-lg bg-slate-100 dark:bg-slate-700">
          <div class="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white">
            <i class="fas fa-check"></i>
          </div>
          <span class="text-slate-800 dark:text-white">Barcha funksiyalar</span>
        </div>
      </div>
      
      <div class="text-center">
        <div class="text-4xl font-bold text-slate-800 dark:text-white mb-2">99,000 so'm</div>
        <div class="text-sm text-slate-500 dark:text-slate-400 mb-6">oyiga</div>
        
        <button class="w-full bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-white px-6 py-4 rounded-lg font-bold text-lg transition">
          Premium olish
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close modal
  modal.querySelector('button').addEventListener('click', () => {
    modal.remove();
  });
}

// Open debtor modal
function openDebtorModal(debtor) {
  const modal = document.createElement('div');
  modal.id = 'debtorDetailModal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50';
  
  let totalAdd = 0, totalSub = 0;
  (debtor.history || []).forEach((h) => {
    if (h.type === "add") totalAdd += h.amount || 0;
    if (h.type === "sub") totalSub += h.amount || 0;
  });
  
  const totalDebt = totalAdd - totalSub;
  
  modal.innerHTML = `
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 relative">
      <button id="closeDebtorModal" class="absolute top-4 right-4 text-2xl text-gray-400 hover:text-red-500 transition">&times;</button>
      
      <div class="flex flex-col md:flex-row gap-6 mb-6">
        <div class="flex-1 bg-gray-50 dark:bg-gray-700 rounded-xl p-5 shadow border border-gray-200 dark:border-gray-600">
          <div class="font-bold text-2xl mb-2 flex items-center gap-2 text-gray-900 dark:text-white">
            ${debtor.name}
            <span class="text-blue-600 dark:text-blue-300 text-base font-mono">#${debtor.code || debtor.id}</span>
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-300 mb-2">${debtor.product ? `${debtor.product} (${debtor.count || 1} x ${debtor.price || 0} so'm)` : ""}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400 mb-4">${debtor.note || ""}</div>
          <div class="mb-4 text-lg">
            Umumiy qarz: <span class="font-bold text-blue-700 dark:text-blue-300">${totalDebt} so'm</span>
          </div>
          
          <form id="addDebtForm" class="flex flex-col gap-3 mb-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input type="text" placeholder="Mahsulot nomi" class="p-3 bg-gray-100 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-900 dark:text-gray-100 transition" autocomplete="off">
              <input type="number" placeholder="Mahsulot soni" class="p-3 bg-gray-100 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-900 dark:text-gray-100 transition" autocomplete="off">
              <input type="number" min="1" placeholder="Mahsulot narxi" class="p-3 bg-gray-100 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-900 dark:text-gray-100 transition" required autocomplete="off">
              <input type="text" placeholder="Izoh (ixtiyoriy)" class="p-3 bg-gray-100 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-900 dark:text-gray-100 transition" autocomplete="off">
            </div>
            <button type="submit" class="bg-green-500 hover:bg-green-600 text-white px-4 py-3 rounded-lg font-semibold shadow transition">
              <i class="fas fa-plus mr-2"></i>Qo'shish
            </button>
          </form>
          
          <form id="subDebtForm" class="flex flex-col gap-3 mb-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input type="number" min="1" placeholder="Qarz ayirish (so'm)" class="p-3 bg-gray-100 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded focus:outline-none focus:ring-2 focus:ring-red-400 text-gray-900 dark:text-gray-100 transition" required autocomplete="off">
              <input type="text" placeholder="Izoh (ixtiyoriy)" class="p-3 bg-gray-100 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded focus:outline-none focus:ring-2 focus:ring-red-400 text-gray-900 dark:text-gray-100 transition" autocomplete="off">
            </div>
            <button type="submit" class="bg-red-500 hover:bg-red-600 text-white px-4 py-3 rounded-lg font-semibold shadow transition">
              <i class="fas fa-minus mr-2"></i>Ayirish
            </button>
          </form>
          
          ${totalDebt > 0 ? `
            <button id="finishDebtBtn" class="bg-purple-600 hover:bg-purple-700 text-white px-4 py-3 rounded-lg w-full font-semibold shadow transition">
              <i class="fas fa-check-circle mr-2"></i>Qarz tugatish
            </button>
          ` : ""}
        </div>
        
        <div class="flex-1">
          <div class="font-bold mb-4 text-gray-900 dark:text-white">Barcha harakatlar</div>
          <div class="space-y-3 max-h-96 overflow-y-auto">
            ${(debtor.history || []).length > 0 ? 
              (debtor.history || []).map(h => {
                const date = h.date?.toDate ? h.date.toDate() : new Date();
                const time = date.toLocaleString("uz-UZ");
                return `
                  <div class="p-3 rounded-lg ${h.type === "add" ? "bg-green-100 dark:bg-green-900" : "bg-red-100 dark:bg-red-900"}">
                    <div class="font-semibold ${h.type === "add" ? "text-green-800 dark:text-green-200" : "text-red-800 dark:text-red-200"}">
                      ${h.type === "add" ? "+" : "-"}${h.amount} so'm
                    </div>
                    ${h.product ? `<div class="text-sm text-gray-600 dark:text-gray-300">${h.product} (${h.count || 1} x ${h.price || h.amount} so'm)</div>` : ""}
                    ${h.note ? `<div class="text-sm text-gray-500 dark:text-gray-400 mt-1">${h.note}</div>` : ""}
                    <div class="text-xs text-gray-400 mt-2">${time}</div>
                  </div>
                `;
              }).join("") : 
              '<div class="text-gray-400 text-center py-8">Tarix yo\'q</div>'
            }
          </div>
        </div>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          <div class="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">Qolgan qarz</div>
          <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">${totalDebt}</div>
          <div class="text-blue-600 dark:text-blue-400 font-semibold">so'm</div>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close modal
  modal.querySelector('#closeDebtorModal').onclick = () => modal.remove();
  
  // Close modal when clicking outside
  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      modal.remove();
    }
  });
  
  // Add debt form handler
  modal.querySelector('#addDebtForm').onsubmit = async (e) => {
    e.preventDefault();
    
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

    try {
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
        totalAdded: (debtor.totalAdded || 0) + amount
      });
      
      showNotification('Qarz muvaffaqiyatli qo\'shildi!', 'success');
      modal.remove();
      loadDebtors();
      await updateUserTotals();
    } catch (error) {
      console.error('Error adding debt:', error);
      showNotification('Xatolik yuz berdi!', 'error');
    }
  };

  // Subtract debt form handler
  modal.querySelector('#subDebtForm').onsubmit = async (e) => {
    e.preventDefault();
    
    const val = parseInt(e.target[0].value);
    const note = e.target[1].value.trim();
    
    if (!val) return;
    
    try {
      const ref = doc(db, "debtors", debtor.id);
      await updateDoc(ref, {
        history: arrayUnion({
          type: "sub",
          amount: val,
          note,
          date: Timestamp.now(),
          authorId: auth.currentUser.uid
        }),
        totalSubtracted: (debtor.totalSubtracted || 0) + val
      });
      
      showNotification('Qarz muvaffaqiyatli ayirildi!', 'success');
      modal.remove();
      loadDebtors();
      await updateUserTotals();
    } catch (error) {
      console.error('Error subtracting debt:', error);
      showNotification('Xatolik yuz berdi!', 'error');
    }
  };

  // Finish debt button handler
  if (totalDebt > 0) {
    const finishBtn = modal.querySelector('#finishDebtBtn');
    if (finishBtn) {
      finishBtn.onclick = async () => {
        if (confirm('Qarz tugatilsinmi?')) {
          try {
            const ref = doc(db, "debtors", debtor.id);
            await updateDoc(ref, {
              history: [],
              totalAdded: 0,
              totalSubtracted: 0
            });
            
            showNotification('Qarz muvaffaqiyatli tugatildi!', 'success');
            modal.remove();
            loadDebtors();
            await updateUserTotals();
          } catch (error) {
            console.error('Error finishing debt:', error);
            showNotification('Xatolik yuz berdi!', 'error');
          }
        }
      };
    }
  }
}

// Load user totals from Firebase
async function loadUserTotals() {
  const user = auth.currentUser;
  if (!user) return;

  if (!checkNetworkConnectivity()) {
    showNetworkError();
    return;
  }

  try {
    // First try to get from user document
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      const userData = userSnap.data();
      if (userData.totalAdded !== undefined && userData.totalSubtracted !== undefined && userData.totalDebt !== undefined) {
        // Update UI with stored totals
        updateTotalsUI(userData.totalAdded, userData.totalSubtracted, userData.totalDebt, userData.debtorsCount || 0);
        return;
      }
    }
    
    // If no stored totals, calculate from debtors
    await updateUserTotals();
  } catch (error) {
    console.error('Error loading user totals:', error);
    if (error.code === 'unavailable' || error.code === 'permission-denied') {
      showNetworkError();
    }
  }
}

// Update totals UI
function updateTotalsUI(totalAdded, totalSubtracted, totalDebt, debtorsCount = 0) {
  const totalAddedEl = document.getElementById('totalAdded');
  const totalSubtractedEl = document.getElementById('totalSubtracted');
  const totalDebtEl = document.getElementById('totalDebt');
  const debtorsCountEl = document.getElementById('debtorsCount');
  
  if (totalAddedEl) totalAddedEl.textContent = `${formatMoney(totalAdded)} so'm`;
  if (totalSubtractedEl) totalSubtractedEl.textContent = `${formatMoney(totalSubtracted)} so'm`;
  if (totalDebtEl) totalDebtEl.textContent = `${formatMoney(totalDebt)} so'm`;
  if (debtorsCountEl) debtorsCountEl.textContent = `${debtorsCount} kishi`;
  
  // Save to localStorage for bosh-sahifa.html
  localStorage.setItem("totals", JSON.stringify({ totalAdded, totalSubtracted, totalDebt, debtorsCount }));
}

// Update user totals
async function updateUserTotals() {
  const user = auth.currentUser;
  if (!user) return;

  if (!checkNetworkConnectivity()) {
    showNetworkError();
    return;
  }

  try {
    // Get all debtors for this user
    const snapshot = await retryFirebaseOperation(() => getDocs(collection(db, "debtors")));
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
    for (let idx = 0; idx < addedSearchUsers.length; idx++) {
      const searchUser = addedSearchUsers[idx];
      let searchUserTotalAdded = 0, searchUserTotalSub = 0;
      const debtorsSnap = await retryFirebaseOperation(() => getDocs(collection(db, "debtors")));
      const debtor = debtorsSnap.docs
        .map(doc => ({ ...doc.data(), id: doc.id }))
        .find(d => d.userId === searchUser.id || d.code === searchUser.id || d.id === searchUser.id);

      if (debtor) {
        if (typeof debtor.totalAdded === "number") {
          searchUserTotalAdded = debtor.totalAdded;
        } else {
          (debtor.history || []).forEach(h => {
            if (h.type === "add") searchUserTotalAdded += h.amount || 0;
          });
        }
        if (typeof debtor.totalSubtracted === "number") {
          searchUserTotalSub = debtor.totalSubtracted;
        } else {
          (debtor.history || []).forEach(h => {
            if (h.type === "sub") searchUserTotalSub += h.amount || 0;
          });
        }
      }
      totalAdded += searchUserTotalAdded;
      totalSubtracted += searchUserTotalSub;
    }

    totalDebt = totalAdded - totalSubtracted;

    // Count debtors
    const debtorsCount = snapshot.docs.filter(doc => {
      const data = doc.data();
      return data.userId === user.uid;
    }).length;

    // Update user document with totals
    const userRef = doc(db, "users", user.uid);
    await retryFirebaseOperation(() => updateDoc(userRef, {
      totalAdded,
      totalSubtracted,
      totalDebt,
      debtorsCount,
      lastUpdated: Timestamp.now()
    }));

    // Update UI
    updateTotalsUI(totalAdded, totalSubtracted, totalDebt, debtorsCount);
    
    return { totalAdded, totalSubtracted, totalDebt, debtorsCount };
  } catch (error) {
    console.error('Error updating user totals:', error);
    if (error.code === 'unavailable' || error.code === 'permission-denied') {
      showNetworkError();
    }
  }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', initApp);

// Chart.js functions for dashboard analytics


// Load all users from Firebase
async function loadAllUsers() {
  try {
    const usersSnap = await retryFirebaseOperation(() => getDocs(collection(db, "users")));
    allUsers = usersSnap.docs.map(doc => {
      const data = doc.data();
      return {
        id: data.sidebarUserCode || doc.id,
        name: data.name || "Noma'lum",
        number: data.sidebarNumber || "",
        userId: doc.id
      };
    });
    console.log('Loaded users:', allUsers.length);
  } catch (error) {
    console.error('Error loading users:', error);
  }
}

// Check for pending permission requests
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

// Check for notifications
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
        showNotification(notification.message, 'info');
        
        // Mark as read
        updateDoc(doc.ref, { read: true });
      }
    });
  } catch (error) {
    console.error('Error checking notifications:', error);
  }
}

// Set up real-time listener for permission requests
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
        updateMessageCountBadge();
      }
    });
  });
}

// Set up real-time listener for notifications
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
          showNotification(notification.message, 'info');
          
          // Mark as read after showing
          setTimeout(() => {
            updateDoc(change.doc.ref, { read: true });
          }, 2000);
          
          updateMessageCountBadge();
        }
      }
    });
  });
}

// Set up real-time listener for permission request updates
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

// Update message count badge
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
    if (!messagesBtn) return;
    
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

// Load added search users from Firebase
async function loadAddedSearchUsers() {
  const user = auth.currentUser;
  if (!user) return;
  
  try {
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);
    if (snap.exists() && Array.isArray(snap.data().addedSearchUsers)) {
      addedSearchUsers = snap.data().addedSearchUsers;
      renderAddedSearchUsers();
    }
  } catch (error) {
    console.error('Error loading added search users:', error);
  }
}

// Save added search users to Firebase
async function saveAddedSearchUsers() {
  const user = auth.currentUser;
  if (!user) return;
  
  try {
    const userRef = doc(db, "users", user.uid);
    await updateDoc(userRef, { addedSearchUsers });
  } catch (error) {
    console.error('Error saving added search users:', error);
  }
}

// Render added search users
async function renderAddedSearchUsers() {
  if (addedSearchUsers.length === 0) return;
  
  let container = document.getElementById('addedSearchUsersList');
  if (!container) {
    container = document.createElement('div');
    container.id = 'addedSearchUsersList';
    container.className = 'w-full max-w-3xl space-y-4 px-4 mb-6';
    const debtorsList = document.getElementById('debtorsList');
    if (debtorsList && debtorsList.parentNode) {
      debtorsList.parentNode.insertBefore(container, debtorsList);
    }
  }

  container.innerHTML = '';
  
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

    container.innerHTML += `
      <div class="flex flex-col sm:flex-row items-center gap-4 rounded-2xl p-5 shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/80 backdrop-blur-xl">
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

  // Add event listeners
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
      const debtorsSnap = await getDocs(collection(db, "debtors"));
      const debtor = debtorsSnap.docs
        .map(doc => ({ ...doc.data(), id: doc.id }))
        .find(d => d.userId === userId || d.code === userId || d.id === userId);

      if (debtor) {
        openDebtorModal(debtor);
      } else {
        // Find the user in addedSearchUsers to get their details
        const user = addedSearchUsers.find(u => u.id === userId);
        if (user) {
          // Create a new debtor record for this user
          try {
            const newDebtor = {
              name: user.name || user.displayName || 'Noma\'lum',
              userId: user.id,
              code: user.code || generateUserCode(),
              debts: [],
              createdAt: new Date(),
              updatedAt: new Date()
            };
            
            const docRef = await addDoc(collection(db, "debtors"), newDebtor);
            newDebtor.id = docRef.id;
            
            showNotification(`${user.name || user.displayName} uchun yangi qarzdor yozuv yaratildi!`, 'success');
            openDebtorModal(newDebtor);
            await updateUserTotals();
          } catch (error) {
            console.error('Error creating new debtor:', error);
            showNotification('Yangi qarzdor yaratishda xatolik yuz berdi!', 'error');
          }
        } else {
          showNotification('Foydalanuvchi ma\'lumotlari topilmadi!', 'error');
        }
      }
    };
  });
}

// Show permission request notification
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

// Update permission request status
async function updatePermissionRequest(requestId, status) {
  try {
    const requestRef = doc(db, "permissionRequests", requestId);
    await updateDoc(requestRef, { 
      status: status,
      respondedAt: new Date()
    });
    
    // If approved, notify the requesting user
    if (status === 'approved') {
      const requestSnap = await getDoc(requestRef);
      const request = requestSnap.data();
      
      // Create a notification for the requesting user
      await addDoc(collection(db, "notifications"), {
        userId: request.requestingUserId,
        type: 'permission_approved',
        message: `${request.targetUserName} sizning ruxsat so'rovingizni tasdiqladi`,
        timestamp: new Date(),
        read: false
      });
    }
  } catch (error) {
    console.error('Error updating permission request:', error);
  }
}

// Global functions for buttons (window object)
window.approveRequest = async function(requestId) {
  await updatePermissionRequest(requestId, 'approved');
  loadMessages(); // Reload the list
  updateMessageCountBadge(); // Update badge
  showNotification('Ruxsat berildi!', 'success');
};

window.rejectRequest = async function(requestId) {
  await updatePermissionRequest(requestId, 'rejected');
  loadMessages(); // Reload the list
  updateMessageCountBadge(); // Update badge
  showNotification('Ruxsat rad etildi', 'info');
};

window.markNotificationAsRead = async function(notificationId) {
  try {
    const notificationRef = doc(db, "notifications", notificationId);
    await updateDoc(notificationRef, { read: true });
    loadMessages(); // Reload the list
    updateMessageCountBadge(); // Update badge
  } catch (error) {
    console.error('Error marking notification as read:', error);
  }
};

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


