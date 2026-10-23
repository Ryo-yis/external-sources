const areas = new Map([
  [oceanArea.id, oceanArea],
  [desertArea.id, desertArea],
]);

const WALK_SPEED = 3.2;
const RUN_SPEED = 5.4;
const TURN_SPEED = 1.8;
const MOUSE_SENSITIVITY = 0.0035;
const MIN_RESOLUTION_SCALE = 0.65;
const MAX_RESOLUTION_SCALE = 1.25;
const PLAYER_RADIUS = 0.2;
const FIELD_OF_VIEW = Math.PI / 2.6;
const VIEW_MATRIX = new Float32Array(16);
const PROJECTION_MATRIX = new Float32Array(16);
const VIEW_PROJECTION_MATRIX = new Float32Array(16);
const VIEW_DIRECTION = new Float32Array(3);
const VIEW_RIGHT = new Float32Array(3);
const VIEW_UP = new Float32Array(3);
const VIEW_EYE = new Float32Array(3);
const OCEAN_SUN_COLOR = new Float32Array([1, 0.82, 0.56]);
const DESERT_SUN_COLOR = new Float32Array([1, 0.72, 0.4]);
const OCEAN_FOG_COLOR = new Float32Array([0.55, 0.66, 0.62]);
const DESERT_FOG_COLOR = new Float32Array([0.75, 0.61, 0.42]);
const LIGHT_DIRECTION = new Float32Array([-0.48, 0.78, 0.38]);
const WALKABLE_TILES = new Set([".", "f", "s", "b", "P", "h", "c", "o", "B"]);
const SKY_VERTEX_SHADER = `
  precision mediump float;
  attribute vec2 aPosition;
  varying vec2 vUv;
  void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.999, 1.0);
  }
`;
const SKY_FRAGMENT_SHADER = `
  precision mediump float;
  varying vec2 vUv;
  uniform vec3 uForward;
  uniform vec3 uRight;
  uniform vec3 uUp;
  uniform vec3 uSunColor;
  uniform float uAspect;
  uniform float uFovScale;
  uniform float uTime;
  uniform float uDesert;

  void main() {
    vec2 screen = (vUv * 2.0 - 1.0) * vec2(uAspect, 1.0) * uFovScale;
    vec3 ray = normalize(uForward + uRight * screen.x + uUp * screen.y);
    float horizon = smoothstep(-0.2, 0.75, ray.y);
    vec3 zenith = mix(vec3(0.15, 0.32, 0.49), vec3(0.2, 0.4, 0.55), uDesert);
    vec3 horizonColor = mix(vec3(0.75, 0.78, 0.68), vec3(0.91, 0.72, 0.48), uDesert);
    vec3 color = mix(horizonColor, zenith, horizon);

    float ridge = sin(atan(ray.x, ray.z) * 7.0 + 0.6) * 0.055
      + sin(atan(ray.x, ray.z) * 15.0 - 0.8) * 0.025;
    float mountain = 1.0 - smoothstep(-0.025, 0.025, ray.y - ridge);
    vec3 mountainColor = mix(vec3(0.22, 0.34, 0.3), vec3(0.48, 0.39, 0.26), uDesert);
    color = mix(color, mountainColor, mountain * smoothstep(-0.15, 0.05, ray.y));

    vec2 cloudPoint = ray.xz / max(0.25, ray.y + 0.62) * 2.2;
    float cloud = sin(cloudPoint.x * 1.15 + sin(cloudPoint.y * 0.8 + uTime * 0.015))
      * cos(cloudPoint.y * 1.45 - cloudPoint.x * 0.3);
    cloud = smoothstep(0.45, 0.82, cloud) * smoothstep(0.02, 0.25, ray.y);
    color = mix(color, vec3(0.95, 0.94, 0.83), cloud * 0.38);

    vec3 sunDirection = normalize(vec3(-0.48, 0.54, 0.69));
    float sun = max(dot(ray, sunDirection), 0.0);
    float halo = pow(sun, 8.0) * 0.28 + pow(sun, 48.0) * 0.65;
    float disc = smoothstep(0.99915, 0.99965, sun);
    color += uSunColor * (halo + disc * 0.9);
    color = mix(color, horizonColor, smoothstep(-0.04, 0.02, ray.y) * 0.28);
    gl_FragColor = vec4(color, 1.0);
  }
`;

const states = new Map([...areas].map(([id, area]) => [id, area.createState()]));
const elements = {
  areaRegion: document.querySelector("#area-region"),
  areaName: document.querySelector("#area-name"),
  mapName: document.querySelector("#map-name"),
  environmentStatus: document.querySelector("#environment-status"),
  canvas: document.querySelector("#world-view"),
  viewport: document.querySelector("#world-viewport"),
  viewHint: document.querySelector("#view-hint"),
  compassHeading: document.querySelector("#compass-heading"),
  compassDegree: document.querySelector("#compass-degree"),
  interactionPrompt: document.querySelector("#interaction-prompt"),
  interactionLabel: document.querySelector("#interaction-label"),
  fullscreenToggle: document.querySelector("#fullscreen-toggle"),
  dialogueCard: document.querySelector("#dialogue-card"),
  dialogueClose: document.querySelector("#dialogue-close"),
  questTitle: document.querySelector("#quest-title"),
  questDescription: document.querySelector("#quest-description"),
  dialogueSpeaker: document.querySelector("#dialogue-speaker"),
  dialogueText: document.querySelector("#dialogue-text"),
  choices: document.querySelector("#choices"),
};

const gl = elements.canvas.getContext("webgl", {
  alpha: false,
  antialias: false,
  powerPreference: "low-power",
});
if (!gl) {
  throw new Error("このブラウザーではWebGLを利用できないため、3D画面を表示できません。");
}

const vertexShaderSource = `
  precision mediump float;
  attribute vec3 aPosition;
  attribute vec3 aColor;
  attribute vec3 aNormal;
  attribute float aMaterial;
  uniform mat4 uViewProjection;
  uniform mat4 uView;
  uniform float uTime;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying float vDepth;
  varying float vMaterial;
  void main() {
    vec3 position = aPosition;
    if (aMaterial > 0.5 && aMaterial < 1.5) {
      position.y += sin(position.x * 1.8 + uTime * 1.3) * 0.025
        + cos(position.z * 1.45 - uTime * 0.9) * 0.018;
    } else if (aMaterial > 2.5 && aMaterial < 4.5) {
      float sway = sin(uTime * 1.45 + position.x * 1.1 + position.z * 0.75);
      position.x += sway * 0.035;
      position.y += abs(sway) * 0.018;
    }
    vec4 worldPosition = vec4(position, 1.0);
    vec4 viewPosition = uView * worldPosition;
    gl_Position = uViewProjection * worldPosition;
    vColor = aColor;
    vNormal = aNormal;
    vDepth = length(viewPosition.xyz);
    vMaterial = aMaterial;
  }
`;
const fragmentShaderSource = `
  precision mediump float;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying float vDepth;
  varying float vMaterial;
  uniform vec3 uFogColor;
  uniform vec3 uLightDirection;
  void main() {
    vec3 normal = normalize(vNormal);
    float diffuse = max(dot(normal, normalize(uLightDirection)), 0.0);
    float lighting = 0.42 + diffuse * 0.7;
    vec3 color = vColor * lighting;

    if (vMaterial > 0.5 && vMaterial < 1.5) {
      color += vec3(0.035, 0.085, 0.1);
    } else if (vMaterial > 1.5 && vMaterial < 2.5) {
      color += vec3(0.16, 0.12, 0.055);
    } else if (vMaterial > 2.5) {
      color *= 1.08;
    }
    float fog = smoothstep(22.0, 49.0, vDepth);
    color = mix(color, uFogColor, fog);
    gl_FragColor = vec4(color, 1.0);
  }
`;

