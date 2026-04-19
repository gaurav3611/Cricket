/**
 * =====================================================
 * SwingLab — 3D Batsman Visualization (Three.js r128)
 * =====================================================
 * Full-body cricket batsman with properly proportioned human
 * anatomy, batting gear, helmet, pads, and bat.
 * Responds to real-time gyroscope data with smooth animation.
 */

let batScene, batCamera, batRenderer, batGroup, upperBodyGroup;
let batTargetRot = { x: 0, y: 0, z: 0 };
let batCurrentRot = { x: 0, y: 0, z: 0 };
let batGlowIntensity = 0;
let sweetSpotMesh = null;
let trailPoints = [];
const MAX_TRAIL = 100;
let gridPulseTime = 0;

function init3DBat(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  // Scene
  batScene = new THREE.Scene();
  batScene.fog = new THREE.FogExp2(0x020610, 0.06);
  
  // Camera — positioned to see full batsman
  const height = container.offsetHeight || 420;
  batCamera = new THREE.PerspectiveCamera(42, container.offsetWidth / height, 0.1, 100);
  batCamera.position.set(3.5, 2.0, 4.5);
  batCamera.lookAt(0, 0.6, 0);
  
  // Renderer
  batRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  batRenderer.setSize(container.offsetWidth, height);
  batRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  batRenderer.setClearColor(0x020610, 1);
  batRenderer.shadowMap.enabled = true;
  batRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
  batRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  batRenderer.toneMappingExposure = 1.6;
  container.appendChild(batRenderer.domElement);
  
  // Lighting
  setupLighting();
  
  // Build Scene
  buildEnvironment();
  buildBatsman();
  
  // Bat tip trail line — glowing cyan path
  const trailGeo = new THREE.BufferGeometry();
  const trailMat = new THREE.LineBasicMaterial({ 
    color: 0x00d4ff, transparent: true, opacity: 0.85, linewidth: 2
  });
  const trail = new THREE.Line(trailGeo, trailMat);
  trail.name = 'trail';
  batScene.add(trail);
  
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
  // Ambient — cool tone
  batScene.add(new THREE.AmbientLight(0x1a2a44, 3.0));
  
  // Key light — bright white-cyan from front-right
  const keyLight = new THREE.DirectionalLight(0xddeeff, 3.5);
  keyLight.position.set(4, 8, 6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 1024;
  keyLight.shadow.mapSize.height = 1024;
  keyLight.shadow.bias = -0.001;
  batScene.add(keyLight);
  
  // Fill — warm from left
  const fillLight = new THREE.PointLight(0xff8844, 2.0, 15);
  fillLight.position.set(-4, 3, 3);
  batScene.add(fillLight);
  
  // Rim — back light for silhouette
  const rimLight = new THREE.PointLight(0x00d4ff, 2.0, 12);
  rimLight.position.set(-1, 3, -5);
  batScene.add(rimLight);

  // Ground bounce
  const bounceLight = new THREE.PointLight(0x00ff88, 0.5, 6);
  bounceLight.position.set(0, -1, 0);
  batScene.add(bounceLight);
}

function buildEnvironment() {
  // Cricket pitch impression
  const pitchMat = new THREE.MeshPhongMaterial({ 
    color: 0x0a1a0a, shininess: 40, specular: 0x112211, 
    transparent: true, opacity: 0.95, side: THREE.DoubleSide
  });
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), pitchMat);
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.y = 0;
  pitch.receiveShadow = true;
  batScene.add(pitch);
  
  // Grid
  const grid = new THREE.GridHelper(14, 50, 0x00d4ff, 0x0a1a2e);
  grid.position.y = 0.001;
  grid.material.transparent = true;
  grid.material.opacity = 0.12;
  batScene.add(grid);
  
  // Crease line
  const creaseMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 });
  const crease = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.005, 0.025), creaseMat);
  crease.position.set(0, 0.003, 0.5);
  batScene.add(crease);
}

