import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  updateDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

// Function to remove premium data from all users
async function removePremiumData() {
  try {
    console.log('Starting to remove premium data...');
    
    // Get all users
    const usersSnapshot = await getDocs(collection(db, "users"));
    const batch = writeBatch(db);
    let updateCount = 0;
    
    usersSnapshot.forEach((userDoc) => {
      const userData = userDoc.data();
      const updates = {};
      
      // Remove premium-related fields
      if (userData.isPremium !== undefined) {
        updates.isPremium = false;
      }
      if (userData.premiumExpiresAt !== undefined) {
        updates.premiumExpiresAt = null;
      }
      if (userData.premiumStartDate !== undefined) {
        updates.premiumStartDate = null;
      }
      if (userData.premiumType !== undefined) {
        updates.premiumType = null;
      }
      
      // Only update if there are changes
      if (Object.keys(updates).length > 0) {
        batch.update(doc(db, "users", userDoc.id), updates);
        updateCount++;
        console.log(`Updating user: ${userDoc.id}`);
      }
    });
    
    // Commit all updates
    if (updateCount > 0) {
      await batch.commit();
      console.log(`Successfully updated ${updateCount} users`);
    } else {
      console.log('No premium data found to remove');
    }
    
    console.log('Premium data removal completed!');
    
  } catch (error) {
    console.error('Error removing premium data:', error);
  }
}

// Function to check for any remaining premium data
async function checkRemainingPremiumData() {
  try {
    console.log('Checking for remaining premium data...');
    
    const usersSnapshot = await getDocs(collection(db, "users"));
    let premiumUsers = 0;
    
    usersSnapshot.forEach((userDoc) => {
      const userData = userDoc.data();
      if (userData.isPremium || userData.premiumExpiresAt || userData.premiumStartDate || userData.premiumType) {
        premiumUsers++;
        console.log(`User ${userDoc.id} still has premium data:`, userData);
      }
    });
    
    if (premiumUsers === 0) {
      console.log('No remaining premium data found!');
    } else {
      console.log(`Found ${premiumUsers} users with remaining premium data`);
    }
    
  } catch (error) {
    console.error('Error checking premium data:', error);
  }
}

// Export functions for use
window.removePremiumData = removePremiumData;
window.checkRemainingPremiumData = checkRemainingPremiumData;

console.log('Premium data removal script loaded!');
console.log('Use removePremiumData() to remove premium data from Firebase');
console.log('Use checkRemainingPremiumData() to check for remaining premium data'); 