function compileShader(type, source) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("WebGLシェーダーを作成できませんでした。");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "シェーダーのコンパイルに失敗しました。";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

const program = gl.createProgram();
if (!program) throw new Error("WebGLプログラムを作成できませんでした。");
gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexShaderSource));
gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource));
gl.linkProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
  throw new Error(gl.getProgramInfoLog(program) || "WebGLプログラムのリンクに失敗しました。");
}

const positionAttribute = gl.getAttribLocation(program, "aPosition");
const colorAttribute = gl.getAttribLocation(program, "aColor");
const normalAttribute = gl.getAttribLocation(program, "aNormal");
const materialAttribute = gl.getAttribLocation(program, "aMaterial");
const viewProjectionUniform = gl.getUniformLocation(program, "uViewProjection");
const viewUniform = gl.getUniformLocation(program, "uView");
const timeUniform = gl.getUniformLocation(program, "uTime");
const fogColorUniform = gl.getUniformLocation(program, "uFogColor");
const lightDirectionUniform = gl.getUniformLocation(program, "uLightDirection");
const vertexBuffer = gl.createBuffer();
if (!vertexBuffer || viewProjectionUniform === null || viewUniform === null
  || timeUniform === null || fogColorUniform === null || lightDirectionUniform === null) {
  throw new Error("WebGLの描画リソースを初期化できませんでした。");
}

const skyProgram = gl.createProgram();
if (!skyProgram) throw new Error("空の描画プログラムを作成できませんでした。");
gl.attachShader(skyProgram, compileShader(gl.VERTEX_SHADER, SKY_VERTEX_SHADER));
gl.attachShader(skyProgram, compileShader(gl.FRAGMENT_SHADER, SKY_FRAGMENT_SHADER));
gl.linkProgram(skyProgram);
if (!gl.getProgramParameter(skyProgram, gl.LINK_STATUS)) {
  throw new Error(gl.getProgramInfoLog(skyProgram) || "空の描画プログラムをリンクできませんでした。");
}
const skyPositionAttribute = gl.getAttribLocation(skyProgram, "aPosition");
const skyUniforms = {
  forward: gl.getUniformLocation(skyProgram, "uForward"),
  right: gl.getUniformLocation(skyProgram, "uRight"),
  up: gl.getUniformLocation(skyProgram, "uUp"),
  sunColor: gl.getUniformLocation(skyProgram, "uSunColor"),
  aspect: gl.getUniformLocation(skyProgram, "uAspect"),
  fovScale: gl.getUniformLocation(skyProgram, "uFovScale"),
  time: gl.getUniformLocation(skyProgram, "uTime"),
  desert: gl.getUniformLocation(skyProgram, "uDesert"),
};
const skyBuffer = gl.createBuffer();
if (!skyBuffer || Object.values(skyUniforms).some((location) => location === null)) {
  throw new Error("空の描画リソースを初期化できませんでした。");
}
gl.bindBuffer(gl.ARRAY_BUFFER, skyBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
  -1, -1, 1, -1, -1, 1,
  -1, 1, 1, -1, 1, 1,
]), gl.STATIC_DRAW);

let currentArea = oceanArea;
let currentMapId = "town";
let sceneVertexCount = 0;
let sceneDirty = true;
let scene = null;
const playerPositions = new Map();
let player = { x: 0, y: 0, angle: 0, pitch: 0 };
const pressedKeys = new Set();
let previousFrame = 0;
let lastRender = 0;
let lastHudUpdate = 0;
let adaptiveResolutionScale = 1;
let slowFrameCount = 0;
let fastFrameCount = 0;
let walkCycle = 0;
let isMoving = false;
let isRunning = false;
let draggingTouch = false;
let previousPointer = null;

for (const area of areas.values()) {
  for (const map of Object.values(area.maps)) {
    map.map = map.map.flatMap((row) => {
      const expandedRow = [...row].map((tile) => tile.repeat(2)).join("");
      return [expandedRow, expandedRow];
    });
    map.spawn = { x: map.spawn.x * 2, y: map.spawn.y * 2 };
    map.features.forEach((feature) => {
      feature.x *= 2;
      feature.y *= 2;
    });
  }
}

function positionKey(area = currentArea, mapId = currentMapId) {
  return `${area.id}:${mapId}`;
}

function activeMap() {
  return currentArea.maps[currentMapId];
}

function featurePosition(feature) {
  return { x: feature.x + 1, z: feature.y + 1 };
}

function isWalkable(x, z) {
  return WALKABLE_TILES.has(activeMap().map[Math.floor(z)]?.[Math.floor(x)]);
}

function canStandAt(x, z) {
  return [
    [x - PLAYER_RADIUS, z - PLAYER_RADIUS],
    [x + PLAYER_RADIUS, z - PLAYER_RADIUS],
    [x - PLAYER_RADIUS, z + PLAYER_RADIUS],
    [x + PLAYER_RADIUS, z + PLAYER_RADIUS],
  ].every(([testX, testZ]) => isWalkable(testX, testZ));
}

function shade(color, amount) {
  return color.map((component) => Math.max(0, Math.min(1, component * amount)));
}

function tileColor(tile, x, z) {
  const desert = currentArea.id === "desert";
  const colors = desert
    ? {
      ".": [0.54, 0.49, 0.32], f: [0.43, 0.49, 0.27], s: [0.72, 0.59, 0.36],
      b: [0.5, 0.54, 0.4], P: [0.57, 0.48, 0.34], h: [0.49, 0.43, 0.27],
      c: [0.64, 0.48, 0.29], o: [0.22, 0.43, 0.34], B: [0.58, 0.47, 0.32],
    }
    : {
      ".": [0.26, 0.42, 0.28], f: [0.32, 0.49, 0.29], s: [0.63, 0.56, 0.37],
      b: [0.36, 0.49, 0.42], P: [0.48, 0.45, 0.35], h: [0.46, 0.47, 0.34],
      c: [0.58, 0.47, 0.31], o: [0.22, 0.46, 0.39], B: [0.52, 0.46, 0.34],
    };
  const color = colors[tile] ?? (tile === "~" || tile === "O"
    ? [0.12, 0.38, 0.47]
    : [0.31, 0.37, 0.3]);
  const variation = (((Math.imul(x + 17, 73) ^ Math.imul(z + 29, 151)) >>> 0) % 13 - 6) / 100;
  return color.map((channel) => Math.max(0, Math.min(1, channel + variation)));
}

