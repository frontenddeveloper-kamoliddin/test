import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyACHEuejKVniBAcYExQxk23A9QD84bUaB4",
  authDomain: "new-project-6075a.firebaseapp.com",
  projectId: "new-project-6075a",
  storageBucket: "new-project-6075a.appspot.com",
  messagingSenderId: "974403904500",
  appId: "1:974403904500:web:5d4edb5db8f5432cbdcfa1",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    loadUserDebtorsStats(user);
  }
});

async function loadUserDebtorsStats(user) {
  const snapshot = await getDocs(collection(db, "debtors"));
  const debtors = snapshot.docs
    .map(doc => ({ ...doc.data(), id: doc.id }))
    .filter(d => d.userId === user.uid);
  
  // Load addedSearchUsers from user document
  let addedSearchUsers = [];
  try {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists() && Array.isArray(userSnap.data().addedSearchUsers)) {
      addedSearchUsers = userSnap.data().addedSearchUsers;
    }
  } catch (error) {
    console.log("Error loading addedSearchUsers:", error);
  }
  
  // Find and merge addedSearchUsers' debtors (unique by id)
  let allDebtors = [...debtors];
  const allDebtorsIds = new Set(debtors.map(d => d.id));
  for (const user of addedSearchUsers) {
    // Find debtor by userId, code, or id
    const addedDebtor = snapshot.docs
      .map(doc => ({ ...doc.data(), id: doc.id }))
      .find(d => d.userId === user.id || d.code === user.id || d.id === user.id);
    if (addedDebtor && !allDebtorsIds.has(addedDebtor.id)) {
      allDebtors.push(addedDebtor);
      allDebtorsIds.add(addedDebtor.id);
    }
  }
  renderStats(debtors, addedSearchUsers, allDebtors);
}

function renderStats(debtors, addedSearchUsers = [], allDebtors = []) {
  let totalAdded = 0,
    totalSubtracted = 0,
    totalDebt = 0;
  
  debtors.forEach((d) => {
    let add = 0,
      sub = 0;
    d.history?.forEach((h) => {
      if (h.type === "add") add += h.amount;
      if (h.type === "sub") sub += h.amount;
    });
    totalAdded += add;
    totalSubtracted += sub;
    totalDebt += add - sub;
  });

  // Add totals from addedSearchUsers
  addedSearchUsers.forEach((user) => {
    // Find debtor data for this user
    const debtor = allDebtors.find(d => 
      d.userId === user.id || 
      d.code === user.id || 
      d.id === user.id
    );
    
    if (debtor) {
      let add = 0, sub = 0;
      debtor.history?.forEach((h) => {
        if (h.type === "add") add += h.amount;
        if (h.type === "sub") sub += h.amount;
      });
      totalAdded += add;
      totalSubtracted += sub;
      totalDebt += add - sub;
    }
  });

  document.getElementById("totalAdded").innerText = totalAdded + " so'm";
  document.getElementById("totalSubtracted").innerText = totalSubtracted + " so'm";
  document.getElementById("totalDebt").innerText = totalDebt + " so'm";
  
  // Calculate total debtors count including addedSearchUsers
  let totalDebtorsCount = allDebtors.length;
  document.getElementById("totalDebtors").innerText = totalDebtorsCount;

  // Pass allDebtors to all render* functions
  renderDebtChart(allDebtors);
  renderRatingChart(allDebtors);
  renderLongestDebtorsTable(allDebtors);
  renderTopDebtorsTable(allDebtors);
}

