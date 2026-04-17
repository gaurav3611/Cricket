/**
 * =====================================================
 * CricPro — Dashboard Controller
 * =====================================================
 * Main dashboard logic: BLE + WebSocket connection,
 * real-time data processing, charts, session management
 */

// ============================================
// STATE
// ============================================
let socket = null;
let recording = false;
let sessionData = [];
let sessionStart = null;
let timerInterval = null;
let swingCount = 0;
let maxBackliftAngle = 0;
let peakSpeed = 0;
let peakPower = 0;
let speedChart = null;
let accelChart = null;
let currentTab = 'live';
let userProfile = null;

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  initializeFirebase();
  checkAuth();
  initCharts();
  init3DBat('threeContainer');
  setupUI();
  connectWebSocket();  // Still connects for demo mode & backend API
  createParticles();
  
  // Show BLE status
  addLog('Ready — click CONNECT BAT to pair via Bluetooth');
});

// ============================================
// AUTH CHECK
// ============================================
function checkAuth() {
  if (isDemoMode) {
    const demoUser = JSON.parse(localStorage.getItem('cricpro_demo_user') || 'null');
    if (!demoUser) {
      window.location.href = '/';
      return;
    }
    userProfile = demoUser;
    updateUserUI(demoUser);
    return;
  }
  
  firebaseAuth.onAuthStateChanged((user) => {
    if (!user) {
      window.location.href = '/';
      return;
    }
    userProfile = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || user.email.split('@')[0]
    };
    updateUserUI(userProfile);
    loadSessionHistory();
  });
}

function updateUserUI(user) {
  const initials = (user.displayName || user.email || 'U')
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  
  const avatar = document.getElementById('userAvatar');
  if (avatar) avatar.textContent = initials;
  
  const profileAvatar = document.getElementById('profileAvatarText');
  if (profileAvatar) profileAvatar.textContent = initials;
  
  const profileName = document.getElementById('profileName');
  if (profileName) profileName.textContent = user.displayName || 'Player';
  
  const profileEmail = document.getElementById('profileEmail');
  if (profileEmail) profileEmail.textContent = user.email || '';
}

// ============================================
// WEBSOCKET CONNECTION
// ============================================
function connectWebSocket() {
  try {
    // Load Socket.IO client
    const script = document.createElement('script');
    script.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
    script.onload = () => {
      socket = io(BACKEND_URL, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 10
      });
      
      socket.on('connect', () => {
        console.log('[WS] Connected');
        updateConnectionStatus(true);
        addLog('🔗 Connected to CricPro server');
      });
      
      socket.on('disconnect', () => {
        console.log('[WS] Disconnected');
        updateConnectionStatus(false);
        addLog('⚠️ Server connection lost');
      });
      
      socket.on('sensor_data', handleSensorData);
      socket.on('swing_detected', handleSwingDetected);
      socket.on('session_started', (data) => {
        addLog(`▶ Session ${data.session_id} started`);
      });
      socket.on('session_stopped', handleSessionStopped);
      
      // Authenticate WebSocket
      if (userProfile) {
        getAuthToken().then(token => {
          socket.emit('authenticate', { token });
        });
      }
    };
    document.head.appendChild(script);
  } catch (err) {
    console.error('[WS] Connection error:', err);
    updateConnectionStatus(false);
  }
}

function updateConnectionStatus(connected) {
  const dot = document.getElementById('connDot');
  const text = document.getElementById('connText');
  const btnConnect = document.getElementById('btnBLEConnect');
  const btnDisconnect = document.getElementById('btnBLEDisconnect');
  const bleDeviceName = document.getElementById('bleDeviceName');
  
  if (dot) {
    dot.classList.toggle('online', connected);
  }
  if (text) {
    if (connected && bleConnected && bleDevice) {
      text.textContent = bleDevice.name || 'BLE Connected';
    } else if (connected) {
      text.textContent = 'Connected';
    } else {
      text.textContent = 'Disconnected';
    }
  }
  // Toggle BLE buttons
  if (btnConnect) btnConnect.style.display = connected ? 'none' : '';
  if (btnDisconnect) btnDisconnect.style.display = connected ? '' : 'none';
  // Update settings page
  if (bleDeviceName && bleDevice && connected) {
    bleDeviceName.textContent = 'Connected to: ' + (bleDevice.name || 'Unknown device');
  } else if (bleDeviceName && !connected) {
    bleDeviceName.textContent = 'No device paired. Click "Connect Bat" in the navbar.';
  }
}