function terrainHeight(x, z) {
  const amplitude = currentMapId === "field" ? (currentArea.id === "desert" ? 0.22 : 0.16) : 0.045;
  return amplitude * (
    Math.sin(x * 0.17 + z * 0.08) * 0.55
    + Math.cos(z * 0.21 - x * 0.07) * 0.3
    + Math.sin((x + z) * 0.39) * 0.15
  );
}

function terrainNormal(x, z) {
  const delta = 0.08;
  const slopeX = (terrainHeight(x + delta, z) - terrainHeight(x - delta, z)) / (delta * 2);
  const slopeZ = (terrainHeight(x, z + delta) - terrainHeight(x, z - delta)) / (delta * 2);
  const normal = [-slopeX, 1, -slopeZ];
  const length = Math.hypot(...normal) || 1;
  return normal.map((value) => value / length);
}

function pushVertex(vertices, point, color, normal, material = 0) {
  vertices.push(...point, ...color, ...normal, material);
}

function addTriangle(vertices, first, second, third, color, material = 0) {
  const edgeA = [second[0] - first[0], second[1] - first[1], second[2] - first[2]];
  const edgeB = [third[0] - first[0], third[1] - first[1], third[2] - first[2]];
  const normal = [
    edgeA[1] * edgeB[2] - edgeA[2] * edgeB[1],
    edgeA[2] * edgeB[0] - edgeA[0] * edgeB[2],
    edgeA[0] * edgeB[1] - edgeA[1] * edgeB[0],
  ];
  const length = Math.hypot(...normal) || 1;
  const unitNormal = normal.map((value) => value / length);
  pushVertex(vertices, first, color, unitNormal, material);
  pushVertex(vertices, second, color, unitNormal, material);
  pushVertex(vertices, third, color, unitNormal, material);
}

function addTriangleSmooth(vertices, first, second, third, firstNormal, secondNormal, thirdNormal, color, material = 0) {
  pushVertex(vertices, first, color, firstNormal, material);
  pushVertex(vertices, second, color, secondNormal, material);
  pushVertex(vertices, third, color, thirdNormal, material);
}

function addFace(vertices, color, first, second, third, fourth, material = 0) {
  addTriangle(vertices, first, second, third, color, material);
  addTriangle(vertices, first, third, fourth, color, material);
}

function addFloor(vertices, x, z, color, material = 0) {
  const subdivisions = material === 1 ? 1 : 2;
  for (let row = 0; row < subdivisions; row += 1) {
    for (let column = 0; column < subdivisions; column += 1) {
      const x0 = x + column / subdivisions;
      const x1 = x + (column + 1) / subdivisions;
      const z0 = z + row / subdivisions;
      const z1 = z + (row + 1) / subdivisions;
      const heightAt = (pointX, pointZ) => material === 1 ? -0.04 : terrainHeight(pointX, pointZ);
      const topLeft = [x0, heightAt(x0, z0), z0];
      const topRight = [x1, heightAt(x1, z0), z0];
      const bottomRight = [x1, heightAt(x1, z1), z1];
      const bottomLeft = [x0, heightAt(x0, z1), z1];
      if (material === 1) {
        addFace(vertices, color, topLeft, bottomLeft, bottomRight, topRight, material);
      } else {
        const topLeftNormal = terrainNormal(x0, z0);
        const topRightNormal = terrainNormal(x1, z0);
        const bottomRightNormal = terrainNormal(x1, z1);
        const bottomLeftNormal = terrainNormal(x0, z1);
        addTriangleSmooth(vertices, topLeft, bottomLeft, bottomRight,
          topLeftNormal, bottomLeftNormal, bottomRightNormal, color, material);
        addTriangleSmooth(vertices, topLeft, bottomRight, topRight,
          topLeftNormal, bottomRightNormal, topRightNormal, color, material);
      }
    }
  }
}

function addBox(vertices, x, y, z, width, height, depth, color, material = 0) {
  const x1 = x + width;
  const y1 = y + height;
  const z1 = z + depth;
  const yBottom = y + terrainHeight(x + width / 2, z + depth / 2);
  const yTop = y1 + terrainHeight(x + width / 2, z + depth / 2);
  addFace(vertices, shade(color, 0.78), [x, yBottom, z1], [x1, yBottom, z1], [x1, yTop, z1], [x, yTop, z1], material);
  addFace(vertices, shade(color, 0.62), [x1, yBottom, z], [x, yBottom, z], [x, yTop, z], [x1, yTop, z], material);
  addFace(vertices, shade(color, 0.9), [x, yBottom, z], [x, yBottom, z1], [x, yTop, z1], [x, yTop, z], material);
  addFace(vertices, shade(color, 0.7), [x1, yBottom, z1], [x1, yBottom, z], [x1, yTop, z], [x1, yTop, z1], material);
  addFace(vertices, color, [x, yTop, z1], [x1, yTop, z1], [x1, yTop, z], [x, yTop, z], material);
  addFace(vertices, shade(color, 0.48), [x, yBottom, z], [x1, yBottom, z], [x1, yBottom, z1], [x, yBottom, z1], material);
}

function addCylinder(vertices, x, y, z, bottomRadius, topRadius, height, color, segments = 9) {
  const baseY = y + terrainHeight(x, z);
  for (let index = 0; index < segments; index += 1) {
    const angleA = index * Math.PI * 2 / segments;
    const angleB = (index + 1) * Math.PI * 2 / segments;
    const bottomA = [x + Math.cos(angleA) * bottomRadius, baseY, z + Math.sin(angleA) * bottomRadius];
    const bottomB = [x + Math.cos(angleB) * bottomRadius, baseY, z + Math.sin(angleB) * bottomRadius];
    const topA = [x + Math.cos(angleA) * topRadius, baseY + height, z + Math.sin(angleA) * topRadius];
    const topB = [x + Math.cos(angleB) * topRadius, baseY + height, z + Math.sin(angleB) * topRadius];
    addFace(vertices, shade(color, 0.8 + (index % 3) * 0.08), bottomA, bottomB, topB, topA);
    addTriangle(vertices, [x, baseY + height, z], topA, topB, shade(color, 1.1));
  }
}

