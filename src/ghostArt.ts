/* The Hollow House — procedural ghost rendering.
   She is drawn live on canvas: swaying hair, hollow eyes, mist, flicker.
   No image files, so she can never look like a pasted-on photograph. */

import torchWebpUrl from './assets/torch.webp';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Turns a raw photo into an apparition plate: cold grade, film grain,
    lifted blacks and feathered edges — so she dissolves into the scene
    instead of looking like a pasted-on image. */
export function apparitionPlate(src: CanvasImageSource, sw: number, sh: number, opts?: { fade?: number; grain?: number }): HTMLCanvasElement {
  const W = 384;
  const H = 480;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d')!;
  // cover-fit
  const sc = Math.max(W / sw, H / sh);
  const dw = sw * sc;
  const dh = sh * sc;
  c.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);

  const img = c.getImageData(0, 0, W, H);
  const d = img.data;
  const grain = opts?.grain ?? 16;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    const n = (Math.random() - 0.5) * grain;
    // cold desaturated grade, blacks lifted toward moonlight blue
    d[i] = Math.min(255, r * 0.34 + l * 0.5 + 10 + n);
    d[i + 1] = Math.min(255, g * 0.34 + l * 0.52 + 12 + n);
    d[i + 2] = Math.min(255, b * 0.38 + l * 0.62 + 22 + n);
  }
  c.putImageData(img, 0, 0);

  // feather the silhouette into the dark
  const fade = opts?.fade ?? 0.92;
  c.globalCompositeOperation = 'destination-out';
  const g2 = c.createRadialGradient(W / 2, H * 0.42, H * 0.16, W / 2, H * 0.46, H * 0.62);
  g2.addColorStop(0, 'rgba(0,0,0,0)');
  g2.addColorStop(0.62, 'rgba(0,0,0,0)');
  g2.addColorStop(1, `rgba(0,0,0,${fade})`);
  c.fillStyle = g2;
  c.fillRect(0, 0, W, H);
  // top and bottom melt away
  const v = c.createLinearGradient(0, 0, 0, H);
  v.addColorStop(0, 'rgba(0,0,0,0.85)');
  v.addColorStop(0.18, 'rgba(0,0,0,0)');
  v.addColorStop(0.8, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.9)');
  c.fillStyle = v;
  c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = 'source-over';
  return cv;
}

