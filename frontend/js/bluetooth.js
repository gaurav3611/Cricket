/**
 * =====================================================
 * CricPro - Web Bluetooth Connection Module
 * =====================================================
 * Connects directly to the ESP32 BLE sensor from the
 * browser using the Web Bluetooth API.
 * 
 * No WiFi or backend needed for real-time data!
 * Data flows: ESP32 -> BLE -> Browser -> Dashboard
 */

// ============================================
// BLE CONFIGURATION (must match ESP32 firmware)
// ============================================
const BLE_SERVICE_UUID  = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const BLE_SENSOR_UUID   = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';
const BLE_STATUS_UUID   = 'd1a7a08c-2f4e-4f6b-9e3d-5c8a1b2e3f40';

// ============================================
// STATE
// ============================================
let bleDevice = null;
let bleServer = null;
let bleSensorChar = null;
let bleStatusChar = null;
let bleConnected = false;

// ============================================
// CHECK SUPPORT
// ============================================
function isBLESupported() {
  return navigator.bluetooth !== undefined;
}

// ============================================
// CONNECT TO ESP32 VIA BLE
// ============================================
async function connectBLE() {
  if (!isBLESupported()) {
    showToast('Web Bluetooth is not supported in this browser. Use Chrome or Edge.', 'error');
    return false;
  }
  
  try {
    addLog('Searching for SwingLab bat sensor...');
    
    // Request device - user will see a pairing dialog
    bleDevice = await navigator.bluetooth.requestDevice({
      filters: [
        { namePrefix: 'SwingLab' },
        { services: [BLE_SERVICE_UUID] }
      ],
      optionalServices: [BLE_SERVICE_UUID]
    });
    
    addLog('Found: ' + bleDevice.name);
    
    // Listen for disconnection
    bleDevice.addEventListener('gattserverdisconnected', onBLEDisconnected);
    
    // Connect to GATT server
    addLog('Connecting to BLE GATT server...');
    bleServer = await bleDevice.gatt.connect();
    
    // Get the sensor service
    const service = await bleServer.getPrimaryService(BLE_SERVICE_UUID);
    
    // Get sensor data characteristic
    bleSensorChar = await service.getCharacteristic(BLE_SENSOR_UUID);
    
    // Get status characteristic
    try {
      bleStatusChar = await service.getCharacteristic(BLE_STATUS_UUID);
    } catch (e) {
      console.warn('[BLE] Status characteristic not found:', e);
    }
    
    // Subscribe to sensor data notifications
    await bleSensorChar.startNotifications();
    bleSensorChar.addEventListener('characteristicvaluechanged', onSensorData);
    
    // Update UI
    bleConnected = true;
    updateConnectionStatus(true);
    addLog('Connected to ' + bleDevice.name + ' via Bluetooth!');
    showToast('Connected to ' + bleDevice.name, 'success');
    
    return true;
    
  } catch (error) {
    if (error.name === 'NotFoundError') {
      addLog('No SwingLab device found. Make sure the bat sensor is powered on.');
      showToast('No device found. Power on the bat sensor and try again.', 'error');
    } else if (error.name === 'SecurityError') {
      addLog('Bluetooth permission denied.');
      showToast('Please allow Bluetooth access.', 'error');
    } else {
      addLog('BLE error: ' + error.message);
      showToast('Connection failed: ' + error.message, 'error');
    }
    console.error('[BLE] Connection error:', error);
    return false;
  }
}

// ============================================
// DISCONNECT
// ============================================
function disconnectBLE() {
  if (bleDevice && bleDevice.gatt.connected) {
    bleDevice.gatt.disconnect();
  }
  bleConnected = false;
  updateConnectionStatus(false);
  addLog('Bluetooth disconnected.');
}

// ============================================
// DISCONNECTION HANDLER
// ============================================
function onBLEDisconnected(event) {
  bleConnected = false;
  updateConnectionStatus(false);
  addLog('Bluetooth connection lost. Power on sensor and reconnect.');
  showToast('Bluetooth disconnected', 'error');
  
  // Cleanup
  bleSensorChar = null;
  bleStatusChar = null;
  bleServer = null;
}

