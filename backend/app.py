"""
=====================================================
CricPro — Python Backend Server
=====================================================

Flask + Socket.IO backend that:
1. Receives sensor data from ESP32 via HTTP POST
2. Broadcasts real-time data to dashboard via WebSocket
3. Handles user authentication via Firebase
4. Stores session data in Firebase Firestore
5. Provides REST API for session history

Run: python app.py
"""

import os
import math
import time
import uuid
from datetime import datetime, timezone
from functools import wraps

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from dotenv import load_dotenv

from firebase_config import (
    initialize_firebase,
    get_firestore_client,
    verify_firebase_token,
    get_user_info
)

# ============================================
# APP INITIALIZATION
# ============================================
load_dotenv()

app = Flask(__name__, static_folder='../frontend', static_url_path='')
app.config['SECRET_KEY'] = os.getenv('FLASK_SECRET_KEY', 'cricpro-secret-key-change-me')

CORS(app, resources={"/api/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Initialize Firebase
firebase_app = initialize_firebase()
db = get_firestore_client()

# ============================================
# IN-MEMORY STATE
# ============================================
active_sessions = {}       # uid -> session data
connected_clients = {}     # sid -> uid
live_sensor_buffer = {}    # device_id -> latest data
demo_mode = db is None     # Run without Firebase if no credentials


# ============================================
# AUTH DECORATOR
# ============================================
def require_auth(f):
    """Decorator to require Firebase authentication on API routes."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if demo_mode:
            # In demo mode, use a fake UID
            request.uid = 'demo-user'
            return f(*args, **kwargs)
        
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Missing authorization token'}), 401
        
        token = auth_header.split('Bearer ')[1]
        decoded = verify_firebase_token(token)
        if not decoded:
            return jsonify({'error': 'Invalid or expired token'}), 401
        
        request.uid = decoded['uid']
        return f(*args, **kwargs)
    return decorated


# ============================================
# STATIC FILE SERVING
# ============================================
@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')


@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(app.static_folder, path)


# ============================================
# ESP32 SENSOR DATA ENDPOINT
# ============================================
@app.route('/api/sensor-data', methods=['POST'])
def receive_sensor_data():
    """
    Receive sensor data from ESP32.
    Expected JSON: { device_id, ax, ay, az, gx, gy, gz, ts }
    """
    try:
        data = request.get_json(force=True)
        
        if not data:
            return jsonify({'error': 'No data received'}), 400
        
        device_id = data.get('device_id', 'unknown')
        
        # Extract raw sensor values
        ax = float(data.get('ax', 0))
        ay = float(data.get('ay', 0))
        az = float(data.get('az', 0))
        gx = float(data.get('gx', 0))
        gy = float(data.get('gy', 0))
        gz = float(data.get('gz', 0))
        
        # ---- Compute derived metrics ----
        
        # Total acceleration magnitude (g-force)
        accel_magnitude = math.sqrt(ax**2 + ay**2 + az**2)
        
        # Bat speed estimation (from gyroscope angular velocity)
        angular_velocity = math.sqrt(gx**2 + gy**2 + gz**2)
        
        # Dead zone: filter out gyro noise below 10°/s
        if angular_velocity < 10:
            angular_velocity = 0
            
        # Convert to bat tip speed: v = ω (rad/s) × bat_length (m)
        # Effective bat radius from handle sensor to sweet spot ≈ 0.55m
        bat_speed_mps = angular_velocity * (math.pi / 180) * 0.55  # Convert °/s to rad/s
        bat_speed_kmh = bat_speed_mps * 3.6
        
        # Cap at realistic maximum (even pro batsmen rarely exceed 160 km/h)
        bat_speed_kmh = min(bat_speed_kmh, 160.0)
        
        # Power estimation (simplified: Force × Velocity)
        # Force ≈ mass × acceleration, using bat mass ~1.2kg
        force = 1.2 * accel_magnitude * 9.81  # Convert g to m/s²
        power = force * bat_speed_mps
        
        # Backlift angle estimation (from gyro X)
        backlift_angle = abs(gx) * 15
        
        # Impact detection
        impact_detected = accel_magnitude > 3.0
        
        # Shot direction from gyro Z
        if gz > 1:
            shot_direction = 'leg'
        elif gz < -1:
            shot_direction = 'off'
        else:
            shot_direction = 'straight'
        
        # Build processed data packet
        processed = {
            'device_id': device_id,
            'timestamp': time.time(),
            'raw': {'ax': ax, 'ay': ay, 'az': az, 'gx': gx, 'gy': gy, 'gz': gz},
            'metrics': {
                'speed_kmh': round(bat_speed_kmh, 1),
                'power_watts': round(power, 1),
                'accel_g': round(accel_magnitude, 2),
                'backlift_deg': round(backlift_angle, 1),
                'shot_direction': shot_direction,
                'impact_detected': impact_detected,
                'angular_velocity': round(angular_velocity, 2)
            }
        }
        
        # Store in buffer
        live_sensor_buffer[device_id] = processed
        
        # Broadcast to all connected dashboard clients
        socketio.emit('sensor_data', processed)
        
        # If any active sessions for this device, accumulate data
        for uid, session in active_sessions.items():
            if session.get('device_id') == device_id:
                session['data_points'].append(processed)
                session['peak_speed'] = max(session.get('peak_speed', 0), bat_speed_kmh)
                session['peak_power'] = max(session.get('peak_power', 0), power)
                session['peak_accel'] = max(session.get('peak_accel', 0), accel_magnitude)
                
                # Swing detection
                if bat_speed_kmh > 25 and session.get('last_speed', 0) < 15:
                    session['swing_count'] = session.get('swing_count', 0) + 1
                    socketio.emit('swing_detected', {
                        'count': session['swing_count'],
                        'speed': round(bat_speed_kmh, 1)
                    })
                
                session['last_speed'] = bat_speed_kmh
        
        return jsonify({'status': 'ok'}), 200
        
    except Exception as e:
        print(f"[ERR] Sensor data error: {e}")
        return jsonify({'error': str(e)}), 500


# ============================================
# ESP32 STATUS ENDPOINT (for direct connection)
# ============================================
@app.route('/api/esp32/status', methods=['GET'])
def esp32_status():
    """Check if any ESP32 device has sent data recently."""
    devices = []
    for device_id, data in live_sensor_buffer.items():
        age = time.time() - data.get('timestamp', 0)
        devices.append({
            'device_id': device_id,
            'last_seen': age,
            'online': age < 5
        })
    return jsonify({'devices': devices, 'count': len(devices)})


# ============================================
# SESSION MANAGEMENT API
# ============================================
@app.route('/api/session/start', methods=['POST'])
@require_auth
def start_session():
    """Start a new recording session."""
    data = request.get_json() or {}
    device_id = data.get('device_id', 'CRICPRO_BAT_001')
    
    session_id = str(uuid.uuid4())[:8]
    
    active_sessions[request.uid] = {
        'session_id': session_id,
        'device_id': device_id,
        'uid': request.uid,
        'started_at': datetime.now(timezone.utc).isoformat(),
        'data_points': [],
        'swing_count': 0,
        'peak_speed': 0,
        'peak_power': 0,
        'peak_accel': 0,
        'last_speed': 0
    }
    
    socketio.emit('session_started', {'session_id': session_id})
    
    return jsonify({
        'status': 'started',
        'session_id': session_id
    })


@app.route('/api/session/stop', methods=['POST'])
@require_auth
def stop_session():
    """Stop session and compute final analytics."""
    session = active_sessions.pop(request.uid, None)
    
    if not session:
        return jsonify({'error': 'No active session'}), 400
    
    # Compute session analytics
    data_points = session.get('data_points', [])
    
    if len(data_points) == 0:
        return jsonify({
            'status': 'stopped',
            'session_id': session['session_id'],
            'analytics': None,
            'message': 'No data recorded'
        })
    
    speeds = [dp['metrics']['speed_kmh'] for dp in data_points]
    powers = [dp['metrics']['power_watts'] for dp in data_points]
    accels = [dp['metrics']['accel_g'] for dp in data_points]
    
    avg_speed = sum(speeds) / len(speeds) if speeds else 0
    avg_power = sum(powers) / len(powers) if powers else 0
    
    # Timing score (consistency of swing speeds during swings)
    swing_speeds = [s for s in speeds if s > 20]
    if len(swing_speeds) > 1:
        speed_std = (sum((s - sum(swing_speeds)/len(swing_speeds))**2 for s in swing_speeds) / len(swing_speeds))**0.5
        timing_score = max(0, min(100, 100 - speed_std * 5))
    else:
        timing_score = 50
    
    # Control score (lower gyro variance = better control)
    gz_values = [dp['raw']['gz'] for dp in data_points]
    if len(gz_values) > 1:
        gz_std = (sum((g - sum(gz_values)/len(gz_values))**2 for g in gz_values) / len(gz_values))**0.5
        control_score = max(0, min(100, 100 - gz_std * 10))
    else:
        control_score = 50
    
    # Sweet spot hit rate (high accel + moderate speed = clean hit)
    sweet_spot_hits = sum(1 for dp in data_points if dp['metrics']['accel_g'] > 2.5 and dp['metrics']['speed_kmh'] > 20)
    sweet_spot_pct = (sweet_spot_hits / max(1, session['swing_count'])) * 100 if session['swing_count'] > 0 else 0
    
    # Follow-through (sustained speed after peak)
    follow_through = 75  # Simplified
    if len(speeds) > 10:
        peak_idx = speeds.index(max(speeds))
        after_peak = speeds[peak_idx:min(peak_idx+10, len(speeds))]
        if len(after_peak) > 3:
            follow_through = min(100, (sum(after_peak[1:]) / (len(after_peak)-1)) / max(0.01, after_peak[0]) * 100)
    
    # Overall score
    overall_score = int(
        timing_score * 0.3 +
        control_score * 0.25 +
        min(100, session['peak_speed'] * 1.2) * 0.25 +
        min(100, sweet_spot_pct) * 0.2
    )
    
    # Session duration
    start_time = datetime.fromisoformat(session['started_at'])
    duration_sec = (datetime.now(timezone.utc) - start_time).total_seconds()
    
    analytics = {
        'session_id': session['session_id'],
        'uid': request.uid,
        'device_id': session['device_id'],
        'started_at': session['started_at'],
        'ended_at': datetime.now(timezone.utc).isoformat(),
        'duration_seconds': round(duration_sec),
        'total_readings': len(data_points),
        'swing_count': session['swing_count'],
        'peak_speed_kmh': round(session['peak_speed'], 1),
        'avg_speed_kmh': round(avg_speed, 1),
        'peak_power_watts': round(session['peak_power'], 1),
        'avg_power_watts': round(avg_power, 1),
        'peak_accel_g': round(session['peak_accel'], 2),
        'timing_score': round(timing_score),
        'control_score': round(control_score),
        'sweet_spot_pct': round(sweet_spot_pct),
        'follow_through_pct': round(follow_through),
        'overall_score': overall_score
    }
    
    # Save to Firebase Firestore
    if db:
        try:
            db.collection('sessions').document(session['session_id']).set(analytics)
            print(f"[DB] Session {session['session_id']} saved to Firestore")
        except Exception as e:
            print(f"[ERR] Firestore save failed: {e}")
    
    socketio.emit('session_stopped', analytics)
    
    return jsonify({
        'status': 'stopped',
        'analytics': analytics
    })


@app.route('/api/sessions', methods=['GET'])
@require_auth
def get_sessions():
    """Get session history for the authenticated user."""
    if demo_mode or not db:
        return jsonify({'sessions': []})
    
    try:
        sessions_ref = db.collection('sessions')
        query = sessions_ref.where('uid', '==', request.uid).order_by(
            'started_at', direction='DESCENDING'
        ).limit(50)
        
        sessions = []
        for doc in query.stream():
            sessions.append(doc.to_dict())
        
        return jsonify({'sessions': sessions})
    except Exception as e:
        print(f"[ERR] Get sessions failed: {e}")
        return jsonify({'sessions': [], 'error': str(e)})


@app.route('/api/session/<session_id>', methods=['GET'])
@require_auth
def get_session(session_id):
    """Get a specific session's analytics."""
    if demo_mode or not db:
        return jsonify({'error': 'Not available in demo mode'}), 404
    
    try:
        doc = db.collection('sessions').document(session_id).get()
        if doc.exists:
            data = doc.to_dict()
            if data.get('uid') != request.uid:
                return jsonify({'error': 'Unauthorized'}), 403
            return jsonify(data)
        return jsonify({'error': 'Session not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/session/<session_id>', methods=['DELETE'])
@require_auth
def delete_session(session_id):
    """Delete a session."""
    if demo_mode or not db:
        return jsonify({'error': 'Not available in demo mode'}), 404
    
    try:
        doc_ref = db.collection('sessions').document(session_id)
        doc = doc_ref.get()
        if doc.exists and doc.to_dict().get('uid') == request.uid:
            doc_ref.delete()
            return jsonify({'status': 'deleted'})
        return jsonify({'error': 'Not found or unauthorized'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============================================
# USER PROFILE API
# ============================================
@app.route('/api/profile', methods=['GET'])
@require_auth
def get_profile():
    """Get user profile and stats."""
    if demo_mode:
        return jsonify({
            'uid': 'demo-user',
            'email': 'demo@cricpro.com',
            'display_name': 'Demo User',
            'stats': {
                'total_sessions': 0,
                'total_swings': 0,
                'best_score': 0,
                'avg_speed': 0
            }
        })
    
    user_info = get_user_info(request.uid)
    
    # Get aggregated stats from Firestore
    stats = {'total_sessions': 0, 'total_swings': 0, 'best_score': 0, 'avg_speed': 0}
    
    if db:
        try:
            sessions = db.collection('sessions').where('uid', '==', request.uid).stream()
            total_speed = 0
            count = 0
            for doc in sessions:
                data = doc.to_dict()
                stats['total_sessions'] += 1
                stats['total_swings'] += data.get('swing_count', 0)
                stats['best_score'] = max(stats['best_score'], data.get('overall_score', 0))
                total_speed += data.get('avg_speed_kmh', 0)
                count += 1
            stats['avg_speed'] = round(total_speed / max(1, count), 1)
        except Exception as e:
            print(f"[ERR] Profile stats error: {e}")
    
    return jsonify({
        **(user_info or {}),
        'stats': stats
    })


@app.route('/api/profile', methods=['PUT'])
@require_auth
def update_profile():
    """Update user profile in Firestore."""
    if demo_mode or not db:
        return jsonify({'status': 'ok'})
    
    data = request.get_json() or {}
    
    try:
        db.collection('users').document(request.uid).set({
            'uid': request.uid,
            'display_name': data.get('display_name', ''),
            'team': data.get('team', ''),
            'batting_style': data.get('batting_style', 'right'),
            'updated_at': datetime.now(timezone.utc).isoformat()
        }, merge=True)
        return jsonify({'status': 'updated'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============================================
# DEMO / SIMULATION ENDPOINT
# ============================================
@app.route('/api/demo/start', methods=['POST'])
def start_demo_simulation():
    """Start simulated sensor data for demo purposes (no ESP32 needed)."""
    import threading
    import random
    
    def simulate():
        t = 0
        while True:
            # Simulate a swing pattern
            phase = (t % 100) / 100.0
            
            if phase < 0.3:
                # Backlift
                gx = math.sin(phase * 10) * 3
                gy = 0.5
                gz = random.uniform(-0.5, 0.5)
                ax = random.uniform(-0.3, 0.3)
                ay = random.uniform(0.8, 1.2)
                az = random.uniform(-0.3, 0.3)
            elif phase < 0.5:
                # Swing
                intensity = math.sin((phase - 0.3) / 0.2 * math.pi)
                gx = -intensity * 6
                gy = intensity * 8
                gz = random.choice([-1, 0, 1]) * intensity * 2
                ax = intensity * 4
                ay = intensity * 3
                az = intensity * 2
            else:
                # Follow-through / rest
                decay = max(0, 1 - (phase - 0.5) * 4)
                gx = -decay * 2
                gy = decay * 3
                gz = random.uniform(-0.3, 0.3) * decay
                ax = decay * random.uniform(0, 1)
                ay = 1 + decay * 0.5
                az = decay * random.uniform(-0.5, 0.5)
            
            data = {
                'device_id': 'DEMO_BAT',
                'ax': round(ax, 2),
                'ay': round(ay, 2),
                'az': round(az, 2),
                'gx': round(gx, 2),
                'gy': round(gy, 2),
                'gz': round(gz, 2),
                'ts': int(time.time() * 1000)
            }
            
            # Post to our own sensor endpoint
            with app.test_client() as client:
                client.post('/api/sensor-data', json=data)
            
            t += 1
            time.sleep(0.02)  # 50Hz
    
    thread = threading.Thread(target=simulate, daemon=True)
    thread.start()
    
    return jsonify({'status': 'demo_started', 'device_id': 'DEMO_BAT'})


# ============================================
# WEBSOCKET EVENTS
# ============================================
@socketio.on('connect')
def handle_connect():
    print(f"[WS] Client connected: {request.sid}")
    connected_clients[request.sid] = None
    emit('connected', {'message': 'Connected to CricPro server'})


@socketio.on('disconnect')
def handle_disconnect():
    print(f"[WS] Client disconnected: {request.sid}")
    connected_clients.pop(request.sid, None)


@socketio.on('authenticate')
def handle_auth(data):
    """Associate a WebSocket connection with a user."""
    token = data.get('token')
    if demo_mode:
        connected_clients[request.sid] = 'demo-user'
        emit('authenticated', {'uid': 'demo-user'})
        return
    
    if token:
        decoded = verify_firebase_token(token)
        if decoded:
            connected_clients[request.sid] = decoded['uid']
            emit('authenticated', {'uid': decoded['uid']})
        else:
            emit('auth_error', {'error': 'Invalid token'})


# ============================================
# HEALTH CHECK
# ============================================
@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'demo_mode': demo_mode,
        'connected_clients': len(connected_clients),
        'active_sessions': len(active_sessions),
        'live_devices': len(live_sensor_buffer)
    })


# ============================================
# RUN SERVER
# ============================================
if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'
    
    print()
    print("╔════════════════════════════════════════════╗")
    print("║   🏏 CricPro Backend Server v2.0          ║")
    print("║   Cricket Bat Swing Analyzer               ║")
    print("╚════════════════════════════════════════════╝")
    print()
    print(f"  → Port:        {port}")
    print(f"  → Debug:       {debug}")
    print(f"  → Demo Mode:   {demo_mode}")
    print(f"  → Firebase:    {'Connected' if not demo_mode else 'Not configured'}")
    print()
    
    if demo_mode:
        print("  ⚠️  Running in DEMO MODE (no Firebase)")
        print("     Place serviceAccountKey.json in backend/ to enable Firebase")
        print()
    
    print(f"  🌐 Dashboard:  http://localhost:{port}")
    print(f"  📡 Sensor API: http://localhost:{port}/api/sensor-data")
    print(f"  ❤️  Health:     http://localhost:{port}/api/health")
    print()
    
    socketio.run(app, host='0.0.0.0', port=port, debug=debug)
