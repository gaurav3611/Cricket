/**
 * =====================================================
 * CricPro — Authentication Module
 * =====================================================
 * Handles user registration, login, and session management
 * using Firebase Authentication
 */

// ============================================
// STATE
// ============================================
let currentUser = null;

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  initializeFirebase();
  setupAuthUI();
  setupAuthStateListener();
  createParticles();
});

// ============================================
// AUTH STATE LISTENER
// ============================================
function setupAuthStateListener() {
  if (isDemoMode) return;
  
  firebaseAuth.onAuthStateChanged((user) => {
    if (user) {
      // User is signed in — redirect to dashboard
      currentUser = user;
      window.location.href = '/dashboard.html';
    }
  });
}

// ============================================
// UI SETUP
// ============================================
function setupAuthUI() {
  // Tab switching
  const tabs = document.querySelectorAll('.auth-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      
      // Update tabs
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Update forms
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      document.getElementById(`${target}Form`).classList.add('active');
      
      // Clear errors
      hideError('loginError');
      hideError('registerError');
    });
  });
  
  // Login form
  document.getElementById('loginFormEl').addEventListener('submit', handleLogin);
  
  // Register form
  document.getElementById('registerFormEl').addEventListener('submit', handleRegister);
  
  // Password visibility toggles
  document.querySelectorAll('.password-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.parentElement.querySelector('input');
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      btn.textContent = isPassword ? '🙈' : '👁️';
    });
  });
  
  // Google Sign-In buttons
  document.querySelectorAll('.google-btn').forEach(btn => {
    btn.addEventListener('click', handleGoogleSignIn);
  });
}

// ============================================
// LOGIN HANDLER
// ============================================
async function handleLogin(e) {
  e.preventDefault();
  
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const submitBtn = e.target.querySelector('button[type="submit"]');
  
  if (!email || !password) {
    showError('loginError', 'Please fill in all fields');
    return;
  }
  
  // Demo mode
  if (isDemoMode) {
    showToast('Running in demo mode — redirecting to dashboard', 'info');
    localStorage.setItem('cricpro_demo_user', JSON.stringify({
      email: email,
      displayName: email.split('@')[0],
      uid: 'demo-' + Date.now()
    }));
    setTimeout(() => window.location.href = '/dashboard.html', 1000);
    return;
  }
  
  // Show loading
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<div class="spinner" style="width:18px;height:18px;border-width:2px;margin:0 auto;"></div>';
  
  try {
    const credential = await firebaseAuth.signInWithEmailAndPassword(email, password);
    currentUser = credential.user;
    showToast('Welcome back! Redirecting...', 'success');
    // onAuthStateChanged will handle redirect
  } catch (error) {
    let message = 'Login failed. Please try again.';
    switch (error.code) {
      case 'auth/user-not-found':
        message = 'No account found with this email';
        break;
      case 'auth/wrong-password':
        message = 'Incorrect password';
        break;
      case 'auth/invalid-email':
        message = 'Invalid email address';
        break;
      case 'auth/too-many-requests':
        message = 'Too many attempts. Please wait and try again.';
        break;
    }
    showError('loginError', message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'SIGN IN';
  }
}

// ============================================
// REGISTER HANDLER
// ============================================
async function handleRegister(e) {
  e.preventDefault();
  
  const name = document.getElementById('registerName').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;
  const confirmPassword = document.getElementById('registerConfirm').value;
  const team = document.getElementById('registerTeam').value.trim();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  
  // Validation
  if (!name || !email || !password) {
    showError('registerError', 'Please fill in all required fields');
    return;
  }
  
  if (password.length < 6) {
    showError('registerError', 'Password must be at least 6 characters');
    return;
  }
  
  if (password !== confirmPassword) {
    showError('registerError', 'Passwords do not match');
    return;
  }
  
  // Demo mode
  if (isDemoMode) {
    showToast('Account created in demo mode — redirecting', 'info');
    localStorage.setItem('cricpro_demo_user', JSON.stringify({
      email: email,
      displayName: name,
      uid: 'demo-' + Date.now(),
      team: team
    }));
    setTimeout(() => window.location.href = '/dashboard.html', 1000);
    return;
  }
  
  // Show loading
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<div class="spinner" style="width:18px;height:18px;border-width:2px;margin:0 auto;"></div>';
  
  try {
    // Create account
    const credential = await firebaseAuth.createUserWithEmailAndPassword(email, password);
    
    // Update profile
    await credential.user.updateProfile({
      displayName: name
    });
    
    // Save additional profile data to backend
    try {
      await apiCall('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({
          display_name: name,
          team: team,
          batting_style: 'right'
        })
      });
    } catch (err) {
      console.warn('[Profile] Could not save profile:', err);
    }
    
    currentUser = credential.user;
    showToast('Account created! Welcome to CricPro 🏏', 'success');
    // onAuthStateChanged will handle redirect
    
  } catch (error) {
    let message = 'Registration failed. Please try again.';
    switch (error.code) {
      case 'auth/email-already-in-use':
        message = 'An account with this email already exists';
        break;
      case 'auth/invalid-email':
        message = 'Invalid email address';
        break;
      case 'auth/weak-password':
        message = 'Password is too weak (min 6 characters)';
        break;
    }
    showError('registerError', message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'CREATE ACCOUNT';
  }
}

// ============================================
// GOOGLE SIGN-IN
// ============================================
async function handleGoogleSignIn() {
  if (isDemoMode) {
    showToast('Google Sign-In not available in demo mode', 'info');
    return;
  }
  
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    const result = await firebaseAuth.signInWithPopup(provider);
    currentUser = result.user;
    showToast('Welcome! Redirecting...', 'success');
  } catch (error) {
    if (error.code !== 'auth/popup-closed-by-user') {
      showToast('Google sign-in failed: ' + error.message, 'error');
    }
  }
}

// ============================================
// UI HELPERS
// ============================================
function showError(elementId, message) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = message;
    el.classList.add('visible');
  }
}

function hideError(elementId) {
  const el = document.getElementById(elementId);
  if (el) {
    el.classList.remove('visible');
  }
}

function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type] || ''}</span> ${message}`;
  container.appendChild(toast);
  
  setTimeout(() => toast.remove(), 4000);
}

// ============================================
// PARTICLES BACKGROUND
// ============================================
function createParticles() {
  const container = document.querySelector('.particles');
  if (!container) return;
  
  for (let i = 0; i < 30; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.style.left = Math.random() * 100 + '%';
    particle.style.animationDuration = (8 + Math.random() * 15) + 's';
    particle.style.animationDelay = Math.random() * 10 + 's';
    particle.style.width = (1 + Math.random() * 3) + 'px';
    particle.style.height = particle.style.width;
    
    if (Math.random() > 0.5) {
      particle.style.background = '#ff6b00';
    }
    
    container.appendChild(particle);
  }
}
