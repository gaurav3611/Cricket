/**
 * =====================================================
 * CricPro — 3D Bat Visualization (Three.js)
 * =====================================================
 * Creates an interactive 3D cricket bat that responds
 * to real-time sensor data
 */

let batScene, batCamera, batRenderer, batGroup;
let batTargetRot = { x: 0, y: 0, z: 0 };
let batCurrentRot = { x: 0, y: 0, z: 0 };
let batGlowIntensity = 0;
let sweetSpotMesh = null;
let trailPoints = [];
const MAX_TRAIL = 60;

function init3DBat(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  // Scene
  batScene = new THREE.Scene();
  batScene.fog = new THREE.FogExp2(0x030810, 0.08);
  
  // Camera
  batCamera = new THREE.PerspectiveCamera(50, container.offsetWidth / 280, 0.1, 100);
  batCamera.position.set(0, 1.2, 5);
  batCamera.lookAt(0, 0.3, 0);
  
  // Renderer
  batRenderer = new THREE.WebGLRenderer({ 
    antialias: true, 
    alpha: true
  });
  batRenderer.setSize(container.offsetWidth, 280);
  batRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  batRenderer.setClearColor(0x030810, 1);
  batRenderer.shadowMap.enabled = true;
  container.appendChild(batRenderer.domElement);
  
  // Lighting
  const ambientLight = new THREE.AmbientLight(0x1a2a4a, 1.5);
  batScene.add(ambientLight);
  
  const mainLight = new THREE.DirectionalLight(0x00d4ff, 1.8);
  mainLight.position.set(3, 5, 2);
  mainLight.castShadow = true;
  batScene.add(mainLight);
  
  const fillLight = new THREE.PointLight(0xff6b00, 0.8);
  fillLight.position.set(-3, 2, 4);
  batScene.add(fillLight);
  
  const rimLight = new THREE.PointLight(0x00ff88, 0.4);
  rimLight.position.set(0, -1, -3);
  batScene.add(rimLight);
  
  // Create bat model
  batGroup = new THREE.Group();
  
  // Handle (grip)
  const gripGeo = new THREE.CylinderGeometry(0.06, 0.065, 0.35, 16);
  const gripMat = new THREE.MeshPhongMaterial({ 
    color: 0x222222,
    shininess: 30
  });
  const grip = new THREE.Mesh(gripGeo, gripMat);
  grip.position.y = -0.9;
  batGroup.add(grip);
  
  // Handle (wood)
  const handleGeo = new THREE.CylinderGeometry(0.065, 0.08, 0.55, 16);
  const handleMat = new THREE.MeshPhongMaterial({ 
    color: 0x8B5E3C,
    shininess: 40
  });
  const handle = new THREE.Mesh(handleGeo, handleMat);
  handle.position.y = -0.45;
  batGroup.add(handle);
  
  // Shoulder (tapered transition)
  const shoulderGeo = new THREE.CylinderGeometry(0.08, 0.28, 0.3, 8);
  const shoulderMat = new THREE.MeshPhongMaterial({ 
    color: 0xC4A26E, 
    shininess: 50
  });
  const shoulder = new THREE.Mesh(shoulderGeo, shoulderMat);
  shoulder.position.y = -0.05;
  batGroup.add(shoulder);
  
  // Blade (main face)
  const bladeGeo = new THREE.BoxGeometry(0.55, 1.2, 0.09);
  const bladeMat = new THREE.MeshPhongMaterial({ 
    color: 0xD2B48C, 
    shininess: 100,
    specular: 0x443322
  });
  const blade = new THREE.Mesh(bladeGeo, bladeMat);
  blade.position.y = 0.6;
  batGroup.add(blade);
  
  // Toe (bottom of blade)
  const toeGeo = new THREE.BoxGeometry(0.55, 0.08, 0.09);
  const toeMat = new THREE.MeshPhongMaterial({ color: 0xBFA578 });
  const toe = new THREE.Mesh(toeGeo, toeMat);
  toe.position.y = 1.24;
  batGroup.add(toe);
  
  // Sweet spot indicator (glowing sphere)
  const sweetGeo = new THREE.SphereGeometry(0.1, 24, 24);
  const sweetMat = new THREE.MeshPhongMaterial({ 
    color: 0xff6b00, 
    emissive: 0xff3300, 
    emissiveIntensity: 0.3,
    transparent: true,
    opacity: 0.7
  });
  sweetSpotMesh = new THREE.Mesh(sweetGeo, sweetMat);
  sweetSpotMesh.position.set(0, 0.6, 0.06);
  batGroup.add(sweetSpotMesh);
  
  // Sensor indicator (ESP32)
  const sensorGeo = new THREE.BoxGeometry(0.08, 0.05, 0.04);
  const sensorMat = new THREE.MeshPhongMaterial({ 
    color: 0x00ff00, 
    emissive: 0x003300,
    emissiveIntensity: 0.5
  });
  const sensor = new THREE.Mesh(sensorGeo, sensorMat);
  sensor.position.set(0, -0.3, 0.06);
  batGroup.add(sensor);
  
  // Sticker/brand area
  const stickerGeo = new THREE.PlaneGeometry(0.4, 0.25);
  const stickerMat = new THREE.MeshPhongMaterial({ 
    color: 0x00d4ff,
    emissive: 0x003344,
    emissiveIntensity: 0.3,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide
  });
  const sticker = new THREE.Mesh(stickerGeo, stickerMat);
  sticker.position.set(0, 0.9, 0.055);
  batGroup.add(sticker);
  
  batGroup.position.y = 0.2;
  batScene.add(batGroup);
  
  // Ground grid
  const gridHelper = new THREE.GridHelper(8, 30, 0x00d4ff, 0x0a1a2e);
  gridHelper.position.y = -1.5;
  gridHelper.material.transparent = true;
  gridHelper.material.opacity = 0.2;
  batScene.add(gridHelper);
  
  // Ground reflection plane
  const groundGeo = new THREE.PlaneGeometry(8, 8);
  const groundMat = new THREE.MeshPhongMaterial({ 
    color: 0x030810,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.5;
  batScene.add(ground);
  
  // Trail line
  const trailGeo = new THREE.BufferGeometry();
  const trailMat = new THREE.LineBasicMaterial({ 
    color: 0x00d4ff, 
    transparent: true, 
    opacity: 0.3 
  });
  const trail = new THREE.Line(trailGeo, trailMat);
  trail.name = 'trail';
  batScene.add(trail);
  
  // Handle resize
  window.addEventListener('resize', () => {
    if (!container || !batRenderer) return;
    const width = container.offsetWidth;
    batCamera.aspect = width / 280;
    batCamera.updateProjectionMatrix();
    batRenderer.setSize(width, 280);
  });
  
  // Start animation
  animateBat();
}

function animateBat() {
  requestAnimationFrame(animateBat);
  
  if (!batGroup || !batRenderer) return;
  
  // Smooth rotation interpolation
  batCurrentRot.x += (batTargetRot.x - batCurrentRot.x) * 0.12;
  batCurrentRot.y += (batTargetRot.y - batCurrentRot.y) * 0.12;
  batCurrentRot.z += (batTargetRot.z - batCurrentRot.z) * 0.12;
  
  batGroup.rotation.x = batCurrentRot.x;
  batGroup.rotation.y = batCurrentRot.y;
  batGroup.rotation.z = batCurrentRot.z;
  
  // Sweet spot glow
  if (sweetSpotMesh) {
    if (batGlowIntensity > 0.01) {
      sweetSpotMesh.material.emissiveIntensity = batGlowIntensity;
      sweetSpotMesh.material.opacity = 0.5 + batGlowIntensity * 0.3;
      sweetSpotMesh.scale.setScalar(1 + batGlowIntensity * 0.3);
      batGlowIntensity *= 0.94;
    } else {
      sweetSpotMesh.material.emissiveIntensity = 0.3;
      sweetSpotMesh.material.opacity = 0.7;
      sweetSpotMesh.scale.setScalar(1);
    }
  }
  
  // Update trail
  const tipWorldPos = new THREE.Vector3(0, 1.2, 0);
  batGroup.localToWorld(tipWorldPos);
  trailPoints.push(tipWorldPos.clone());
  if (trailPoints.length > MAX_TRAIL) trailPoints.shift();
  
  const trail = batScene.getObjectByName('trail');
  if (trail && trailPoints.length > 2) {
    const positions = new Float32Array(trailPoints.length * 3);
    trailPoints.forEach((p, i) => {
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
    });
    trail.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  }
  
  batRenderer.render(batScene, batCamera);
}

function update3DBat(gy, gx, gz, impact) {
  batTargetRot.x = Math.min(0.9, Math.max(-0.9, gx * 0.12));
  batTargetRot.y = Math.min(0.7, Math.max(-0.7, gy * 0.1));
  batTargetRot.z = Math.min(0.6, Math.max(-0.6, gz * 0.08));
  
  if (impact > 2.5) {
    batGlowIntensity = Math.min(2.0, impact / 8);
  }
}

function resetBat3D() {
  batTargetRot = { x: 0, y: 0, z: 0 };
  trailPoints = [];
}