function addSphere(vertices, x, y, z, scaleX, scaleY, scaleZ, color, material = 0, segments = 8, rings = 5) {
  const centerY = y + terrainHeight(x, z);
  for (let ring = 0; ring < rings; ring += 1) {
    const latitudeA = -Math.PI / 2 + ring / rings * Math.PI;
    const latitudeB = -Math.PI / 2 + (ring + 1) / rings * Math.PI;
    for (let segment = 0; segment < segments; segment += 1) {
      const longitudeA = segment / segments * Math.PI * 2;
      const longitudeB = (segment + 1) / segments * Math.PI * 2;
      const point = (latitude, longitude) => [
        x + Math.cos(latitude) * Math.cos(longitude) * scaleX,
        centerY + Math.sin(latitude) * scaleY,
        z + Math.cos(latitude) * Math.sin(longitude) * scaleZ,
      ];
      const first = point(latitudeA, longitudeA);
      const second = point(latitudeA, longitudeB);
      const third = point(latitudeB, longitudeB);
      const fourth = point(latitudeB, longitudeA);
      const tint = 0.91 + ((segment + ring * 3) % 5) * 0.045;
      addFace(vertices, shade(color, tint), first, second, third, fourth, material);
    }
  }
}

function addPyramid(vertices, x, y, z, width, height, depth, color, sides = 4) {
  const centerX = x + width / 2;
  const centerZ = z + depth / 2;
  const top = [centerX, y + height + terrainHeight(centerX, centerZ), centerZ];
  const corners = Array.from({ length: sides }, (_, index) => {
    const angle = index / sides * Math.PI * 2 + Math.PI / 4;
    return [
      centerX + Math.cos(angle) * width / Math.SQRT2,
      y + terrainHeight(centerX, centerZ),
      centerZ + Math.sin(angle) * depth / Math.SQRT2,
    ];
  });
  for (let index = 0; index < corners.length; index += 1) {
    const next = corners[(index + 1) % corners.length];
    addTriangle(vertices, corners[index], next, top, shade(color, 0.82 + (index % 3) * 0.08));
  }
}

function addTree(vertices, x, z) {
  const centerX = x + 0.5;
  const centerZ = z + 0.5;
  const desert = currentArea.id === "desert";
  addGroundShadow(vertices, centerX, centerZ, 0.55, 0.35);
  addCylinder(vertices, centerX, 0, centerZ, 0.16, 0.09, 1.15, desert ? [0.43, 0.29, 0.16] : [0.3, 0.2, 0.12]);
  addCylinder(vertices, centerX, 0.67, centerZ, 0.09, 0.025, 0.72, desert ? [0.43, 0.29, 0.16] : [0.3, 0.2, 0.12], 7);
  if (desert) {
    const palmColor = [0.27, 0.43, 0.22];
    for (let index = 0; index < 7; index += 1) {
      const angle = index * Math.PI * 2 / 7;
      const endX = centerX + Math.cos(angle) * 0.74;
      const endZ = centerZ + Math.sin(angle) * 0.74;
      addTriangle(vertices,
        [centerX, 1.45 + terrainHeight(centerX, centerZ), centerZ],
        [endX - Math.sin(angle) * 0.1, 1.23 + terrainHeight(endX, endZ), endZ + Math.cos(angle) * 0.1],
        [endX, 1.12 + terrainHeight(endX, endZ), endZ],
        shade(palmColor, 0.84 + (index % 3) * 0.12));
    }
    addSphere(vertices, centerX, 1.35, centerZ, 0.17, 0.14, 0.17, [0.52, 0.31, 0.16], 0, 7, 4);
    return;
  }
  addSphere(vertices, centerX, 1.18, centerZ, 0.52, 0.55, 0.49, [0.15, 0.35, 0.18], 3, 9, 6);
  addSphere(vertices, centerX - 0.26, 1.04, centerZ + 0.09, 0.37, 0.39, 0.39, [0.2, 0.42, 0.21], 3, 8, 5);
  addSphere(vertices, centerX + 0.25, 1.08, centerZ - 0.09, 0.36, 0.42, 0.38, [0.23, 0.45, 0.24], 3, 8, 5);
}

function addBuilding(vertices, x, z) {
  const desert = currentArea.id === "desert";
  const wall = desert
    ? [0.74, 0.59, 0.39]
    : [0.76, 0.67, 0.49];
  const roof = desert ? [0.5, 0.27, 0.17] : [0.42, 0.2, 0.14];
  const baseY = terrainHeight(x + 0.5, z + 0.5);
  const frontZ = z + 0.04;
  const rearZ = z + 0.96;
  const left = x + 0.03;
  const right = x + 0.97;
  const ridgeX = x + 0.5;
  addGroundShadow(vertices, x + 0.5, z + 0.5, 0.68, 0.61);
  addBox(vertices, left + 0.04, 0, z + 0.08, 0.86, 1.18, 0.84, wall);
  const frontBaseL = [left, 1.18 + baseY, frontZ];
  const frontBaseR = [right, 1.18 + baseY, frontZ];
  const frontPeak = [ridgeX, 1.78 + baseY, frontZ];
  const backBaseL = [left, 1.18 + baseY, rearZ];
  const backBaseR = [right, 1.18 + baseY, rearZ];
  const backPeak = [ridgeX, 1.78 + baseY, rearZ];
  addTriangle(vertices, frontBaseL, frontBaseR, frontPeak, shade(wall, 0.92));
  addTriangle(vertices, backBaseR, backBaseL, backPeak, shade(wall, 0.82));
  addFace(vertices, roof, frontBaseL, frontPeak, backPeak, backBaseL);
  addFace(vertices, shade(roof, 0.82), frontPeak, frontBaseR, backBaseR, backPeak);
  addBox(vertices, ridgeX - 0.035, 1.76, z, 0.07, 0.1, 1, shade(roof, 0.75));

  const doorColor = desert ? [0.32, 0.22, 0.13] : [0.31, 0.24, 0.17];
  addBox(vertices, x + 0.39, 0.015, frontZ - 0.025, 0.22, 0.7, 0.045, doorColor);
  addBox(vertices, x + 0.36, 0.7, frontZ - 0.035, 0.28, 0.07, 0.065, shade(doorColor, 0.8));
  const windowColor = [0.32, 0.56, 0.63];
  for (const windowX of [x + 0.16, x + 0.69]) {
    addBox(vertices, windowX, 0.73, frontZ - 0.024, 0.16, 0.2, 0.04, [0.32, 0.24, 0.16]);
    addBox(vertices, windowX + 0.025, 0.755, frontZ - 0.05, 0.11, 0.15, 0.025, windowColor);
    addBox(vertices, windowX + 0.075, 0.755, frontZ - 0.064, 0.018, 0.15, 0.012, [0.82, 0.68, 0.45]);
    addBox(vertices, windowX + 0.025, 0.817, frontZ - 0.066, 0.11, 0.018, 0.012, [0.82, 0.68, 0.45]);
    addBox(vertices, windowX - 0.035, 0.71, frontZ - 0.035, 0.035, 0.24, 0.06, shade(roof, 0.84));
    addBox(vertices, windowX + 0.16, 0.71, frontZ - 0.035, 0.035, 0.24, 0.06, shade(roof, 0.84));
  }
  addBox(vertices, left - 0.025, 0.2, frontZ - 0.08, 0.07, 0.09, 0.1, [0.88, 0.63, 0.24], 2);
  addCylinder(vertices, x + 0.5, 0.88, frontZ - 0.07, 0.025, 0.025, 0.025, [0.87, 0.7, 0.38], 6);
}