// ============================================
// SENSOR DATA HANDLER
// ============================================
function handleSensorData(data) {
  if (!recording) return;
  
  const metrics = data.metrics;
  const raw = data.raw;
  
  // Store data
  sessionData.push(data);
  if (sessionData.length > 600) sessionData.shift();
  
  // Track peaks
  if (metrics.speed_kmh > peakSpeed) peakSpeed = metrics.speed_kmh;
  if (metrics.power_watts > peakPower) peakPower = metrics.power_watts;
  if (metrics.backlift_deg > maxBackliftAngle) maxBackliftAngle = metrics.backlift_deg;
  
  // ---- Update KPIs ----
  updateKPI('speedValue', metrics.speed_kmh.toFixed(1), 'km/h');
  updateKPI('powerValue', metrics.power_watts.toFixed(0), 'W');
  
  // Speed badge
  if (metrics.speed_kmh > 80) updateBadge('speedBadge', 'ELITE', 'badge-excellent');
  else if (metrics.speed_kmh > 50) updateBadge('speedBadge', 'GREAT', 'badge-good');
  else if (metrics.speed_kmh > 25) updateBadge('speedBadge', 'GOOD', 'badge-warning');
  
  // ---- Update Gyro Bars ----
  const maxGyro = 8;
  setText('gxValue', raw.gx.toFixed(2));
  setText('gyValue', raw.gy.toFixed(2));
  setText('gzValue', raw.gz.toFixed(2));
  setWidth('gxBar', Math.min(Math.abs(raw.gx) / maxGyro * 100, 100) + '%');
  setWidth('gyBar', Math.min(Math.abs(raw.gy) / maxGyro * 100, 100) + '%');
  setWidth('gzBar', Math.min(Math.abs(raw.gz) / maxGyro * 100, 100) + '%');
  
  // ---- Update Backlift ----
  const bl = document.getElementById('backliftValue');
  if (bl) bl.innerHTML = metrics.backlift_deg.toFixed(0) + '<span style="font-size:0.7rem">°</span>';
  
  // ---- Update Shot Direction ----
  updateShotDirection(raw.gz, raw.gx);
  
  // ---- Update 3D Bat ----
  update3DBat(raw.gy, raw.gx, raw.gz, metrics.accel_g);
  
  // ---- Update Charts ----
  addChartData(speedChart, metrics.speed_kmh);
  addChartData(accelChart, metrics.accel_g);
}

function handleSwingDetected(data) {
  swingCount = data.count;
  addLog(`🏏 Swing #${data.count} — ${data.speed} km/h`);
}

function handleSessionStopped(analytics) {
  // Update final scores
  updateKPI('timingValue', analytics.timing_score, '/100');
  updateKPI('controlValue', analytics.control_score + '', '');
  
  // Timing badge
  if (analytics.timing_score > 80) updateBadge('timingBadge', 'EXCELLENT', 'badge-excellent');
  else if (analytics.timing_score > 60) updateBadge('timingBadge', 'GOOD', 'badge-good');
  else updateBadge('timingBadge', 'NEEDS WORK', 'badge-warning');
  
  // Control badge
  if (analytics.control_score > 80) updateBadge('controlBadge', 'STEADY', 'badge-excellent');
  else if (analytics.control_score > 60) updateBadge('controlBadge', 'OK', 'badge-good');
  else updateBadge('controlBadge', 'ERRATIC', 'badge-warning');
  
  // Metrics
  setText('sweetValue', analytics.sweet_spot_pct + '%');
  setText('followValue', analytics.follow_through_pct + '%');
  setText('accuracyValue', Math.round((analytics.timing_score + analytics.control_score) / 2) + '%');
  
  // Overall score
  updateScoreRing(analytics.overall_score);
  
  addLog(`📊 Session complete — Score: ${analytics.overall_score}/100`);
  addLog(`   Peak: ${analytics.peak_speed_kmh} km/h | Swings: ${analytics.swing_count}`);
}

