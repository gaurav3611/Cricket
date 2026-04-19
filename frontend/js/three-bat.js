/**
 * =====================================================
 * SwingLab — 3D Bat + Swing Trace Visualization
 * =====================================================
 * A detailed cricket bat that rotates with sensor data.
 * The bat tip draws a glowing trail curve showing the
 * exact swing path trajectory in 3D space.
 */

let batScene, batCamera, batRenderer, batGroup;
let batTargetRot = { x: 0, y: 0, z: 0 };
let batCurrentRot = { x: 0, y: 0, z: 0 };
let batGlowIntensity = 0;
let sweetSpotMesh = null;
let gridPulseTime = 0;

// Trail system — records bat tip positions over time
let trailPoints = [];
const MAX_TRAIL = 200;
let trailLine = null;
let trailGlowLine = null;

function init3DBat(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Scene
  batScene = new THREE.Scene();
  batScene.fog = new THREE.FogExp2(0x020610, 0.04);

  // Camera — close enough to see bat detail + trail
  const height = container.offsetHeight || 420;
  batCamera = new THREE.PerspectiveCamera(50, container.offsetWidth / height, 0.1, 100);
  batCamera.position.set(1.8, 1.2, 2.5);
  batCamera.lookAt(0, 0.2, 0);

  // Renderer
  batRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  batRenderer.setSize(container.offsetWidth, height);
  batRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  batRenderer.setClearColor(0x020610, 1);
  batRenderer.shadowMap.enabled = true;
  batRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
  batRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  batRenderer.toneMappingExposure = 1.8;
  container.appendChild(batRenderer.domElement);

  // Lighting
  setupLighting();

  // Environment
  buildEnvironment();

  // The Bat
  batGroup = createBat();
  batGroup.position.set(0, 0, 0);
  batScene.add(batGroup);

  // Trail — main line (bright cyan)
  const trailGeo = new THREE.BufferGeometry();
  const trailMat = new THREE.LineBasicMaterial({
    color: 0x00d4ff,
    transparent: true,
    opacity: 0.9,
    linewidth: 2
  });
  trailLine = new THREE.Line(trailGeo, trailMat);
  trailLine.name = 'trail';
  batScene.add(trailLine);

  // Trail glow — wider, dimmer duplicate for bloom effect
  const glowGeo = new THREE.BufferGeometry();
  const glowMat = new THREE.LineBasicMaterial({
    color: 0x00d4ff,
    transparent: true,
    opacity: 0.25,
    linewidth: 4
  });
  trailGlowLine = new THREE.Line(glowGeo, glowMat);
  trailGlowLine.name = 'trailGlow';
  batScene.add(trailGlowLine);

  // Trail dots — small spheres at intervals along the path
  // (created dynamically in the animation loop)

  // Handle resize
  window.addEventListener('resize', () => {
    if (!container || !batRenderer) return;
    const w = container.offsetWidth;
    const h = container.offsetHeight || 420;
    batCamera.aspect = w / h;
    batCamera.updateProjectionMatrix();
    batRenderer.setSize(w, h);
  });

  animateBat();
}

function setupLighting() {
  // Ambient — deep blue
  batScene.add(new THREE.AmbientLight(0x1a2a44, 2.5));

  // Key light — bright from top-right
  const keyLight = new THREE.DirectionalLight(0xffffff, 3.0);
  keyLight.position.set(3, 6, 4);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.bias = -0.001;
  batScene.add(keyLight);

  // Fill — warm orange from left
  const fillLight = new THREE.PointLight(0xff8844, 1.8, 12);
  fillLight.position.set(-3, 2, 2);
  batScene.add(fillLight);

  // Rim — cyan from behind for edge glow
  const rimLight = new THREE.PointLight(0x00d4ff, 2.5, 10);
  rimLight.position.set(0, 1, -4);
  batScene.add(rimLight);

  // Bottom accent
  const bottomLight = new THREE.PointLight(0x6633ff, 0.8, 6);
  bottomLight.position.set(0, -2, 1);
  batScene.add(bottomLight);
}