function addPerson(vertices, x, z) {
  const outfit = currentArea.id === "ocean" ? [0.2, 0.43, 0.36] : [0.61, 0.34, 0.19];
  const skin = [0.78, 0.54, 0.37];
  addCylinder(vertices, x - 0.105, 0.04, z, 0.055, 0.045, 0.51, [0.24, 0.25, 0.28], 7);
  addCylinder(vertices, x + 0.105, 0.04, z, 0.055, 0.045, 0.51, [0.24, 0.25, 0.28], 7);
  addSphere(vertices, x, 0.76, z, 0.24, 0.34, 0.17, outfit, 0, 9, 6);
  addSphere(vertices, x, 1.19, z, 0.14, 0.17, 0.13, skin, 0, 9, 6);
  addSphere(vertices, x, 1.32, z - 0.015, 0.15, 0.075, 0.14, [0.2, 0.15, 0.12], 0, 9, 4);
  addCylinder(vertices, x - 0.26, 0.68, z, 0.055, 0.04, 0.34, skin, 7);
  addCylinder(vertices, x + 0.26, 0.68, z, 0.055, 0.04, 0.34, skin, 7);
}

function addFeature(vertices, feature) {
  const { x, z } = featurePosition(feature);
  if (feature.kind === "person") {
    addPerson(vertices, x, z);
  } else if (feature.kind === "entrance") {
    addBox(vertices, x - 0.48, 0, z - 0.08, 0.12, 1.55, 0.16, [0.36, 0.26, 0.16]);
    addBox(vertices, x + 0.36, 0, z - 0.08, 0.12, 1.55, 0.16, [0.36, 0.26, 0.16]);
    addBox(vertices, x - 0.48, 1.43, z - 0.08, 0.96, 0.14, 0.16, [0.54, 0.4, 0.22]);
  } else if (feature.kind === "portal") {
    const portalColor = [0.27, 0.8, 0.83];
    addBox(vertices, x - 0.38, 0, z - 0.08, 0.11, 1.9, 0.12, portalColor);
    addBox(vertices, x + 0.27, 0, z - 0.08, 0.11, 1.9, 0.12, portalColor);
    addBox(vertices, x - 0.38, 1.78, z - 0.08, 0.76, 0.12, 0.12, portalColor);
  } else {
    addCylinder(vertices, x, 0.03, z, 0.04, 0.035, 0.44, [0.39, 0.31, 0.16], 7);
    addSphere(vertices, x, 0.58, z, 0.2, 0.21, 0.2, [0.96, 0.77, 0.24], 2, 8, 5);
  }
}