// ============================================
// SESSION CONTROLS
// ============================================
async function startSession() {
  if (recording) return;
  
  recording = true;
  sessionData = [];
  swingCount = 0;
  maxBackliftAngle = 0;
  peakSpeed = 0;
  peakPower = 0;
  sessionStart = Date.now();
  
  // Reset charts
  resetChart(speedChart);
  resetChart(accelChart);
  resetBat3D();
  
  // Reset KPIs
  updateKPI('speedValue', '--', 'km/h');
  updateKPI('powerValue', '--', 'W');
  updateKPI('timingValue', '--', '/100');
  updateKPI('controlValue', '--', '');
  updateBadge('speedBadge', 'RECORDING', 'badge-good');
  updateBadge('powerBadge', 'RECORDING', 'badge-good');
  updateBadge('timingBadge', 'RECORDING', 'badge-good');
  updateBadge('controlBadge', 'RECORDING', 'badge-good');
  updateScoreRing(0);
  setText('sweetValue', '--%');
  setText('followValue', '--%');
  setText('accuracyValue', '--%');
  
  // Timer
  const timer = document.getElementById('sessionTimer');
  if (timer) timer.classList.add('recording');
  
  timerInterval = setInterval(() => {
    if (!sessionStart) return;
    const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');
    if (timer) timer.textContent = `${mins}:${secs}`;
  }, 1000);
  
  // Tell backend
  try {
    await apiCall('/api/session/start', {
      method: 'POST',
      body: JSON.stringify({ device_id: 'CRICPRO_BAT_001' })
    });
  } catch (err) {
    console.warn('Start session API call failed:', err);
  }
  
  addLog('▶ Session started — swing the bat!');
  showToast('Session started! 🏏', 'success');
}

async function stopSession() {
  if (!recording) return;
  
  recording = false;
  sessionStart = null;
  
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  
  const timer = document.getElementById('sessionTimer');
  if (timer) timer.classList.remove('recording');
  
  // Tell backend to compute analytics
  try {
    const result = await apiCall('/api/session/stop', { method: 'POST' });
    if (result.analytics) {
      handleSessionStopped(result.analytics);
    }
  } catch (err) {
    console.warn('Stop session API call failed:', err);
    addLog('⚠️ Could not save session analytics');
  }
  
  showToast('Session stopped — analyzing results...', 'info');
}

async function startDemoMode() {
  try {
    await fetch(`${BACKEND_URL}/api/demo/start`, { method: 'POST' });
    updateConnectionStatus(true);
    addLog('🎮 Demo mode started — simulating sensor data');
    showToast('Demo mode active! Press START to begin recording.', 'info');
  } catch (err) {
    showToast('Could not start demo — is the backend running?', 'error');
  }
}

