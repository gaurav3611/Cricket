# 🏏 CricPro — Cricket Bat Swing Analyzer

A professional-grade cricket bat swing analyzer that uses an ESP32 microcontroller with MPU6050 motion sensor to track bat speed, power, timing, and technique in real-time.

## 🎯 Features

- **Real-Time Bat Speed** — Measures swing velocity up to 150+ km/h
- **3D Bat Visualization** — Live 3D model responds to sensor data
- **Shot Direction Analysis** — Detects leg side, off side, and straight drives
- **Session Recording** — Save and review training sessions
- **User Authentication** — Secure login with Firebase Auth
- **Cloud Storage** — Session data stored in Firebase Firestore
- **Demo Mode** — Test the dashboard without hardware

## 📁 Project Structure

```
Swing_LAB/
├── firmware/                    # ESP32 Arduino code
│   └── esp32_cricket_sensor.ino
├── backend/                     # Python Flask server
│   ├── app.py                   # Main server
│   ├── firebase_config.py       # Firebase Admin setup
│   ├── requirements.txt         # Python dependencies
│   └── .env.example             # Environment variables template
├── frontend/                    # Web dashboard
│   ├── index.html               # Landing page + auth
│   ├── dashboard.html           # Live dashboard
│   ├── css/
│   │   ├── main.css             # Shared design system
│   │   ├── auth.css             # Auth page styles
│   │   └── dashboard.css        # Dashboard styles
│   └── js/
│       ├── firebase-config.js   # Firebase client config
│       ├── auth.js              # Auth logic
│       ├── dashboard.js         # Dashboard controller
│       └── three-bat.js         # 3D bat visualization
└── README.md
```

## 🚀 Quick Start

### 1. Set Up Firebase (Required for production, optional for demo)

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project
3. Enable **Authentication** → Email/Password
4. Enable **Firestore Database**
5. Go to **Project Settings** → **Service Accounts** → Generate private key
6. Save the JSON file as `backend/serviceAccountKey.json`
7. Go to **Project Settings** → **General** → Your apps → Web app
8. Copy the config and paste into `frontend/js/firebase-config.js`

### 2. Start the Backend

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Copy and edit env file
cp .env.example .env

# Run the server
python app.py
```

The server will start at `http://localhost:5000`

### 3. Open the Dashboard

Open `http://localhost:5000` in your browser. You'll see the login page.

### 4. Demo Mode (No Hardware)

1. Register or login (use any email in demo mode)
2. Click the **🎮 DEMO** button on the dashboard
3. Press **▶ START SESSION** to begin recording
4. Watch the simulated data flow into the dashboard

### 5. ESP32 Hardware Setup

#### Hardware Required:
- ESP32 Dev Board
- MPU6050 Accelerometer/Gyroscope module
- Jumper wires
- Cricket bat 🏏

#### Wiring:
| MPU6050 Pin | ESP32 Pin |
|-------------|-----------|
| VCC         | 3.3V      |
| GND         | GND       |
| SDA         | GPIO 21   |
| SCL         | GPIO 22   |

#### Upload Firmware:
1. Open `firmware/esp32_cricket_sensor.ino` in Arduino IDE
2. Install required libraries:
   - `ArduinoJson` (by Benoit Blanchon)
   - `WiFi` (built-in for ESP32)
3. Edit WiFi credentials and backend IP in the code
4. Select board: "ESP32 Dev Module"
5. Upload

## 🌐 Deployment

### Deploy Backend (e.g., Railway, Render, or VPS)

```bash
# Using gunicorn for production
pip install gunicorn eventlet
gunicorn --worker-class eventlet -w 1 app:app --bind 0.0.0.0:5000
```

### Custom Domain

1. Point your domain to the server IP
2. Set up nginx as reverse proxy
3. Configure SSL with Let's Encrypt

### Environment Variables

| Variable | Description |
|----------|-------------|
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Path to Firebase service account JSON |
| `FLASK_SECRET_KEY` | Secret key for Flask sessions |
| `PORT` | Server port (default: 5000) |

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | `/api/sensor-data` | Receive ESP32 sensor data |
| GET    | `/api/esp32/status` | Check connected devices |
| POST   | `/api/session/start` | Start recording session |
| POST   | `/api/session/stop` | Stop and analyze session |
| GET    | `/api/sessions` | Get session history |
| GET    | `/api/profile` | Get user profile |
| PUT    | `/api/profile` | Update user profile |
| POST   | `/api/demo/start` | Start demo simulation |
| GET    | `/api/health` | Health check |

## 🛠️ Tech Stack

- **Frontend**: HTML5, CSS3, JavaScript, Chart.js, Three.js
- **Backend**: Python, Flask, Flask-SocketIO
- **Database**: Firebase Firestore
- **Auth**: Firebase Authentication
- **Hardware**: ESP32 + MPU6050
- **Real-time**: WebSocket (Socket.IO)

