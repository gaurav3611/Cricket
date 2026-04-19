/*
 * SwingLab BLE Cricket Bat Sensor — v3.0
 * ========================================
 * MPU6050 + ESP32 with:
 *   - Gyro range: ±2000°/s (for fast cricket swings)
 *   - Accel range: ±8g (for impact detection)
 *   - Gyro calibration at startup (removes offset drift)
 *   - Digital Low-Pass Filter (reduces vibration noise)
 *   - 50Hz BLE notification rate
 *
 * WIRING (ESP32 → MPU6050):
 *   3.3V → VCC
 *   GND  → GND
 *   GPIO 21 → SDA
 *   GPIO 22 → SCL
 *   (AD0 → GND for address 0x68)
 *
 * BLE DATA FORMAT (14 bytes, little-endian int16):
 *   [0-1]  ax  (raw accel X, divide by 4096  → g)
 *   [2-3]  ay  (raw accel Y, divide by 4096  → g)
 *   [4-5]  az  (raw accel Z, divide by 4096  → g)
 *   [6-7]  gx  (calibrated gyro X, divide by 16.4 → °/s)
 *   [8-9]  gy  (calibrated gyro Y, divide by 16.4 → °/s)
 *   [10-11] gz (calibrated gyro Z, divide by 16.4 → °/s)
 *   [12-13] temp_raw
 */

#include <BLE2902.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <Wire.h>

#define MPU_ADDR 0x68

#define SERVICE_UUID "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define SENSOR_CHAR_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

BLEServer *pServer = NULL;
BLECharacteristic *pChar = NULL;
bool deviceConnected = false;
bool oldConnected = false;
unsigned long lastSend = 0;

// Gyro calibration offsets (computed at startup)
int16_t gx_offset = 0;
int16_t gy_offset = 0;
int16_t gz_offset = 0;

// ============================================
// BLE CALLBACKS
// ============================================
class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *s) {
    deviceConnected = true;
    Serial.println("BLE CONNECTED!");
    digitalWrite(2, HIGH);
  }
  void onDisconnect(BLEServer *s) {
    deviceConnected = false;
    Serial.println("BLE DISCONNECTED");
    digitalWrite(2, LOW);
  }
};

// ============================================
// MPU6050 REGISTER WRITE HELPER
// ============================================
void writeRegister(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.write(val);
  Wire.endTransmission();
}

// ============================================
// GYRO CALIBRATION — MUST KEEP BAT STILL
// ============================================
void calibrateGyro() {
  Serial.println("\n[CAL] Calibrating gyroscope...");
  Serial.println("  >> KEEP THE BAT COMPLETELY STILL! <<");
  
  // Blink LED fast during calibration
  long sumGX = 0, sumGY = 0, sumGZ = 0;
  int samples = 500;
  
  for (int i = 0; i < samples; i++) {
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(0x43);  // GYRO_XOUT_H register
    Wire.endTransmission(false);
    Wire.requestFrom((uint8_t)MPU_ADDR, (uint8_t)6);
    
    if (Wire.available() >= 6) {
      int16_t gx = (Wire.read() << 8) | Wire.read();
      int16_t gy = (Wire.read() << 8) | Wire.read();
      int16_t gz = (Wire.read() << 8) | Wire.read();
      sumGX += gx;
      sumGY += gy;
      sumGZ += gz;
    }
    
    // Blink during calibration
    digitalWrite(2, (i / 50) % 2);
    delay(4);  // ~2 seconds total
  }
  
  gx_offset = sumGX / samples;
  gy_offset = sumGY / samples;
  gz_offset = sumGZ / samples;
  
  Serial.print("  Offsets: GX=");
  Serial.print(gx_offset);
  Serial.print(" GY=");
  Serial.print(gy_offset);
  Serial.print(" GZ=");
  Serial.println(gz_offset);
  Serial.println("  Calibration complete ✓\n");
  
  digitalWrite(2, LOW);
}