// ============================================
// SESSION HISTORY
// ============================================
async function loadSessionHistory() {
  const container = document.getElementById('sessionsGrid');
  if (!container) return;
  
  try {
    const data = await apiCall('/api/sessions');
    const sessions = data.sessions || [];
    
    if (sessions.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1;">
          <div class="empty-state-icon">📊</div>
          <div class="empty-state-text">No sessions yet.<br>Start a session to see your history here.</div>
        </div>
      `;
      return;
    }
    
    container.innerHTML = sessions.map(s => `
      <div class="glass-card session-card" onclick="viewSession('${s.session_id}')">
        <div class="session-card-header">
          <div>
            <div class="session-card-date">${formatDate(s.started_at)}</div>
            <div class="session-card-id">#${s.session_id}</div>
          </div>
          <div class="session-card-score">${s.overall_score}</div>
        </div>
        <div class="session-card-stats">
          <div class="session-stat">
            <div class="session-stat-value">${s.peak_speed_kmh}</div>
            <div class="session-stat-label">Peak km/h</div>
          </div>
          <div class="session-stat">
            <div class="session-stat-value">${s.swing_count}</div>
            <div class="session-stat-label">Swings</div>
          </div>
          <div class="session-stat">
            <div class="session-stat-value">${s.duration_seconds}s</div>
            <div class="session-stat-label">Duration</div>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.warn('Failed to load sessions:', err);
  }
}

function viewSession(sessionId) {
  showToast(`Viewing session #${sessionId}`, 'info');
  // Could expand to a detailed view
}

// ============================================
// CHARTS
// ============================================
function initCharts() {
  const chartDefaults = {
    responsive: true,
    animation: false,
    interaction: { mode: 'nearest', intersect: false },
    plugins: { 
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(10,17,32,0.95)',
        borderColor: 'rgba(0,212,255,0.3)',
        borderWidth: 1,
        titleFont: { family: 'Orbitron', size: 10 },
        bodyFont: { family: 'Inter', size: 11 },
        padding: 10,
        cornerRadius: 8
      }
    },
    scales: {
      x: { display: false },
      y: {
        grid: { color: 'rgba(30,60,100,0.2)', drawBorder: false },
        ticks: { color: '#4a6a8a', font: { size: 9, family: 'Inter' } }
      }
    }
  };
  
  const speedCtx = document.getElementById('speedChart');
  if (speedCtx) {
    speedChart = new Chart(speedCtx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          data: [],
          borderColor: '#00d4ff',
          backgroundColor: createGradient(speedCtx, '#00d4ff'),
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: '#00d4ff'
        }]
      },
      options: {
        ...chartDefaults,
        scales: {
          ...chartDefaults.scales,
          y: { ...chartDefaults.scales.y, min: 0, max: 120, title: { display: true, text: 'km/h', color: '#4a6a8a', font: { size: 9 } } }
        }
      }
    });
  }
  
  const accelCtx = document.getElementById('accelChart');
  if (accelCtx) {
    accelChart = new Chart(accelCtx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          data: [],
          borderColor: '#ff6b00',
          backgroundColor: createGradient(accelCtx, '#ff6b00'),
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: '#ff6b00'
        }]
      },
      options: {
        ...chartDefaults,
        scales: {
          ...chartDefaults.scales,
          y: { ...chartDefaults.scales.y, min: 0, max: 15, title: { display: true, text: 'g-force', color: '#4a6a8a', font: { size: 9 } } }
        }
      }
    });
  }
}

function createGradient(canvas, color) {
  try {
    const ctx = canvas.getContext ? canvas.getContext('2d') : canvas;
    if (!ctx || !ctx.createLinearGradient) return color + '20';
    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, color + '40');
    gradient.addColorStop(1, color + '00');
    return gradient;
  } catch {
    return color + '20';
  }
}

function addChartData(chart, value) {
  if (!chart) return;
  chart.data.labels.push('');
  chart.data.datasets[0].data.push(value);
  if (chart.data.labels.length > 80) {
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }
  chart.update('none');
}

function resetChart(chart) {
  if (!chart) return;
  chart.data.labels = [];
  chart.data.datasets[0].data = [];
  chart.update();
}

// ============================================
// SHOT DIRECTION
// ============================================
function updateShotDirection(gz, gx) {
  const sectorLeg = document.getElementById('sectorLeg');
  const sectorOff = document.getElementById('sectorOff');
  const sectorStraight = document.getElementById('sectorStraight');
  const batDot = document.getElementById('batDot');
  const shotLabel = document.getElementById('shotLabel');
  
  if (!sectorLeg || !batDot) return;
  
  sectorLeg.classList.remove('active');
  sectorOff.classList.remove('active');
  sectorStraight.classList.remove('active');
  
  const mx = 50 + Math.tanh(gz) * 35;
  const my = 50 - Math.tanh(Math.abs(gx)) * 30;
  batDot.style.left = mx + '%';
  batDot.style.top = my + '%';
  
  if (gz > 1) {
    sectorLeg.classList.add('active');
    shotLabel.textContent = 'LEG SIDE';
    shotLabel.style.color = '#00d4ff';
  } else if (gz < -1) {
    sectorOff.classList.add('active');
    shotLabel.textContent = 'OFF SIDE';
    shotLabel.style.color = '#ff6b00';
  } else {
    sectorStraight.classList.add('active');
    shotLabel.textContent = 'STRAIGHT';
    shotLabel.style.color = '#00ff88';
  }
}