function tileRandom(x, z, salt = 0) {
  const value = Math.sin((x + 17 + salt * 31) * 127.1 + (z + 29) * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function addGrassTuft(vertices, x, z, scale = 1, flower = false) {
  const centerX = x + 0.5 + (tileRandom(x, z, 1) - 0.5) * 0.42;
  const centerZ = z + 0.5 + (tileRandom(x, z, 2) - 0.5) * 0.42;
  const baseY = terrainHeight(centerX, centerZ) + 0.015;
  const blades = 3 + Math.floor(tileRandom(x, z, 3) * 3);
  for (let blade = 0; blade < blades; blade += 1) {
    const angle = blade / blades * Math.PI + tileRandom(x, z, blade + 4) * 0.8;
    const width = 0.045 * scale;
    const length = (0.18 + tileRandom(x, z, blade + 8) * 0.16) * scale;
    const sideX = Math.cos(angle) * width;
    const sideZ = Math.sin(angle) * width;
    const tipX = centerX + Math.cos(angle + 0.7) * length;
    const tipZ = centerZ + Math.sin(angle + 0.7) * length;
    const green = 0.78 + tileRandom(x, z, blade + 12) * 0.3;
    const color = currentArea.id === "desert"
      ? [0.43 * green, 0.48 * green, 0.25 * green]
      : [0.16 * green, 0.38 * green, 0.17 * green];
    addTriangle(vertices,
      [centerX - sideX, baseY, centerZ - sideZ],
      [centerX + sideX, baseY, centerZ + sideZ],
      [tipX, baseY + length, tipZ],
      color, 4);
  }
  if (flower) {
    const flowerX = centerX + 0.08;
    const flowerZ = centerZ - 0.04;
    addCylinder(vertices, flowerX, 0.06, flowerZ, 0.012, 0.01, 0.12, [0.2, 0.34, 0.14], 5);
    const flowerColor = tileRandom(x, z, 18) > 0.5 ? [0.87, 0.55, 0.31] : [0.88, 0.76, 0.43];
    addSphere(vertices, flowerX, 0.19, flowerZ, 0.065, 0.055, 0.065, flowerColor, 2, 6, 3);
  }
}

function addPathDetail(vertices, x, z) {
  const offsetX = 0.14 + tileRandom(x, z, 21) * 0.34;
  const offsetZ = 0.14 + tileRandom(x, z, 22) * 0.34;
  const width = 0.22 + tileRandom(x, z, 23) * 0.24;
  const depth = 0.18 + tileRandom(x, z, 24) * 0.22;
  const stone = currentArea.id === "desert" ? [0.65, 0.53, 0.35] : [0.5, 0.49, 0.4];
  addBox(vertices, x + offsetX, 0.018, z + offsetZ, width, 0.025, depth, shade(stone, 0.9 + tileRandom(x, z, 25) * 0.18));
}

function addRockCluster(vertices, x, z) {
  const baseX = x + 0.5;
  const baseZ = z + 0.5;
  const stone = currentArea.id === "desert" ? [0.49, 0.41, 0.31] : [0.43, 0.48, 0.44];
  addSphere(vertices, baseX - 0.15, 0.03, baseZ, 0.3, 0.29, 0.26, stone, 0, 7, 4);
  addSphere(vertices, baseX + 0.18, 0.02, baseZ + 0.08, 0.22, 0.2, 0.2, shade(stone, 1.12), 0, 7, 4);
}

function addGroundShadow(vertices, x, z, radiusX, radiusZ) {
  const center = [x, terrainHeight(x, z) + 0.025, z];
  const segments = 10;
  for (let index = 0; index < segments; index += 1) {
    const angleA = index / segments * Math.PI * 2;
    const angleB = (index + 1) / segments * Math.PI * 2;
    const first = [
      x + Math.cos(angleA) * radiusX,
      terrainHeight(x + Math.cos(angleA) * radiusX, z + Math.sin(angleA) * radiusZ) + 0.025,
      z + Math.sin(angleA) * radiusZ,
    ];
    const second = [
      x + Math.cos(angleB) * radiusX,
      terrainHeight(x + Math.cos(angleB) * radiusX, z + Math.sin(angleB) * radiusZ) + 0.025,
      z + Math.sin(angleB) * radiusZ,
    ];
    addTriangleSmooth(vertices, center, first, second, [0, 1, 0], [0, 1, 0], [0, 1, 0], [0.12, 0.15, 0.11]);
  }
}

function addBoundaryCliff(vertices, x, z) {
  const centerX = x + 0.5;
  const centerZ = z + 0.5;
  const desert = currentArea.id === "desert";
  const stone = desert ? [0.47, 0.37, 0.25] : [0.3, 0.36, 0.34];
  const scale = 0.75 + tileRandom(x, z, 42) * 0.3;
  addSphere(vertices, centerX, 0.14, centerZ, 0.78 * scale, 1.1 * scale, 0.76 * scale, stone, 0, 7, 4);
  if (tileRandom(x, z, 43) > 0.45) {
    addSphere(vertices, centerX + 0.3, 0.2, centerZ - 0.12, 0.46, 0.72 * scale, 0.48, shade(stone, 1.13), 0, 7, 4);
  }
}

function buildScene() {
  const vertices = [];
  const map = activeMap();
  for (let z = 0; z < map.map.length; z += 1) {
    for (let x = 0; x < map.map[z].length; x += 1) {
      const tile = map.map[z][x];
      const isWater = tile === "~" || tile === "O";
      const base = tileColor(tile, x, z);
      addFloor(vertices, x, z, base, isWater ? 1 : 0);

      if (tile === "T") {
        addTree(vertices, x, z);
      } else if (tile === "H") {
        addBuilding(vertices, x, z);
      } else if (tile === "R") {
        addRockCluster(vertices, x, z);
      } else if (tile === "#") {
        addBoundaryCliff(vertices, x, z);
      } else if (!isWater && tile === "P" && tileRandom(x, z, 26) > 0.44) {
        addPathDetail(vertices, x, z);
      } else if (!isWater && ["f", ".", "s", "h", "c"].includes(tile)) {
        const probability = tile === "f" || tile === "h" ? 0.3 : 0.13;
        if (tileRandom(x, z, 27) > 1 - probability) {
          addGrassTuft(vertices, x, z, 0.75 + tileRandom(x, z, 28) * 0.65, tileRandom(x, z, 29) > 0.82);
        }
        if (tileRandom(x, z, 30) > 0.89) {
          const bushColor = currentArea.id === "desert" ? [0.34, 0.41, 0.23] : [0.17, 0.32, 0.16];
          addSphere(vertices, x + 0.5, 0.06, z + 0.5, 0.24, 0.2, 0.23, bushColor, 0, 7, 4);
        }
      }
    }
  }
  map.features.forEach((feature) => addFeature(vertices, feature));
  scene = new Float32Array(vertices);
  sceneVertexCount = scene.length / 10;
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, scene, gl.STATIC_DRAW);
  sceneDirty = false;
}

function multiplyMatrices(first, second, result) {
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      result[column * 4 + row] =
        first[row] * second[column * 4]
        + first[4 + row] * second[column * 4 + 1]
        + first[8 + row] * second[column * 4 + 2]
        + first[12 + row] * second[column * 4 + 3];
    }
  }
  return result;
}

function perspectiveMatrix(fieldOfView, aspect, near, far, result) {
  const focalLength = 1 / Math.tan(fieldOfView / 2);
  const range = 1 / (near - far);
  result.set([
    focalLength / aspect, 0, 0, 0,
    0, focalLength, 0, 0,
    0, 0, (far + near) * range, -1,
    0, 0, 2 * far * near * range, 0,
  ]);
  return result;
}

function lookAtMatrix(eye, direction, result) {
  let rightX = -direction[2];
  let rightZ = direction[0];
  const rightLength = Math.hypot(rightX, rightZ) || 1;
  rightX /= rightLength;
  rightZ /= rightLength;
  const upX = -rightZ * direction[1];
  const upY = rightZ * direction[0] - rightX * direction[2];
  const upZ = rightX * direction[1];
  result.set([
    rightX, upX, -direction[0], 0,
    0, upY, -direction[1], 0,
    rightZ, upZ, -direction[2], 0,
    -(rightX * eye[0] + rightZ * eye[2]),
    -(upX * eye[0] + upY * eye[1] + upZ * eye[2]),
    direction[0] * eye[0] + direction[1] * eye[1] + direction[2] * eye[2],
    1,
  ]);
  return result;
}

function resizeCanvas() {
  const bounds = elements.viewport.getBoundingClientRect();
  const resolutionScale = Math.min(
    window.devicePixelRatio || 1,
    MAX_RESOLUTION_SCALE,
    adaptiveResolutionScale,
  );
  const width = Math.max(1, Math.floor(bounds.width * resolutionScale));
  const height = Math.max(1, Math.floor(bounds.height * resolutionScale));
  if (elements.canvas.width !== width || elements.canvas.height !== height) {
    elements.canvas.width = width;
    elements.canvas.height = height;
    gl.viewport(0, 0, width, height);
  }
  return { width, height };
}