/** The full-screen scare face. Drawn once per jumpscare with a random seed. */
export function drawScareFace(c: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  const r = mulberry32(seed);
  c.clearRect(0, 0, w, h);
  const cx = w / 2 + (r() - 0.5) * 14;
  const cy = h * 0.44;
  const rx = w * 0.3;
  const ry = h * 0.33;

  // cold halo behind the head
  let g = c.createRadialGradient(cx, cy, ry * 0.3, cx, cy, ry * 2.1);
  g.addColorStop(0, 'rgba(190,205,230,0.16)');
  g.addColorStop(1, 'rgba(190,205,230,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);

  // skull
  g = c.createRadialGradient(cx - rx * 0.35, cy - ry * 0.4, ry * 0.15, cx, cy, ry * 1.15);
  g.addColorStop(0, '#ded6c7');
  g.addColorStop(0.55, '#b3aa99');
  g.addColorStop(1, '#4d463c');
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  c.fill();

  // gaunt cheek / temple hollows
  const hollow = (x: number, y: number, rr: number, a: number) => {
    const hg = c.createRadialGradient(x, y, 1, x, y, rr);
    hg.addColorStop(0, `rgba(30,24,22,${a})`);
    hg.addColorStop(1, 'rgba(30,24,22,0)');
    c.fillStyle = hg;
    c.beginPath();
    c.arc(x, y, rr, 0, Math.PI * 2);
    c.fill();
  };
  hollow(cx - rx * 0.55, cy + ry * 0.25, rx * 0.3, 0.4);
  hollow(cx + rx * 0.55, cy + ry * 0.2, rx * 0.28, 0.45);
  hollow(cx - rx * 0.7, cy - ry * 0.3, rx * 0.22, 0.3);
  hollow(cx + rx * 0.72, cy - ry * 0.35, rx * 0.2, 0.32);

  // eye sockets — deep, wet, wrong
  const socket = (ex: number, ey: number, sx: number, sy: number) => {
    const sg = c.createRadialGradient(ex, ey, 1, ex, ey, sx * 1.9);
    sg.addColorStop(0, 'rgba(2,2,4,0.98)');
    sg.addColorStop(0.6, 'rgba(8,6,8,0.85)');
    sg.addColorStop(1, 'rgba(8,6,8,0)');
    c.fillStyle = sg;
    c.beginPath();
    c.ellipse(ex, ey, sx * 1.9, sy * 1.9, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.95)';
    c.beginPath();
    c.ellipse(ex, ey, sx, sy, 0, 0, Math.PI * 2);
    c.fill();
    // bloodshot rim
    c.strokeStyle = 'rgba(120,22,22,0.3)';
    c.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      c.beginPath();
      const a0 = r() * Math.PI * 2;
      c.moveTo(ex + Math.cos(a0) * sx, ey + Math.sin(a0) * sy);
      c.quadraticCurveTo(ex + Math.cos(a0) * sx * 2, ey + Math.sin(a0) * sy * 2, ex + Math.cos(a0 + 0.5) * sx * 2.4, ey + Math.sin(a0 + 0.5) * sy * 2.4);
      c.stroke();
    }
    // the glint that watches back
    c.fillStyle = 'rgba(205,235,255,0.85)';
    c.beginPath();
    c.arc(ex + sx * 0.3, ey - sy * 0.25, Math.max(1.2, sx * 0.09), 0, Math.PI * 2);
    c.fill();
  };
  socket(cx - rx * 0.42, cy - ry * 0.2, rx * 0.19, ry * 0.22);
  socket(cx + rx * 0.44, cy - ry * 0.16, rx * 0.2, ry * 0.25);

  // nose shadow
  c.fillStyle = 'rgba(20,16,14,0.5)';
  c.beginPath();
  c.ellipse(cx - rx * 0.06, cy + ry * 0.16, rx * 0.05, ry * 0.05, 0, 0, Math.PI * 2);
  c.ellipse(cx + rx * 0.1, cy + ry * 0.17, rx * 0.05, ry * 0.05, 0, 0, Math.PI * 2);
  c.fill();

  // the open mouth
  const mx = cx + rx * 0.02;
  const my = cy + ry * 0.52;
  const mg = c.createRadialGradient(mx, my, 1, mx, my, ry * 0.34);
  mg.addColorStop(0, '#000000');
  mg.addColorStop(0.7, '#160304');
  mg.addColorStop(1, 'rgba(22,3,4,0)');
  c.fillStyle = mg;
  c.beginPath();
  c.ellipse(mx, my, rx * 0.24, ry * 0.3, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = 'rgba(205,195,180,0.5)';
  for (let i = 0; i < 4; i++) c.fillRect(mx - rx * 0.13 + i * rx * 0.075, my - ry * 0.24, rx * 0.05, ry * 0.07);

  // cracked skin
  c.strokeStyle = 'rgba(28,20,18,0.3)';
  c.lineWidth = 1;
  for (let i = 0; i < 34; i++) {
    const a0 = r() * Math.PI * 2;
    const d0 = 0.4 + r() * 0.5;
    c.beginPath();
    c.moveTo(cx + Math.cos(a0) * rx * d0, cy + Math.sin(a0) * ry * d0);
    c.lineTo(cx + Math.cos(a0 + 0.12) * rx * (d0 + 0.22), cy + Math.sin(a0 + 0.12) * ry * (d0 + 0.22));
    c.stroke();
  }

  // wet streaks under the eyes
  c.strokeStyle = 'rgba(190,200,215,0.14)';
  c.lineWidth = 3;
  for (const s of [-1, 1]) {
    c.beginPath();
    c.moveTo(cx + s * rx * 0.43, cy - ry * 0.02);
    c.quadraticCurveTo(cx + s * rx * 0.46, cy + ry * 0.4, cx + s * rx * 0.38, cy + ry * 0.85);
    c.stroke();
  }

  // hair — falling over the face, some strands across one eye
  for (let i = 0; i < 46; i++) {
    const topX = cx + (r() - 0.5) * rx * 1.7;
    const endX = topX + (r() - 0.5) * rx * 1.1;
    const endY = cy + ry * (0.9 + r() * 1.2);
    c.strokeStyle = `rgba(6,7,11,${0.55 + r() * 0.4})`;
    c.lineWidth = 1.5 + r() * 3.5;
    c.beginPath();
    c.moveTo(topX, cy - ry * (0.85 + r() * 0.2));
    c.bezierCurveTo(topX + (r() - 0.5) * 30, cy - ry * 0.2, endX + (r() - 0.5) * 30, cy + ry * 0.3, endX, endY);
    c.stroke();
  }
  // crown mass
  c.fillStyle = 'rgba(5,6,10,0.95)';
  c.beginPath();
  c.ellipse(cx, cy - ry * 0.72, rx * 1.05, ry * 0.55, 0, Math.PI, Math.PI * 2);
  c.fill();

  // film grain
  for (let i = 0; i < 2600; i++) {
    c.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.07)';
    c.fillRect(r() * w, r() * h, 1, 1);
  }

  // vignette
  g = c.createRadialGradient(cx, cy, ry * 0.5, cx, cy, Math.max(w, h) * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.9)');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
}

