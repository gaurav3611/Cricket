/**
 * =====================================================
 * CricPro — Firebase Client Configuration
 * =====================================================
 * 
 * IMPORTANT: Replace the config below with YOUR Firebase
 * project credentials from Firebase Console:
 *   1. Go to console.firebase.google.com
 *   2. Select your project → Project Settings (gear icon)
 *   3. Scroll to "Your apps" → Web app → Config
 *   4. Copy the firebaseConfig object below
 */

// ============================================
// FIREBASE CONFIG — REPLACE WITH YOUR VALUES
// ============================================
const firebaseConfig = {
  apiKey: "AIzaSyCiv1I-SbHwUcmGlC4hrJQmxuaCEkkPhgQ",
  authDomain: "cricpro-app.firebaseapp.com",
  projectId: "cricpro-app",
  storageBucket: "cricpro-app.firebasestorage.app",
  messagingSenderId: "140824187893",
  appId: "1:140824187893:web:7692545a9a2b7d91a5c6bc",
  measurementId: "G-DLXEJ3PFR9"
};

// ============================================
// BACKEND URL
// ============================================
// Change this to your deployed backend URL when hosting
const BACKEND_URL = window.location.origin;

// ============================================
// INITIALIZATION
// ============================================
let firebaseApp = null;
let firebaseAuth = null;
let isDemoMode = false;

function initializeFirebase() {
  try {
    // Check if Firebase SDK is loaded
    if (typeof firebase === 'undefined') {
      console.warn('[Firebase] SDK not loaded — running in demo mode');
      isDemoMode = true;
      return false;
    }
    
    // Check if config is set
    if (firebaseConfig.apiKey === 'YOUR_API_KEY') {
      console.warn('[Firebase] Config not set — running in demo mode');
      console.info('[Firebase] Edit frontend/js/firebase-config.js with your credentials');
      isDemoMode = true;
      return false;
    }
    
    firebaseApp = firebase.initializeApp(firebaseConfig);
    firebaseAuth = firebase.auth();
    
    console.log('[Firebase] Initialized successfully');
    isDemoMode = false;
    return true;
    
  } catch (error) {
    console.error('[Firebase] Init error:', error);
    isDemoMode = true;
    return false;
  }
}

/**
 * Get the current user's auth token for API calls
 */
async function getAuthToken() {
  if (isDemoMode) return 'demo-token';
  
  const user = firebaseAuth?.currentUser;
  if (!user) return null;
  
  try {
    return await user.getIdToken();
  } catch (error) {
    console.error('[Auth] Token error:', error);
    return null;
  }
}

/**
 * Make an authenticated API call to the backend
 */
async function apiCall(endpoint, options = {}) {
  const token = await getAuthToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers
  };
  
  const response = await fetch(`${BACKEND_URL}${endpoint}`, {
    ...options,
    headers
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  
  return response.json();
}
