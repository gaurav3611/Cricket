/**
 * =====================================================
 * SwingLab — 3D Cricket Bat + Swing Path Trace
 * =====================================================
 * Realistic cricket bat shape facing downward (resting stance).
 * Bat rotates in response to sensor data, and a glowing
 * trail traces the swing arc in 3D space.
 */

let batScene, batCamera, batRenderer, batGroup;
let batTargetRot = { x: 0, y: 0, z: 0 };
let batCurrentRot = { x: 0, y: 0, z: 0 };
let batGlowIntensity = 0;
let sweetSpotMesh = null;
let gridPulseTime = 0;

// Trail
let trailPoints = [];
const MAX_TRAIL = 200;
let trailLine = null;
let trailGlowLine = null;

function init3DBat(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  batScene = new THREE.Scene();
  batScene.fog = new THREE.FogExp2(0x020610, 0.035);

  const height = container.offsetHeight || 420;
  batCamera = new THREE.PerspectiveCamera(48, container.offsetWidth / height, 0.1, 100);
  batCamera.position.set(2.0, 0.8, 2.8);
  batCamera.lookAt(0, -0.3, 0);

  batRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  batRenderer.setSize(container.offsetWidth, height);
  batRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  batRenderer.setClearColor(0x020610, 1);
  batRenderer.shadowMap.enabled = true;
  batRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
  batRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  batRenderer.toneMappingExposure = 1.8;
  container.appendChild(batRenderer.domElement);

  setupLighting();
  buildEnvironment();

  // Build the bat facing DOWN (toe toward ground)
  batGroup = new THREE.Group();
  var bat = createRealisticBat();
  // Rotate so toe points down: rotate 180° around X
  bat.rotation.x = Math.PI;
  batGroup.add(bat);
  batGroup.position.set(0, 0.5, 0);
  batScene.add(batGroup);

  // Trail lines
  var trailGeo = new THREE.BufferGeometry();
  trailLine = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({
    color: 0x00d4ff, transparent: true, opacity: 0.9, linewidth: 2
  }));
  batScene.add(trailLine);

  var glowGeo = new THREE.BufferGeometry();
  trailGlowLine = new THREE.Line(glowGeo, new THREE.LineBasicMaterial({
    color: 0x00d4ff, transparent: true, opacity: 0.2, linewidth: 4
  }));
  batScene.add(trailGlowLine);

  window.addEventListener('resize', function() {
    if (!container || !batRenderer) return;
    var w = container.offsetWidth;
    var h = container.offsetHeight || 420;
    batCamera.aspect = w / h;
    batCamera.updateProjectionMatrix();
    batRenderer.setSize(w, h);
  });

  animateBat();
}