function drawWorld() {
  const { width, height } = resizeCanvas();
  if (sceneDirty) buildScene();
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const pitch = player.pitch;
  VIEW_DIRECTION[0] = Math.cos(player.angle) * Math.cos(pitch);
  VIEW_DIRECTION[1] = Math.sin(pitch);
  VIEW_DIRECTION[2] = Math.sin(player.angle) * Math.cos(pitch);
  VIEW_RIGHT[0] = -Math.sin(player.angle);
  VIEW_RIGHT[1] = 0;
  VIEW_RIGHT[2] = Math.cos(player.angle);
  VIEW_UP[0] = -VIEW_RIGHT[2] * VIEW_DIRECTION[1];
  VIEW_UP[1] = VIEW_RIGHT[2] * VIEW_DIRECTION[0] - VIEW_RIGHT[0] * VIEW_DIRECTION[2];
  VIEW_UP[2] = VIEW_RIGHT[0] * VIEW_DIRECTION[1];
  const now = performance.now() / 1000;
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.useProgram(skyProgram);
  gl.bindBuffer(gl.ARRAY_BUFFER, skyBuffer);
  gl.enableVertexAttribArray(skyPositionAttribute);
  gl.vertexAttribPointer(skyPositionAttribute, 2, gl.FLOAT, false, 0, 0);
  gl.uniform3fv(skyUniforms.forward, VIEW_DIRECTION);
  gl.uniform3fv(skyUniforms.right, VIEW_RIGHT);
  gl.uniform3fv(skyUniforms.up, VIEW_UP);
  gl.uniform3fv(skyUniforms.sunColor, currentArea.id === "ocean" ? OCEAN_SUN_COLOR : DESERT_SUN_COLOR);
  gl.uniform1f(skyUniforms.aspect, width / height);
  gl.uniform1f(skyUniforms.fovScale, Math.tan(FIELD_OF_VIEW / 2));
  gl.uniform1f(skyUniforms.time, now);
  gl.uniform1f(skyUniforms.desert, currentArea.id === "desert" ? 1 : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.depthMask(true);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);

  const bob = isMoving ? Math.sin(walkCycle) * (isRunning ? 0.035 : 0.018) : 0;
  VIEW_EYE[0] = player.x;
  VIEW_EYE[1] = terrainHeight(player.x, player.y) + 0.78 + bob;
  VIEW_EYE[2] = player.y;
  const view = lookAtMatrix(VIEW_EYE, VIEW_DIRECTION, VIEW_MATRIX);
  const projection = perspectiveMatrix(FIELD_OF_VIEW, width / height, 0.04, 55, PROJECTION_MATRIX);
  const viewProjection = multiplyMatrices(projection, view, VIEW_PROJECTION_MATRIX);
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.uniformMatrix4fv(viewUniform, false, view);
  gl.uniformMatrix4fv(viewProjectionUniform, false, viewProjection);
  gl.uniform1f(timeUniform, now);
  gl.uniform3fv(fogColorUniform, currentArea.id === "ocean" ? OCEAN_FOG_COLOR : DESERT_FOG_COLOR);
  gl.uniform3fv(lightDirectionUniform, LIGHT_DIRECTION);
  gl.enableVertexAttribArray(positionAttribute);
  gl.enableVertexAttribArray(colorAttribute);
  gl.enableVertexAttribArray(normalAttribute);
  gl.enableVertexAttribArray(materialAttribute);
  gl.vertexAttribPointer(positionAttribute, 3, gl.FLOAT, false, 40, 0);
  gl.vertexAttribPointer(colorAttribute, 3, gl.FLOAT, false, 40, 12);
  gl.vertexAttribPointer(normalAttribute, 3, gl.FLOAT, false, 40, 24);
  gl.vertexAttribPointer(materialAttribute, 1, gl.FLOAT, false, 40, 36);
  gl.drawArrays(gl.TRIANGLES, 0, sceneVertexCount);
  if (now * 1000 - lastHudUpdate >= 100) {
    updateHud();
    lastHudUpdate = now * 1000;
  }
}

function getNearbyFeature() {
  return activeMap().features
    .map((item) => ({ item, ...featurePosition(item) }))
    .map(({ item, x, z }) => {
      const angle = Math.atan2(z - player.y, x - player.x) - player.angle;
      return {
        item,
        distance: Math.hypot(x - player.x, z - player.y),
        angle: Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))),
      };
    })
    .filter(({ distance, angle }) => distance <= 2.4 && angle <= FIELD_OF_VIEW * 0.7)
    .sort((first, second) => first.distance - second.distance)[0]?.item ?? null;
}

function updateHud() {
  const heading = ((Math.round((Math.PI / 2 - player.angle) * 180 / Math.PI) % 360) + 360) % 360;
  const directions = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];
  elements.compassHeading.textContent = directions[Math.round(heading / 45) % directions.length];
  elements.compassDegree.textContent = `${heading}°`;

  const feature = getNearbyFeature();
  elements.interactionPrompt.hidden = !feature;
  if (feature) {
    const action = feature.kind === "person"
      ? "話しかける"
      : feature.kind === "clue"
        ? "調べる"
        : "エリア移動";
    elements.interactionLabel.textContent = `${feature.name} — ${action}`;
  }
}

function render() {
  const state = states.get(currentArea.id);
  const map = activeMap();
  elements.areaRegion.textContent = currentArea.region;
  elements.areaName.textContent = currentArea.name;
  elements.mapName.textContent = map.name;
  elements.environmentStatus.textContent = currentArea.getStatus(state);
  const quest = currentArea.getQuest(state);
  elements.questTitle.textContent = quest.title;
  elements.questDescription.textContent = quest.description;
  drawWorld();
}

function showMessage(title, text, choices = []) {
  elements.dialogueCard.hidden = false;
  elements.dialogueSpeaker.textContent = title;
  elements.dialogueText.textContent = text;
  elements.choices.replaceChildren();
  choices.forEach((choice) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-button";
    button.textContent = choice.label;
    button.addEventListener("click", () => choose(choice.id));
    elements.choices.append(button);
  });
}

function hideDialogue() {
  elements.dialogueCard.hidden = true;
  elements.choices.replaceChildren();
}

function choose(choiceId) {
  const state = states.get(currentArea.id);
  const result = currentArea.choose(choiceId, state);
  if (!result) return;
  showMessage(result.title, result.text);
  render();
}

function switchMap(destination) {
  playerPositions.set(positionKey(), { ...player });
  currentMapId = destination;
  sceneDirty = true;
  const spawn = activeMap().spawn;
  player = playerPositions.get(positionKey()) ?? {
    x: spawn.x + 1,
    y: spawn.y + 1,
    angle: currentArea.id === "ocean" ? -Math.PI / 2 : Math.PI / 2,
    pitch: 0,
  };
  playerPositions.set(positionKey(), { ...player });
}

function switchArea(nextArea) {
  playerPositions.set(positionKey(), { ...player });
  currentArea = nextArea;
  currentMapId = "town";
  sceneDirty = true;
  const spawn = activeMap().spawn;
  player = playerPositions.get(positionKey()) ?? {
    x: spawn.x + 1,
    y: spawn.y + 1,
    angle: Math.PI / 2,
    pitch: 0,
  };
  playerPositions.set(positionKey(), { ...player });
}

function interact() {
  const feature = getNearbyFeature();

  if (!feature) {
    hideDialogue();
    return;
  }

  if (feature.kind === "entrance") {
    switchMap(feature.destination);
    showMessage("エリア移動", `${activeMap().name}に着いた。周囲を見渡して、地形を調べながら進もう。`);
    render();
    return;
  }
  if (feature.kind === "portal") {
    switchArea(currentArea.id === "ocean" ? areas.get("desert") : areas.get("ocean"));
    showMessage("エリア移動", `${currentArea.name}に着いた。住民に話しかけ、周りを調べてみよう。`);
    render();
    return;
  }

  const result = currentArea.interact(feature.id, states.get(currentArea.id));
  if (result) {
    showMessage(result.title, result.text, result.choices ?? []);
    render();
  }
}

