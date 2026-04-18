import os
import sys
from functools import wraps
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv

import firebase_admin
from firebase_admin import credentials, firestore, auth

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)

# ==========================================
# FIREBASE SETUP
# ==========================================
db = None
demo_mode = False

def initialize_firebase():
    global db, demo_mode
    if firebase_admin._apps:
        db = firestore.client()
        return

    try:
        # Vercel Environment Variables setup
        # Requires adding FIREBASE_SERVICE_ACCOUNT_JSON containing the full json string in Vercel UI
        import json
        cert_env = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
        if cert_env:
            cert_dict = json.loads(cert_env)
            cred = credentials.Certificate(cert_dict)
            firebase_admin.initialize_app(cred)
            db = firestore.client()
            print("[OK] Firebase Admin SDK initialized from env config")
        else:
            demo_mode = True
            print("[WARNING] Firebase config missing. Running in DEMO MODE.")
    except Exception as e:
        print(f"[ERROR] Failed to initialize Firebase: {e}")
        demo_mode = True

initialize_firebase()

# ==========================================
# MIDDLEWARE
# ==========================================
def require_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if demo_mode:
            return f('demo_user', *args, **kwargs)

        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Unauthorized', 'message': 'Missing token'}), 401
        
        token = auth_header.split(' ')[1]
        if token == 'demo-token':
            return f('demo_user', *args, **kwargs)

        try:
            decoded_token = auth.verify_id_token(token)
            uid = decoded_token['uid']
            return f(uid, *args, **kwargs)
        except Exception as e:
            return jsonify({'error': 'Unauthorized', 'message': str(e)}), 401
    return decorated_function

# ==========================================
# ENDPOINTS
# ==========================================
@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'service': 'CricPro API (Vercel Serverless)',
        'firebase_connected': not demo_mode
    }), 200

@app.route('/api/profile', methods=['GET'])
@require_auth
def get_profile(uid):
    if demo_mode or uid == 'demo_user':
        return jsonify({
            'uid': 'demo_user', 'name': 'Demo Player',
            'stats': {'total_sessions': 5, 'avg_speed': 84.5, 'best_score': 92, 'off_side_shots': 15, 'leg_side_shots': 20, 'total_swings': 120}
        })
    try:
        user_ref = db.collection('users').document(uid)
        user_doc = user_ref.get()
        data = user_doc.to_dict() if user_doc.exists else {'stats': {}}
        return jsonify({'uid': uid, 'stats': data.get('stats', {})})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/sessions', methods=['GET'])
@require_auth
def get_sessions(uid):
    if demo_mode or uid == 'demo_user':
        return jsonify({'sessions': [
            {'session_id': 'demo1', 'started_at': '2026-04-18T10:00:00Z', 'duration_seconds': 1200, 'swing_count': 24, 'peak_speed_kmh': 88.5, 'overall_score': 85},
            {'session_id': 'demo2', 'started_at': '2026-04-16T15:30:00Z', 'duration_seconds': 900, 'swing_count': 18, 'peak_speed_kmh': 82.1, 'overall_score': 72}
        ]})
        
    try:
        sessions_ref = db.collection('sessions').where('user_id', '==', uid).order_by('started_at', direction=firestore.Query.DESCENDING).limit(10)
        docs = sessions_ref.stream()
        return jsonify({'sessions': [d.to_dict() for d in docs]})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Vercel entry point
if __name__ == '__main__':
    app.run(debug=True)