/** 8-frame cycle of her standing figure, seen down a hallway. */
export function makeFarFrames(): HTMLCanvasElement[] {
  const W = 192;
  const H = 320;
  const flick = [0.85, 0.68, 0.9, 0.45, 0.8, 0.95, 0.6, 0.88];
  const frames: HTMLCanvasElement[] = [];
  for (let f = 0; f < 8; f++) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d')!;
    const r = mulberry32(900 + f * 77);
    const phase = (f / 8) * Math.PI * 2;
    const cx = W / 2 + Math.sin(phase) * 2;
    c.globalAlpha = flick[f];

    // gown — dissolves into mist at the hem
    const bg = c.createLinearGradient(0, 90, 0, H);
    bg.addColorStop(0, 'rgba(205,215,232,0.6)');
    bg.addColorStop(0.65, 'rgba(175,188,210,0.32)');
    bg.addColorStop(1, 'rgba(150,165,190,0.02)');
    c.fillStyle = bg;
    c.beginPath();
    c.moveTo(cx - 34, 118);
    c.bezierCurveTo(cx - 52, 170, cx - 60, 240, cx - 56 + Math.sin(phase) * 4, H - 8);
    for (let i = 0; i <= 6; i++) {
      const x = cx - 56 + (112 * i) / 6;
      c.quadraticCurveTo(x + 9, H - 8 - (i % 2 ? 16 : 2) + Math.sin(phase + i) * 3, x + 18, H - 8);
    }
    c.bezierCurveTo(cx + 60, 240, cx + 52, 170, cx + 34, 118);
    c.bezierCurveTo(cx + 20, 92, cx - 20, 92, cx - 34, 118);
    c.fill();

    // dark core inside the gown
    const cg = c.createRadialGradient(cx, 190, 4, cx, 190, 80);
    cg.addColorStop(0, 'rgba(18,24,40,0.5)');
    cg.addColorStop(1, 'rgba(18,24,40,0)');
    c.fillStyle = cg;
    c.beginPath();
    c.ellipse(cx, 190, 40, 92, 0, 0, Math.PI * 2);
    c.fill();

    // hanging arms
    c.strokeStyle = 'rgba(190,200,220,0.2)';
    c.lineWidth = 9;
    c.lineCap = 'round';
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(cx + s * 34, 130);
      c.quadraticCurveTo(cx + s * 46, 190, cx + s * 42 + Math.sin(phase + s) * 3, 248);
      c.stroke();
    }

    // head
    const hg = c.createRadialGradient(cx - 8, 66, 4, cx, 76, 40);
    hg.addColorStop(0, 'rgba(226,218,204,0.9)');
    hg.addColorStop(1, 'rgba(120,114,104,0.55)');
    c.fillStyle = hg;
    c.beginPath();
    c.ellipse(cx, 76, 26, 32, 0, 0, Math.PI * 2);
    c.fill();

    // sockets + glints
    for (const s of [-1, 1]) {
      c.fillStyle = 'rgba(4,5,9,0.92)';
      c.beginPath();
      c.ellipse(cx + s * 10, 72 + (s > 0 ? 1.5 : 0), 4.5, 6, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = `rgba(200,235,255,${0.5 + 0.4 * Math.sin(phase * 2 + s)})`;
      c.beginPath();
      c.arc(cx + s * 10 + 1.4, 70.5, 1.1, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = 'rgba(6,6,10,0.8)';
    c.beginPath();
    c.ellipse(cx, 92, 3.4, 5, 0, 0, Math.PI * 2);
    c.fill();

    // hair — long, wet, swaying
    for (let i = 0; i < 26; i++) {
      const topX = cx - 22 + (i / 25) * 44;
      const sway = Math.sin(phase + i * 0.7) * 7;
      const endX = topX + (i - 12.5) * 2.6 + sway;
      const endY = 185 + r() * 95 + (i % 4 === 0 ? 60 : 0);
      c.strokeStyle = `rgba(7,8,13,${0.5 + r() * 0.4})`;
      c.lineWidth = 1.8 + r() * 2.6;
      c.beginPath();
      c.moveTo(topX, 48 + r() * 8);
      c.bezierCurveTo(topX + sway * 0.4, 90, endX - sway * 0.5, endY - 60, endX, endY);
      c.stroke();
    }
    c.fillStyle = 'rgba(5,6,10,0.95)';
    c.beginPath();
    c.ellipse(cx, 52, 27, 18, 0, Math.PI, Math.PI * 2);
    c.fill();

    // ground mist
    for (let i = 0; i < 6; i++) {
      const mg = c.createRadialGradient(cx + (i - 2.5) * 22, H - 14, 2, cx + (i - 2.5) * 22, H - 14, 30);
      mg.addColorStop(0, 'rgba(185,198,220,0.1)');
      mg.addColorStop(1, 'rgba(185,198,220,0)');
      c.fillStyle = mg;
      c.beginPath();
      c.ellipse(cx + (i - 2.5) * 22, H - 14, 30, 10, 0, 0, Math.PI * 2);
      c.fill();
    }

    // drifting motes
    for (let i = 0; i < 14; i++) {
      c.fillStyle = `rgba(205,220,245,${0.08 + r() * 0.2})`;
      c.beginPath();
      c.arc(r() * W, r() * H, 0.6 + r() * 1.1, 0, Math.PI * 2);
      c.fill();
    }
    frames.push(cv);
  }
  return frames;
}

/** 4-frame close face cycle for when she is right in front of you. */
export function makeFaceFrames(): HTMLCanvasElement[] {
  const frames: HTMLCanvasElement[] = [];
  for (let f = 0; f < 4; f++) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 320;
    const c = cv.getContext('2d')!;
    c.translate((f % 2 ? 1 : -1) * (1 + f), (f % 3 ? 1 : -1));
    drawScareFace(c, 256, 320, 500 + f * 131);
    frames.push(cv);
  }
  return frames;
}