function setupLighting() {
  batScene.add(new THREE.AmbientLight(0x1a2a44, 2.5));

  var keyLight = new THREE.DirectionalLight(0xfff5e6, 3.5);
  keyLight.position.set(4, 6, 5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  batScene.add(keyLight);

  var fillLight = new THREE.PointLight(0xff8844, 1.5, 12);
  fillLight.position.set(-3, 1, 3);
  batScene.add(fillLight);

  var rimLight = new THREE.PointLight(0x00d4ff, 2.5, 10);
  rimLight.position.set(0, 0, -4);
  batScene.add(rimLight);

  var bottomLight = new THREE.PointLight(0x4422ff, 0.6, 6);
  bottomLight.position.set(0, -3, 1);
  batScene.add(bottomLight);
}

function buildEnvironment() {
  var groundMat = new THREE.MeshPhongMaterial({
    color: 0x010308, transparent: true, opacity: 0.9,
    side: THREE.DoubleSide, shininess: 100, specular: 0x112233
  });
  var ground = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.8;
  ground.receiveShadow = true;
  batScene.add(ground);

  var grid = new THREE.GridHelper(12, 48, 0x00d4ff, 0x081420);
  grid.position.y = -1.79;
  grid.material.transparent = true;
  grid.material.opacity = 0.12;
  batScene.add(grid);
}

// ===== REALISTIC CRICKET BAT =====
function createRealisticBat() {
  var bat = new THREE.Group();

  // --- MATERIALS ---
  // Willow wood — warm natural tone
  var willowMat = new THREE.MeshPhongMaterial({
    color: 0xD4A86A, shininess: 80, specular: 0x443322
  });
  var willowDarkMat = new THREE.MeshPhongMaterial({
    color: 0xC89850, shininess: 70
  });
  // Handle cane
  var caneMat = new THREE.MeshPhongMaterial({
    color: 0x8B6B3D, shininess: 50
  });
  // Grip rubber
  var gripMat = new THREE.MeshPhongMaterial({
    color: 0x1a1a2e, shininess: 40,
    emissive: 0x002244, emissiveIntensity: 0.15
  });
  // Grip accent
  var gripAccentMat = new THREE.MeshPhongMaterial({
    color: 0x00b4d8, shininess: 100,
    emissive: 0x004466, emissiveIntensity: 0.3
  });

  // ====== GRIP (bottom) ======
  // Main rubber grip
  var grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.28, 16), gripMat);
  grip.position.y = -0.36;
  grip.castShadow = true;
  bat.add(grip);

  // Grip cone at very bottom
  var gripCone = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 12), gripAccentMat);
  gripCone.position.y = -0.50;
  bat.add(gripCone);

  // Grip spiral wrapping (rings)
  for (var i = 0; i < 10; i++) {
    var ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.024, 0.003, 6, 16),
      i % 3 === 0 ? gripAccentMat : gripMat
    );
    ring.position.y = -0.46 + i * 0.028;
    ring.rotation.x = Math.PI / 2;
    bat.add(ring);
  }

  // ====== HANDLE (cane section) ======
  var handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.18, 12), caneMat);
  handle.position.y = -0.13;
  handle.castShadow = true;
  bat.add(handle);

  // ====== SPLICE / SHOULDER ======
  // Tapered transition from handle to blade
  var splice = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.065, 0.1, 12), willowDarkMat);
  splice.position.y = 0.01;
  splice.castShadow = true;
  bat.add(splice);

  // Shoulder curve
  var shoulderCurve = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.085, 0.06, 12), willowMat);
  shoulderCurve.position.y = 0.09;
  bat.add(shoulderCurve);

  // ====== BLADE — the hitting face ======
  // Main blade body — flat front, ridged back
  // Front face (flat hitting surface)
  var bladeFront = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.5, 0.032), willowMat);
  bladeFront.position.set(0, 0.37, 0.008);
  bladeFront.castShadow = true;
  bat.add(bladeFront);

  // Blade edges — slightly thicker on the sides
  var edgeGeo = new THREE.BoxGeometry(0.02, 0.48, 0.04);
  var leftEdge = new THREE.Mesh(edgeGeo, willowMat);
  leftEdge.position.set(-0.065, 0.37, 0);
  leftEdge.castShadow = true;
  bat.add(leftEdge);

  var rightEdge = new THREE.Mesh(edgeGeo, willowMat);
  rightEdge.position.set(0.065, 0.37, 0);
  rightEdge.castShadow = true;
  bat.add(rightEdge);

  // Spine (back ridge — gives the bat its "bow")
  var spine = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.46, 8), willowDarkMat);
  spine.position.set(0, 0.37, -0.028);
  spine.castShadow = true;
  bat.add(spine);

  // Back shoulders (where spine widens)
  var backShoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.065, 0.08, 8), willowDarkMat);
  backShoulder.position.set(0, 0.15, -0.02);
  bat.add(backShoulder);

  // ====== STICKER / BRAND AREA ======
  var stickerBg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.08, 0.14),
    new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.06, side: THREE.DoubleSide })
  );
  stickerBg.position.set(0, 0.34, 0.025);
  bat.add(stickerBg);

  // Brand line
  var brandLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.003, 0.001),
    new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.4 })
  );
  brandLine.position.set(0, 0.42, 0.025);
  bat.add(brandLine);

  // Edge highlight lines (subtle)
  var edgeHighlight = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.06 });
  [-0.075, 0.075].forEach(function(x) {
    var line = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.48, 0.038), edgeHighlight);
    line.position.set(x, 0.37, 0);
    bat.add(line);
  });

  // ====== SWEET SPOT ======
  sweetSpotMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 14, 14),
    new THREE.MeshPhongMaterial({
      color: 0xff6b00, emissive: 0xff3300, emissiveIntensity: 0.4,
      transparent: true, opacity: 0.5
    })
  );
  sweetSpotMesh.position.set(0, 0.42, 0.025);
  bat.add(sweetSpotMesh);

  // ====== TOE ======
  // Rounded toe at the bottom of the blade
  var toeMain = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.025, 0.032), willowMat);
  toeMain.position.set(0, 0.625, 0.008);
  bat.add(toeMain);

  // Toe edges
  var toeEdgeL = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.025, 0.04), willowMat);
  toeEdgeL.position.set(-0.065, 0.625, 0);
  bat.add(toeEdgeL);
  var toeEdgeR = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.025, 0.04), willowMat);
  toeEdgeR.position.set(0.065, 0.625, 0);
  bat.add(toeEdgeR);

  // Toe guard (white rubber strip)
  var toeGuard = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.012, 0.05),
    new THREE.MeshPhongMaterial({ color: 0xe8e8e8, shininess: 60 })
  );
  toeGuard.position.set(0, 0.64, 0);
  bat.add(toeGuard);

  return bat;
}

