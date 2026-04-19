# 🏏 SwingLab — Cricket Swing Analytics Dashboard

A real-time cricket swing analytics platform with 3D visualization, shot tracking, and performance insights.

## 🎯 Features

- **Real-Time Speed Tracking** — Live bat speed monitoring with dynamic charts
- **3D Batsman Visualization** — Interactive 3D model with swing animation
- **Shot-by-Shot Analysis** — Individual shot recording with accuracy, direction & control scores
- **Shot History** — Persistent shot log with detailed metrics and speed graphs
- **User Authentication** — Secure login with Firebase (Email + Google Sign-In)
- **Demo Mode** — Full dashboard experience without any setup

## 🚀 Getting Started

### Prerequisites

- Python 3.9+
- Firebase project with Authentication enabled

### Setup

```bash
# Install dependencies
cd backend
pip install -r requirements.txt

# Configure environment
cp .env.example .env

# Run the server
python app.py
```

Open `http://localhost:5050` in your browser.

### Demo Mode

1. Register or login with any email
2. Click **🎮 Start Demo** on the dashboard
3. Click **START SHOT** → watch live data → **STOP & SAVE SHOT**
4. View shot history and analytics on the home page

## 🌐 Deployment (Vercel)

The project is configured for Vercel deployment:

```bash
# Deploy via Vercel CLI
npx vercel --prod
```

Or connect your GitHub repo to Vercel for automatic deployments on push.

### Environment Variables (Vercel)

| Variable | Description |
|----------|-------------|
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Path to Firebase service account JSON |
| `FLASK_SECRET_KEY` | Secret key for Flask sessions |

## 🛠️ Tech Stack

- **Frontend**: HTML5, CSS3, JavaScript, Chart.js, Three.js
- **Backend**: Python, Flask, Flask-SocketIO
- **Database**: Firebase Firestore
- **Auth**: Firebase Authentication (Email + Google)
- **Deployment**: Vercel
