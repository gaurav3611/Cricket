/**
 * =====================================================
 * SwingLab — 3D Cricket Bat (Realistic) + Swing Trace
 * =====================================================
 * Modeled after a real cricket bat reference image.
 * Grip at top, toe at bottom (facing down).
 * Wide flat blade, narrow handle, proper proportions.
 */

let batScene, batCamera, batRenderer, batGroup;
let batTargetRot = { x: 0, y: 0, z: 0 };
let batCurrentRot = { x: 0, y: 0, z: 0 };
let batGlowIntensity = 0;
let sweetSpotMesh = null;
let gridPulseTime = 0;
let trailPoints = [];
const MAX_TRAIL = 500;
let trailLine = null;
let trailGlowLine = null;

function init3DBat(containerId) {
  var container = document.getElementById(containerId);
  if (!container) return;

  batScene = new THREE.Scene();
  batScene.fog = new THREE.FogExp2(0x020610, 0.03);

  var height = container.offsetHeight || 420;
  batCamera = new THREE.PerspectiveCamera(40, container.offsetWidth / height, 0.1, 100);
  // Position camera to see the full bat
  batCamera.position.set(1.2, 0.2, 3.0);
  batCamera.lookAt(0, 0, 0);

  batRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  batRenderer.setSize(container.offsetWidth, height);
  batRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  batRenderer.setClearColor(0x020610, 1);
  batRenderer.shadowMap.enabled = true;
  batRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
  batRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  batRenderer.toneMappingExposure = 1.6;
  container.appendChild(batRenderer.domElement);

  setupLighting();
  buildEnvironment();

  // Build bat — grip at top, toe at bottom
  batGroup = new THREE.Group();
  var bat = buildCricketBat();
  batGroup.add(bat);
  batScene.add(batGroup);

  // Trail
  trailLine = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, linewidth: 2 })
  );
  batScene.add(trailLine);

  trailGlowLine = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, linewidth: 4 })
  );
  batScene.add(trailGlowLine);

  window.addEventListener('resize', function() {
    if (!container || !batRenderer) return;
    batCamera.aspect = container.offsetWidth / (container.offsetHeight || 420);
    batCamera.updateProjectionMatrix();
    batRenderer.setSize(container.offsetWidth, container.offsetHeight || 420);
  });

  animateBat();
}