// ===== PROPER HUMAN BATSMAN =====
function buildBatsman() {
  const playerGroup = new THREE.Group();
  
  // ---- MATERIALS ----
  // Cricket whites / jersey (dark cyber version)
  const jerseyMat = new THREE.MeshPhysicalMaterial({
    color: 0x141e30, metalness: 0.3, roughness: 0.6, 
    clearcoat: 0.2
  });
  // Skin tone
  const skinMat = new THREE.MeshPhysicalMaterial({
    color: 0xc68642, metalness: 0.1, roughness: 0.7
  });
  // White pads
  const padMat = new THREE.MeshPhongMaterial({ 
    color: 0xe8ecf0, shininess: 90, specular: 0x334455
  });
  // Helmet — dark blue metallic
  const helmetMat = new THREE.MeshPhysicalMaterial({
    color: 0x0a1a40, metalness: 0.9, roughness: 0.1, 
    clearcoat: 1.0
  });
  // Shoes
  const shoeMat = new THREE.MeshPhongMaterial({ color: 0xf0f0f0, shininess: 70 });
  // Gloves
  const gloveMat = new THREE.MeshPhongMaterial({ color: 0xf0f0f0, shininess: 90, specular: 0x666666 });
  
  // ===== LOWER BODY (static — stays planted) =====
  const lowerBody = new THREE.Group();
  
  // --- HIPS ---
  const hips = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.25, 0.2, 16),
    jerseyMat
  );
  hips.position.y = 0.95;
  hips.castShadow = true;
  lowerBody.add(hips);
  
  // --- LEGS ---
  const buildLeg = (side) => {
    const xOff = side === 'left' ? -0.14 : 0.14;
    const leg = new THREE.Group();
    leg.position.set(xOff, 0.95, 0);
    
    // Thigh — angled for batting stance
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.075, 0.42, 12), jerseyMat);
    thigh.position.y = -0.23;
    thigh.rotation.x = side === 'left' ? -0.15 : -0.08;
    thigh.castShadow = true;
    leg.add(thigh);
    
    // Knee joint
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), jerseyMat);
    knee.position.set(0, -0.44, side === 'left' ? 0.06 : 0.03);
    leg.add(knee);
    
    // Shin
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.05, 0.42, 12), jerseyMat);
    shin.position.set(0, -0.66, side === 'left' ? 0.08 : 0.04);
    shin.castShadow = true;
    leg.add(shin);
    
    // Cricket Pad — proper shape
    const padGroup = new THREE.Group();
    padGroup.position.set(0, -0.60, side === 'left' ? 0.16 : 0.12);
    
    const padBody = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.48, 0.09), padMat);
    padBody.castShadow = true;
    padGroup.add(padBody);
    
    // Pad knee roll
    const padRoll = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 12), padMat);
    padRoll.rotation.z = Math.PI / 2;
    padRoll.position.y = 0.2;
    padGroup.add(padRoll);
    
    // Pad straps (cyan glow accent)
    const strapMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.4 });
    [-0.08, 0.08].forEach(yOff => {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.06, 0.1), strapMat);
      strap.position.set(0.085, yOff, 0);
      padGroup.add(strap);
    });
    
    leg.add(padGroup);
    
    // Shoe
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.2), shoeMat);
    shoe.position.set(0, -0.88, side === 'left' ? 0.12 : 0.06);
    shoe.castShadow = true;
    leg.add(shoe);
    
    // Shoe sole accent
    const soleMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.3 });
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.01, 0.2), soleMat);
    sole.position.set(0, -0.91, side === 'left' ? 0.12 : 0.06);
    leg.add(sole);
    
    return leg;
  };
  
  lowerBody.add(buildLeg('left'));
  lowerBody.add(buildLeg('right'));
  playerGroup.add(lowerBody);
  
  // ===== UPPER BODY (rotates with swing) =====
  upperBodyGroup = new THREE.Group();
  upperBodyGroup.position.set(0, 1.05, 0);
  
  // --- TORSO / CHEST ---
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.2, 0.55, 16),
    jerseyMat
  );
  torso.position.y = 0.3;
  torso.castShadow = true;
  upperBodyGroup.add(torso);
  
  // Jersey number area
  const numberPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(0.15, 0.18),
    new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide })
  );
  numberPlane.position.set(0.06, 0.35, 0.223);
  upperBodyGroup.add(numberPlane);
  
  // Jersey collar
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.14, 0.06, 12),
    new THREE.MeshPhongMaterial({ color: 0x1a2844, shininess: 60 })
  );
  collar.position.y = 0.58;
  upperBodyGroup.add(collar);
  
  // --- NECK ---
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.07, 0.1, 12),
    skinMat
  );
  neck.position.y = 0.64;
  upperBodyGroup.add(neck);
  
  // --- SHOULDERS ---
  const buildShoulder = (side) => {
    const x = side === 'left' ? -0.27 : 0.27;
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 12), jerseyMat);
    shoulder.position.set(x, 0.52, 0);
    shoulder.castShadow = true;
    return shoulder;
  };
  upperBodyGroup.add(buildShoulder('left'));
  upperBodyGroup.add(buildShoulder('right'));

  // --- HEAD / HELMET ---
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.74, 0);
  
  // Head shape — slightly elongated sphere
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 24, 24),
    helmetMat
  );
  head.scale.set(1, 1.1, 1);
  head.castShadow = true;
  headGroup.add(head);
  
  // Helmet peak/visor
  const peak = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.02, 0.1),
    helmetMat
  );
  peak.position.set(0, -0.04, 0.12);
  peak.rotation.x = -0.2;
  headGroup.add(peak);
  
  // Face grill — wireframe cage
  const grillMat = new THREE.MeshBasicMaterial({ 
    color: 0x88aacc, wireframe: true, transparent: true, opacity: 0.5
  });
  const grill = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.1, 0.1),
    grillMat
  );
  grill.position.set(0, -0.06, 0.1);
  headGroup.add(grill);
  
  // Face area (visible behind grill)
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.1, 0.08),
    new THREE.MeshPhongMaterial({ color: 0xc68642, side: THREE.DoubleSide })
  );
  face.position.set(0, -0.05, 0.08);
  headGroup.add(face);
  
  // Helmet center line accent
  const helmetStripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.005, 0.26, 0.005),
    new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.6 })
  );
  helmetStripe.position.set(0, 0.02, 0.135);
  headGroup.add(helmetStripe);
  
  // Head turned towards bowler
  headGroup.rotation.y = -Math.PI / 4;
  upperBodyGroup.add(headGroup);
  
  // --- ARMS (batting stance — both hands on bat) ---
  
  // Left upper arm
  const armLU = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.32, 10), jerseyMat);
  armLU.position.set(-0.28, 0.35, 0.1);
  armLU.rotation.set(0.7, 0, -0.5);
  armLU.castShadow = true;
  upperBodyGroup.add(armLU);
  
  // Left forearm
  const armLF = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.28, 10), skinMat);
  armLF.position.set(-0.16, 0.12, 0.32);
  armLF.rotation.set(0.9, 0, -0.15);
  armLF.castShadow = true;
  upperBodyGroup.add(armLF);
  
  // Left glove
  const gloveL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), gloveMat);
  gloveL.position.set(-0.06, -0.02, 0.44);
  upperBodyGroup.add(gloveL);
  
  // Right upper arm
  const armRU = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.32, 10), jerseyMat);
  armRU.position.set(0.28, 0.35, 0.1);
  armRU.rotation.set(0.7, 0, 0.5);
  armRU.castShadow = true;
  upperBodyGroup.add(armRU);
  
  // Right forearm
  const armRF = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.28, 10), skinMat);
  armRF.position.set(0.16, 0.12, 0.32);
  armRF.rotation.set(0.9, 0, 0.15);
  armRF.castShadow = true;
  upperBodyGroup.add(armRF);
  
  // Right glove
  const gloveR = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), gloveMat);
  gloveR.position.set(0.06, -0.02, 0.44);
  upperBodyGroup.add(gloveR);
  
  // --- THE BAT ---
  batGroup = createBat();
  batGroup.position.set(0, -0.08, 0.45);
  batGroup.rotation.x = Math.PI / 1.5; // bat held at angle
  upperBodyGroup.add(batGroup);
  
  playerGroup.add(upperBodyGroup);
  
  // ---- STANCE ----
  // Right-handed batsman facing the bowler
  playerGroup.rotation.y = Math.PI / 4;
  
  batScene.add(playerGroup);
}