function buildEnvironment() {
  // Ground plane
  const groundGeo = new THREE.PlaneGeometry(16, 16);
  const groundMat = new THREE.MeshPhongMaterial({
    color: 0x010308,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    shininess: 100,
    specular: 0x112233
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.5;
  ground.receiveShadow = true;
  batScene.add(ground);

  // Grid
  const grid = new THREE.GridHelper(12, 48, 0x00d4ff, 0x081420);
  grid.position.y = -1.49;
  grid.material.transparent = true;
  grid.material.opacity = 0.15;
  batScene.add(grid);

  // Center reference circle (pivot point indicator)
  const ringGeo = new THREE.RingGeometry(0.08, 0.1, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x00d4ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -1.48;
  batScene.add(ring);
}

function createBat() {
  const bat = new THREE.Group();

  // === HANDLE ===
  // Grip — rubber with cyan accent
  const gripMat = new THREE.MeshPhongMaterial({
    color: 0x00b4d8, shininess: 120,
    emissive: 0x004466, emissiveIntensity: 0.3
  });
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.3, 16), gripMat);
  grip.position.y = -0.35;
  grip.castShadow = true;
  bat.add(grip);

  // Grip texture lines
  const gripLineMat = new THREE.MeshBasicMaterial({ color: 0x006688, transparent: true, opacity: 0.5 });
  for (let i = 0; i < 6; i++) {
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 16), gripLineMat);
    line.position.y = -0.45 + i * 0.04;
    bat.add(line);
  }

  // Handle — cane
  const handleMat = new THREE.MeshPhongMaterial({ color: 0x7B4E2C, shininess: 50 });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.2, 12), handleMat);
  handle.position.y = -0.1;
  handle.castShadow = true;
  bat.add(handle);

  // === SPLICE / SHOULDER ===
  const spliceMat = new THREE.MeshPhongMaterial({ color: 0xC4A265, shininess: 80 });
  const splice = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.095, 0.14, 12), spliceMat);
  splice.position.y = 0.07;
  splice.castShadow = true;
  bat.add(splice);

  // === BLADE — English Willow ===
  const woodMat = new THREE.MeshPhongMaterial({
    color: 0xD4A86A, shininess: 90, specular: 0x554422
  });

  // Blade face
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.58, 0.05), woodMat);
  blade.position.y = 0.43;
  blade.castShadow = true;
  bat.add(blade);

  // Blade spine (back ridge)
  const spineMat = new THREE.MeshPhongMaterial({ color: 0xc89e55, shininess: 70 });
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.54, 0.025), spineMat);
  spine.position.set(0, 0.43, -0.035);
  bat.add(spine);

  // Edge highlights
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.12 });
  [-0.1, 0.1].forEach(x => {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.56, 0.048), edgeMat);
    edge.position.set(x, 0.43, 0);
    bat.add(edge);
  });

  // Sticker / brand area
  const stickerMat = new THREE.MeshBasicMaterial({
    color: 0xff6b00, transparent: true, opacity: 0.08, side: THREE.DoubleSide
  });
  const sticker = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.22), stickerMat);
  sticker.position.set(0, 0.38, 0.026);
  bat.add(sticker);

  // Brand line accent
  const brandLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.004, 0.002),
    new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.35 })
  );
  brandLine.position.set(0, 0.5, 0.026);
  bat.add(brandLine);

  // === SWEET SPOT GLOW ===
  sweetSpotMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 16, 16),
    new THREE.MeshPhongMaterial({
      color: 0xff6b00,
      emissive: 0xff3300,
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.5
    })
  );
  sweetSpotMesh.position.set(0, 0.52, 0.025);
  bat.add(sweetSpotMesh);

  // === TOE ===
  const toe = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.035, 0.05),
    new THREE.MeshPhongMaterial({ color: 0xC8A060, shininess: 80 })
  );
  toe.position.y = 0.73;
  bat.add(toe);

  // Toe guard accent
  const toeGuard = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.01, 0.05),
    new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.2 })
  );
  toeGuard.position.y = 0.75;
  bat.add(toeGuard);

  return bat;
}

