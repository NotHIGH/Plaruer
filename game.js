const worldCanvas = document.querySelector("#world");
const worldContext = worldCanvas.getContext("2d");
const context = worldContext;
const effectCanvas = document.querySelector("#effects");
const joystick = document.querySelector("#joystick");
const joystickStick = document.querySelector("#joystick-stick");
const attackButton = document.querySelector("#attack");
const inventoryButton = document.querySelector("#inventory-toggle");
const inventoryPanel = document.querySelector("#inventory");
const toast = document.querySelector("#toast");
const zombieCounter = document.querySelector("#zombie-count");
const tileSize = 64;
const mapColumns = 128;
const mapRows = 128;
const mapWidth = mapColumns * tileSize;
const mapHeight = mapRows * tileSize;
const worldSeed = Math.floor(Math.random() * 2147483647);
const terrain = [];
const deadTrees = [];
const rocks = [];
const zombies = [];
const keys = new Set();
const movementAxis = { x: 0, y: 0 };
const player = {
  x: mapWidth / 2,
  y: mapHeight / 2,
  speed: 210,
  facingX: 1,
  moving: false,
  selectedSlot: 0
};
const camera = { x: player.x, y: player.y };
const playerSprites = [
  "assets/1000005638-removebg-preview.png",
  "assets/1000005640-removebg-preview.png",
  "assets/1000005642-removebg-preview.png"
].map(loadImage);
const zombieSprites = [
  "assets/zombie/1000005656-removebg-preview.png",
  "assets/zombie/1000005658-removebg-preview.png",
  "assets/zombie/1000005660-removebg-preview.png"
].map(loadImage);
let viewportWidth = 0;
let viewportHeight = 0;
let pixelRatio = 1;
let lastFrame = 0;
let lastAttack = -Infinity;
let toastTimeout = 0;
let joystickPointer = null;
let webgl = null;
let sceneTexture = null;
let sceneSampler = null;
let sceneTimeUniform = null;
let sceneSizeUniform = null;

function loadImage(source) {
  const image = new Image();
  image.src = source;
  return image;
}

