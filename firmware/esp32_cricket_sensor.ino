/*
 * SwingLab BLE Cricket Bat Sensor
 * ================================
 * Uses the EXACT same raw I2C register reads as mpu6050_test.ino
 * and sends data over BLE notifications.
 *
 * WIRING (ESP32 → MPU6050):
 *   3.3V → VCC
 *   GND  → GND
 *   GPIO 21 → SDA
 *   GPIO 22 → SCL
 *   (AD0 → GND for address 0x68)
 *
 * BLE DATA FORMAT (14 bytes, little-endian):
 *   int16[0] = ax   (raw accelerometer X)
 *   int16[1] = ay   (raw accelerometer Y)
 *   int16[2] = az   (raw accelerometer Z)
 *   int16[3] = gx   (raw gyroscope X)
 *   int16[4] = gy   (raw gyroscope Y)
 *   int16[5] = gz   (raw gyroscope Z)
 *   int16[6] = temp_raw  (raw temperature)
 */

#include <BLE2902.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <Wire.h>

// MPU6050 I2C address
#define MPU_ADDR 0x68

// BLE UUIDs (match frontend bluetooth.js)
#define SERVICE_UUID "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define SENSOR_CHAR_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// BLE globals
BLEServer *pServer = NULL;
BLECharacteristic *pChar = NULL;
bool deviceConnected = false;
bool oldConnected = false;
unsigned long lastSend = 0;

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
// SETUP
// ============================================
void setup() {
  Serial.begin(115200);
  pinMode(2, OUTPUT);
  delay(1000);

  Serial.println("\n============================");
  Serial.println("  SwingLab BLE Sensor");
  Serial.println("============================\n");

  // === STEP 1: I2C Bus Scan (same as test) ===
  Wire.begin(21, 22); // SDA=21, SCL=22
  Serial.println("[STEP 1] Scanning I2C bus...\n");

  int found = 0;
  for (byte addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.print("  FOUND device at 0x");
      if (addr < 16)
        Serial.print("0");
      Serial.println(addr, HEX);
      found++;
    }
  }

  if (found == 0) {
    Serial.println("  !! NO devices found !!");
    Serial.println("\n  CHECK YOUR WIRING:");
    Serial.println("  - SDA connected to GPIO 21?");
    Serial.println("  - SCL connected to GPIO 22?");
    Serial.println("  - VCC connected to 3.3V?");
    Serial.println("  - GND connected to GND?");
    Serial.println("  - Are solder joints good?");
    Serial.println("\n  Halting. Fix wiring and reset.\n");
    while (1) {
      digitalWrite(2, (millis() / 200) % 2); // Fast blink = error
      delay(10);
    }
  } else {
    Serial.print("\n  Total: ");
    Serial.print(found);
    Serial.println(" device(s)\n");
  }

  // === STEP 2: Wake up MPU6050 (same as test) ===
  Serial.println("[STEP 2] Waking up MPU6050...");

  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B); // PWR_MGMT_1 register
  Wire.write(0x00); // Wake up (clear sleep bit)
  byte err = Wire.endTransmission();

  if (err == 0) {
    Serial.println("  MPU6050 found at 0x68 ✓");
  } else {
    Serial.println("  !! MPU6050 NOT responding at 0x68 !!");
    Serial.println("  Halting. Fix wiring and reset.\n");
    while (1) {
      digitalWrite(2, (millis() / 200) % 2);
      delay(10);
    }
  }

  // === STEP 3: Read WHO_AM_I (same as test) ===
  Serial.println("\n[STEP 3] Reading WHO_AM_I register...");
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x75); // WHO_AM_I register
  Wire.endTransmission(false);
  Wire.requestFrom((uint8_t)MPU_ADDR, (uint8_t)1);

  if (Wire.available()) {
    byte whoami = Wire.read();
    Serial.print("  WHO_AM_I = 0x");
    Serial.println(whoami, HEX);

    if (whoami == 0x68)
      Serial.println("  → Confirmed: MPU6050 ✓");
    else if (whoami == 0x70)
      Serial.println("  → Confirmed: MPU6500 ✓");
    else if (whoami == 0x71)
      Serial.println("  → Confirmed: MPU9250 ✓");
    else
      Serial.println("  → Unknown sensor (may still work)");
  } else {
    Serial.println("  !! No response — check wiring !!");
  }

  // === STEP 4: Verify sensor reads before BLE ===
  Serial.println("\n[STEP 4] Test reading sensor data...");
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
    float temp_c = temp_raw / 340.0 + 36.53;

    Serial.print("  AX=");
    Serial.print(ax);
    Serial.print(" AY=");
    Serial.print(ay);
    Serial.print(" AZ=");
    Serial.print(az);
    Serial.print(" | GX=");
    Serial.print(gx);
    Serial.print(" GY=");
    Serial.print(gy);
    Serial.print(" GZ=");
    Serial.print(gz);
    Serial.print(" | T=");
    Serial.print(temp_c, 1);
    Serial.println("°C");
    Serial.println("  Sensor data OK ✓");
  } else {
    Serial.println("  !! Sensor read failed !!");
  }

  // === STEP 5: Initialize BLE ===
  Serial.println("\n[STEP 5] Starting BLE...");

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
  Serial.println("  READY! Waiting for BLE...");
  Serial.println("============================\n");
}

// ============================================
// LOOP
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

  // Blink LED when waiting for connection
  if (!deviceConnected) {
    digitalWrite(2, (millis() / 500) % 2);
    return;
  }

  // === Send sensor data at ~50Hz (every 20ms) ===
  if (millis() - lastSend >= 20) {
    lastSend = millis();

    // Read 14 bytes starting from register 0x3B (EXACT same as test)
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

      // Pack into BLE payload: 7 int16 values = 14 bytes
      // Order: ax, ay, az, gx, gy, gz, temp_raw
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