// ===== ANIMATION LOOP =====
function animateBat() {
  requestAnimationFrame(animateBat);
  if (!batGroup || !batRenderer) return;

  // Smooth rotation interpolation
  const lerp = 0.12;
  batCurrentRot.x += (batTargetRot.x - batCurrentRot.x) * lerp;
  batCurrentRot.y += (batTargetRot.y - batCurrentRot.y) * lerp;
  batCurrentRot.z += (batTargetRot.z - batCurrentRot.z) * lerp;

  // Apply rotation to bat
  batGroup.rotation.x = batCurrentRot.x;
  batGroup.rotation.y = batCurrentRot.y;
  batGroup.rotation.z = batCurrentRot.z;

  // ===== SWEET SPOT GLOW =====
  if (sweetSpotMesh) {
    if (batGlowIntensity > 0.01) {
      sweetSpotMesh.material.emissiveIntensity = batGlowIntensity * 3;
      sweetSpotMesh.material.opacity = 0.3 + batGlowIntensity * 0.6;
      sweetSpotMesh.scale.setScalar(1 + batGlowIntensity * 0.8);
      batGlowIntensity *= 0.90;
    } else {
      sweetSpotMesh.material.emissiveIntensity = 0.4;
      sweetSpotMesh.material.opacity = 0.5;
      sweetSpotMesh.scale.setScalar(1);
    }
  }

  // ===== BAT TIP TRAIL — SWING PATH TRACE =====
  // Track the world position of the bat toe (tip)
  const tipLocal = new THREE.Vector3(0, 0.75, 0);
  const tipWorld = tipLocal.clone();
  batGroup.localToWorld(tipWorld);

  // Also track the sweet spot for a second trail
  const sweetLocal = new THREE.Vector3(0, 0.52, 0.025);
  const sweetWorld = sweetLocal.clone();
  batGroup.localToWorld(sweetWorld);

  // Only add points when the bat is actually moving
  const speed = Math.sqrt(
    Math.pow(batTargetRot.x - batCurrentRot.x, 2) +
    Math.pow(batTargetRot.y - batCurrentRot.y, 2) +
    Math.pow(batTargetRot.z - batCurrentRot.z, 2)
  );

  trailPoints.push({
    tip: tipWorld.clone(),
    sweet: sweetWorld.clone(),
    speed: speed
  });

  if (trailPoints.length > MAX_TRAIL) trailPoints.shift();

  // Update trail geometry
  if (trailPoints.length > 2) {
    const positions = new Float32Array(trailPoints.length * 3);
    trailPoints.forEach((p, i) => {
      positions[i * 3] = p.tip.x;
      positions[i * 3 + 1] = p.tip.y;
      positions[i * 3 + 2] = p.tip.z;
    });

    // Main trail
    if (trailLine) {
      trailLine.geometry.dispose();
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      trailLine.geometry = geo;

      // Fade trail based on age: newer = brighter
      const age = trailPoints.length / MAX_TRAIL;
      trailLine.material.opacity = 0.3 + age * 0.6;
    }

    // Glow trail (same positions)
    if (trailGlowLine) {
      trailGlowLine.geometry.dispose();
      const glowGeo = new THREE.BufferGeometry();
      glowGeo.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3));
      trailGlowLine.geometry = glowGeo;
    }
  }

  // ===== TRAIL DOTS (rendered as small spheres at intervals) =====
  // Remove old dots
  const oldDots = batScene.children.filter(c => c.userData && c.userData.isTrailDot);
  oldDots.forEach(d => { batScene.remove(d); d.geometry.dispose(); d.material.dispose(); });

  // Add new dots every 10th point
  for (let i = 0; i < trailPoints.length; i += 8) {
    const p = trailPoints[i];
    const alpha = i / trailPoints.length; // 0 = old, 1 = new
    const dotGeo = new THREE.SphereGeometry(0.012 + alpha * 0.01, 6, 6);
    const dotMat = new THREE.MeshBasicMaterial({
      color: p.speed > 0.01 ? 0xff6b00 : 0x00d4ff,
      transparent: true,
      opacity: 0.15 + alpha * 0.6
    });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.copy(p.tip);
    dot.userData.isTrailDot = true;
    batScene.add(dot);
  }

  // ===== GENTLE CAMERA ORBIT =====
  gridPulseTime += 0.005;
  batCamera.position.x = 1.8 + Math.sin(gridPulseTime * 0.2) * 0.15;
  batCamera.position.y = 1.2 + Math.cos(gridPulseTime * 0.15) * 0.08;
  batCamera.lookAt(0, 0.2, 0);

  batRenderer.render(batScene, batCamera);
}

// ===== SENSOR DATA → 3D ROTATION =====
let integratedRot = { x: 0, y: 0, z: 0 };

function update3DBat(gy, gx, gz, impact) {
  const dt = 0.022;
  integratedRot.x += (gx * Math.PI / 180) * dt;
  integratedRot.y += (gy * Math.PI / 180) * dt;
  integratedRot.z += (gz * Math.PI / 180) * dt;

  // Smooth decay back to rest position
  integratedRot.x *= 0.93;
  integratedRot.y *= 0.93;
  integratedRot.z *= 0.93;

  const maxRot = Math.PI / 1.2;
  batTargetRot.x = Math.min(maxRot, Math.max(-maxRot, integratedRot.x));
  batTargetRot.y = Math.min(maxRot, Math.max(-maxRot, integratedRot.y));
  batTargetRot.z = Math.min(maxRot, Math.max(-maxRot, integratedRot.z));

  // Trigger glow on impact
  if (impact > 2.0) {
    batGlowIntensity = Math.min(3.5, impact / 3.5);
  }
}

function resetBat3D() {
  batTargetRot = { x: 0, y: 0, z: 0 };
  integratedRot = { x: 0, y: 0, z: 0 };
  trailPoints = [];

  // Clear trail dots
  if (batScene) {
    const dots = batScene.children.filter(c => c.userData && c.userData.isTrailDot);
    dots.forEach(d => { batScene.remove(d); d.geometry.dispose(); d.material.dispose(); });
  }
}
