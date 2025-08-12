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
let userProducts = []; // Add this line to store user products

// Global variable to track if debt has been written
let debtWritten = false;

// Username validation state
let usernameValidationState = {
  isValid: false,
  isAvailable: false,
  isChecking: false
};

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

// Username validation functions
function validateUsername(username) {
  if (!username) return { isValid: false, message: 'Username kiritilishi kerak' };
  
  if (username.length < 4) {
    return { isValid: false, message: 'Username kamida 4 ta belgi bo\'lishi kerak' };
  }
  
  if (username.length > 20) {
    return { isValid: false, message: 'Username 20 ta belgidan oshmasligi kerak' };
  }
  
  // Check if username contains only allowed characters
  const usernameRegex = /^[a-zA-Z0-9_]+$/;
  if (!usernameRegex.test(username)) {
    return { isValid: false, message: 'Faqat harflar, sonlar va chiziqcha (_) ishlatilishi mumkin' };
  }
  
  return { isValid: true, message: 'Username to\'g\'ri' };
}

async function checkUsernameAvailability(username, currentUserId = null) {
  try {
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("username", "==", username.toLowerCase()));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return true; // Username is available
    }
    
    // If current user is editing their own username, allow them to keep it
    if (currentUserId) {
      const userDoc = querySnapshot.docs.find(doc => doc.id === currentUserId);
      if (userDoc) {
        return true; // User can keep their own username
      }
    }
    
    return false; // Username is taken by someone else
  } catch (error) {
    console.error('Error checking username availability:', error);
    return false;
  }
}

function updateUsernameValidationUI(username, validationResult, isAvailable = null) {
  const statusDiv = document.getElementById('usernameStatus');
  const validationDiv = document.getElementById('usernameValidation');
  const saveBtn = document.getElementById('saveUsernameBtn');
  
  if (!statusDiv || !validationDiv || !saveBtn) return;
  
  // Clear previous status
  statusDiv.innerHTML = '';
  
  if (usernameValidationState.isChecking) {
    statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin text-blue-500"></i>';
    validationDiv.innerHTML = '<span class="text-blue-500">Tekshirilmoqda...</span>';
    saveBtn.disabled = true;
    return;
  }
  
  if (!validationResult.isValid) {
    statusDiv.innerHTML = '<i class="fas fa-times text-red-500"></i>';
    validationDiv.innerHTML = `<span class="text-red-500">${validationResult.message}</span>`;
    saveBtn.disabled = true;
    usernameValidationState.isValid = false;
    return;
  }
  
  if (isAvailable === null) {
    // Still checking availability
    statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin text-blue-500"></i>';
    validationDiv.innerHTML = '<span class="text-blue-500">Mavjudligi tekshirilmoqda...</span>';
    saveBtn.disabled = true;
    return;
  }
  
  if (!isAvailable) {
    statusDiv.innerHTML = '<i class="fas fa-times text-red-500"></i>';
    validationDiv.innerHTML = '<span class="text-red-500">Bu username allaqachon ishlatilgan</span>';
    saveBtn.disabled = true;
    usernameValidationState.isAvailable = false;
    return;
  }
  
  // Username is valid and available
  statusDiv.innerHTML = '<i class="fas fa-check text-green-500"></i>';
  validationDiv.innerHTML = '<span class="text-green-500">Username mavjud va to\'g\'ri</span>';
  saveBtn.disabled = false;
  usernameValidationState.isValid = true;
  usernameValidationState.isAvailable = true;
}

async function setupUsernameValidation() {
  const usernameInput = document.getElementById('usernameInput');
  const saveBtn = document.getElementById('saveUsernameBtn');
  const modal = document.getElementById('usernameSetupModal');
  
  if (!usernameInput || !saveBtn || !modal) return;
  
  // Close modal when clicking outside
  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      modal.style.display = 'none';
      // Clear the input
      usernameInput.value = '';
      updateUsernameValidationUI('', { isValid: false, message: '' });
    }
  });
  
  let debounceTimer;
  
  usernameInput.addEventListener('input', async function() {
    const username = this.value.trim();
    
    // Clear previous timer
    clearTimeout(debounceTimer);
    
    if (!username) {
      updateUsernameValidationUI('', { isValid: false, message: '' });
      usernameValidationState = { isValid: false, isAvailable: false, isChecking: false };
      return;
    }
    
    // Validate username format
    const validationResult = validateUsername(username);
    updateUsernameValidationUI(username, validationResult);
    
    if (!validationResult.isValid) {
      usernameValidationState = { isValid: false, isAvailable: false, isChecking: false };
      return;
    }
    
    // Debounce availability check
    debounceTimer = setTimeout(async () => {
      usernameValidationState.isChecking = true;
      updateUsernameValidationUI(username, validationResult);
      
      const currentUser = auth.currentUser;
      const currentUserId = currentUser ? currentUser.uid : null;
      const isAvailable = await checkUsernameAvailability(username.toLowerCase(), currentUserId);
      usernameValidationState.isChecking = false;
      
      updateUsernameValidationUI(username, validationResult, isAvailable);
    }, 500);
  });
  
  // Save username button handler
  saveBtn.addEventListener('click', async function() {
    if (!usernameValidationState.isValid || !usernameValidationState.isAvailable) {
      showNotification('Iltimos, to\'g\'ri username kiriting', 'error');
      return;
    }
    
    const username = usernameInput.value.trim();
    const currentUser = auth.currentUser;
    
    if (!currentUser) {
      showNotification('Avval tizimga kirishingiz kerak!', 'error');
      return;
    }
    
    try {
      // Save username to user's profile
      const userRef = doc(db, "users", currentUser.uid);
      await setDoc(userRef, {
        username: username.toLowerCase(),
        displayName: username,
        email: currentUser.email,
        createdAt: new Date(),
        updatedAt: new Date()
      }, { merge: true });
      
      showNotification('Username muvaffaqiyatli saqlandi!', 'success');
      
      // Hide the modal
      const modal = document.getElementById('usernameSetupModal');
      if (modal) {
        modal.style.display = 'none';
      }
      
      // Reload user data
      showSidebarUser(currentUser);
      
    } catch (error) {
      console.error('Error saving username:', error);
      showNotification('Username saqlashda xatolik yuz berdi', 'error');
    }
  });
}