// ============================================
// SENSOR DATA HANDLER
// ============================================
function onSensorData(event) {
  /*
   * Binary data format from ESP32 (14 bytes, raw MPU6050 registers):
   * 
   * int16[0] = ax   (raw, divide by 16384 for g at ±2g)
   * int16[1] = ay   (raw, divide by 16384 for g at ±2g)
   * int16[2] = az   (raw, divide by 16384 for g at ±2g)
   * int16[3] = gx   (raw, divide by 131 for °/s at ±250°/s)
   * int16[4] = gy   (raw, divide by 131 for °/s at ±250°/s)
   * int16[5] = gz   (raw, divide by 131 for °/s at ±250°/s)
   * int16[6] = temp_raw (temp = raw/340 + 36.53)
   */
  
  const dataView = event.target.value;
  
  if (dataView.byteLength < 14) return;
  
  // Parse raw int16 values (little-endian)
  const rawAx = dataView.getInt16(0, true);
  const rawAy = dataView.getInt16(2, true);
  const rawAz = dataView.getInt16(4, true);
  const rawGx = dataView.getInt16(6, true);
  const rawGy = dataView.getInt16(8, true);
  const rawGz = dataView.getInt16(10, true);
  const rawTemp = dataView.getInt16(12, true);
  
  // Convert to physical units using MPU6050 default sensitivity
  // Accel: ±2g range → 16384 LSB/g → divide by 16384 for g-force
  // Gyro:  ±250°/s range → 131 LSB/(°/s) → divide by 131 for °/s
  const ax = rawAx / 16384.0;  // g-force
  const ay = rawAy / 16384.0;
  const az = rawAz / 16384.0;
  const gx = rawGx / 131.0;    // degrees per second
  const gy = rawGy / 131.0;
  const gz = rawGz / 131.0;
  const tempC = rawTemp / 340.0 + 36.53;
  
  // Compute metrics
  const accelMagnitude = Math.sqrt(ax*ax + ay*ay + az*az);
  const angularVelocity = Math.sqrt(gx*gx + gy*gy + gz*gz);
  const batSpeedMps = angularVelocity * 0.85 * (Math.PI / 180);
  const batSpeedKmh = batSpeedMps * 3.6;
  const force = 1.2 * accelMagnitude * 9.81;
  const power = force * batSpeedMps;
  const backliftDeg = Math.abs(gx) * 15;
  
  let shotDirection = 'straight';
  if (gz > 1) shotDirection = 'leg';
  else if (gz < -1) shotDirection = 'off';
  
  // Build processed data object (same format as WebSocket)
  const data = {
    device_id: bleDevice ? bleDevice.name : 'BLE',
    timestamp: Date.now() / 1000,
    raw: { ax, ay, az, gx, gy, gz, temp: tempC },
    metrics: {
      speed_kmh: Math.round(batSpeedKmh * 10) / 10,
      power_watts: Math.round(power * 10) / 10,
      accel_g: Math.round(accelMagnitude * 100) / 100,
      backlift_deg: Math.round(backliftDeg * 10) / 10,
      shot_direction: shotDirection,
      impact_detected: accelMagnitude > 3.0,
      angular_velocity: Math.round(angularVelocity * 100) / 100
    }
  };
  
  // Feed into the same handler as WebSocket data
  handleSensorData(data);
}

// ============================================
// RECONNECT HELPER
// ============================================
async function reconnectBLE() {
  if (bleDevice) {
    try {
      addLog('Reconnecting to ' + bleDevice.name + '...');
      bleServer = await bleDevice.gatt.connect();
      
      const service = await bleServer.getPrimaryService(BLE_SERVICE_UUID);
      bleSensorChar = await service.getCharacteristic(BLE_SENSOR_UUID);
      
      await bleSensorChar.startNotifications();
      bleSensorChar.addEventListener('characteristicvaluechanged', onSensorData);
      
      bleConnected = true;
      updateConnectionStatus(true);
      addLog('Reconnected!');
      showToast('Reconnected to ' + bleDevice.name, 'success');
    } catch (error) {
      addLog('Reconnect failed: ' + error.message);
      showToast('Reconnect failed', 'error');
    }
  } else {
    // No previous device, do fresh scan
    await connectBLE();
  }
}