// ===== ANIMATION =====
function animateBat() {
  requestAnimationFrame(animateBat);
  if (!batGroup || !batRenderer) return;

  // Smooth interpolation
  var lerp = 0.12;
  batCurrentRot.x += (batTargetRot.x - batCurrentRot.x) * lerp;
  batCurrentRot.y += (batTargetRot.y - batCurrentRot.y) * lerp;
  batCurrentRot.z += (batTargetRot.z - batCurrentRot.z) * lerp;

  batGroup.rotation.x = batCurrentRot.x;
  batGroup.rotation.y = batCurrentRot.y;
  batGroup.rotation.z = batCurrentRot.z;

  // Sweet spot glow on impact
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

  // ===== SWING PATH TRACE =====
  // Track the bat toe (tip) world position
  // The bat child is rotated 180°, so toe is at y=0.64 in child → maps to y=-0.64 in world-relative
  var tipLocal = new THREE.Vector3(0, -0.64, 0);
  var tipWorld = tipLocal.clone();
  batGroup.localToWorld(tipWorld);

  var speed = Math.sqrt(
    Math.pow(batTargetRot.x - batCurrentRot.x, 2) +
    Math.pow(batTargetRot.y - batCurrentRot.y, 2) +
    Math.pow(batTargetRot.z - batCurrentRot.z, 2)
  );

  trailPoints.push({ pos: tipWorld.clone(), speed: speed });
  if (trailPoints.length > MAX_TRAIL) trailPoints.shift();

  // Update trail lines
  if (trailPoints.length > 2) {
    var positions = new Float32Array(trailPoints.length * 3);
    trailPoints.forEach(function(p, i) {
      positions[i * 3] = p.pos.x;
      positions[i * 3 + 1] = p.pos.y;
      positions[i * 3 + 2] = p.pos.z;
    });

    if (trailLine) {
      trailLine.geometry.dispose();
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      trailLine.geometry = geo;
    }
    if (trailGlowLine) {
      trailGlowLine.geometry.dispose();
      var gGeo = new THREE.BufferGeometry();
      gGeo.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3));
      trailGlowLine.geometry = gGeo;
    }
  }

  // Trail dots
  var oldDots = batScene.children.filter(function(c) { return c.userData && c.userData.isTrailDot; });
  oldDots.forEach(function(d) { batScene.remove(d); d.geometry.dispose(); d.material.dispose(); });

  for (var i = 0; i < trailPoints.length; i += 6) {
    var p = trailPoints[i];
    var alpha = i / trailPoints.length;
    var dotSize = 0.008 + alpha * 0.012;
    var dotGeo = new THREE.SphereGeometry(dotSize, 6, 6);
    var isMoving = p.speed > 0.008;
    var dotMat = new THREE.MeshBasicMaterial({
      color: isMoving ? 0xff6b00 : 0x00d4ff,
      transparent: true,
      opacity: 0.1 + alpha * 0.7
    });
    var dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.copy(p.pos);
    dot.userData.isTrailDot = true;
    batScene.add(dot);
  }

  // Camera orbit
  gridPulseTime += 0.005;
  batCamera.position.x = 2.0 + Math.sin(gridPulseTime * 0.18) * 0.15;
  batCamera.position.y = 0.8 + Math.cos(gridPulseTime * 0.12) * 0.06;
  batCamera.lookAt(0, -0.3, 0);

  batRenderer.render(batScene, batCamera);
}

// ===== SENSOR → ROTATION =====
var integratedRot = { x: 0, y: 0, z: 0 };

function update3DBat(gy, gx, gz, impact) {
  var dt = 0.022;
  integratedRot.x += (gx * Math.PI / 180) * dt;
  integratedRot.y += (gy * Math.PI / 180) * dt;
  integratedRot.z += (gz * Math.PI / 180) * dt;

  integratedRot.x *= 0.93;
  integratedRot.y *= 0.93;
  integratedRot.z *= 0.93;

  var maxRot = Math.PI / 1.2;
  batTargetRot.x = Math.min(maxRot, Math.max(-maxRot, integratedRot.x));
  batTargetRot.y = Math.min(maxRot, Math.max(-maxRot, integratedRot.y));
  batTargetRot.z = Math.min(maxRot, Math.max(-maxRot, integratedRot.z));

  if (impact > 2.0) {
    batGlowIntensity = Math.min(3.5, impact / 3.5);
  }
}

function resetBat3D() {
  batTargetRot = { x: 0, y: 0, z: 0 };
  integratedRot = { x: 0, y: 0, z: 0 };
  trailPoints = [];
  if (batScene) {
    var dots = batScene.children.filter(function(c) { return c.userData && c.userData.isTrailDot; });
    dots.forEach(function(d) { batScene.remove(d); d.geometry.dispose(); d.material.dispose(); });
  }
}