async function checkUserHasUsername(user) {
  try {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      const userData = userSnap.data();
      return userData.username && userData.username.length > 0;
    }
    
    return false;
  } catch (error) {
    console.error('Error checking user username:', error);
    return false;
  }
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
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    try {
      // Check if user has username
      const hasUsername = await checkUserHasUsername(user);
      
      if (!hasUsername) {
        // Show username setup modal
        const modal = document.getElementById('usernameSetupModal');
        if (modal) {
          modal.style.display = 'flex';
          setupUsernameValidation();
        }
        return; // Don't load other data until username is set
      }
      
      // Hide username modal if it's visible
      const modal = document.getElementById('usernameSetupModal');
      if (modal) {
        modal.style.display = 'none';
      }
      
      showSidebarUser(user);
      loadUserTotals(); // Load totals from Firebase first
      loadDebtors();
      loadAddedSearchUsers();
      loadUserProducts(); // Load user products
      loadAllUsers();
      checkNotifications();
      setupNotificationListener();
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
  const productSelect = document.getElementById("debtorProduct").value.trim();
  const productCustom = document.getElementById("debtorProductCustom").value.trim();
  const product = productSelect || productCustom;
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
      authorId: user.uid,
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
  if (!user) {
    return;
  }
  
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
  if (typeof addedSearchUsers !== 'undefined' && Array.isArray(addedSearchUsers)) {
    addedSearchUsers.forEach(user => {
      const debtor = snapshot.docs
        .map(doc => ({ ...doc.data(), id: doc.id }))
        .find(d => d.userId === user.id || d.code === user.id || d.id === user.id);
      if (debtor && !debtors.some(d => d.id === debtor.id)) {
        debtors.push(debtor);
      }
    });
  }
  
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
  const profilesContainer = document.getElementById('addedSearchUsersList');
  
  switch(filterType) {
    case 'debt_high':
      if (profilesContainer) profilesContainer.classList.add('hidden');
      return debtors.filter(d => {
        const total = calculateTotalDebt(d);
        return total > 0;
      }).sort((a, b) => calculateTotalDebt(b) - calculateTotalDebt(a));
    case 'debt_low':
      if (profilesContainer) profilesContainer.classList.add('hidden');
      return debtors.filter(d => {
        const total = calculateTotalDebt(d);
        return total > 0;
      }).sort((a, b) => calculateTotalDebt(a) - calculateTotalDebt(b));
    case 'recent':
      if (profilesContainer) profilesContainer.classList.add('hidden');
      // Most recent first
      return [...debtors].sort((a, b) => {
        const aDate = a.history && a.history.length ? a.history[a.history.length-1].date : new Date(0);
        const bDate = b.history && b.history.length ? b.history[b.history.length-1].date : new Date(0);
        return bDate - aDate;
      });
    case 'show_profiles':
      // Show profile cards
      if (profilesContainer) {
        profilesContainer.classList.remove('hidden');
      }
      // Render added search users to ensure they are displayed
      renderAddedSearchUsers();
      return debtors;
    default:
      // Hide profile cards for other options
      if (profilesContainer) {
        profilesContainer.classList.add('hidden');
      }
      return debtors;
  }
}