function setupLighting() {
  batScene.add(new THREE.AmbientLight(0x2a3a54, 3.0));

  // Key — warm white from front-right
  var key = new THREE.DirectionalLight(0xfff8ee, 3.0);
  key.position.set(3, 5, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  batScene.add(key);

  // Fill — warm from left
  var fill = new THREE.PointLight(0xffaa66, 1.5, 12);
  fill.position.set(-4, 2, 3);
  batScene.add(fill);

  // Rim — cool cyan from behind
  var rim = new THREE.PointLight(0x00d4ff, 2.0, 10);
  rim.position.set(0, 0, -5);
  batScene.add(rim);

  // Under — subtle purple
  var under = new THREE.PointLight(0x4422cc, 0.5, 6);
  under.position.set(0, -3, 1);
  batScene.add(under);
}

function buildEnvironment() {
  // Ground
  var ground = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 16),
    new THREE.MeshPhongMaterial({ color: 0x010308, transparent: true, opacity: 0.9, side: THREE.DoubleSide, shininess: 100, specular: 0x112233 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2.0;
  ground.receiveShadow = true;
  batScene.add(ground);

  // Grid
  var grid = new THREE.GridHelper(12, 48, 0x00d4ff, 0x081420);
  grid.position.y = -1.99;
  grid.material.transparent = true;
  grid.material.opacity = 0.1;
  batScene.add(grid);
}

// ===============================================
// BUILD REALISTIC CRICKET BAT
// Proportions based on real bat reference image:
//   Total length ~86cm → 2.15 units
//   Blade: 56cm (1.4u) wide 10.8cm (0.27u) thick 4cm (0.1u)
//   Handle: 30cm (0.75u) diameter 3.8cm (0.095u)
//   Grip at TOP, Toe at BOTTOM
// ===============================================
function buildCricketBat() {
  var bat = new THREE.Group();

  // ---- MATERIALS ----
  // Natural willow — light cream/beige
  var willowMat = new THREE.MeshPhongMaterial({
    color: 0xf0dfc0, shininess: 40, specular: 0x332211
  });
  // Slightly darker edges
  var willowEdgeMat = new THREE.MeshPhongMaterial({
    color: 0xe5d0a8, shininess: 35
  });
  // Darker spine
  var spineMat = new THREE.MeshPhongMaterial({
    color: 0xd8c49a, shininess: 30
  });
  // Handle cane
  var caneMat = new THREE.MeshPhongMaterial({
    color: 0xc4a87a, shininess: 50
  });
  // Grip — dark navy/grey
  var gripMat = new THREE.MeshPhongMaterial({
    color: 0x3a4055, shininess: 30
  });
  // Grip chevron accent
  var gripChevMat = new THREE.MeshBasicMaterial({
    color: 0x8090a0, transparent: true, opacity: 0.5
  });
  // Sticker — dark navy blue
  var stickerBgMat = new THREE.MeshBasicMaterial({
    color: 0x0a1e3d, transparent: true, opacity: 0.85, side: THREE.DoubleSide
  });
  // Sticker gold accent
  var stickerGoldMat = new THREE.MeshBasicMaterial({
    color: 0xc8a84e, transparent: true, opacity: 0.9, side: THREE.DoubleSide
  });
  // Toe guard — white rubber
  var toeGuardMat = new THREE.MeshPhongMaterial({
    color: 0xf5f5f0, shininess: 60
  });

  // ============ GRIP (top of bat, y = 0.7 to 1.08) ============
  // Main grip cylinder
  var grip = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.045, 0.38, 20), gripMat);
  grip.position.y = 0.89;
  grip.castShadow = true;
  bat.add(grip);

  // Grip end cap (top ball)
  var gripCap = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), gripMat);
  gripCap.scale.y = 0.6;
  gripCap.position.y = 1.08;
  bat.add(gripCap);

  // Grip chevron/spiral rings
  for (var i = 0; i < 12; i++) {
    var ringMat = (i % 2 === 0) ? gripChevMat : gripMat;
    var ring = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.004, 6, 20), ringMat);
    ring.position.y = 0.72 + i * 0.03;
    ring.rotation.x = Math.PI / 2;
    bat.add(ring);
  }

  // ============ HANDLE (y = 0.32 to 0.7) ============
  var handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.038, 0.38, 16), caneMat);
  handle.position.y = 0.51;
  handle.castShadow = true;
  bat.add(handle);

  // ============ SHOULDER/SPLICE (y = 0.12 to 0.32) ============
  // Tapered transition — handle width to blade width
  var shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.12, 0.2, 16), willowEdgeMat);
  shoulder.position.y = 0.22;
  shoulder.castShadow = true;
  bat.add(shoulder);

  // ============ BLADE (y = -1.08 to 0.12) ============
  // Main blade face — wide and flat
  var bladeH = 1.2;
  var bladeW = 0.27;
  var bladeD = 0.08;
  
  var bladeFace = new THREE.Mesh(new THREE.BoxGeometry(bladeW, bladeH, bladeD * 0.5), willowMat);
  bladeFace.position.set(0, -0.48, 0.015);
  bladeFace.castShadow = true;
  bat.add(bladeFace);

  // Blade edges (thicker sides)
  var edgeH = bladeH;
  var edgeW = 0.025;
  var edgeD = bladeD;
  
  var edgeL = new THREE.Mesh(new THREE.BoxGeometry(edgeW, edgeH, edgeD), willowEdgeMat);
  edgeL.position.set(-bladeW / 2 - edgeW / 2 + 0.005, -0.48, 0);
  edgeL.castShadow = true;
  bat.add(edgeL);

  var edgeR = new THREE.Mesh(new THREE.BoxGeometry(edgeW, edgeH, edgeD), willowEdgeMat);
  edgeR.position.set(bladeW / 2 + edgeW / 2 - 0.005, -0.48, 0);
  edgeR.castShadow = true;
  bat.add(edgeR);

  // Spine (back of blade — raised ridge)
  var spineMain = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, bladeH * 0.9, 8), spineMat);
  spineMain.position.set(0, -0.48, -bladeD * 0.35);
  spineMain.castShadow = true;
  bat.add(spineMain);

  // ============ STICKER (front face of blade, upper section) ============
  // Shield/diamond background
  var stickerW = 0.18;
  var stickerH = 0.35;
  
  // Sticker background — dark navy rectangle with slight angle
  var stickerBg = new THREE.Mesh(new THREE.PlaneGeometry(stickerW, stickerH), stickerBgMat);
  stickerBg.position.set(0, -0.15, bladeD * 0.26);
  bat.add(stickerBg);

  // Gold border lines on sticker
  var borderMat = stickerGoldMat;
  // Top line
  var sTop = new THREE.Mesh(new THREE.PlaneGeometry(stickerW, 0.005), borderMat);
  sTop.position.set(0, -0.15 + stickerH / 2, bladeD * 0.261);
  bat.add(sTop);
  // Bottom line
  var sBot = new THREE.Mesh(new THREE.PlaneGeometry(stickerW, 0.005), borderMat);
  sBot.position.set(0, -0.15 - stickerH / 2, bladeD * 0.261);
  bat.add(sBot);
  // Left line
  var sLeft = new THREE.Mesh(new THREE.PlaneGeometry(0.005, stickerH), borderMat);
  sLeft.position.set(-stickerW / 2, -0.15, bladeD * 0.261);
  bat.add(sLeft);
  // Right line
  var sRight = new THREE.Mesh(new THREE.PlaneGeometry(0.005, stickerH), borderMat);
  sRight.position.set(stickerW / 2, -0.15, bladeD * 0.261);
  bat.add(sRight);

  // Diagonal gold lines (like the Century logo style)
  var diag1 = new THREE.Mesh(new THREE.PlaneGeometry(stickerW * 0.9, 0.004), borderMat);
  diag1.position.set(0, -0.08, bladeD * 0.262);
  diag1.rotation.z = -0.15;
  bat.add(diag1);

  var diag2 = new THREE.Mesh(new THREE.PlaneGeometry(stickerW * 0.9, 0.004), borderMat);
  diag2.position.set(0, -0.22, bladeD * 0.262);
  diag2.rotation.z = 0.15;
  bat.add(diag2);

  // Stars (3 dots above brand area)
  for (var s = -1; s <= 1; s++) {
    var star = new THREE.Mesh(new THREE.CircleGeometry(0.008, 8), stickerGoldMat);
    star.position.set(s * 0.03, -0.05, bladeD * 0.263);
    bat.add(star);
  }

  // ============ SWEET SPOT (invisible glow point) ============
  sweetSpotMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 14, 14),
    new THREE.MeshPhongMaterial({
      color: 0xff6b00, emissive: 0xff3300, emissiveIntensity: 0.3,
      transparent: true, opacity: 0.4
    })
  );
  sweetSpotMesh.position.set(0, -0.55, bladeD * 0.26);
  bat.add(sweetSpotMesh);

  // ============ TOE (bottom of blade) ============
  // Flat bottom
  var toeFlat = new THREE.Mesh(new THREE.BoxGeometry(bladeW + 0.04, 0.02, bladeD), willowEdgeMat);
  toeFlat.position.set(0, -1.09, 0);
  bat.add(toeFlat);

  // Toe guard — white rubber strip
  var toeGuard = new THREE.Mesh(new THREE.BoxGeometry(bladeW + 0.05, 0.025, bladeD + 0.01), toeGuardMat);
  toeGuard.position.set(0, -1.1, 0);
  bat.add(toeGuard);

  return bat;
}