function renderLongestDebtorsTable(allDebtors) {
  // For each debtor, find the last payment (sub) or last add if no payment
  const now = new Date();
  const rows = allDebtors.map((debtor) => {
    let lastSub = null;
    let lastAdd = null;
    let total = 0;
    (debtor.history || []).forEach((h) => {
      if (h.type === 'add') {
        total += h.amount;
        if (!lastAdd || (h.date && (h.date.toDate ? h.date.toDate() : new Date(h.date)) > lastAdd)) {
          lastAdd = h.date ? (h.date.toDate ? h.date.toDate() : new Date(h.date)) : null;
        }
      }
      if (h.type === 'sub') {
        total -= h.amount;
        if (!lastSub || (h.date && (h.date.toDate ? h.date.toDate() : new Date(h.date)) > lastSub)) {
          lastSub = h.date ? (h.date.toDate ? h.date.toDate() : new Date(h.date)) : null;
        }
      }
    });
    let lastAction = lastSub || lastAdd;
    let lastActionLabel = lastSub ? 'To‘lov' : 'Qo‘shilgan';
    return {
      name: debtor.name,
      total,
      lastAction,
      lastActionLabel,
    };
  })
  // faqat hali qarzi borlar
  .filter(d => d.total > 0)
  // eng uzoqdan beri bermaganlar yuqorida
  .sort((a, b) => {
    if (!a.lastAction && !b.lastAction) return 0;
    if (!a.lastAction) return -1;
    if (!b.lastAction) return 1;
    return a.lastAction - b.lastAction;
  });

  const tbody = document.getElementById('longestDebtorsTable');
  tbody.innerHTML = rows.slice(0, 10).map((row, i) => {
    let dateStr = row.lastAction ? row.lastAction.toLocaleDateString('uz-UZ') : 'Maʼlumot yo‘q';
    let label = row.lastActionLabel;
    return `<tr>
      <td class="py-2 px-3">${i + 1}</td>
      <td class="py-2 px-3">${row.name}</td>
      <td class="py-2 px-3">${row.total} so‘m</td>
      <td class="py-2 px-3">${dateStr} <span class='text-xs text-gray-400'>(${label})</span></td>
    </tr>`;
  }).join('');
}

function renderTopDebtorsTable(allDebtors) {
  // Sort by total debt descending
  const rows = allDebtors.map((debtor) => {
    let total = 0;
    (debtor.history || []).forEach((h) => {
      if (h.type === 'add') total += h.amount;
      if (h.type === 'sub') total -= h.amount;
    });
    return {
      name: debtor.name,
      total,
    };
  })
  .filter(d => d.total > 0)
  .sort((a, b) => b.total - a.total);

  const tbody = document.getElementById('topDebtorsTable');
  tbody.innerHTML = rows.slice(0, 10).map((row, i) => {
    return `<tr>
      <td>${i + 1}</td>
      <td>${row.name}</td>
      <td>${row.total} so‘m</td>
    </tr>`;
  }).join('');
}

let debtChartInstance = null;
function renderDebtChart(allDebtors) {
  const days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push(d.toLocaleDateString('uz-UZ'));
  }
  const dailyAdded = Array(7).fill(0);
  const dailySub = Array(7).fill(0);

  allDebtors.forEach((debtor) => {
    (debtor.history || []).forEach((h) => {
      if (!h.date) return;
      const date = h.date.toDate ? h.date.toDate() : new Date(h.date);
      const idx = days.findIndex(day => day === date.toLocaleDateString('uz-UZ'));
      if (idx !== -1) {
        if (h.type === 'add') dailyAdded[idx] += h.amount;
        if (h.type === 'sub') dailySub[idx] += h.amount;
      }
    });
  });

  const ctx = document.getElementById('debtChart').getContext('2d');
  if (debtChartInstance) debtChartInstance.destroy();
  debtChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days,
      datasets: [
        {
          label: 'Qo‘shilgan',
          data: dailyAdded,
          backgroundColor: 'rgba(59, 130, 246, 0.7)',
        },
        {
          label: 'Ayirilgan',
          data: dailySub,
          backgroundColor: 'rgba(239, 68, 68, 0.7)',
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top' },
        title: { display: false },
      },
      scales: {
        y: { beginAtZero: true }
      }
    },
  });
}

let ratingChartInstance = null;
function renderRatingChart(allDebtors) {
  const rating = allDebtors.map(d => {
    let total = 0;
    (d.history || []).forEach(h => {
      if (h.type === 'add') total += h.amount;
      if (h.type === 'sub') total -= h.amount;
    });
    return { name: d.name, total: total };
  })
  .sort((a, b) => b.total - a.total)
  .slice(0, 5);

  const ctx = document.getElementById('ratingChart').getContext('2d');
  if (ratingChartInstance) ratingChartInstance.destroy();
  ratingChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: rating.map(r => r.name),
      datasets: [{
        label: 'Qarzdorlik',
        data: rating.map(r => r.total),
        backgroundColor: 'rgba(16, 185, 129, 0.7)',
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        title: { display: false },
      },
      scales: {
        y: { beginAtZero: true }
      }
    },
  });
}