// Calculate total debt for a debtor
function calculateTotalDebt(debtor) {
  const currentUserId = auth.currentUser.uid;
  // Filter history to only include transactions created by current user
  const userHistory = (debtor.history || []).filter(h => h.authorId === currentUserId);
  
  let totalAdd = 0, totalSub = 0;
  
  userHistory.forEach((h) => {
    // Only count non-deleted transactions
    if (!h.deleted) {
      if (h.type === "add") totalAdd += h.amount || 0;
      if (h.type === "sub") totalSub += h.amount || 0;
    }
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
      const currentUserId = auth.currentUser.uid;
      // Filter history to only show transactions created by current user
      const userHistory = (debtor.history || []).filter(h => h.authorId === currentUserId || !h.authorId);
      
      const totalAdded = userHistory.reduce((sum, h) => !h.deleted && h.type === 'add' ? sum + (h.amount || 0) : sum, 0);
      const totalSubtracted = userHistory.reduce((sum, h) => !h.deleted && h.type === 'sub' ? sum + (h.amount || 0) : sum, 0);
      const totalDebt = totalAdded - totalSubtracted;
      
      // Calculate progress percentage
      const progress = totalAdded > 0 ? (totalSubtracted / totalAdded) * 100 : 0;
      
      // Check if deadline is approaching
      const deadlineWarning = debtor.deadline ? checkDeadline(debtor.deadline) : null;
      
      // Check if this debtor is profile added
      const isProfileAdded = typeof addedSearchUsers !== 'undefined' && Array.isArray(addedSearchUsers) && 
        addedSearchUsers.some(user => user.id === debtor.userId || user.id === debtor.code || user.id === debtor.id);
      
      const card = document.createElement('div');
      card.className = 'card animate-card p-5 relative';
      card.style.animationDelay = `${index * 0.05}s`;
      
      // Add category badge
      const categoryBadge = isProfileAdded ? 
        '<div class="absolute top-3 right-3 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1"><i class="fas fa-user-friends"></i> Profile</div>' :
        '<div class="absolute top-3 right-3 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1"><i class="fas fa-user-plus"></i> Qo\'lda</div>';
      
      card.innerHTML = `
        ${categoryBadge}
        <div class="flex items-start gap-4 mb-4">
          <div class="debtor-avatar bg-gradient-to-r from-indigo-500 to-purple-600">
            ${debtor.name.charAt(0)}
          </div>
          <div class="flex-1">
            <div class="flex items-center justify-between">
              <h3 class="font-bold text-lg text-slate-800 dark:text-white">${debtor.name}</h3>
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
  }
  
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
  
  // Hide main dashboard elements when modal opens
  const elementsToHide = [
    document.getElementById('debtorsList'),
    document.querySelector('.w-full.bg-white.dark\\:bg-slate-800.card.p-6.mb-6'), // Search and filters
    document.querySelector('header'),
    document.getElementById('greenPlusBtn'),
    document.getElementById('scrollToTopBtn')
  ];
  
  elementsToHide.forEach(element => {
    if (element) {
      element.style.display = 'none';
    }
  });
  
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
  
  // Function to show hidden elements
  const showHiddenElements = () => {
    const elementsToShow = [
      document.getElementById('debtorsList'),
      document.querySelector('.w-full.bg-white.dark\\:bg-slate-800.card.p-6.mb-6'), // Search and filters
      document.querySelector('header'),
      document.getElementById('greenPlusBtn'),
      document.getElementById('scrollToTopBtn')
    ];
    
    elementsToShow.forEach(element => {
      if (element) {
        element.style.display = '';
      }
    });
  };
  
  // Close modal
  modal.querySelector('#closePaymentModal').onclick = () => {
    modal.remove();
    showHiddenElements();
  };
  modal.querySelector('#cancelPayment').onclick = () => {
    modal.remove();
    showHiddenElements();
  };
  
  // Close modal when clicking outside
  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      modal.remove();
      showHiddenElements();
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
      showHiddenElements();
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
  
  // Hide main dashboard elements when modal opens
  const elementsToHide = [
    document.getElementById('debtorsList'),
    document.querySelector('.w-full.bg-white.dark\\:bg-slate-800.card.p-6.mb-6'), // Search and filters
    document.querySelector('header'),
    document.getElementById('greenPlusBtn'),
    document.getElementById('scrollToTopBtn')
  ];
  
  elementsToHide.forEach(element => {
    if (element) {
      element.style.display = 'none';
    }
  });
  
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
  
  // Function to show hidden elements
  const showHiddenElements = () => {
    const elementsToShow = [
      document.getElementById('debtorsList'),
      document.querySelector('.w-full.bg-white.dark\\:bg-slate-800.card.p-6.mb-6'), // Search and filters
      document.querySelector('header'),
      document.getElementById('greenPlusBtn'),
      document.getElementById('scrollToTopBtn')
    ];
    
    elementsToShow.forEach(element => {
      if (element) {
        element.style.display = '';
      }
    });
  };
  
  // Close modal
  modal.querySelector('#cancelDelete').onclick = () => {
    modal.remove();
    showHiddenElements();
  };
  
  // Close modal when clicking outside
  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      modal.remove();
      showHiddenElements();
    }
  });
  
  // Confirm delete
  modal.querySelector('#confirmDelete').onclick = async () => {
    try {
      const ref = doc(db, "debtors", debtor.id);
      await deleteDoc(ref);
      
      showNotification(`${debtor.name} qarzdor muvaffaqiyatli o'chirildi!`, 'success');
      modal.remove();
      showHiddenElements();
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
  
  let sidebarNumber, sidebarUserCode, userName, username;
  if (userSnap.exists()) {
    const data = userSnap.data();
    sidebarNumber = data.sidebarNumber || Math.floor(Math.random() * 999) + 1;
    sidebarUserCode = data.sidebarUserCode || generateUserCode();
    userName = data.name || user.displayName || "Foydalanuvchi";
    username = data.username || null;
    
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
    username = null;
    await setDoc(userRef, {
      name: userName,
      sidebarNumber,
      sidebarUserCode,
      addedSearchUsers: []
    });
  }
  
  // Update sidebar UI
  const sidebarUserDiv = document.getElementById("sidebarUserInfo");
  if (sidebarUserDiv) {
    sidebarUserDiv.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="relative">
          <div class="w-12 h-12 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
            ${userName.charAt(0)}
          </div>
        </div>
        <div>
          <div class="font-bold text-lg flex items-center gap-2">
            <span class="truncate max-w-[120px]">${userName}</span>
            <span class="text-blue-600 dark:text-blue-300 font-extrabold text-base">#${sidebarNumber}</span>
          </div>
          ${username ? `<div class="text-xs text-indigo-600 dark:text-indigo-400 font-medium">@${username}</div>` : ''}
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



// Initialize the application
function initApp() {
  // Set up event listeners
  document.getElementById('searchInput')?.addEventListener('input', loadDebtors);
  document.getElementById('filterSelect')?.addEventListener('change', loadDebtors);
  document.getElementById('addDebtorBtn')?.addEventListener('click', () => {
    document.getElementById('addDebtorModal').classList.remove('hidden');
    populateProductDropdown();
  });
  document.getElementById('viewDebtsBtn')?.addEventListener('click', () => {
    document.getElementById('viewDebtsModal').classList.remove('hidden');
    setupViewDebtsModal();
  });
  document.getElementById('myDebtsBtn')?.addEventListener('click', () => {
    document.getElementById('myDebtsModal').classList.remove('hidden');
    loadMyDebts();
  });
  // Messages button now redirects to admin-messages.html
  // document.getElementById('messagesBtn')?.addEventListener('click', () => {
  //   document.getElementById('messagesModal').classList.remove('hidden');
  //   loadMessages();
  // });

  document.getElementById('notificationBtn')?.addEventListener('click', toggleNotifications);
  
  // Setup edit username button
  document.getElementById('editUsernameBtn')?.addEventListener('click', () => {
    const modal = document.getElementById('usernameSetupModal');
    if (modal) {
      modal.style.display = 'flex';
      setupUsernameValidation();
      
      // Pre-fill with current username if exists
      const currentUser = auth.currentUser;
      if (currentUser) {
        checkUserHasUsername(currentUser).then(hasUsername => {
          if (hasUsername) {
            const userRef = doc(db, "users", currentUser.uid);
            getDoc(userRef).then(userSnap => {
              if (userSnap.exists()) {
                const userData = userSnap.data();
                const usernameInput = document.getElementById('usernameInput');
                if (usernameInput && userData.username) {
                  usernameInput.value = userData.username;
                  // Trigger validation
                  usernameInput.dispatchEvent(new Event('input'));
                }
              }
            });
          }
        });
      }
    }
  });
  
  // Setup search functionality
  setupSearchFunctionality();
  
  // Setup modal close buttons
  setupModalCloseButtons();
  
  // Load initial data
  loadDebtors();
  loadUserTotals();
  loadAllUsers();
  loadAddedSearchUsers();
  loadUserProducts(); // Load user products
  checkNotifications();
  
  // Setup listeners
  setupNotificationListener();
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
      
      const results = (allUsers || []).filter(user =>
        enhancedSearch(user.id, query) ||
        (user.username && enhancedSearch(user.username, query))
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
                  <div class="text-xs text-gray-500 dark:text-gray-400 font-mono">
                    ID: ${user.id}
                    ${user.username ? `<br>Username: @${user.username}` : ''}
                  </div>
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

// Add user directly without permission system
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
  
  // Add user directly without name change modal
  addedSearchUsers.push(userToAdd);
  renderAddedSearchUsers();
  saveAddedSearchUsers();
  loadDebtors(); // Refresh the debtors list to include the new user
  showNotification(`${userToAdd.name} muvaffaqiyatli qo'shildi!`, 'success');
  
  // Close the search modal
  const viewDebtsModal = document.getElementById('viewDebtsModal');
  if (viewDebtsModal) {
    viewDebtsModal.classList.add('hidden');
  }
  
  // Find or create debtor record and open detailed modal
  try {
    const debtorsSnap = await getDocs(collection(db, "debtors"));
    const debtor = debtorsSnap.docs
      .map(doc => ({ ...doc.data(), id: doc.id }))
      .find(d => d.userId === userToAdd.id || d.code === userToAdd.id || d.id === userToAdd.id);

    if (debtor) {
      // If debtor exists, open their modal
      openDebtorModal(debtor);
    } else {
      // Create a new debtor record for this user
      const newDebtor = {
        name: userToAdd.name || userToAdd.displayName || 'Noma\'lum',
        userId: userToAdd.id,
        code: userToAdd.code || generateUserCode(),
        debts: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const docRef = await addDoc(collection(db, "debtors"), newDebtor);
      newDebtor.id = docRef.id;
      
      showNotification(`${userToAdd.name} uchun yangi qarzdor yozuv yaratildi!`, 'success');
      openDebtorModal(newDebtor);
      await updateUserTotals();
    }
  } catch (error) {
    console.error('Error creating new debtor:', error);
    showNotification('Yangi qarzdor yaratishda xatolik yuz berdi!', 'error');
  }
}







// Setup modal close buttons
function setupModalCloseButtons() {
  // Close buttons for all modals
  const closeButtons = [
    { id: 'closeViewDebtsModal', modal: 'viewDebtsModal' },
    { id: 'closeMyDebtsModal', modal: 'myDebtsModal' },
    { id: 'closeMessagesModal', modal: 'messagesModal' },
    { id: 'closeAddDebtorModal', modal: 'addDebtorModal' },
    { id: 'closeChangeNameModal', modal: 'changeNameModal' }
  ];
  
  closeButtons.forEach(({ id, modal }) => {
    const btn = document.getElementById(id);
    const modalEl = document.getElementById(modal);
    if (btn && modalEl) {
      btn.onclick = () => modalEl.classList.add('hidden');
    }
  });
  
  // Username modal close button (special handling)
  const closeUsernameBtn = document.getElementById('closeUsernameModal');
  const usernameModal = document.getElementById('usernameSetupModal');
  if (closeUsernameBtn && usernameModal) {
    closeUsernameBtn.onclick = () => {
      usernameModal.style.display = 'none';
      // Clear the input
      const usernameInput = document.getElementById('usernameInput');
      if (usernameInput) {
        usernameInput.value = '';
        updateUsernameValidationUI('', { isValid: false, message: '' });
      }
    };
  }
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
        // Har bir qarz yozgan odamning qarzlari alohida guruhlash
        const debtsByAuthor = {};
        let totalAdded = 0;
        let totalSubtracted = 0;
        
        myDebts.forEach(d => {
          (d.history || []).forEach(h => {
            // Skip deleted transactions
            if (h.deleted) return;
            
            const authorId = h.authorId || d.userId;
            const authorName = usersMap[authorId] || authorId || "Noma'lum";
            
            if (!debtsByAuthor[authorName]) {
              debtsByAuthor[authorName] = [];
            }
            
            debtsByAuthor[authorName].push({
              ...h,
              debtorId: d.id,
              debtorCode: d.code || d.userId
            });
            
            if (h.type === "add") {
              totalAdded += h.amount || 0;
            } else if (h.type === "sub") {
              totalSubtracted += h.amount || 0;
            }
          });
        });
        
        // Umumiy yig'indi
        const totalDebt = totalAdded - totalSubtracted;
        
        let html = `
          <div class="mb-4 p-4 bg-blue-50 dark:bg-blue-900 rounded-lg">
            <h3 class="font-bold text-lg mb-2 text-blue-800 dark:text-blue-200">Umumiy Qarzlar</h3>
            <div class="grid grid-cols-3 gap-4 text-center">
              <div>
                <div class="text-sm text-gray-600 dark:text-gray-400">Jami qo'shilgan</div>
                <div class="font-bold text-green-600 dark:text-green-400">${formatMoney(totalAdded)}</div>
              </div>
              <div>
                <div class="text-sm text-gray-600 dark:text-gray-400">Jami ayirilgan</div>
                <div class="font-bold text-red-600 dark:text-red-400">${formatMoney(totalSubtracted)}</div>
              </div>
              <div>
                <div class="text-sm text-gray-600 dark:text-gray-400">Qolgan qarz</div>
                <div class="font-bold ${totalDebt > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}">${formatMoney(totalDebt)}</div>
              </div>
            </div>
          </div>
        `;
        
        // Har bir odamning qarzlari alohida ko'rsatish
        Object.keys(debtsByAuthor).forEach(authorName => {
          const authorDebts = debtsByAuthor[authorName];
          let authorTotalAdded = 0;
          let authorTotalSubtracted = 0;
          
          const authorDebtsHtml = authorDebts.map(h => {
            // Skip deleted transactions in calculation
            if (!h.deleted) {
              if (h.type === "add") authorTotalAdded += h.amount || 0;
              if (h.type === "sub") authorTotalSubtracted += h.amount || 0;
            }
            
            // Mahsulot ma'lumotlarini olish
            const productInfo = h.product ? `
              <div class="text-xs text-gray-500 mt-1">
                <span class="font-medium">Mahsulot:</span> ${h.product}
              </div>
            ` : '';
            
            const quantityInfo = h.count ? `
              <div class="text-xs text-gray-500">
                <span class="font-medium">Miqdori:</span> ${h.count} ta
              </div>
            ` : '';
            
            const priceInfo = h.price ? `
              <div class="text-xs text-gray-500">
                <span class="font-medium">Narxi:</span> ${formatMoney(h.price)} so'm
              </div>
            ` : '';
            
            const isDeleted = h.deleted === true;
            const isEdited = h.edited === true || !!h.editedAt;
            return `
              <div class="p-3 rounded mb-2 ${isDeleted ? 'bg-gray-100 dark:bg-gray-700 opacity-60' : (h.type === "add" ? "bg-green-100 dark:bg-green-900" : "bg-red-100 dark:bg-red-900")} relative">
                ${isDeleted ? '<div class="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded">O\'chirilgan</div>' : ''}
                ${!isDeleted && isEdited ? '<div class="absolute bottom-2 right-2 bg-amber-500 text-white text-xs px-2 py-1 rounded">O\'zgartirilgan</div>' : ''}
                <div class="flex justify-between items-start mb-1">
                  <b class="text-lg ${isDeleted ? 'text-gray-500 dark:text-gray-400' : ''}">${h.type === "add" ? "+" : "-"}${h.amount} so'm</b>
                  <span class="text-xs text-gray-500">${h.date && h.date.toDate ? h.date.toDate().toLocaleString("uz-UZ") : ""}</span>
                </div>
                ${productInfo}
                ${quantityInfo}
                ${priceInfo}
                <div class="text-xs text-gray-400 mt-1">${h.note || ""}</div>
                <div class="text-xs text-gray-500 mt-1">ID: <b>${h.debtorCode}</b></div>
              </div>
            `;
          }).join("");
          
          const authorTotalDebt = authorTotalAdded - authorTotalSubtracted;
          
          html += `
            <div class="p-3 rounded bg-gray-100 dark:bg-gray-700 mb-4">
              <div class="flex justify-between items-center mb-2">
                <h4 class="font-bold text-gray-800 dark:text-white">${authorName}</h4>
                <div class="text-sm">
                  <span class="text-green-600 dark:text-green-400">+${formatMoney(authorTotalAdded)}</span>
                  <span class="text-red-600 dark:text-red-400"> -${formatMoney(authorTotalSubtracted)}</span>
                  <span class="font-bold ${authorTotalDebt > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}"> = ${formatMoney(authorTotalDebt)}</span>
                </div>
              </div>
              <div class="mt-2">${authorDebtsHtml}</div>
            </div>
          `;
        });
        
        myDebtsList.innerHTML = html;
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
      { id: 3, title: "Yangi funksiya", message: "Yangi funksiyalar qo'shildi", time: "1 kun oldin", read: true }
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



// Open debtor modal
function openDebtorModal(debtor) {
  const modal = document.createElement('div');
  modal.id = 'debtorDetailModal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50';
  
  // Hide main dashboard elements when modal opens
  const elementsToHide = [
    document.getElementById('debtorsList'),
    document.querySelector('.w-full.bg-white.dark\\:bg-slate-800.card.p-6.mb-6'), // Search and filters
    document.querySelector('header'),
    document.getElementById('greenPlusBtn'),
    document.getElementById('scrollToTopBtn')
  ];
  
  elementsToHide.forEach(element => {
    if (element) {
      element.style.display = 'none';
    }
  });
  
  const currentUserId = auth.currentUser.uid;
  
  // Filter history to only show transactions created by current user
  const userHistory = (debtor.history || []).filter(h => h.authorId === currentUserId || !h.authorId);
  
  let totalAdd = 0, totalSub = 0;
  userHistory.forEach((h) => {
    // Only count non-deleted transactions
    if (!h.deleted) {
      if (h.type === "add") totalAdd += h.amount || 0;
      if (h.type === "sub") totalSub += h.amount || 0;
    }
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
              <select id="debtorModalProduct" class="p-3 bg-gray-100 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-900 dark:text-gray-100 transition">
                <option value="">Mahsulot tanlang yoki yozing</option>
              </select>
              <input id="debtorModalProductCustom" type="text" placeholder="Yangi mahsulot nomi" class="p-3 bg-gray-100 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-900 dark:text-gray-100 transition hidden">
              <input type="number" placeholder="Mahsulot soni (ixtiyoriy)" class="p-3 bg-gray-100 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-900 dark:text-gray-100 transition" autocomplete="off">
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
          <div class="space-y-3">
            ${userHistory.length > 0 ? 
              userHistory.map((h, index) => {
                const date = h.date?.toDate ? h.date.toDate() : new Date();
                const time = date.toLocaleString("uz-UZ");
                const isDeleted = h.deleted === true;
                const isEdited = h.edited === true || !!h.editedAt;
                return `
                  <div class="p-3 rounded-lg ${isDeleted ? 'bg-gray-100 dark:bg-gray-700 opacity-60' : (h.type === "add" ? "bg-green-100 dark:bg-green-900" : "bg-red-100 dark:bg-red-900")} relative">
                    ${isDeleted ? '<div class="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded">O\'chirilgan</div>' : ''}
                    ${!isDeleted && isEdited ? '<div class="absolute bottom-2 right-2 bg-amber-500 text-white text-xs px-2 py-1 rounded">O\'zgartirilgan</div>' : ''}
                    <div class="font-semibold ${isDeleted ? 'text-gray-500 dark:text-gray-400' : (h.type === "add" ? "text-green-800 dark:text-green-200" : "text-red-800 dark:text-red-200")}">
                      ${h.type === "add" ? "+" : "-"}${h.amount} so'm
                    </div>
                    ${h.product ? `<div class="text-sm ${isDeleted ? 'text-gray-400 dark:text-gray-500' : 'text-gray-600 dark:text-gray-300'}">Mahsulot: ${h.product}</div>` : ""}
                    ${h.count ? `<div class="text-sm ${isDeleted ? 'text-gray-400 dark:text-gray-500' : 'text-gray-600 dark:text-gray-300'}">Miqdori: ${h.count} ta</div>` : ""}
                    ${h.price ? `<div class="text-sm ${isDeleted ? 'text-gray-400 dark:text-gray-500' : 'text-gray-600 dark:text-gray-300'}">Narxi: ${formatMoney(h.price)} so'm</div>` : ""}
                    ${h.note ? `<div class="text-sm ${isDeleted ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'} mt-1">${h.note}</div>` : ""}
                    <div class="text-xs text-gray-400 mt-2">${time}</div>
                    ${!isDeleted ? `
                      <div class="absolute top-2 right-2 flex gap-1">
                        <button class="bg-indigo-500 hover:bg-indigo-600 text-white text-xs px-2 py-1 rounded transition edit-transaction-btn" data-index="${index}" title="Tahrirlash">
                          <i class="fas fa-pen"></i>
                        </button>
                        <button class="bg-red-500 hover:bg-red-600 text-white text-xs px-2 py-1 rounded transition delete-transaction-btn" data-index="${index}" title="O'chirish">
                          <i class="fas fa-trash"></i>
                        </button>
                      </div>
                    ` : ''}
                  </div>
                `;
              }).join("") : 
              '<div class="text-gray-400 text-center py-8">Siz yozgan qarzlar yo\'q</div>'
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
  
  // Populate product dropdown in the modal
  populateDebtorModalProductDropdown();
  
  // Add event listeners for delete transaction buttons
  modal.querySelectorAll('.delete-transaction-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const index = parseInt(btn.getAttribute('data-index'));
      
      if (confirm('Bu harakatni o\'chirishni xohlaysizmi?')) {
        try {
          // Mark the transaction as deleted
          const updatedHistory = [...userHistory];
          updatedHistory[index] = { ...updatedHistory[index], deleted: true };
          
          const ref = doc(db, "debtors", debtor.id);
          await updateDoc(ref, {
            history: updatedHistory
          });
          
          showNotification('Harakat o\'chirildi!', 'success');
          
          // Update the debtor object with new data
          debtor.history = updatedHistory;
          
          // Refresh the modal content
          modal.remove();
          openDebtorModal(debtor);
          
          // Update the main debtors list in background
          loadDebtors();
          await updateUserTotals();
        } catch (error) {
          console.error('Error deleting transaction:', error);
          showNotification('Harakatni o\'chirishda xatolik yuz berdi!', 'error');
        }
      }
    });
  });

  // Add event listeners for edit transaction buttons
  modal.querySelectorAll('.edit-transaction-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const index = parseInt(btn.getAttribute('data-index'));
      const tx = userHistory[index];
      if (!tx || tx.deleted) return;

      // Build edit modal
      const editModal = document.createElement('div');
      editModal.id = 'editTransactionModal';
      editModal.className = 'fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50';

      const isAdd = tx.type === 'add';
      const initialCount = Number.isFinite(tx.count) && tx.count > 0 ? tx.count : 1;
      const initialPrice = Number.isFinite(tx.price) && tx.price > 0 ? tx.price : (isAdd ? Math.round((tx.amount || 0) / initialCount) : 0);

      editModal.innerHTML = `
        <div class="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md p-5 border border-slate-200 dark:border-slate-700">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-bold text-slate-900 dark:text-white">Harakatni tahrirlash</h3>
            <button id="closeEditTx" class="text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-white"><i class="fas fa-times"></i></button>
          </div>
          <div class="text-xs mb-3 text-slate-600 dark:text-slate-300">Turi: <span class="font-semibold ${isAdd ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">${isAdd ? 'Qo\'shish' : 'Ayirish'}</span></div>
          <form id="editTxForm" class="space-y-3">
            ${isAdd ? `
              <div>
                <label class="block text-slate-700 dark:text-slate-300 mb-1">Mahsulot</label>
                <input id="editTxProduct" type="text" value="${tx.product || ''}" class="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-white" autocomplete="off">
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-slate-700 dark:text-slate-300 mb-1">Miqdori</label>
                  <input id="editTxCount" type="number" min="1" value="${initialCount}" class="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-white" autocomplete="off">
                </div>
                <div>
                  <label class="block text-slate-700 dark:text-slate-300 mb-1">Narxi (so'm)</label>
                  <input id="editTxPrice" type="number" min="1" value="${initialPrice}" class="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-white" autocomplete="off">
                </div>
              </div>
            ` : `
              <div>
                <label class="block text-slate-700 dark:text-slate-300 mb-1">Miqdor (so'm)</label>
                <input id="editTxAmount" type="number" min="1" value="${tx.amount || 0}" class="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-white" autocomplete="off">
              </div>
            `}
            <div>
              <label class="block text-slate-700 dark:text-slate-300 mb-1">Izoh</label>
              <input id="editTxNote" type="text" value="${tx.note || ''}" class="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-white" autocomplete="off">
            </div>
            <div class="flex gap-3 pt-2">
              <button type="button" id="cancelEditTx" class="flex-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-white px-4 py-2 rounded-lg transition">Bekor qilish</button>
              <button type="submit" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition">Saqlash</button>
            </div>
          </form>
        </div>
      `;

      document.body.appendChild(editModal);

      const closeEdit = () => editModal.remove();
      editModal.querySelector('#closeEditTx').onclick = closeEdit;
      editModal.querySelector('#cancelEditTx').onclick = closeEdit;
      editModal.addEventListener('click', (evt) => { if (evt.target === editModal) closeEdit(); });

      editModal.querySelector('#editTxForm').onsubmit = async (evt) => {
        evt.preventDefault();

        try {
          let updated = { ...tx };
          if (isAdd) {
            const product = editModal.querySelector('#editTxProduct').value.trim();
            let count = parseInt(editModal.querySelector('#editTxCount').value, 10);
            let price = parseInt(editModal.querySelector('#editTxPrice').value, 10);
            if (!Number.isFinite(count) || count <= 0) count = 1;
            if (!Number.isFinite(price) || price <= 0) price = 1;
            const amount = count * price;
            updated = { ...updated, product, count, price, amount };
          } else {
            let amount = parseInt(editModal.querySelector('#editTxAmount').value, 10);
            if (!Number.isFinite(amount) || amount <= 0) amount = tx.amount || 1;
            updated = { ...updated, amount };
          }
          const note = editModal.querySelector('#editTxNote').value.trim();
          updated.note = note;
          // mark as edited
          updated.edited = true;
          try { updated.editedAt = Timestamp.now(); } catch (_) {}
          updated.lastEditedBy = (auth.currentUser && auth.currentUser.uid) ? auth.currentUser.uid : updated.lastEditedBy;

          // Update filtered history used in the modal (keeps behavior consistent with delete flow)
          const updatedHistory = [...userHistory];
          updatedHistory[index] = updated;

          const ref = doc(db, 'debtors', debtor.id);
          await updateDoc(ref, { history: updatedHistory });

          // Update in-memory and refresh UI
          debtor.history = updatedHistory;
          showNotification('Harakat muvaffaqiyatli yangilandi!', 'success');
          closeEdit();
          modal.remove();
          openDebtorModal(debtor);
          loadDebtors();
          await updateUserTotals();
        } catch (error) {
          console.error('Error updating transaction:', error);
          showNotification('Harakatni yangilashda xatolik yuz berdi!', 'error');
        }
      };
    });
  });
  
  // Function to show hidden elements
  const showHiddenElements = () => {
    const elementsToShow = [
      document.getElementById('debtorsList'),
      document.querySelector('.w-full.bg-white.dark\\:bg-slate-800.card.p-6.mb-6'), // Search and filters
      document.querySelector('header'),
      document.getElementById('greenPlusBtn'),
      document.getElementById('scrollToTopBtn')
    ];
    
    elementsToShow.forEach(element => {
      if (element) {
        element.style.display = '';
      }
    });
  };
  
  // Close modal
  modal.querySelector('#closeDebtorModal').onclick = () => {
    modal.remove();
    showHiddenElements();
  };
  
  // Close modal when clicking outside
  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      modal.remove();
      showHiddenElements();
    }
  });
  
  // Add debt form handler
  modal.querySelector('#addDebtForm').onsubmit = async (e) => {
    e.preventDefault();
    
    const productSelect = e.target[0].value.trim();
    const productCustom = e.target[1].value.trim();
    const product = productSelect || productCustom;
    let count = parseInt(e.target[2].value);
    let price = parseInt(e.target[3].value);
    const note = e.target[4].value.trim();

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
      
      // Update the debtor object with new data
      debtor.history = debtor.history || [];
      debtor.history.push({
        type: "add",
        amount,
        count,
        price,
        product,
        note,
        date: Timestamp.now(),
        authorId: auth.currentUser.uid
      });
      debtor.totalAdded = (debtor.totalAdded || 0) + amount;
      
      // Clear the form
      e.target.reset();
      
      // Refresh the modal content instead of closing it
      modal.remove();
      openDebtorModal(debtor);
      
      // Update the main debtors list in background
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
      
      // Update the debtor object with new data
      debtor.history = debtor.history || [];
      debtor.history.push({
        type: "sub",
        amount: val,
        note,
        date: Timestamp.now(),
        authorId: auth.currentUser.uid
      });
      debtor.totalSubtracted = (debtor.totalSubtracted || 0) + val;
      
      // Clear the form
      e.target.reset();
      
      // Refresh the modal content instead of closing it
      modal.remove();
      openDebtorModal(debtor);
      
      // Update the main debtors list in background
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
            
            // Update the debtor object with new data
            debtor.history = [];
            debtor.totalAdded = 0;
            debtor.totalSubtracted = 0;
            
            // Refresh the modal content instead of closing it
            modal.remove();
            openDebtorModal(debtor);
            
            // Update the main debtors list in background
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
        // Filter history to only include transactions created by current user
        const userHistory = (data.history || []).filter(h => h.authorId === user.uid);
        
        // Calculate totals only from user's own transactions
        userHistory.forEach(h => {
          if (h.type === "add") totalAdded += h.amount || 0;
          if (h.type === "sub") totalSubtracted += h.amount || 0;
        });
      }
    });

    // Removed addedSearchUsers logic - only show current user's transactions

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
        userId: doc.id,
        username: data.username || null
      };
    });
  } catch (error) {
    console.error('Error loading users:', error);
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



// Update message count badge
async function updateMessageCountBadge() {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  try {
    // Count unread notifications only
    const notificationsRef = collection(db, "notifications");
    const notificationsQuery = query(notificationsRef, where("userId", "==", currentUser.uid));
    const notificationsSnapshot = await getDocs(notificationsQuery);
    const unreadNotificationsCount = notificationsSnapshot.docs.filter(doc => !doc.data().read).length;
    
    const totalCount = unreadNotificationsCount;
    
    // Update or create badge for admin messages button
    const messagesBtn = document.querySelector('button[onclick*="admin-messages.html"]');
    if (!messagesBtn) return;
    
    let badge = messagesBtn.querySelector('#messageBadge');
    if (totalCount > 0) {
      if (!badge) {
        badge = document.getElementById('messageBadge');
      }
      if (badge) {
        badge.textContent = totalCount > 99 ? '99+' : totalCount;
        badge.classList.remove('hidden');
      }
    } else if (badge) {
      badge.classList.add('hidden');
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
    container.className = 'w-full max-w-3xl space-y-8 px-4 mb-6 mt-8';
    const debtorsList = document.getElementById('debtorsList');
    if (debtorsList && debtorsList.parentNode) {
      debtorsList.parentNode.appendChild(container);
    }
  }

  container.innerHTML = '';
  
  const currentUserId = auth.currentUser.uid;
  
  for (let idx = 0; idx < addedSearchUsers.length; idx++) {
    const user = addedSearchUsers[idx];
    let totalAdded = 0, totalSub = 0;
    
    const debtorsSnap = await getDocs(collection(db, "debtors"));
    const debtor = debtorsSnap.docs
      .map(doc => ({ ...doc.data(), id: doc.id }))
      .find(d => d.userId === user.id || d.code === user.id || d.id === user.id);

    if (debtor) {
      // Filter history to only include transactions created by current user
      const userHistory = (debtor.history || []).filter(h => h.authorId === currentUserId);
      
      if (typeof debtor.totalAdded === "number") {
        // If using totalAdded field, we need to calculate based on user's transactions
        userHistory.forEach(h => {
          if (h.type === "add") totalAdded += h.amount || 0;
        });
      } else {
        userHistory.forEach(h => {
          if (h.type === "add") totalAdded += h.amount || 0;
        });
      }
      if (typeof debtor.totalSubtracted === "number") {
        // If using totalSubtracted field, we need to calculate based on user's transactions
        userHistory.forEach(h => {
          if (h.type === "sub") totalSub += h.amount || 0;
        });
      } else {
        userHistory.forEach(h => {
          if (h.type === "sub") totalSub += h.amount || 0;
        });
      }
    }

    // Show all added profiles, even if no debts have been written yet
    // if (totalAdded === 0) continue;

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
          ${totalAdded > 0 ? `
            <div class="mt-1 font-semibold text-base text-gray-700 dark:text-gray-200">
              Jami qo'shilgan: <span class="text-green-600 dark:text-green-400 font-bold">${totalAdded} so'm</span>
            </div>
            <div class="mt-1 font-semibold text-base">
              <span class="text-red-600 dark:text-red-400">Jami ayirilgan: ${totalSub} so'm</span>
            </div>
            <div class="mt-1 font-semibold text-base">
              Qolgan qarzdorlik: <span class="text-blue-700 dark:text-blue-400 font-bold">${remaining} so'm</span>
            </div>
          ` : `
            <div class="mt-1 font-semibold text-base text-gray-500 dark:text-gray-400">
              <i class="fas fa-info-circle mr-1"></i>Hali qarzdorlik yozilmagan
            </div>
          `}
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
      loadDebtors(); // Refresh the debtors list after removing a user
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





// Global functions for buttons (window object)

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

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

// Load user products from Firebase
async function loadUserProducts() {
  const user = auth.currentUser;
  if (!user) return;
  
  try {
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);
    if (snap.exists() && Array.isArray(snap.data().products)) {
      userProducts = snap.data().products;
      renderProductsList();
    }
  } catch (error) {
    console.error('Error loading user products:', error);
  }
}

// Save user products to Firebase
async function saveUserProducts() {
  const user = auth.currentUser;
  if (!user) return;
  
  try {
    const userRef = doc(db, "users", user.uid);
    await updateDoc(userRef, { products: userProducts });
  } catch (error) {
    console.error('Error saving user products:', error);
  }
}

// Render products list
function renderProductsList() {
  const productsList = document.getElementById('productsList');
  if (!productsList) return;
  
  if (userProducts.length === 0) {
    productsList.innerHTML = `
      <div class="text-center text-slate-500 dark:text-slate-400 py-4">
        <i class="fas fa-box text-2xl mb-2"></i>
        <p>Hali mahsulot qo'shilmagan</p>
      </div>
    `;
  } else {
    productsList.innerHTML = '';
    userProducts.forEach((product, index) => {
      const productItem = document.createElement('div');
      productItem.className = 'flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600';
      productItem.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full flex items-center justify-center text-white text-sm">
            <i class="fas fa-box"></i>
          </div>
          <div>
            <h5 class="font-medium text-slate-800 dark:text-white">${product.name}</h5>
            <p class="text-sm text-slate-600 dark:text-slate-400">${product.price} so'm</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button class="text-blue-500 hover:text-blue-700 dark:hover:text-blue-400" onclick="editProduct(${index})">
            <i class="fas fa-edit"></i>
          </button>
          <button class="text-red-500 hover:text-red-700 dark:hover:text-red-400" onclick="removeProduct(${index})">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      `;
      productsList.appendChild(productItem);
    });
  }
  
  // Also populate the dropdown in the debtor form
  populateProductDropdown();
}

// Add product to Firebase
async function addProductToFirebase(name, price) {
  const user = auth.currentUser;
  if (!user) {
    showNotification('Avval tizimga kirishingiz kerak!', 'error');
    return;
  }
  
  // Check if product already exists
  const existingProduct = userProducts.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (existingProduct) {
    showNotification('Bu mahsulot allaqachon mavjud!', 'error');
    return;
  }
  
  // Add to array
  userProducts.push({
    name: name,
    price: price,
    createdAt: new Date()
  });
  
  // Save to Firebase
  await saveUserProducts();
  
  // Re-render the list
  renderProductsList();
  
  showNotification('Mahsulot muvaffaqiyatli qo\'shildi!', 'success');
}

// Populate product dropdown
function populateProductDropdown() {
  const productSelect = document.getElementById('debtorProduct');
  const customProductInput = document.getElementById('debtorProductCustom');
  
  if (!productSelect) return;
  
  // Clear existing options except the first one
  productSelect.innerHTML = '<option value="">Mahsulot tanlang yoki yozing</option>';
  
  // Add saved products
  userProducts.forEach(product => {
    const option = document.createElement('option');
    option.value = product.name;
    option.textContent = `${product.name} (${product.price} so'm)`;
    productSelect.appendChild(option);
  });
  
  // Remove existing event listener to prevent duplicates
  const newProductSelect = productSelect.cloneNode(true);
  productSelect.parentNode.replaceChild(newProductSelect, productSelect);
  
  // Add event listener for custom product
  newProductSelect.addEventListener('change', function() {
    if (this.value === '') {
      // Show custom input for new product
      if (customProductInput) {
        customProductInput.classList.remove('hidden');
        customProductInput.focus();
      }
    } else {
      // Hide custom input if product is selected
      if (customProductInput) {
        customProductInput.classList.add('hidden');
        customProductInput.value = '';
      }
      
      // Auto-fill price if product is selected
      const selectedProduct = userProducts.find(p => p.name === this.value);
      if (selectedProduct) {
        const priceInput = document.getElementById('debtorPrice');
        if (priceInput) {
          priceInput.value = selectedProduct.price;
        }
      }
    }
  });
}

// Populate product dropdown in debtor modal
function populateDebtorModalProductDropdown() {
  const productSelect = document.getElementById('debtorModalProduct');
  const customProductInput = document.getElementById('debtorModalProductCustom');
  
  if (!productSelect) return;
  
  // Clear existing options except the first one
  productSelect.innerHTML = '<option value="">Mahsulot tanlang yoki yozing</option>';
  
  // Add saved products
  userProducts.forEach(product => {
    const option = document.createElement('option');
    option.value = product.name;
    option.textContent = `${product.name} (${product.price} so'm)`;
    productSelect.appendChild(option);
  });
  
  // Remove existing event listener to prevent duplicates
  const newProductSelect = productSelect.cloneNode(true);
  productSelect.parentNode.replaceChild(newProductSelect, productSelect);
  
  // Add event listener for custom product
  newProductSelect.addEventListener('change', function() {
    if (this.value === '') {
      // Show custom input for new product
      if (customProductInput) {
        customProductInput.classList.remove('hidden');
        customProductInput.focus();
      }
    } else {
      // Hide custom input if product is selected
      if (customProductInput) {
        customProductInput.classList.add('hidden');
        customProductInput.value = '';
      }
      
      // Auto-fill price if product is selected
      const selectedProduct = userProducts.find(p => p.name === this.value);
      if (selectedProduct) {
        const priceInput = newProductSelect.closest('form').querySelector('input[type="number"][min="1"]');
        if (priceInput) {
          priceInput.value = selectedProduct.price;
        }
      }
    }
  });
}

window.addProductToFirebase = addProductToFirebase;

// Edit product function
window.editProduct = async function(index) {
  const product = userProducts[index];
  if (!product) return;
  
  // Create edit modal
  const modal = document.createElement('div');
  modal.id = 'editProductModal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50';
  
  modal.innerHTML = `
    <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md mx-4">
      <div class="p-6 border-b border-slate-200 dark:border-slate-700">
        <div class="flex justify-between items-center">
          <h3 class="text-xl font-bold text-slate-800 dark:text-white">Mahsulotni tahrirlash</h3>
          <button id="closeEditProductModal" class="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
      <div class="p-6">
        <form id="editProductForm" class="space-y-4">
          <div>
            <label class="block text-slate-700 dark:text-slate-300 mb-2">Mahsulot nomi</label>
            <input id="editProductName" type="text" value="${product.name}" placeholder="Mahsulot nomini kiriting..." class="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-white" required>
          </div>
          
          <div>
            <label class="block text-slate-700 dark:text-slate-300 mb-2">Narxi (so'm)</label>
            <input id="editProductPrice" type="number" min="1" value="${product.price}" placeholder="Narxini kiriting..." class="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-white" required>
          </div>
          
          <div class="flex gap-3 pt-4">
            <button type="button" id="cancelEditProduct" class="flex-1 bg-slate-300 hover:bg-slate-400 dark:bg-slate-600 dark:hover:bg-slate-500 text-slate-800 dark:text-slate-200 px-4 py-3 rounded-lg font-semibold transition">
              Bekor qilish
            </button>
            <button type="submit" class="flex-1 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white px-4 py-3 rounded-lg font-semibold transition">
              <i class="fas fa-save mr-2"></i> Saqlash
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close modal
  modal.querySelector('#closeEditProductModal').onclick = () => modal.remove();
  modal.querySelector('#cancelEditProduct').onclick = () => modal.remove();
  
  // Close modal when clicking outside
  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      modal.remove();
    }
  });
  
  // Handle form submission
  modal.querySelector('#editProductForm').onsubmit = async (e) => {
    e.preventDefault();
    
    const newName = document.getElementById('editProductName').value.trim();
    const newPrice = parseInt(document.getElementById('editProductPrice').value);
    
    if (!newName || !newPrice) {
      showNotification('Iltimos, mahsulot nomi va narxini kiriting!', 'error');
      return;
    }
    
    // Check if name already exists (excluding current product)
    const existingProduct = userProducts.find((p, i) => i !== index && p.name.toLowerCase() === newName.toLowerCase());
    if (existingProduct) {
      showNotification('Bu nomli mahsulot allaqachon mavjud!', 'error');
      return;
    }
    
    try {
      // Update product
      userProducts[index] = {
        ...product,
        name: newName,
        price: newPrice,
        updatedAt: new Date()
      };
      
      // Save to Firebase
      await saveUserProducts();
      
      // Re-render the list
      renderProductsList();
      
      showNotification('Mahsulot muvaffaqiyatli yangilandi!', 'success');
      modal.remove();
    } catch (error) {
      console.error('Error updating product:', error);
      showNotification('Mahsulotni yangilashda xatolik yuz berdi!', 'error');
    }
  };
}

window.renderProductsList = renderProductsList;
window.populateProductDropdown = populateProductDropdown;
window.populateDebtorModalProductDropdown = populateDebtorModalProductDropdown;

// Remove product function (for compatibility with HTML onclick)
window.removeProduct = async function(index) {
  if (confirm('Bu mahsulotni o\'chirishni xohlaysizmi?')) {
    // Remove from array
    userProducts.splice(index, 1);
    
    // Save to Firebase
    await saveUserProducts();
    
    // Re-render the list
    renderProductsList();
    
    showNotification('Mahsulot muvaffaqiyatli o\'chirildi!', 'success');
  }
};