// ============================================
// SETUP
// ============================================
void setup() {
  Serial.begin(115200);
  pinMode(2, OUTPUT);
  delay(1000);

  Serial.println("\n============================");
  Serial.println("  SwingLab BLE Sensor v3.0");
  Serial.println("============================\n");

  // --- I2C Bus Scan ---
  Wire.begin(21, 22);
  Serial.println("[1] Scanning I2C bus...");

  int found = 0;
  for (byte addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.print("  FOUND device at 0x");
      if (addr < 16) Serial.print("0");
      Serial.println(addr, HEX);
      found++;
    }
  }

  if (found == 0) {
    Serial.println("  !! NO I2C devices found — check wiring !!");
    while (1) { digitalWrite(2, (millis() / 200) % 2); delay(10); }
  }

  // --- Wake up MPU6050 ---
  Serial.println("\n[2] Configuring MPU6050...");
  
  writeRegister(0x6B, 0x00);   // PWR_MGMT_1: Wake up
  delay(100);
  
  // Verify WHO_AM_I
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x75);
  Wire.endTransmission(false);
  Wire.requestFrom((uint8_t)MPU_ADDR, (uint8_t)1);
  if (Wire.available()) {
    byte id = Wire.read();
    Serial.print("  WHO_AM_I = 0x");
    Serial.print(id, HEX);
    if (id == 0x68) Serial.println(" → MPU6050 ✓");
    else if (id == 0x70) Serial.println(" → MPU6500 ✓");
    else Serial.println(" → Unknown (may work)");
  }
  
  // --- Configure sensor ranges ---
  // Gyro: ±2000°/s (register 0x1B, FS_SEL=3)
  // Sensitivity = 16.4 LSB/(°/s)
  writeRegister(0x1B, 0x18);
  Serial.println("  Gyro: ±2000°/s ✓");
  
  // Accel: ±8g (register 0x1C, AFS_SEL=2)
  // Sensitivity = 4096 LSB/g
  writeRegister(0x1C, 0x10);
  Serial.println("  Accel: ±8g ✓");
  
  // DLPF: 42Hz bandwidth (reduce vibration noise)
  // Register 0x1A, DLPF_CFG=3
  writeRegister(0x1A, 0x03);
  Serial.println("  DLPF: 42Hz bandwidth ✓");
  
  // Sample rate: 200Hz (SMPLRT_DIV = 4 → 1000/5 = 200Hz)
  writeRegister(0x19, 0x04);
  Serial.println("  Sample rate: 200Hz ✓");
  
  // --- Calibrate gyroscope ---
  calibrateGyro();

  // --- Test read ---
  Serial.println("[3] Test sensor read...");
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  Wire.endTransmission(false);
  Wire.requestFrom((uint8_t)MPU_ADDR, (uint8_t)14);

  if (Wire.available() >= 14) {
    int16_t ax = (Wire.read() << 8) | Wire.read();
    int16_t ay = (Wire.read() << 8) | Wire.read();
    int16_t az = (Wire.read() << 8) | Wire.read();
    int16_t temp_raw = (Wire.read() << 8) | Wire.read();
    int16_t gx = (Wire.read() << 8) | Wire.read();
    int16_t gy = (Wire.read() << 8) | Wire.read();
    int16_t gz = (Wire.read() << 8) | Wire.read();
    
    Serial.print("  A: ");
    Serial.print(ax/4096.0, 2); Serial.print("g, ");
    Serial.print(ay/4096.0, 2); Serial.print("g, ");
    Serial.print(az/4096.0, 2); Serial.println("g");
    Serial.print("  G: ");
    Serial.print((gx - gx_offset)/16.4, 1); Serial.print("°/s, ");
    Serial.print((gy - gy_offset)/16.4, 1); Serial.print("°/s, ");
    Serial.print((gz - gz_offset)/16.4, 1); Serial.println("°/s");
    Serial.println("  Sensor OK ✓");
  }

  // --- Initialize BLE ---
  Serial.println("\n[4] Starting BLE...");

  BLEDevice::init("SwingLab-Bat");
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *svc = pServer->createService(SERVICE_UUID);

  pChar = svc->createCharacteristic(SENSOR_CHAR_UUID,
                                    BLECharacteristic::PROPERTY_READ |
                                        BLECharacteristic::PROPERTY_NOTIFY);
  pChar->addDescriptor(new BLE2902());
  svc->start();

  BLEAdvertising *adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->setScanResponse(true);
  adv->setMinPreferred(0x06);
  BLEDevice::startAdvertising();

  Serial.println("  BLE advertising as: SwingLab-Bat");
  Serial.println("\n============================");
  Serial.println("  READY! Connect via app.");
  Serial.println("============================\n");
}

// ============================================
// LOOP — 50Hz BLE notifications
// ============================================
void loop() {
  // Handle BLE reconnect
  if (!deviceConnected && oldConnected) {
    delay(500);
    pServer->startAdvertising();
    Serial.println("Re-advertising...");
    oldConnected = false;
  }
  if (deviceConnected && !oldConnected) {
    oldConnected = true;
  }

  // Blink when waiting
  if (!deviceConnected) {
    digitalWrite(2, (millis() / 500) % 2);
    return;
  }

  // Send at 50Hz (every 20ms)
  if (millis() - lastSend >= 20) {
    lastSend = millis();

    Wire.beginTransmission(MPU_ADDR);
    Wire.write(0x3B);
    Wire.endTransmission(false);
    Wire.requestFrom((uint8_t)MPU_ADDR, (uint8_t)14);

    if (Wire.available() >= 14) {
      int16_t ax = (Wire.read() << 8) | Wire.read();
      int16_t ay = (Wire.read() << 8) | Wire.read();
      int16_t az = (Wire.read() << 8) | Wire.read();
      int16_t temp_raw = (Wire.read() << 8) | Wire.read();
      int16_t gx = (Wire.read() << 8) | Wire.read();
      int16_t gy = (Wire.read() << 8) | Wire.read();
      int16_t gz = (Wire.read() << 8) | Wire.read();

      // Apply gyro calibration offset
      gx -= gx_offset;
      gy -= gy_offset;
      gz -= gz_offset;

      // Pack BLE payload: ax, ay, az, gx, gy, gz, temp
      int16_t data[7];
      data[0] = ax;
      data[1] = ay;
      data[2] = az;
      data[3] = gx;
      data[4] = gy;
      data[5] = gz;
      data[6] = temp_raw;

      pChar->setValue((uint8_t *)data, 14);
      pChar->notify();
    }
  }
}
