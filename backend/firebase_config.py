"""
Firebase Admin SDK Configuration
=================================
Initializes Firebase Admin SDK for server-side operations:
- User authentication verification
- Firestore database access
- Token management
"""

import os
import firebase_admin
from firebase_admin import credentials, firestore, auth


def initialize_firebase(service_account_path=None):
    """Initialize Firebase Admin SDK with service account credentials."""
    
    if firebase_admin._apps:
        return  # Already initialized
    
    path = service_account_path or os.getenv(
        'FIREBASE_SERVICE_ACCOUNT_PATH', 
        'serviceAccountKey.json'
    )
    
    if not os.path.exists(path):
        print(f"[WARNING] Firebase service account key not found at: {path}")
        print("          Download it from Firebase Console > Project Settings > Service Accounts")
        print("          Running in DEMO MODE — no data will be persisted")
        return None
    
    cred = credentials.Certificate(path)
    firebase_admin.initialize_app(cred)
    print("[OK] Firebase Admin SDK initialized")
    return firebase_admin.get_app()


def get_firestore_client():
    """Get Firestore client instance."""
    try:
        return firestore.client()
    except Exception:
        return None


def verify_firebase_token(id_token):
    """Verify a Firebase ID token from the frontend."""
    try:
        decoded_token = auth.verify_id_token(id_token)
        return decoded_token
    except Exception as e:
        print(f"[AUTH] Token verification failed: {e}")
        return None


def get_user_info(uid):
    """Get user info from Firebase Auth."""
    try:
        user = auth.get_user(uid)
        return {
            'uid': user.uid,
            'email': user.email,
            'display_name': user.display_name,
            'photo_url': user.photo_url,
            'created_at': user.user_metadata.creation_timestamp
        }
    except Exception as e:
        print(f"[AUTH] Get user failed: {e}")
        return None