function randomAt(column, row, salt = 0) {
  const value = Math.sin(column * 127.1 + row * 311.7 + worldSeed * .00017 + salt * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function riverColumnAt(row) {
  return mapColumns * .52
    + Math.sin(row * .075 + worldSeed) * 11
    + Math.sin(row * .19 + worldSeed * .3) * 4
    + Math.sin(row * .035) * 8;
}

function tributaryRowAt(column, junctionColumn, junctionRow) {
  return junctionRow - (junctionColumn - column) * .28 + Math.sin(column * .11 + worldSeed * .2) * 2.2;
}

function generateWorld() {
  const junctionRow = mapRows * .55;
  const junctionColumn = riverColumnAt(junctionRow);
  for (let row = 0; row < mapRows; row++) {
    for (let column = 0; column < mapColumns; column++) {
      const mainDistance = Math.abs(column - riverColumnAt(row));
      const branchDistance = Math.abs(row - tributaryRowAt(column, junctionColumn, junctionRow));
      const onMainRiver = mainDistance < 1.7;
      const onTributary = column < junctionColumn + 1 && branchDistance < 1.35;
      const water = onMainRiver || onTributary;
      const shore = !water && (mainDistance < 3.1 || (column < junctionColumn + 3 && branchDistance < 2.7));
      const variation = randomAt(column, row);
      const cell = {
        water,
        shore,
        tone: Math.floor(variation * 5),
        detail: randomAt(column, row, 2)
      };
      terrain[row * mapColumns + column] = cell;
      if (water || shore) continue;
      if (variation > .973) deadTrees.push({ x: (column + .5) * tileSize, y: (row + .62) * tileSize, size: .72 + randomAt(column, row, 5) * .7 });
      else if (variation < .018) rocks.push({ x: (column + .5) * tileSize, y: (row + .62) * tileSize, size: .65 + randomAt(column, row, 8) * .75 });
    }
  }
  if (!isWalkable(player.x, player.y)) {
    const safeStart = randomOpenPoint(mapWidth * .35, mapHeight * .35, mapWidth * .65, mapHeight * .65);
    player.x = safeStart.x;
    player.y = safeStart.y;
    camera.x = player.x;
    camera.y = player.y;
  }
}

function cellAt(x, y) {
  const column = Math.floor(x / tileSize);
  const row = Math.floor(y / tileSize);
  if (column < 0 || row < 0 || column >= mapColumns || row >= mapRows) return null;
  return terrain[row * mapColumns + column];
}

function isWalkable(x, y) {
  const cell = cellAt(x, y);
  return cell !== null && !cell.water;
}

function randomOpenPoint(minX = 0, minY = 0, maxX = mapWidth, maxY = mapHeight) {
  for (let attempt = 0; attempt < 1200; attempt++) {
    const x = minX + Math.random() * (maxX - minX);
    const y = minY + Math.random() * (maxY - minY);
    if (isWalkable(x, y)) return { x, y };
  }
  return { x: player.x + tileSize * 12, y: player.y + tileSize * 8 };
}

function spawnZombies() {
  for (let index = 0; index < 24; index++) {
    let point;
    if (index < 6) {
      const angle = Math.random() * Math.PI * 2;
      const distance = tileSize * (4 + Math.random() * 8);
      point = randomOpenPoint(
        Math.max(0, player.x + Math.cos(angle) * distance - tileSize * 2),
        Math.max(0, player.y + Math.sin(angle) * distance - tileSize * 2),
        Math.min(mapWidth, player.x + Math.cos(angle) * distance + tileSize * 2),
        Math.min(mapHeight, player.y + Math.sin(angle) * distance + tileSize * 2)
      );
    } else {
      point = randomOpenPoint();
    }
    zombies.push({
      x: point.x,
      y: point.y,
      homeX: point.x,
      homeY: point.y,
      targetX: point.x,
      targetY: point.y,
      hp: 3,
      speed: 43 + Math.random() * 12,
      facingX: 1,
      moving: false,
      nextWander: 0,
      hitUntil: 0
    });
  }
}

function resize() {
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  viewportWidth = window.innerWidth;
  viewportHeight = window.innerHeight;
  const width = Math.round(viewportWidth * pixelRatio);
  const height = Math.round(viewportHeight * pixelRatio);
  worldCanvas.width = width;
  worldCanvas.height = height;
  effectCanvas.width = width;
  effectCanvas.height = height;
  worldContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  if (webgl) webgl.viewport(0, 0, width, height);
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(message || "Could not compile the fog shader");
  }
  return shader;
}

function initializeFogShader() {
  const gl = effectCanvas.getContext("webgl", { alpha: false, antialias: false, preserveDrawingBuffer: false });
  if (!gl) {
    document.body.classList.add("no-webgl");
    return;
  }
  const vertexSource = `
    attribute vec2 a_position;
    varying vec2 v_uv;
    void main() {
      v_uv = a_position * 0.5 + 0.5;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;
  const fragmentSource = `
    precision mediump float;
    varying vec2 v_uv;
    uniform sampler2D u_scene;
    uniform vec2 u_resolution;
    uniform float u_time;
    float hash(vec2 point) {
      return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
    }
    float noise(vec2 point) {
      vec2 cell = floor(point);
      vec2 local = fract(point);
      local = local * local * (3.0 - 2.0 * local);
      return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), local.x),
                 mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), local.x), local.y);
    }
    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution;
      vec3 scene = texture2D(u_scene, uv).rgb;
      float luminance = dot(scene, vec3(0.299, 0.587, 0.114));
      vec3 grayScene = mix(scene, vec3(luminance), 0.92);
      vec2 fogPoint = uv * vec2(4.2, 2.6) + vec2(u_time * 0.012, -u_time * 0.007);
      float fogNoise = noise(fogPoint) * 0.68 + noise(fogPoint * 2.1 + 4.0) * 0.32;
      float lowFog = smoothstep(0.28, 0.88, fogNoise) * smoothstep(0.03, 0.72, 1.0 - uv.y);
      float distanceFog = smoothstep(0.24, 0.88, distance(uv, vec2(0.5, 0.53)));
      float fog = clamp(lowFog * 0.38 + distanceFog * 0.26, 0.0, 0.48);
      vec3 mist = vec3(0.66, 0.68, 0.68);
      vec3 color = mix(grayScene * 0.92, mist, fog);
      float vignette = 1.0 - smoothstep(0.28, 0.96, distance(uv * vec2(1.0, 0.82), vec2(0.5, 0.5)));
      color *= mix(0.73, 1.0, vignette);
      gl_FragColor = vec4(color, 1.0);
    }
  `;
  try {
    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "Could not link the fog shader");
    gl.useProgram(program);
    const vertices = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    sceneTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    sceneSampler = gl.getUniformLocation(program, "u_scene");
    sceneTimeUniform = gl.getUniformLocation(program, "u_time");
    sceneSizeUniform = gl.getUniformLocation(program, "u_resolution");
    webgl = gl;
  } catch (error) {
    console.warn("Fog shader unavailable:", error);
    document.body.classList.add("no-webgl");
  }
}

function applyFogShader(timestamp) {
  if (!webgl) return;
  webgl.viewport(0, 0, effectCanvas.width, effectCanvas.height);
  webgl.activeTexture(webgl.TEXTURE0);
  webgl.bindTexture(webgl.TEXTURE_2D, sceneTexture);
  webgl.texImage2D(webgl.TEXTURE_2D, 0, webgl.RGBA, webgl.RGBA, webgl.UNSIGNED_BYTE, worldCanvas);
  webgl.uniform1i(sceneSampler, 0);
  webgl.uniform1f(sceneTimeUniform, timestamp * 0.001);
  webgl.uniform2f(sceneSizeUniform, effectCanvas.width, effectCanvas.height);
  webgl.drawArrays(webgl.TRIANGLE_STRIP, 0, 4);
}

function drawGround(left, top, right, bottom) {
  const firstColumn = Math.max(0, Math.floor(left / tileSize));
  const lastColumn = Math.min(mapColumns - 1, Math.ceil(right / tileSize));
  const firstRow = Math.max(0, Math.floor(top / tileSize));
  const lastRow = Math.min(mapRows - 1, Math.ceil(bottom / tileSize));
  const landTones = ["#696d6d", "#707473", "#656968", "#747776", "#6b6f70"];
  const shoreTones = ["#585d5d", "#606464", "#555a5a"];
  const waterTones = ["#454d50", "#4b5355", "#41494b"];
  for (let row = firstRow; row <= lastRow; row++) {
    for (let column = firstColumn; column <= lastColumn; column++) {
      const cell = terrain[row * mapColumns + column];
      const x = column * tileSize;
      const y = row * tileSize;
      context.fillStyle = cell.water ? waterTones[cell.tone % waterTones.length] : cell.shore ? shoreTones[cell.tone % shoreTones.length] : landTones[cell.tone];
      context.fillRect(x, y, tileSize + 1, tileSize + 1);
      if (cell.water && cell.detail > .58) {
        context.strokeStyle = "#b4bbba35";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(x + 10, y + 18 + cell.detail * 16);
        context.lineTo(x + 39, y + 18 + cell.detail * 16);
        context.stroke();
      } else if (!cell.water && cell.detail > .64) {
        context.fillStyle = cell.shore ? "#41464755" : "#44494a55";
        context.fillRect(x + cell.detail * 39, y + randomAt(column, row, 11) * 45, 3, 3);
      }
    }
  }
}

function drawDeadTree(tree) {
  const size = tree.size;
  context.save();
  context.translate(tree.x, tree.y);
  context.strokeStyle = "#34393a";
  context.lineCap = "round";
  context.lineWidth = 5 * size;
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(-2 * size, -42 * size);
  context.lineTo(-12 * size, -62 * size);
  context.moveTo(-2 * size, -37 * size);
  context.lineTo(12 * size, -54 * size);
  context.moveTo(-8 * size, -53 * size);
  context.lineTo(-20 * size, -57 * size);
  context.moveTo(4 * size, -45 * size);
  context.lineTo(22 * size, -47 * size);
  context.stroke();
  context.strokeStyle = "#818584";
  context.lineWidth = Math.max(1, 1.3 * size);
  context.beginPath();
  context.moveTo(-1 * size, -5 * size);
  context.lineTo(-3 * size, -39 * size);
  context.moveTo(-2 * size, -37 * size);
  context.lineTo(-12 * size, -59 * size);
  context.moveTo(1 * size, -39 * size);
  context.lineTo(11 * size, -52 * size);
  context.stroke();
  context.fillStyle = "#404344";
  context.beginPath();
  context.ellipse(0, 1, 16 * size, 5 * size, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawRock(rock) {
  context.save();
  context.translate(rock.x, rock.y);
  context.fillStyle = "#414646";
  context.beginPath();
  context.moveTo(-13 * rock.size, 3 * rock.size);
  context.lineTo(-9 * rock.size, -8 * rock.size);
  context.lineTo(1 * rock.size, -13 * rock.size);
  context.lineTo(12 * rock.size, -5 * rock.size);
  context.lineTo(14 * rock.size, 4 * rock.size);
  context.closePath();
  context.fill();
  context.fillStyle = "#858a88";
  context.beginPath();
  context.moveTo(-7 * rock.size, -6 * rock.size);
  context.lineTo(1 * rock.size, -11 * rock.size);
  context.lineTo(6 * rock.size, -7 * rock.size);
  context.closePath();
  context.fill();
  context.restore();
}

function drawSword(x, y, facingX) {
  context.save();
  context.translate(x + facingX * 10, y - 37);
  context.scale(facingX, 1);
  context.rotate(-.42);
  context.lineCap = "round";
  context.strokeStyle = "#363b3d";
  context.lineWidth = 5;
  context.beginPath();
  context.moveTo(0, 3);
  context.lineTo(0, 18);
  context.stroke();
  context.strokeStyle = "#929a9b";
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(0, 1);
  context.lineTo(0, -25);
  context.stroke();
  context.strokeStyle = "#c2c6c3";
  context.lineWidth = 1.4;
  context.beginPath();
  context.moveTo(1, 0);
  context.lineTo(1, -21);
  context.stroke();
  context.strokeStyle = "#514a46";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(-6, 2);
  context.lineTo(6, 2);
  context.stroke();
  context.restore();
}

function drawPlayer(timestamp) {
  const frame = player.moving ? Math.floor(timestamp / 145) % playerSprites.length : 0;
  const image = playerSprites[frame];
  if (!image.complete || !image.naturalWidth) return;
  const height = 78;
  const width = height * image.naturalWidth / image.naturalHeight;
  const bob = player.moving ? Math.sin(timestamp / 70) * 2 : 0;
  context.save();
  context.translate(player.x, player.y + bob);
  context.scale(player.facingX, 1);
  context.fillStyle = "#25292a88";
  context.beginPath();
  context.ellipse(0, 1, 15, 6, 0, 0, Math.PI * 2);
  context.fill();
  context.drawImage(image, -width / 2, -height + 8, width, height);
  context.restore();
  if (player.selectedSlot === 0) drawSword(player.x, player.y + bob, player.facingX);
}

function drawZombie(zombie, timestamp) {
  const frame = zombie.moving ? Math.floor(timestamp / 205) % zombieSprites.length : 0;
  const image = zombieSprites[frame];
  if (!image.complete || !image.naturalWidth) return;
  const height = 68;
  const width = height * image.naturalWidth / image.naturalHeight;
  const bob = zombie.moving ? Math.sin(timestamp / 98 + zombie.homeX) * 1.5 : 0;
  context.save();
  context.translate(zombie.x, zombie.y + bob);
  context.scale(zombie.facingX, 1);
  context.fillStyle = "#20242599";
  context.beginPath();
  context.ellipse(0, 1, 14, 5, 0, 0, Math.PI * 2);
  context.fill();
  if (timestamp < zombie.hitUntil) context.globalAlpha = .58;
  context.drawImage(image, -width / 2, -height + 8, width, height);
  context.restore();
  if (zombie.hp < 3) {
    const barWidth = 25;
    context.fillStyle = "#252929";
    context.fillRect(zombie.x - barWidth / 2, zombie.y - height - 8, barWidth, 4);
    context.fillStyle = "#b4b8b3";
    context.fillRect(zombie.x - barWidth / 2, zombie.y - height - 8, barWidth * zombie.hp / 3, 4);
  }
}

function drawWorldEntities(timestamp, left, top, right, bottom) {
  const entities = [];
  for (const tree of deadTrees) {
    if (tree.x > left - 40 && tree.x < right + 40 && tree.y > top - 90 && tree.y < bottom + 20) {
      entities.push({ y: tree.y, draw: () => drawDeadTree(tree) });
    }
  }
  for (const rock of rocks) {
    if (rock.x > left - 20 && rock.x < right + 20 && rock.y > top - 20 && rock.y < bottom + 20) {
      entities.push({ y: rock.y, draw: () => drawRock(rock) });
    }
  }
  for (const zombie of zombies) {
    if (zombie.x > left - 50 && zombie.x < right + 50 && zombie.y > top - 90 && zombie.y < bottom + 20) {
      entities.push({ y: zombie.y, draw: () => drawZombie(zombie, timestamp) });
    }
  }
  entities.push({ y: player.y, draw: () => drawPlayer(timestamp) });
  entities.sort((first, second) => first.y - second.y);
  for (const entity of entities) entity.draw();
}

function moveOnLand(entity, deltaX, deltaY) {
  let moved = false;
  if (isWalkable(entity.x + deltaX, entity.y)) {
    entity.x += deltaX;
    moved ||= Math.abs(deltaX) > .01;
  }
  if (isWalkable(entity.x, entity.y + deltaY)) {
    entity.y += deltaY;
    moved ||= Math.abs(deltaY) > .01;
  }
  return moved;
}

function chooseWanderPoint(zombie) {
  const roamRadius = tileSize * 64;
  const fromHome = Math.hypot(zombie.x - zombie.homeX, zombie.y - zombie.homeY);
  if (fromHome > roamRadius * .78) {
    zombie.targetX = zombie.homeX;
    zombie.targetY = zombie.homeY;
    return;
  }
  for (let attempt = 0; attempt < 12; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.sqrt(Math.random()) * roamRadius;
    const x = Math.max(tileSize, Math.min(mapWidth - tileSize, zombie.homeX + Math.cos(angle) * distance));
    const y = Math.max(tileSize, Math.min(mapHeight - tileSize, zombie.homeY + Math.sin(angle) * distance));
    if (isWalkable(x, y)) {
      zombie.targetX = x;
      zombie.targetY = y;
      return;
    }
  }
  zombie.targetX = zombie.homeX;
  zombie.targetY = zombie.homeY;
}

function updateZombies(delta, timestamp) {
  const detectionRange = tileSize * 10;
  for (const zombie of zombies) {
    const distanceToPlayer = Math.hypot(player.x - zombie.x, player.y - zombie.y);
    const seesPlayer = distanceToPlayer <= detectionRange;
    if (!seesPlayer && Math.hypot(zombie.targetX - zombie.x, zombie.targetY - zombie.y) < tileSize * .6 && timestamp >= zombie.nextWander) {
      chooseWanderPoint(zombie);
      zombie.nextWander = timestamp + 1800 + Math.random() * 3200;
    }
    let targetX = seesPlayer ? player.x : zombie.targetX;
    let targetY = seesPlayer ? player.y : zombie.targetY;
    if (Math.hypot(zombie.x - zombie.homeX, zombie.y - zombie.homeY) > tileSize * 64) {
      targetX = zombie.homeX;
      targetY = zombie.homeY;
    }
    const offsetX = targetX - zombie.x;
    const offsetY = targetY - zombie.y;
    const distance = Math.hypot(offsetX, offsetY);
    zombie.moving = distance > 4;
    if (!zombie.moving) continue;
    const speed = zombie.speed * (seesPlayer ? 1.45 : 1);
    const stepX = offsetX / distance * speed * delta;
    const stepY = offsetY / distance * speed * delta;
    moveOnLand(zombie, stepX, stepY);
    if (Math.abs(offsetX) > 1) zombie.facingX = offsetX < 0 ? -1 : 1;
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => toast.classList.remove("visible"), 900);
}

function attack() {
  const now = performance.now();
  if (now - lastAttack < 270) return;
  lastAttack = now;
  if (player.selectedSlot !== 0) {
    showToast("У цьому слоті порожньо");
    return;
  }
  let target = null;
  let nearestDistance = tileSize * 1.7;
  for (const zombie of zombies) {
    const distance = Math.hypot(player.x - zombie.x, player.y - zombie.y);
    if (distance < nearestDistance) {
      target = zombie;
      nearestDistance = distance;
    }
  }
  if (!target) {
    showToast("Замах повз ціль");
    return;
  }
  target.hp--;
  target.hitUntil = now + 180;
  showToast(target.hp > 0 ? `Влучання · ${target.hp}/3` : "Зомбі знищений");
  if (target.hp <= 0) {
    zombies.splice(zombies.indexOf(target), 1);
    zombieCounter.textContent = String(zombies.length).padStart(2, "0");
  }
}

function setSelectedSlot(index) {
  player.selectedSlot = index;
  document.querySelectorAll(".hotbar-slot").forEach((slot, slotIndex) => {
    slot.classList.toggle("selected", slotIndex === index);
  });
  document.querySelectorAll(".inventory-slot").forEach((slot, slotIndex) => {
    slot.classList.toggle("selected", slotIndex === index);
  });
}

function toggleInventory(forceOpen) {
  const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : inventoryPanel.hidden;
  inventoryPanel.hidden = !shouldOpen;
  inventoryButton.setAttribute("aria-expanded", String(shouldOpen));
}

function updatePlayer(delta) {
  const horizontal = movementAxis.x
    + (keys.has("ArrowRight") || keys.has("d") ? 1 : 0)
    - (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0);
  const vertical = movementAxis.y
    + (keys.has("ArrowDown") || keys.has("s") ? 1 : 0)
    - (keys.has("ArrowUp") || keys.has("w") ? 1 : 0);
  const magnitude = Math.hypot(horizontal, vertical);
  player.moving = magnitude > .08;
  if (!player.moving) return;
  const normalizer = Math.max(1, magnitude);
  const stepX = horizontal / normalizer * player.speed * delta;
  const stepY = vertical / normalizer * player.speed * delta;
  moveOnLand(player, stepX, stepY);
  if (Math.abs(horizontal) > .08) player.facingX = horizontal < 0 ? -1 : 1;
}

function render(timestamp) {
  const delta = Math.min((timestamp - lastFrame) / 1000 || 0, .04);
  lastFrame = timestamp;
  updatePlayer(delta);
  updateZombies(delta, timestamp);
  const cameraTargetX = Math.max(viewportWidth / 2, Math.min(mapWidth - viewportWidth / 2, player.x));
  const cameraTargetY = Math.max(viewportHeight / 2, Math.min(mapHeight - viewportHeight / 2, player.y));
  camera.x += (cameraTargetX - camera.x) * Math.min(1, delta * 5);
  camera.y += (cameraTargetY - camera.y) * Math.min(1, delta * 5);
  worldContext.clearRect(0, 0, viewportWidth, viewportHeight);
  worldContext.fillStyle = "#626666";
  worldContext.fillRect(0, 0, viewportWidth, viewportHeight);
  worldContext.save();
  worldContext.translate(viewportWidth / 2 - camera.x, viewportHeight / 2 - camera.y);
  worldContext.beginPath();
  worldContext.rect(0, 0, mapWidth, mapHeight);
  worldContext.clip();
  drawGround(camera.x - viewportWidth / 2, camera.y - viewportHeight / 2, camera.x + viewportWidth / 2, camera.y + viewportHeight / 2);
  drawWorldEntities(timestamp, camera.x - viewportWidth / 2, camera.y - viewportHeight / 2, camera.x + viewportWidth / 2, camera.y + viewportHeight / 2);
  worldContext.restore();
  applyFogShader(timestamp);
  requestAnimationFrame(render);
}

window.addEventListener("resize", resize);
window.addEventListener("keydown", (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(key)) event.preventDefault();
  if (key === " ") attack();
  if (key === "i") toggleInventory();
  if (["1", "2", "3"].includes(key)) setSelectedSlot(Number(key) - 1);
  keys.add(key);
});
window.addEventListener("keyup", (event) => keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key));
window.addEventListener("blur", () => {
  keys.clear();
  movementAxis.x = 0;
  movementAxis.y = 0;
  joystickStick.style.transform = "translate(0px, 0px)";
  joystick.classList.remove("active");
});

function updateJoystick(event) {
  const bounds = joystick.getBoundingClientRect();
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const radius = bounds.width * .34;
  const offsetX = event.clientX - centerX;
  const offsetY = event.clientY - centerY;
  const distance = Math.hypot(offsetX, offsetY);
  const scale = distance > radius ? radius / distance : 1;
  const x = offsetX * scale;
  const y = offsetY * scale;
  movementAxis.x = x / radius;
  movementAxis.y = y / radius;
  joystickStick.style.transform = `translate(${x}px, ${y}px)`;
}

joystick.addEventListener("pointerdown", (event) => {
  joystickPointer = event.pointerId;
  joystick.setPointerCapture(joystickPointer);
  joystick.classList.add("active");
  updateJoystick(event);
});
joystick.addEventListener("pointermove", (event) => {
  if (event.pointerId === joystickPointer) updateJoystick(event);
});
function releaseJoystick(event) {
  if (event.pointerId !== joystickPointer) return;
  joystickPointer = null;
  movementAxis.x = 0;
  movementAxis.y = 0;
  joystickStick.style.transform = "translate(0px, 0px)";
  joystick.classList.remove("active");
}
joystick.addEventListener("pointerup", releaseJoystick);
joystick.addEventListener("pointercancel", releaseJoystick);

attackButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  attack();
});
worldCanvas.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse") attack();
});
inventoryButton.addEventListener("click", () => toggleInventory());
document.querySelector("#inventory-close").addEventListener("click", () => toggleInventory(false));
document.querySelectorAll(".hotbar-slot").forEach((slot, index) => slot.addEventListener("click", () => setSelectedSlot(index)));
document.querySelectorAll(".inventory-slot").forEach((slot, index) => slot.addEventListener("click", () => {
  if (index < 3) setSelectedSlot(index);
}));

generateWorld();
spawnZombies();
zombieCounter.textContent = String(zombies.length).padStart(2, "0");
initializeFogShader();
resize();
requestAnimationFrame(render);