// ============================================
// SCORE RING
// ============================================
function updateScoreRing(score) {
  const ring = document.getElementById('scoreRing');
  const number = document.getElementById('scoreValue');
  const sublabel = document.getElementById('scoreSubLabel');
  
  if (ring) {
    const circumference = 2 * Math.PI * 60; // r=60
    const offset = circumference - (score / 100) * circumference;
    ring.style.strokeDashoffset = offset;
    
    // Color based on score
    if (score >= 80) ring.style.stroke = '#00ff88';
    else if (score >= 60) ring.style.stroke = '#00d4ff';
    else if (score >= 40) ring.style.stroke = '#ff6b00';
    else ring.style.stroke = '#ff2d55';
  }
  
  if (number) number.textContent = score;
  
  if (sublabel) {
    if (score >= 80) sublabel.textContent = 'EXCELLENT';
    else if (score >= 60) sublabel.textContent = 'GOOD FORM';
    else if (score >= 40) sublabel.textContent = 'NEEDS WORK';
    else if (score > 0) sublabel.textContent = 'KEEP PRACTICING';
    else sublabel.textContent = 'READY';
  }
}

// ============================================
// UI SETUP
// ============================================
function setupUI() {
  // Tab navigation
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      switchTab(target);
    });
  });
  
  // User dropdown
  const avatar = document.getElementById('userAvatar');
  const dropdown = document.getElementById('userDropdown');
  if (avatar && dropdown) {
    avatar.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });
    document.addEventListener('click', () => dropdown.classList.remove('open'));
  }
  
  // Button handlers
  document.getElementById('btnStart')?.addEventListener('click', startSession);
  document.getElementById('btnStop')?.addEventListener('click', stopSession);
  document.getElementById('btnDemo')?.addEventListener('click', startDemoMode);
  document.getElementById('btnLogout')?.addEventListener('click', logout);
}

function switchTab(tabName) {
  currentTab = tabName;
  
  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabName);
  });
  
  document.querySelectorAll('.tab-page').forEach(p => {
    p.classList.toggle('active', p.id === `tab-${tabName}`);
  });
  
  if (tabName === 'history') {
    loadSessionHistory();
  }
}

async function logout() {
  try {
    if (!isDemoMode && firebaseAuth) {
      await firebaseAuth.signOut();
    }
    localStorage.removeItem('cricpro_demo_user');
    window.location.href = '/';
  } catch (err) {
    console.error('Logout error:', err);
    window.location.href = '/';
  }
}

// ============================================
// LOG
// ============================================
function addLog(message) {
  const list = document.getElementById('logList');
  if (!list) return;
  
  const now = new Date();
  const time = String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0');
  
  const li = document.createElement('li');
  li.className = 'log-item';
  li.innerHTML = `<span class="log-time">${time}</span> ${message}`;
  list.insertBefore(li, list.firstChild);
  
  while (list.children.length > 30) list.removeChild(list.lastChild);
}

// ============================================
// UI HELPERS
// ============================================
function updateKPI(id, value, unit) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `${value}<span class="kpi-unit">${unit}</span>`;
}

function updateBadge(id, text, className) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
    el.className = 'badge ' + className;
  }
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setWidth(id, width) {
  const el = document.getElementById(id);
  if (el) el.style.width = width;
}

function formatDate(isoString) {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return isoString;
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

function createParticles() {
  const container = document.querySelector('.particles');
  if (!container) return;
  
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDuration = (10 + Math.random() * 20) + 's';
    p.style.animationDelay = Math.random() * 15 + 's';
    p.style.width = (1 + Math.random() * 2) + 'px';
    p.style.height = p.style.width;
    if (Math.random() > 0.6) p.style.background = '#ff6b00';
    container.appendChild(p);
  }
}