// ===== ANIMATION =====
function animateBat() {
  requestAnimationFrame(animateBat);
  if (!batGroup || !batRenderer) return;

  var lerp = 0.12;
  batCurrentRot.x += (batTargetRot.x - batCurrentRot.x) * lerp;
  batCurrentRot.y += (batTargetRot.y - batCurrentRot.y) * lerp;
  batCurrentRot.z += (batTargetRot.z - batCurrentRot.z) * lerp;

  batGroup.rotation.x = batCurrentRot.x;
  batGroup.rotation.y = batCurrentRot.y;
  batGroup.rotation.z = batCurrentRot.z;

  // Sweet spot glow
  if (sweetSpotMesh) {
    if (batGlowIntensity > 0.01) {
      sweetSpotMesh.material.emissiveIntensity = batGlowIntensity * 3;
      sweetSpotMesh.material.opacity = 0.3 + batGlowIntensity * 0.6;
      sweetSpotMesh.scale.setScalar(1 + batGlowIntensity * 0.8);
      batGlowIntensity *= 0.90;
    } else {
      sweetSpotMesh.material.emissiveIntensity = 0.3;
      sweetSpotMesh.material.opacity = 0.4;
      sweetSpotMesh.scale.setScalar(1);
    }
  }

  // ===== SWING PATH TRACE =====
  // Track toe position (bottom of bat)
  var toeLocal = new THREE.Vector3(0, -1.1, 0);
  var toeWorld = toeLocal.clone();
  batGroup.localToWorld(toeWorld);

  var speed = Math.sqrt(
    Math.pow(batTargetRot.x - batCurrentRot.x, 2) +
    Math.pow(batTargetRot.y - batCurrentRot.y, 2) +
    Math.pow(batTargetRot.z - batCurrentRot.z, 2)
  );

  trailPoints.push({ pos: toeWorld.clone(), speed: speed });
  if (trailPoints.length > MAX_TRAIL) trailPoints.shift();

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
    var dotGeo = new THREE.SphereGeometry(0.008 + alpha * 0.01, 6, 6);
    var dotMat = new THREE.MeshBasicMaterial({
      color: p.speed > 0.008 ? 0xffffff : 0xcccccc,
      transparent: true,
      opacity: 0.15 + alpha * 0.75
    });
    var dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.copy(p.pos);
    dot.userData.isTrailDot = true;
    batScene.add(dot);
  }

  // Camera slow orbit
  gridPulseTime += 0.004;
  batCamera.position.x = 1.2 + Math.sin(gridPulseTime * 0.15) * 0.12;
  batCamera.position.y = 0.2 + Math.cos(gridPulseTime * 0.1) * 0.05;
  batCamera.lookAt(0, 0, 0);

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