function createBat() {
  const bat = new THREE.Group();
  
  // Grip (bottom of handle)
  const gripMat = new THREE.MeshPhongMaterial({ 
    color: 0x00b4d8, shininess: 100,
    emissive: 0x003344, emissiveIntensity: 0.3
  });
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.24), gripMat);
  grip.position.y = -0.28;
  bat.add(grip);
  
  // Handle
  const handleMat = new THREE.MeshPhongMaterial({ color: 0x7B4E2C, shininess: 50 });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.2), handleMat);
  handle.position.y = -0.1;
  handle.castShadow = true;
  bat.add(handle);
  
  // Splice / shoulder
  const spliceMat = new THREE.MeshPhongMaterial({ color: 0xC4A265 });
  const splice = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.085, 0.12), spliceMat);
  splice.position.y = 0.06;
  splice.castShadow = true;
  bat.add(splice);
  
  // Blade — willow
  const woodMat = new THREE.MeshPhongMaterial({ 
    color: 0xD4A86A, shininess: 80, specular: 0x443322
  });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.045), woodMat);
  blade.position.y = 0.4;
  blade.castShadow = true;
  bat.add(blade);
  
  // Blade spine (back ridge)
  const spine = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.5, 0.02),
    new THREE.MeshPhongMaterial({ color: 0xc89e55 })
  );
  spine.position.set(0, 0.4, -0.03);
  bat.add(spine);
  
  // Edge highlight
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.12 });
  [-0.09, 0.09].forEach(xOff => {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.53, 0.043), edgeMat);
    edge.position.set(xOff, 0.4, 0);
    bat.add(edge);
  });
  
  // Sticker / brand area
  const stickerMat = new THREE.MeshBasicMaterial({ 
    color: 0xff6b00, transparent: true, opacity: 0.1, side: THREE.DoubleSide
  });
  const sticker = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.2), stickerMat);
  sticker.position.set(0, 0.35, 0.024);
  bat.add(sticker);
  
  // Sweet spot glow
  sweetSpotMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 14, 14),
    new THREE.MeshPhongMaterial({ 
      color: 0xff6b00, 
      emissive: 0xff3300, 
      emissiveIntensity: 0.4, 
      transparent: true, 
      opacity: 0.5
    })
  );
  sweetSpotMesh.position.set(0, 0.48, 0.023);
  bat.add(sweetSpotMesh);
  
  // Toe
  const toe = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.035, 0.045),
    new THREE.MeshPhongMaterial({ color: 0xC8A060 })
  );
  toe.position.y = 0.68;
  bat.add(toe);
  
  return bat;
}