/** Small battery pickup sprite. */
export function makeBatterySprite(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 44; cv.height = 64;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#caa54a';
  c.fillRect(16, 4, 12, 7);
  c.fillStyle = '#1d3324';
  c.fillRect(8, 10, 28, 50);
  const g = c.createLinearGradient(8, 0, 36, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.22)');
  g.addColorStop(0.3, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.4)');
  c.fillStyle = g;
  c.fillRect(8, 10, 28, 50);
  c.fillStyle = '#d8d8ce';
  c.fillRect(8, 26, 28, 14);
  c.fillStyle = '#c1121f';
  c.fillRect(20, 29, 4, 8);
  c.fillRect(17, 31, 10, 3);
  return cv;
}

/* ------------------------------------------------------------------ */
/*  Photorealistic first-person tactical flashlight viewmodel          */
/* ------------------------------------------------------------------ */

export const TORCH_W = 896;
export const TORCH_H = 1200;

/** Exact coordinates of key flashlight landmarks in the 896x1200 sprite */
export const TORCH_LANDMARKS = {
  // Center of the Cree LED emitter inside the parabolic reflector
  lensX: 213.5,
  lensY: 303.0,
  // Center of the knurled metal handle where the glove grips it
  gripX: 460.9,
  gripY: 399.0,
  // Base anchor point for forearm/wrist rotation
  pivotX: 740,
  pivotY: 1140,
  // Exact angle of the flashlight barrel in sprite space (from grip to lens center)
  barrelAngle: -2.7714, // Math.atan2(303.0 - 399.0, 213.5 - 460.9) === -158.79 deg
};