function move(forward, sideways, elapsed, running) {
  const speed = running ? RUN_SPEED : WALK_SPEED;
  const directionX = Math.cos(player.angle);
  const directionZ = Math.sin(player.angle);
  const strafeX = -directionZ;
  const strafeZ = directionX;
  const length = Math.hypot(forward, sideways) || 1;
  const deltaX = (directionX * forward + strafeX * sideways) / length * speed * elapsed;
  const deltaZ = (directionZ * forward + strafeZ * sideways) / length * speed * elapsed;
  const nextX = player.x + deltaX;
  const nextZ = player.y + deltaZ;
  if (canStandAt(nextX, player.y)) player.x = nextX;
  if (canStandAt(player.x, nextZ)) player.y = nextZ;
  playerPositions.set(positionKey(), { ...player });
}

function gameLoop(timestamp) {
  const elapsed = previousFrame === 0 ? 0 : Math.min((timestamp - previousFrame) / 1000, 0.05);
  previousFrame = timestamp;
  const frameInterval = timestamp - lastRender;
  if (lastRender > 0 && frameInterval > 25) {
    slowFrameCount += 1;
    fastFrameCount = 0;
  } else if (frameInterval > 0 && frameInterval < 18) {
    fastFrameCount += 1;
    slowFrameCount = 0;
  } else {
    slowFrameCount = 0;
    fastFrameCount = 0;
  }
  if (slowFrameCount >= 12 && adaptiveResolutionScale > MIN_RESOLUTION_SCALE) {
    adaptiveResolutionScale = Math.max(MIN_RESOLUTION_SCALE, adaptiveResolutionScale - 0.1);
    slowFrameCount = 0;
  } else if (fastFrameCount >= 180 && adaptiveResolutionScale < MAX_RESOLUTION_SCALE) {
    adaptiveResolutionScale = Math.min(MAX_RESOLUTION_SCALE, adaptiveResolutionScale + 0.05);
    fastFrameCount = 0;
  }

  const forward = Number(pressedKeys.has("w") || pressedKeys.has("touchup"))
    - Number(pressedKeys.has("s") || pressedKeys.has("touchdown"));
  const sideways = Number(pressedKeys.has("d") || pressedKeys.has("touchright"))
    - Number(pressedKeys.has("a") || pressedKeys.has("touchleft"));
  const turning = Number(pressedKeys.has("arrowright") || pressedKeys.has("lookright"))
    - Number(pressedKeys.has("arrowleft") || pressedKeys.has("lookleft"));
  const lookingVertical = Number(pressedKeys.has("lookup"))
    - Number(pressedKeys.has("lookdown"))
    + Number(pressedKeys.has("arrowup"))
    - Number(pressedKeys.has("arrowdown"));
  if (forward || sideways) {
    isMoving = true;
    isRunning = pressedKeys.has("shift");
    walkCycle += elapsed * (isRunning ? 13 : 9);
    move(forward, sideways, elapsed, isRunning);
  } else {
    isMoving = false;
    isRunning = false;
  }
  if (turning) player.angle += turning * elapsed * TURN_SPEED;
  if (lookingVertical) player.pitch = Math.max(-1.15, Math.min(1.15, player.pitch + lookingVertical * elapsed * TURN_SPEED));
  drawWorld();
  lastRender = timestamp;
  requestAnimationFrame(gameLoop);
}

function lookWithPointer(event) {
  if (event.pointerType === "touch" && !draggingTouch) return;
  if (!previousPointer) {
    previousPointer = { x: event.clientX, y: event.clientY };
    return;
  }
  const deltaX = event.clientX - previousPointer.x;
  const deltaY = event.clientY - previousPointer.y;
  previousPointer = { x: event.clientX, y: event.clientY };
  player.angle -= deltaX * MOUSE_SENSITIVITY;
  player.pitch = Math.max(-1.15, Math.min(1.15, player.pitch - deltaY * MOUSE_SENSITIVITY));
  elements.viewHint.classList.add("is-hidden");
}

elements.viewport.addEventListener("pointerenter", (event) => {
  if (event.pointerType !== "touch") previousPointer = { x: event.clientX, y: event.clientY };
});
elements.canvas.addEventListener("pointerdown", (event) => {
  if (event.pointerType !== "touch") return;
  draggingTouch = true;
  previousPointer = { x: event.clientX, y: event.clientY };
  elements.canvas.setPointerCapture(event.pointerId);
});
elements.viewport.addEventListener("pointermove", lookWithPointer);
elements.canvas.addEventListener("pointerup", () => {
  draggingTouch = false;
  previousPointer = null;
});
elements.canvas.addEventListener("pointercancel", () => {
  draggingTouch = false;
  previousPointer = null;
});
elements.viewport.addEventListener("pointerleave", () => {
  previousPointer = null;
});

elements.fullscreenToggle.addEventListener("click", async () => {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
  } else if (elements.viewport.parentElement.requestFullscreen) {
    await elements.viewport.parentElement.requestFullscreen();
  }
});
elements.dialogueClose.addEventListener("click", hideDialogue);
document.addEventListener("fullscreenchange", () => {
  const isFullscreen = document.fullscreenElement === elements.viewport.parentElement;
  elements.fullscreenToggle.textContent = isFullscreen ? "⤢" : "⛶";
  elements.fullscreenToggle.setAttribute("aria-label", isFullscreen ? "全画面を終了" : "全画面表示");
  elements.fullscreenToggle.title = isFullscreen ? "全画面を終了" : "全画面表示";
  drawWorld();
});

document.querySelectorAll("[data-control]").forEach((button) => {
  const control = button.dataset.control;
  const key = control.startsWith("look") ? control : `touch${control.slice(5)}`;
  const release = () => pressedKeys.delete(key);
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    pressedKeys.add(key);
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
});

document.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLButtonElement) return;
  const key = event.key.toLowerCase();
  if (["w", "a", "s", "d", "shift", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
    event.preventDefault();
    pressedKeys.add(key);
  } else if ((key === "e" || key === "enter" || key === " ") && !event.repeat) {
    event.preventDefault();
    interact();
  }
});
document.addEventListener("keyup", (event) => pressedKeys.delete(event.key.toLowerCase()));
window.addEventListener("blur", () => pressedKeys.clear());
window.addEventListener("resize", drawWorld);

const firstSpawn = currentArea.maps.town.spawn;
player = {
  x: firstSpawn.x + 1,
  y: firstSpawn.y + 1,
  angle: Math.PI / 4,
  pitch: 0,
};
playerPositions.set(positionKey(), { ...player });
gl.enable(gl.DEPTH_TEST);
gl.depthFunc(gl.LEQUAL);
gl.enable(gl.CULL_FACE);
gl.cullFace(gl.BACK);
render();
requestAnimationFrame(gameLoop);