// ===== ANIMATION LOOP =====
function animateBat() {
  requestAnimationFrame(animateBat);
  if (!upperBodyGroup || !batRenderer) return;
  
  // Smooth interpolation
  const lerp = 0.12;
  batCurrentRot.x += (batTargetRot.x - batCurrentRot.x) * lerp;
  batCurrentRot.y += (batTargetRot.y - batCurrentRot.y) * lerp;
  batCurrentRot.z += (batTargetRot.z - batCurrentRot.z) * lerp;
  
  // Apply to upper body (torso + arms + bat rotate together)
  upperBodyGroup.rotation.x = batCurrentRot.x;
  upperBodyGroup.rotation.y = batCurrentRot.y;
  upperBodyGroup.rotation.z = batCurrentRot.z;
  
  // Sweet spot impact glow
  if (sweetSpotMesh) {
    if (batGlowIntensity > 0.01) {
      sweetSpotMesh.material.emissiveIntensity = batGlowIntensity * 2.5;
      sweetSpotMesh.material.opacity = 0.3 + batGlowIntensity * 0.5;
      sweetSpotMesh.scale.setScalar(1 + batGlowIntensity * 0.6);
      batGlowIntensity *= 0.91;
    } else {
      sweetSpotMesh.material.emissiveIntensity = 0.4;
      sweetSpotMesh.material.opacity = 0.5;
      sweetSpotMesh.scale.setScalar(1);
    }
  }
  
  // Update bat tip trail (swing path visualization)
  if (batGroup) {
    const tipWorldPos = new THREE.Vector3(0, 0.68, 0);
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
  }
  
  // Gentle camera orbit for premium feel
  gridPulseTime += 0.006;
  batCamera.position.x = 3.5 + Math.sin(gridPulseTime * 0.2) * 0.2;
  batCamera.position.y = 2.0 + Math.cos(gridPulseTime * 0.15) * 0.1;
  batCamera.lookAt(0, 0.6, 0);
  
  batRenderer.render(batScene, batCamera);
}

// ===== SENSOR DATA → 3D ROTATION =====
let integratedRot = { x: 0, y: 0, z: 0 };

function update3DBat(gy, gx, gz, impact) {
  const dt = 0.022;
  integratedRot.x += (gx * Math.PI / 180) * dt;
  integratedRot.y += (gy * Math.PI / 180) * dt;
  integratedRot.z += (gz * Math.PI / 180) * dt;
  
  // Smooth decay back to stance
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
}