/** Procedural stand-in for the torch photograph. Drawn along the same
    wrist→emitter axis the landmarks describe, so the beam, halo and LED core
    in drawView() still line up exactly with the lens. Without this the
    viewmodel canvas stays blank and the game shows a floating beam with no
    torch, no hand and no arm holding it. */
function drawTorchFallback(c: CanvasRenderingContext2D) {
  const { lensX, lensY, pivotX, pivotY } = TORCH_LANDMARKS;
  const L = Math.hypot(lensX - pivotX, lensY - pivotY);
  const r = mulberry32(4711);

  c.save();
  c.clearRect(0, 0, TORCH_W, TORCH_H);
  c.translate(pivotX, pivotY);
  c.rotate(Math.atan2(lensY - pivotY, lensX - pivotX));
  /* local +x now runs from the wrist to the emitter; local y is across the barrel */

  /* anodised aluminium: a lit top edge, a deep shadow along the underside */
  const tube = (x0: number, x1: number, half: number, top: string, mid: string, shade: string) => {
    const g = c.createLinearGradient(0, -half, 0, half);
    g.addColorStop(0, shade);
    g.addColorStop(0.22, top);
    g.addColorStop(0.5, mid);
    g.addColorStop(1, shade);
    c.fillStyle = g;
    c.fillRect(x0, -half, x1 - x0, half * 2);
  };

  /* ---- forearm and combat glove, anchored on the pivot ---- */
  tube(-380, 96, 132, '#3b3f46', '#23272d', '#12151a'); // sleeve, running off-frame
  for (let i = 0; i < 8; i++) {
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.fillRect(-360 + i * 46, -132, 12, 264);
  }
  const fist = c.createRadialGradient(148, -34, 12, 164, 6, 176);
  fist.addColorStop(0, '#4a4f57');
  fist.addColorStop(0.6, '#26292f');
  fist.addColorStop(1, '#0e1013');
  c.fillStyle = fist;
  c.beginPath();
  c.ellipse(164, 0, 152, 128, 0, 0, Math.PI * 2);
  c.fill();
  for (let i = 0; i < 4; i++) { // four knuckles curled over the barrel
    const kx = 96 + i * 44;
    const kg = c.createLinearGradient(0, -118, 0, -40);
    kg.addColorStop(0, '#4d525a');
    kg.addColorStop(1, '#1b1e23');
    c.fillStyle = kg;
    c.beginPath();
    c.ellipse(kx, -66, 34, 54, -0.1, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.4)';
    c.beginPath();
    c.ellipse(kx - 22, -30, 12, 34, 0, 0, Math.PI * 2);
    c.fill();
  }
  const thumb = c.createLinearGradient(0, 30, 0, 130);
  thumb.addColorStop(0, '#43484f');
  thumb.addColorStop(1, '#15171b');
  c.fillStyle = thumb;
  c.beginPath();
  c.ellipse(238, 62, 78, 42, -0.34, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = 'rgba(16,18,22,0.85)'; // rubberised studs
  for (let i = 0; i < 4; i++) {
    c.beginPath();
    c.arc(100 + i * 44, -104, 12, 0, Math.PI * 2);
    c.fill();
  }

  /* ---- the torch ---- */
  tube(-46, 34, 58, '#5b6068', '#2c3037', '#101216'); // tail cap
  c.fillStyle = '#15181d';
  c.fillRect(-46, -58, 14, 116);
  tube(34, 520, 62, '#666c75', '#31353c', '#101216'); // battery tube
  for (let i = 0; i < 42; i++) {
    const x = 56 + i * 11;
    c.fillStyle = i % 2 ? 'rgba(0,0,0,0.34)' : 'rgba(255,255,255,0.07)';
    c.fillRect(x, -62, 5, 124); // aggressive knurling
  }
  for (const bx of [150, 300, 452]) {
    tube(bx, bx + 34, 66, '#767d87', '#3a3f47', '#0d0f12');
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.fillRect(bx + 34, -66, 5, 132);
  }
  c.fillStyle = '#1b1f25'; // rubber boot around the power switch
  c.beginPath();
  c.ellipse(392, 48, 46, 26, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#c8452c';
  c.beginPath();
  c.ellipse(392, 44, 30, 15, 0, 0, Math.PI * 2);
  c.fill();

  const head = c.createLinearGradient(0, -118, 0, 118); // head flaring to the bezel
  head.addColorStop(0, '#0f1115');
  head.addColorStop(0.24, '#6a7079');
  head.addColorStop(0.52, '#33373e');
  head.addColorStop(1, '#0f1115');
  c.fillStyle = head;
  c.beginPath();
  c.moveTo(516, -62);
  c.lineTo(712, -104);
  c.lineTo(L + 26, -112);
  c.lineTo(L + 26, 112);
  c.lineTo(712, 104);
  c.lineTo(516, 62);
  c.closePath();
  c.fill();
  c.fillStyle = 'rgba(0,0,0,0.4)'; // cooling fins
  for (let i = 0; i < 6; i++) c.fillRect(556 + i * 26, -104, 8, 208);
  tube(L - 20, L + 34, 118, '#7d848e', '#3c4149', '#0c0e11'); // bezel ring
  c.fillStyle = 'rgba(0,0,0,0.5)'; // crenellated strike bezel
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i / 8) * Math.PI * 2;
    c.beginPath();
    c.arc(L + 30, Math.sin(a) * 104, 9, 0, Math.PI * 2);
    c.fill();
  }

  /* ---- reflector dish, emitter and glass, centred on the lens landmark ---- */
  const dish = c.createRadialGradient(L - 26, 0, 6, L, 0, 108);
  dish.addColorStop(0, '#f3f6fb');
  dish.addColorStop(0.42, '#9aa3b0');
  dish.addColorStop(0.8, '#454b55');
  dish.addColorStop(1, '#12151a');
  c.fillStyle = dish;
  c.beginPath();
  c.ellipse(L, 0, 40, 104, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.16)';
  c.lineWidth = 2;
  for (let i = 1; i <= 4; i++) {
    c.beginPath();
    c.ellipse(L - 4, 0, 12 + i * 6, 22 + i * 20, 0, 0, Math.PI * 2);
    c.stroke();
  }
  const glass = c.createLinearGradient(L - 30, -96, L + 24, 96);
  glass.addColorStop(0, 'rgba(198,222,255,0.24)');
  glass.addColorStop(0.5, 'rgba(150,175,205,0.07)');
  glass.addColorStop(1, 'rgba(198,222,255,0.16)');
  c.fillStyle = glass;
  c.beginPath();
  c.ellipse(L, 0, 30, 96, 0, 0, Math.PI * 2);
  c.fill();

  /* handling wear — kept inside the silhouette so it never shows as a haze
     rectangle floating around the torch */
  c.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 1400; i++) {
    c.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)';
    c.fillRect(-400 + r() * (L + 480), -150 + r() * 300, 1.5, 1.5);
  }
  c.globalCompositeOperation = 'source-over';
  c.restore();
}

/** High-detail AAA tactical flashlight held in a rugged combat glove.
    Loads the optimized photorealistic asset and renders to a viewmodel canvas. */
export function makeTorchSprite(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = TORCH_W;
  cv.height = TORCH_H;
  const c = cv.getContext('2d')!;
  /* the plate is drawn before either load resolves so the very first frames
     already have something in the player's hand */
  drawTorchFallback(c);

  const img = new Image();
  img.onload = () => {
    c.clearRect(0, 0, TORCH_W, TORCH_H);
    c.drawImage(img, 0, 0, TORCH_W, TORCH_H);
  };
  img.onerror = () => {
    // Fallback: try public folder if bundler URL fails
    const fallback = new Image();
    fallback.onload = () => {
      c.clearRect(0, 0, TORCH_W, TORCH_H);
      c.drawImage(fallback, 0, 0, TORCH_W, TORCH_H);
    };
    fallback.onerror = () => drawTorchFallback(c); // both gone — keep the drawn torch
    fallback.src = '/assets/torch.webp';
  };
  img.src = torchWebpUrl;

  return cv;
}

