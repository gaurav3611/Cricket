/*
 * MPU6050 I2C Diagnostic Test
 * Flash this first to verify your wiring before using BLE firmware.
 * 
 * WIRING (ESP32 → MPU6050):
 *   3.3V → VCC
 *   GND  → GND
 *   GPIO 21 → SDA
 *   GPIO 22 → SCL
 *   (AD0 → GND for address 0x68, or VCC for 0x69)
 */

#include <Wire.h>

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n============================");
  Serial.println("  MPU6050 I2C DIAGNOSTIC");
  Serial.println("============================\n");

  // ---------- STEP 1: I2C Bus Scan ----------
  Wire.begin(21, 22);  // SDA=21, SCL=22 (ESP32 default)
  Serial.println("[STEP 1] Scanning I2C bus...\n");

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
    Serial.println("  !! NO devices found !!");
    Serial.println("\n  CHECK YOUR WIRING:");
    Serial.println("  - SDA connected to GPIO 21?");
    Serial.println("  - SCL connected to GPIO 22?");
    Serial.println("  - VCC connected to 3.3V?");
    Serial.println("  - GND connected to GND?");
    Serial.println("  - Are solder joints good?");
    Serial.println("\n  Retrying every 3 seconds...\n");
  } else {
    Serial.print("\n  Total: ");
    Serial.print(found);
    Serial.println(" device(s)\n");
  }

  // ---------- STEP 2: Wake up MPU6050 ----------
  Serial.println("[STEP 2] Waking up MPU6050...");
  
  // Try address 0x68
  Wire.beginTransmission(0x68);
  Wire.write(0x6B);  // PWR_MGMT_1 register
  Wire.write(0x00);  // Wake up (clear sleep bit)
  byte err = Wire.endTransmission();

  if (err == 0) {
    Serial.println("  MPU6050 found at 0x68 ✓");
  } else {
    // Try address 0x69
    Wire.beginTransmission(0x69);
    Wire.write(0x6B);
    Wire.write(0x00);
    err = Wire.endTransmission();

    if (err == 0) {
      Serial.println("  MPU6050 found at 0x69 ✓");
      Serial.println("  (AD0 pin is HIGH)");
    } else {
      Serial.println("  !! MPU6050 NOT responding at 0x68 or 0x69 !!");
    }
  }

  // ---------- STEP 3: Read WHO_AM_I ----------
  Serial.println("\n[STEP 3] Reading WHO_AM_I register...");
  Wire.beginTransmission(0x68);
  Wire.write(0x75);  // WHO_AM_I register
  Wire.endTransmission(false);
  Wire.requestFrom((uint8_t)0x68, (uint8_t)1);

  if (Wire.available()) {
    byte whoami = Wire.read();
    Serial.print("  WHO_AM_I = 0x");
    Serial.println(whoami, HEX);

    if (whoami == 0x68) Serial.println("  → Confirmed: MPU6050 ✓");
    else if (whoami == 0x70) Serial.println("  → Confirmed: MPU6500 ✓");
    else if (whoami == 0x71) Serial.println("  → Confirmed: MPU9250 ✓");
    else Serial.println("  → Unknown sensor (may still work)");
  } else {
    Serial.println("  !! No response — check wiring !!");
  }

  Serial.println("\n============================");
  Serial.println("  READING RAW DATA...");
  Serial.println("  (values should change");
  Serial.println("   when you move the sensor)");
  Serial.println("============================\n");
}

void loop() {
  // Read 14 bytes starting from register 0x3B
  Wire.beginTransmission(0x68);
  Wire.write(0x3B);
  Wire.endTransmission(false);
  Wire.requestFrom((uint8_t)0x68, (uint8_t)14);

  if (Wire.available() >= 14) {
    int16_t ax = (Wire.read() << 8) | Wire.read();
    int16_t ay = (Wire.read() << 8) | Wire.read();
    int16_t az = (Wire.read() << 8) | Wire.read();
    int16_t temp_raw = (Wire.read() << 8) | Wire.read();
    int16_t gx = (Wire.read() << 8) | Wire.read();
    int16_t gy = (Wire.read() << 8) | Wire.read();
    int16_t gz = (Wire.read() << 8) | Wire.read();

    float temp_c = temp_raw / 340.0 + 36.53;

    Serial.print("AX="); Serial.print(ax);
    Serial.print(" AY="); Serial.print(ay);
    Serial.print(" AZ="); Serial.print(az);
    Serial.print(" | GX="); Serial.print(gx);
    Serial.print(" GY="); Serial.print(gy);
    Serial.print(" GZ="); Serial.print(gz);
    Serial.print(" | T="); Serial.print(temp_c, 1); Serial.println("°C");
  } else {
    Serial.println("!! READ FAILED — check wiring !!");
  }

  delay(200);  // 5 Hz for readable Serial output
}
