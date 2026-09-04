/* The Hollow House — first-person raycasting horror engine.
   Wolfenstein-style DDA renderer, flashlight + candle lighting, ghost AI,
   doors, items, examine zones, minimap. Fully self-contained: every texture
   is procedural and every sprite has a procedural fallback, so the game
   runs even if zero images load. */

import { IMG, EXAMINES, WHISPERS, CHAPTERS } from './gameData';
import * as fx from './audio';
import { makeFarFrames, makeFaceFrames, makeBatterySprite, apparitionPlate, makeTorchSprite, TORCH_W, TORCH_H, TORCH_LANDMARKS } from './ghostArt';

export interface WorldEvents {
  scare(): void;
  died(cause: DeathCause): void;
  escaped(): void;
  log(text: string): void;
  toast(text: string): void;
  candlesChanged(n: number): void;
  invChanged(items: string[]): void;
  story(title: string, line: string): void;
  flash(): void;
}

export interface GameStats {
  sanity: number;
  scared: number;
  prompt: string | null;
  chased: boolean;
  sealProgress: number;
  escaped: boolean;
  dead: boolean;
  stamina: number;
  battery: number;
  emf: number;
}

export type DeathCause = 'caught' | 'sanity';
export type Difficulty = 'candle' | 'lantern' | 'blackout';

interface DiffCfg { ambient: number; speed: number; drain: number; fear: number }
export const DIFFS: Record<Difficulty, DiffCfg & { label: string; blurb: string }> = {
  candle: { ambient: 0.24, speed: 0.85, drain: 0.7, fear: 0.8, label: 'Candlelight', blurb: 'She is patient. The house is kind-ish.' },
  lantern: { ambient: 0.17, speed: 1, drain: 1, fear: 1, label: 'Lantern', blurb: 'The intended haunting. No mercy, some light.' },
  blackout: { ambient: 0.11, speed: 1.22, drain: 1.45, fear: 1.3, label: 'Blackout', blurb: 'The moon left. She did not. Good luck.' },
};

export const MW = 32;
const MH = 32;

/* wall ids */
const W_WALL = 1;
const W_WOOD = 2;
const W_STONE = 3;
const W_ALTAR = 7;
const W_DOOR = 6;
const W_HATCH = 5;
const W_EXIT = 8;

function buildGrid(): number[] {
  const g = new Array<number>(MW * MH).fill(W_WALL);
  const carve = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y * MW + x] = 0;
  };
  carve(5, 13, 26, 16); // hallway
  carve(5, 5, 10, 11); // nursery
  carve(5, 18, 11, 24); // cellar
  carve(12, 3, 17, 7); // attic
  carve(14, 9, 14, 12); // stair shaft into nursery
  carve(16, 9, 16, 12); // second stair shaft straight down to the hallway
  carve(28, 13, 29, 16); // chapel
  g[14 * MW + 31] = 0; // the night outside the front door
  // doors
  g[12 * MW + 7] = W_DOOR; // nursery door
  g[17 * MW + 8] = W_DOOR; // cellar door
  g[14 * MW + 27] = W_DOOR; // chapel door
  g[8 * MW + 14] = W_HATCH; // attic hatch (locked)
  g[14 * MW + 30] = W_EXIT; // sealed front door
  g[13 * MW + 30] = W_ALTAR;
  g[15 * MW + 30] = W_ALTAR;
  g[16 * MW + 30] = W_ALTAR;
  for (let y = 9; y <= 11; y++) {
    g[y * MW + 13] = W_WOOD;
    g[y * MW + 15] = W_WOOD;
  }
  return g;
}

/* ---------------- procedural textures ---------------- */
function tex(draw: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 64;
  const c = cv.getContext('2d')!;
  draw(c);
  // grime pass
  for (let i = 0; i < 320; i++) {
    c.fillStyle = `rgba(0,0,0,${Math.random() * 0.16})`;
    c.fillRect(Math.random() * 64, Math.random() * 64, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  return cv;
}

const textures: Record<number, HTMLCanvasElement> = {};
function makeTextures() {
  textures[W_WALL] = tex((c) => {
    c.fillStyle = '#2b2620';
    c.fillRect(0, 0, 64, 64);
    c.fillStyle = '#241f1a';
    for (let x = 0; x < 64; x += 8) c.fillRect(x, 0, 3, 64);
    c.strokeStyle = '#3a322a';
    c.lineWidth = 1;
    for (let y = 8; y < 64; y += 16)
      for (let x = 4; x < 64; x += 16) {
        c.beginPath();
        c.moveTo(x, y - 4);
        c.quadraticCurveTo(x + 4, y, x, y + 4);
        c.quadraticCurveTo(x - 4, y, x, y - 4);
        c.stroke();
      }
    c.fillStyle = 'rgba(20,12,6,0.5)';
    c.fillRect(0, 52, 64, 12);
  });
  textures[W_WOOD] = tex((c) => {
    c.fillStyle = '#33261a';
    c.fillRect(0, 0, 64, 64);
    for (let x = 0; x < 64; x += 11) {
      c.fillStyle = x % 22 ? '#3a2b1d' : '#2c2013';
      c.fillRect(x, 0, 10, 64);
      c.fillStyle = 'rgba(0,0,0,0.55)';
      c.fillRect(x + 10, 0, 1, 64);
      c.strokeStyle = 'rgba(60,44,26,0.5)';
      c.beginPath();
      c.moveTo(x + 3, 0);
      c.bezierCurveTo(x + 5, 20, x + 2, 44, x + 4, 64);
      c.stroke();
    }
  });
  textures[W_STONE] = tex((c) => {
    c.fillStyle = '#33363a';
    c.fillRect(0, 0, 64, 64);
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 2; col++) {
        const off = row % 2 ? 16 : 0;
        const x = col * 32 + off - 8;
        c.fillStyle = `rgb(${52 + Math.random() * 14},${54 + Math.random() * 14},${58 + Math.random() * 14})`;
        c.fillRect(x + 1, row * 16 + 1, 30, 14);
      }
    c.fillStyle = 'rgba(10,14,10,0.5)';
    for (let i = 0; i < 14; i++) c.fillRect(Math.random() * 64, Math.random() * 64, 3, 2);
  });
  textures[W_ALTAR] = tex((c) => {
    c.fillStyle = '#26222a';
    c.fillRect(0, 0, 64, 64);
    c.fillStyle = '#1d1a21';
    c.fillRect(0, 0, 64, 6);
    c.fillRect(0, 58, 64, 6);
    c.strokeStyle = '#5a1218';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(32, 32, 15, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.moveTo(32, 12);
    c.lineTo(32, 52);
    c.moveTo(22, 20);
    c.lineTo(42, 20);
    c.stroke();
  });
  const doorBase = (c: CanvasRenderingContext2D) => {
    c.fillStyle = '#241a10';
    c.fillRect(0, 0, 64, 64);
    for (let x = 0; x < 64; x += 9) {
      c.fillStyle = x % 18 ? '#2e2114' : '#281d11';
      c.fillRect(x, 0, 8, 64);
    }
    c.strokeStyle = '#3d2c1a';
    c.strokeRect(6.5, 6.5, 51, 51);
    c.strokeRect(14.5, 14.5, 35, 35);
    c.fillStyle = '#8a7434';
    c.beginPath();
    c.arc(52, 34, 2.4, 0, Math.PI * 2);
    c.fill();
  };
  textures[W_DOOR] = tex(doorBase);
  textures[W_HATCH] = tex((c) => {
    doorBase(c);
    c.fillStyle = '#15100a';
    c.fillRect(0, 20, 64, 5);
    c.fillRect(0, 40, 64, 5);
    c.fillStyle = '#050505';
    c.beginPath();
    c.arc(32, 32, 4, 0, Math.PI * 2);
    c.fill();
    c.fillRect(30.5, 32, 3, 7);
    c.fillStyle = '#c1121f';
    c.fillRect(31.4, 33, 1.2, 1.2);
  });
  textures[W_EXIT] = tex((c) => {
    c.fillStyle = '#1b130c';
    c.fillRect(0, 0, 64, 64);
    c.fillStyle = '#241a10';
    c.fillRect(2, 0, 29, 64);
    c.fillRect(33, 0, 29, 64);
    c.strokeStyle = '#3d2c1a';
    c.strokeRect(6.5, 8.5, 21, 47);
    c.strokeRect(36.5, 8.5, 21, 47);
    c.strokeStyle = '#c1121f';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(32, 32, 12, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
      const px = 32 + Math.cos(a) * 12;
      const py = 32 + Math.sin(a) * 12;
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.closePath();
    c.stroke();
  });
}

/* ---------------- sprite loading with fallbacks ---------------- */
function fallbackCanvas(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  return cv;
}

function loadSprite(url: string, fallback: () => HTMLCanvasElement): Promise<HTMLCanvasElement> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (cv: HTMLCanvasElement) => {
      if (!done) {
        done = true;
        resolve(cv);
      }
    };
    const timer = window.setTimeout(() => finish(fallback()), 7000);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      window.clearTimeout(timer);
      try {
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth || 512;
        cv.height = img.naturalHeight || 512;
        cv.getContext('2d')!.drawImage(img, 0, 0);
        finish(cv);
      } catch {
        finish(fallback());
      }
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      finish(fallback());
    };
    img.src = url;
  });
}

const fbFigure = () =>
  fallbackCanvas(256, 512, (c) => {
    const g = c.createLinearGradient(0, 40, 0, 500);
    g.addColorStop(0, 'rgba(210,220,240,0.85)');
    g.addColorStop(1, 'rgba(120,130,160,0)');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(128, 250, 62, 230, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(10,10,16,0.9)';
    c.beginPath();
    c.ellipse(128, 96, 34, 44, 0, 0, Math.PI * 2);
    c.fill();
  });

const fbFace = () =>
  fallbackCanvas(512, 512, (c) => {
    const g = c.createRadialGradient(256, 256, 20, 256, 256, 240);
    g.addColorStop(0, 'rgba(228,226,215,0.95)');
    g.addColorStop(0.7, 'rgba(150,148,140,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 512, 512);
    c.fillStyle = 'rgba(5,5,8,0.95)';
    c.beginPath();
    c.ellipse(180, 210, 34, 48, 0, 0, Math.PI * 2);
    c.ellipse(332, 210, 34, 48, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(256, 350, 40, 70, 0, 0, Math.PI * 2);
    c.fill();
  });

const fbDoll = () =>
  fallbackCanvas(256, 320, (c) => {
    c.fillStyle = 'rgba(205,198,185,0.95)';
    c.beginPath();
    c.arc(128, 90, 62, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(20,16,12,0.95)';
    c.beginPath();
    c.arc(104, 84, 12, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(40,20,10,0.9)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(140, 72);
    c.lineTo(164, 96);
    c.stroke();
    c.fillStyle = 'rgba(70,30,34,0.9)';
    c.fillRect(60, 150, 136, 160);
  });

const fbCasket = () =>
  fallbackCanvas(512, 320, (c) => {
    c.fillStyle = 'rgba(62,44,26,0.95)';
    c.beginPath();
    c.moveTo(40, 60);
    c.lineTo(472, 60);
    c.lineTo(430, 280);
    c.lineTo(82, 280);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(20,12,6,0.9)';
    c.fillRect(60, 40, 392, 26);
    c.strokeStyle = 'rgba(120,90,50,0.7)';
    c.strokeRect(52, 70, 408, 200);
  });

const fbChalk = () =>
  fallbackCanvas(512, 512, (c) => {
    c.strokeStyle = 'rgba(226,222,210,0.9)';
    c.lineWidth = 7;
    c.beginPath();
    c.arc(256, 256, 190, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    for (let i = 0; i <= 5; i++) {
      const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
      const px = 256 + Math.cos(a) * 150;
      const py = 256 + Math.sin(a) * 150;
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.stroke();
  });

const fbFlame = () =>
  fallbackCanvas(64, 128, (c) => {
    const g = c.createLinearGradient(0, 10, 0, 128);
    g.addColorStop(0, 'rgba(255,220,150,0.95)');
    g.addColorStop(0.6, 'rgba(255,140,50,0.7)');
    g.addColorStop(1, 'rgba(120,40,10,0)');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(32, 70, 20, 58, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(230,225,215,0.9)';
    c.fillRect(24, 108, 16, 20);
  });

/* ---------------- entities ---------------- */
interface Sprite {
  id: string;
  x: number;
  y: number;
  img: HTMLCanvasElement | null;
  scale: number;
  float: number;
  wide: number;
  additive: boolean;
  taken?: boolean;
}

interface Zone {
  id: string;
  x: number;
  y: number;
  r: number;
  label: string;
  candleIndex?: number;
}

interface Candle {
  x: number;
  y: number;
  lit: boolean;
}

/* ================= the engine ================= */
export class HorrorEngine {
  private ctx: CanvasRenderingContext2D;
  private mini: CanvasRenderingContext2D;
  private ev: WorldEvents;
  private cols = 480;
  private rows = 270;
  private grid = buildGrid();
  private openDoors = new Set<string>();
  private zbuf = new Float32Array(this.cols);

  private px = 6.5;
  private py = 14.5;
  private dirX = 1;
  private dirY = 0;
  private planeX = 0;
  private planeY = 0.66;

  private keys: Record<string, boolean> = {};
  private bob = 0;
  private movePhase = 0;
  private yawAccum = 0;
  private pitch = 0;
  private pitchPx = 0;
  private wallDist = 5.5;
  private sprites: Sprite[] = [];
  private candles: Candle[] = [
    { x: 29.3, y: 13.7, lit: false },
    { x: 29.3, y: 15.3, lit: false },
    { x: 29.65, y: 14.5, lit: false },
  ];
  private zones: Zone[] = [
    { id: 'candle0', x: 29.3, y: 13.7, r: 1.05, label: 'Black Candle I', candleIndex: 0 },
    { id: 'candle1', x: 29.3, y: 15.3, r: 1.05, label: 'Black Candle II', candleIndex: 1 },
    { id: 'candle2', x: 29.65, y: 14.5, r: 1.05, label: 'Black Candle III', candleIndex: 2 },
    { id: 'portrait', x: 10.5, y: 13.7, r: 1.2, label: 'Family Portrait' },
    { id: 'crib', x: 5.9, y: 5.9, r: 1.15, label: 'The Crib' },
    { id: 'musicbox', x: 9.6, y: 10.6, r: 1.1, label: 'Music Box' },
    { id: 'jars', x: 5.8, y: 19.4, r: 1.2, label: 'Jar Shelves' },
    { id: 'scratches', x: 10.9, y: 23.9, r: 1.2, label: 'Scratch Marks' },
    { id: 'bible', x: 28.4, y: 16.3, r: 1.05, label: 'Defaced Bible' },
    { id: 'trunk', x: 12.7, y: 3.9, r: 1.1, label: 'Sheeted Trunk' },
    { id: 'window', x: 16.7, y: 3.8, r: 1.1, label: 'Round Window' },
    { id: 'mantel', x: 13.2, y: 16.2, r: 1.05, label: 'Mantelpiece' },
    { id: 'nur-window', x: 8.0, y: 5.8, r: 1.0, label: 'Nursery Window' },
    { id: 'journal', x: 6.3, y: 24.1, r: 1.05, label: 'Cellar Journal' },
    { id: 'salt', x: 9.0, y: 24.1, r: 1.05, label: 'Salt Pouch' },
    { id: 'diary', x: 14.7, y: 3.6, r: 1.0, label: 'Her Diary' },
    { id: 'hymnal', x: 28.35, y: 14.5, r: 1.05, label: 'Hymnal' },
  ];
  private examined: Record<string, number> = {};

  /* ghost — she starts at the far, dark end of the hall. Never inside the
     attic: the hatch is locked until Rite 6, and she cannot path out of it. */
  private gx = 24.5;
  private gy = 14.5;
  private gMode: 'wander' | 'stalk' | 'lunge' | 'chase' = 'wander';
  private gTimer = 3;
  private lungeCd = 14;
  private lungeT = 0;
  private path: { x: number; y: number }[] = [];
  private pathT = 0;
  private wardGrace = 0;
  private wanderTarget = { x: 24.5, y: 14.5 };

  /* state */
  private sanity = 100;
  private scared = 0;
  private inv: string[] = [];
  private chased = false;
  private sealTimer = 0;
  private sealActive = false;
  private escapeDone = false;
  private dead = false;
  private deadT = 0;
  private paused = false;
  private destroyed = false;

  private prompt: string | null = null;
  private sanctuaryTold = false;
  private whisperT = 8;
  private ambientT = 10;
  private diff: DiffCfg = { ...DIFFS.lantern };
  private phase = 0;
  private deathCause: DeathCause = 'sanity';
  private dying = false;
  private deathFired = false;
  private growlT = 2;
  private stepFoot = false;
  private flickerT = 0;
  private pendingScare = -1;
  private pendingApparition = -1;
  private nurseryVisited = false;
  private storySeen = new Set<string>();
  private shake = 0;
  private lean = 0;
  private kick = 0;
  private torchLag = 0;
  private lastYaw = 0;
  private lastPrompt: string | null = null;
  private ward = false;
  private sealStrikes = 0;
  private time = 0;

  private raf = 0;
  private last = 0;

  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp: (e: KeyboardEvent) => void;
  private onMouseMove: (e: MouseEvent) => void;
  private onMouseDown: (e: MouseEvent) => void;
  private onMouseUp: (e: MouseEvent) => void;
  private onContextMenu: (e: Event) => void;
  private onTouchStart: (e: TouchEvent) => void;
  private onTouchMove: (e: TouchEvent) => void;
  private mouseHeld = false;
  private mouseHeldAt = 0;
  private mouseDownX = 0;
  private mouseDownY = 0;
  private touchX = 0;
  private touchY = 0;
  private dragX = 0;
  private dragY = 0;
  private dragging = false;

  private mainCv: HTMLCanvasElement;
  private vctx: CanvasRenderingContext2D | null = null;
  private vw = 0;
  private vh = 0;
  private torchSprite = makeTorchSprite();
  private motes: { x: number; y: number; z: number; s: number }[] = [];
  private onResize = () => this.sizeView();

  constructor(main: HTMLCanvasElement, minimap: HTMLCanvasElement, ev: WorldEvents, view?: HTMLCanvasElement) {
    this.mainCv = main;
    main.width = this.cols;
    main.height = this.rows;
    this.ctx = main.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    this.mini = minimap.getContext('2d')!;
    minimap.width = 288;
    minimap.height = 288;
    this.ev = ev;
    makeTextures();

    /* full-resolution flashlight overlay (crisp, above the pixelated world) */
    if (view) {
      this.vctx = view.getContext('2d');
      for (let i = 0; i < 46; i++) {
        this.motes.push({ x: Math.random(), y: Math.random(), z: 0.15 + Math.random() * 0.85, s: 0.6 + Math.random() * 1.6 });
      }
      this.sizeView();
      window.addEventListener('resize', this.onResize);
    }

    this.sprites = [
      { id: 'doll', x: 7.5, y: 8.5, img: null, scale: 0.52, float: 0, wide: 0.8, additive: true },
      { id: 'casket', x: 8.5, y: 21.5, img: null, scale: 0.5, float: 0, wide: 1.35, additive: true },
      { id: 'chalk', x: 14.5, y: 5.3, img: null, scale: 0.4, float: 0.02, wide: 1.3, additive: true },
      { id: 'ghost', x: this.gx, y: this.gy, img: this.farFrames[0], scale: 1.05, float: 0.12, wide: 0.62, additive: true },
      { id: 'flame0', x: this.candles[0].x, y: this.candles[0].y, img: null, scale: 0.3, float: 0.3, wide: 0.4, additive: true },
      { id: 'flame1', x: this.candles[1].x, y: this.candles[1].y, img: null, scale: 0.3, float: 0.3, wide: 0.4, additive: true },
      { id: 'flame2', x: this.candles[2].x, y: this.candles[2].y, img: null, scale: 0.3, float: 0.3, wide: 0.4, additive: true },
      { id: 'battery0', x: 20.5, y: 15.5, img: this.batteryImg, scale: 0.22, float: 0, wide: 0.5, additive: false },
      { id: 'battery1', x: 6.5, y: 20.5, img: this.batteryImg, scale: 0.22, float: 0, wide: 0.5, additive: false },
      { id: 'battery2', x: 13.5, y: 5.5, img: this.batteryImg, scale: 0.22, float: 0, wide: 0.5, additive: false },
    ];
    void loadSprite(IMG.doll, fbDoll).then((cv) => this.setImg('doll', cv));
    void loadSprite(IMG.casket, fbCasket).then((cv) => this.setImg('casket', cv));
    void loadSprite(IMG.chalk, fbChalk).then((cv) => this.setImg('chalk', cv));
    // her photographs, processed into apparition plates so she never reads as a pasted image
    void loadSprite(IMG.figure, fbFigure).then((cv) => {
      this.farPlate = apparitionPlate(cv, cv.width, cv.height, { fade: 0.95, grain: 20 });
    });
    void loadSprite(IMG.scare, fbFace).then((cv) => {
      this.facePlate = apparitionPlate(cv, cv.width, cv.height, { fade: 0.8, grain: 26 });
    });
    /* warm the full-screen scare image now so the first jumpscare never decodes mid-fright */
    const warm = new Image();
    warm.src = IMG.scare;
    const flame = fbFlame();
    this.setImg('flame0', flame);
    this.setImg('flame1', flame);
    this.setImg('flame2', flame);

    this.onKeyDown = (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      /* key auto-repeat must not machine-gun an interaction or strobe the torch */
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (e.code === 'KeyE') this.interact();
      if (e.code === 'KeyF') this.toggleLight();
    };
    this.onKeyUp = (e) => (this.keys[e.code] = false);
    this.onMouseMove = (e) => {
      if (document.pointerLockElement) {
        this.yawAccum += e.movementX * 0.0026;
        this.pitch = Math.max(-0.42, Math.min(0.42, this.pitch - e.movementY * 0.0022));
      } else if (this.dragging) {
        this.yawAccum += (e.clientX - this.dragX) * 0.006;
        this.pitch = Math.max(-0.42, Math.min(0.42, this.pitch - (e.clientY - this.dragY) * 0.004));
        this.dragX = e.clientX;
        this.dragY = e.clientY;
      }
    };
    this.onMouseDown = (e) => {
      if (this.paused || this.dead || this.escapeDone) return;
      if (e.button === 2) return; // right-click does not walk
      if (!document.pointerLockElement) {
        try {
          const p = main.requestPointerLock() as unknown as Promise<void> | undefined;
          if (p && typeof p.catch === 'function') p.catch(() => undefined);
        } catch {
          /* pointer lock unsupported — drag look still works */
        }
        this.dragging = true;
        this.dragX = e.clientX;
        this.dragY = e.clientY;
      }
      // hold the mouse button to walk; a quick click still interacts
      this.mouseHeld = true;
      this.mouseHeldAt = performance.now();
      this.mouseDownX = e.clientX;
      this.mouseDownY = e.clientY;
    };
    this.onMouseUp = (e) => {
      if (this.mouseHeld) {
        const heldFor = performance.now() - this.mouseHeldAt;
        const moved = Math.abs(e.clientX - this.mouseDownX) + Math.abs(e.clientY - this.mouseDownY);
        if (heldFor < 240 && moved < 10) this.interact();
      }
      this.mouseHeld = false;
      this.dragging = false;
    };
    this.onContextMenu = (e) => e.preventDefault();
    this.onTouchStart = (e) => {
      this.touchX = e.touches[0]?.clientX ?? 0;
      this.touchY = e.touches[0]?.clientY ?? 0;
    };
    this.onTouchMove = (e) => {
      const t = e.touches[0];
      if (!t) return;
      this.yawAccum += (t.clientX - this.touchX) * 0.008;
      this.pitch = Math.max(-0.42, Math.min(0.42, this.pitch - (t.clientY - this.touchY) * 0.005));
      this.touchX = t.clientX;
      this.touchY = t.clientY;
    };

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousemove', this.onMouseMove);
    main.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    main.addEventListener('contextmenu', this.onContextMenu);
    main.addEventListener('touchstart', this.onTouchStart, { passive: true });
    main.addEventListener('touchmove', this.onTouchMove, { passive: true });
  }

  private farFrames = makeFarFrames();
  private faceFrames = makeFaceFrames();
  private batteryImg = makeBatterySprite();
  private farPlate: HTMLCanvasElement | null = null;
  private facePlate: HTMLCanvasElement | null = null;
  private flashOn = true;
  private stamina = 100;
  private exhausted = false;
  private battery = 100;
  private batWarned25 = false;
  private batWarned8 = false;
  private emf = 0;
  private beepT = 0;
  private gsT = 0;
  private setImg(id: string, cv: HTMLCanvasElement) {
    const s = this.sprites.find((sp) => sp.id === id);
    if (s) s.img = cv;
  }

  start() {
    this.last = performance.now();
    const loop = (now: number) => {
      if (this.destroyed) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused) {
        this.update(dt);
        this.render();
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.mainCv.removeEventListener('contextmenu', this.onContextMenu);
    this.mainCv.removeEventListener('touchstart', this.onTouchStart);
    this.mainCv.removeEventListener('touchmove', this.onTouchMove);
    this.mainCv.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('resize', this.onResize);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  setPaused(p: boolean) {
    this.paused = p;
    this.keys = {};
    this.mouseHeld = false;
    this.dragging = false;
    if (p && document.pointerLockElement) document.exitPointerLock();
  }

  setDifficulty(d: Difficulty) {
    this.diff = DIFFS[d];
  }

  rotate(angleRad: number) {
    this.yawAccum += angleRad;
  }

  setPitch(pitchRad: number) {
    this.pitch = Math.max(-0.42, Math.min(0.42, pitchRad));
    this.pitchPx = Math.tan(this.pitch) * (this.rows * 0.55);
  }

  private fireStory(id: string) {
    if (this.storySeen.has(id)) return;
    this.storySeen.add(id);
    const ch = CHAPTERS.find((c) => c.id === id);
    if (ch) this.ev.story(ch.title, ch.line);
  }

  /** Public so the on-screen touch controls can reach it — F on a keyboard. */
  toggleLight() {
    if (this.dead || this.escapeDone || this.paused) return;
    if (!this.flashOn && this.battery <= 2) {
      this.ev.toast('The batteries are dead. She likes it that way.');
      return;
    }
    this.flashOn = !this.flashOn;
    fx.torchClick();
    this.ev.toast(this.flashOn ? 'Flashlight on.' : 'Light off. The dark is hers, not yours.');
    if (!this.flashOn) this.ev.log('You kill the light. Immediately, you regret it.');
  }

  /* every completed rite makes her faster, bolder and closer */
  private bumpPhase(msg: string) {
    if (this.phase >= 4) return;
    this.phase++;
    fx.sting();
    this.ev.toast(msg);
    for (let tries = 0; tries < 30; tries++) {
      const rx = 3 + Math.floor(Math.random() * 26);
      const ry = 3 + Math.floor(Math.random() * 26);
      const d = Math.hypot(rx - this.px, ry - this.py);
      if (this.placeable(rx, ry) && d > 4 && d < 8) {
        this.gx = rx + 0.5;
        this.gy = ry + 0.5;
        this.path = [];
        break;
      }
    }
  }

  private ghostSpeed(base: number) {
    return base * this.diff.speed * (1 + this.phase * 0.14);
  }

  setVirtualKey(code: string, down: boolean) {
    this.keys[code] = down;
  }

  stats(): GameStats {
    return {
      sanity: Math.round(this.sanity),
      scared: this.scared,
      prompt: this.prompt,
      chased: this.chased,
      sealProgress: this.sealActive ? 1 - this.sealTimer / 1.6 : 0,
      escaped: this.escapeDone,
      dead: this.dead,
      stamina: Math.round(this.stamina),
      battery: Math.round(this.battery),
      emf: this.emf,
    };
  }

  /* ---------------- world helpers ---------------- */
  private cell(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= MW || y >= MH) return W_WALL;
    return this.grid[y * MW + x];
  }
  private solid(x: number, y: number, forGhostChase = false): boolean {
    const v = this.cell(x, y);
    if (v === 0) return false;
    if (v === W_DOOR || v === W_HATCH || v === W_EXIT) {
      if (forGhostChase && this.chased) return false;
      return !this.openDoors.has(`${x},${y}`);
    }
    return true;
  }
  private key(x: number, y: string | number) {
    return `${x},${y}`;
  }
  /* She may never be dropped inside the attic while the hatch is still locked:
     it has exactly one exit and BFS cannot leave it, so she would be sealed
     away from the house and the night would have no ghost in it at all. */
  private placeable(x: number, y: number): boolean {
    if (this.solid(x, y)) return false;
    if (!this.openDoors.has(this.key(14, 8)) && x >= 12 && x <= 17 && y <= 7) return false;
    return true;
  }
  private lightAt(x: number, y: number, mul = 1): number {
    const flick = this.flickerT > 0 ? 0.5 + Math.random() * 0.35 : 1;
    // moonlight seeping through every window — the house is never dead black
    let l = this.diff.ambient * flick;

    // Flashlight held in player's right hand in 3D world space:
    const rightX = this.dirY;
    const rightY = -this.dirX;
    const lensWorldX = this.px + rightX * 0.22 + this.dirX * 0.20;
    const lensWorldY = this.py + rightY * 0.22 + this.dirY * 0.20;

    // Target point in world space directly in line with camera forward crosshair:
    const targetDist = Math.max(1.5, this.wallDist);
    const targetWorldX = this.px + this.dirX * targetDist;
    const targetWorldY = this.py + this.dirY * targetDist;

    // Authoritative forward vector from lens to crosshair target:
    const fwdX = targetWorldX - lensWorldX;
    const fwdY = targetWorldY - lensWorldY;
    const fwdLen = Math.hypot(fwdX, fwdY) || 1;
    const flashDirX = fwdX / fwdLen;
    const flashDirY = fwdY / fwdLen;

    const dx = x - lensWorldX;
    const dy = y - lensWorldY;
    const d = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);
    const facing = Math.atan2(flashDirY, flashDirX);
    let diff = Math.abs(ang - facing);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    const cone = Math.max(0, 1 - diff / 0.68);
    const att = Math.max(0, 1 - d / 12.5);
    const beam = this.flashOn ? 0.45 + 0.55 * (this.battery / 100) : 0;
    l += 1.15 * cone * cone * att * flick * beam;
    // spill from the torch held at your side — near things stay faintly visible
    l += 0.08 * att * att * flick * beam;
    for (let i = 0; i < this.candles.length; i++) {
      const c = this.candles[i];
      if (!c.lit) continue;
      const cd = Math.hypot(x - c.x, y - c.y);
      const ca = Math.max(0, 1 - cd / 5.4);
      l += 0.95 * ca * ca * (0.82 + 0.18 * Math.sin(this.time * 9 + i * 2.4));
    }
    return Math.min(1, l * mul);
  }

  private los(x0: number, y0: number, x1: number, y1: number): boolean {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const d = Math.hypot(dx, dy);
    const steps = Math.ceil(d / 0.25);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.solid(Math.floor(x0 + dx * t), Math.floor(y0 + dy * t))) return false;
    }
    return true;
  }

  private bfs(sx: number, sy: number, tx: number, ty: number): { x: number; y: number }[] {
    const start = sy * MW + sx;
    const goal = ty * MW + tx;
    if (start === goal) return [];
    const prev = new Int32Array(MW * MH).fill(-2);
    prev[start] = -1;
    const q = [start];
    let head = 0;
    while (head < q.length) {
      const cur = q[head++];
      if (cur === goal) break;
      const cx = cur % MW;
      const cy = (cur / MW) | 0;
      const nbs = [cur - 1, cur + 1, cur - MW, cur + MW];
      for (const n of nbs) {
        if (n < 0 || n >= MW * MH) continue;
        if (prev[n] !== -2) continue;
        const nx = n % MW;
        const ny = (n / MW) | 0;
        if (Math.abs(nx - cx) + Math.abs(ny - cy) !== 1) continue;
        if (this.solid(nx, ny, true)) continue;
        prev[n] = cur;
        q.push(n);
      }
    }
    if (prev[goal] === -2) return [];
    const path: { x: number; y: number }[] = [];
    let cur = goal;
    while (cur !== start && cur >= 0) {
      path.push({ x: (cur % MW) + 0.5, y: ((cur / MW) | 0) + 0.5 });
      cur = prev[cur];
    }
    return path.reverse();
  }

  private tryMove(nx: number, ny: number) {
    const r = 0.24;
    if (!this.solid(Math.floor(nx + Math.sign(nx - this.px) * r), Math.floor(this.py))) this.px = nx;
    if (!this.solid(Math.floor(this.px), Math.floor(ny + Math.sign(ny - this.py) * r))) this.py = ny;
  }

  /* ---------------- interaction ---------------- */
  interact() {
    if (this.paused || this.dead || this.escapeDone) return;
    const t = this.currentTarget();
    if (t) {
      this.kick = 3.2;
      this.shake = Math.max(this.shake, 1.2);
      t.action();
    }
  }

  private currentTarget(): { label: string; action: () => void } | null {
    /* doors along the aim ray */
    for (let t = 0.4; t <= 1.9; t += 0.1) {
      const cx = Math.floor(this.px + this.dirX * t);
      const cy = Math.floor(this.py + this.dirY * t);
      const v = this.cell(cx, cy);
      if (v === W_DOOR || v === W_HATCH || v === W_EXIT) {
        return this.doorTarget(cx, cy, v);
      }
      if (v !== 0) break;
    }
    /* item sprites near the aim ray */
    for (const s of this.sprites) {
      if (s.id === 'ghost' || s.taken) continue;
      const dx = s.x - this.px;
      const dy = s.y - this.py;
      const d = Math.hypot(dx, dy);
      if (d > 2.1) continue;
      const ang = Math.atan2(dy, dx);
      const facing = Math.atan2(this.dirY, this.dirX);
      let diff = Math.abs(ang - facing);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff < 0.5 || d < 1.1) {
        const t = this.spriteTarget(s);
        if (t) return t;
      }
    }
    /* examine zones by proximity */
    for (const z of this.zones) {
      if (Math.hypot(z.x - this.px, z.y - this.py) < z.r) {
        return this.zoneTarget(z);
      }
    }
    return null;
  }

  private doorTarget(cx: number, cy: number, v: number) {
    const k = this.key(cx, cy);
    const open = this.openDoors.has(k);
    if (v === W_HATCH) {
      return {
        label: this.inv.includes('iron-key') ? 'E — Unlock the attic hatch' : 'E — Locked hatch (needs the iron key)',
        action: () => {
          if (this.inv.includes('iron-key')) {
            this.openDoors.add(k);
            fx.gateCreak();
            fx.whisper();
            this.ev.toast('The hatch swings open. Cold air pours down the shaft.');
            this.ev.log('The attic is open. She drew something up there.');
          } else {
            fx.slam();
            this.sanity = Math.max(0, this.sanity - 3);
            this.ev.toast('Locked. Something scratches on the other side.');
          }
        },
      };
    }
    if (v === W_EXIT) {
      const lit = this.candles.filter((c) => c.lit).length;
      const missing: string[] = [];
      if (lit < 3) missing.push('the three candles');
      if (!this.inv.includes('locket')) missing.push('her locket');
      if (!this.inv.includes('sigil')) missing.push('the chalk sigil');
      return {
        label: missing.length
          ? 'E — The sealed front door'
          : this.sealStrikes >= 3
            ? 'The seal is broken — RUN'
            : `E — Strike the seal (${this.sealStrikes}/3)`,
        action: () => {
          if (missing.length) {
            fx.slam();
            this.sanity = Math.max(0, this.sanity - 5);
            this.ev.toast(`The seal holds. It still demands ${missing.join(' and ')}.`);
            return;
          }
          if (this.sealStrikes >= 3) return;
          this.sealStrikes++;
          fx.clang();
          this.kick = 4;
          this.shake = Math.max(this.shake, 3.5);
          if (this.sealStrikes < 3) {
            fx.whisper();
            this.ev.toast(`The seal cracks — strike again (${this.sealStrikes}/3). She heard that.`);
            this.sanity = Math.max(0, this.sanity - 3);
            return;
          }
          this.sealActive = true;
          this.sealTimer = 1.6;
          this.chased = true;
          this.gMode = 'chase';
          this.fireStory('ch-run');
          this.ev.flash();
          this.shake = 5;
          fx.scream();
          this.ev.toast('The seal is breaking — SHE IS COMING. RUN TO THE DOOR.');
          this.ev.log('A scream rolls down from the attic. It is not human.');
        },
      };
    }
    return {
      label: open ? 'E — Close the door' : 'E — Open the door',
      action: () => {
        if (open) {
          if (Math.floor(this.px) === cx && Math.floor(this.py) === cy) return;
          this.openDoors.delete(k);
          fx.slam();
        } else {
          this.openDoors.add(k);
          fx.creak();
        }
      },
    };
  }

  private spriteTarget(s: Sprite) {
    if (s.id === 'doll') {
      if (this.inv.includes('iron-key'))
        return { label: 'The doll is smiling now', action: () => this.ev.toast('It will not let go of its smile.') };
      return {
        label: 'E — Pry the key from the doll',
        action: () => {
          this.inv = [...this.inv, 'iron-key'];
          fx.clink();
          fx.pickup();
          fx.whisper();
          this.ev.invChanged(this.inv);
          this.ev.toast('Iron Key taken. It is colder than the room.');
          this.ev.log('A child\u2019s giggle rises from inside the walls.');
          this.bumpPhase('One rite down. She walks faster now.');
          this.fireStory('ch-key');
        },
      };
    }
    if (s.id === 'casket') {
      if (this.inv.includes('locket'))
        return { label: 'The casket is empty now', action: () => this.ev.toast('Empty. The lid is warm.') };
      return {
        label: 'E — Open the casket',
        action: () => {
          this.inv = [...this.inv, 'locket'];
          fx.lidThud();
          fx.pickup();
          this.ev.invChanged(this.inv);
          this.ev.toast('Mourning Locket taken. Behind you, the lid slams down.');
          this.pendingScare = 0.45;
          this.bumpPhase('You took what was hers. She is coming.');
          this.fireStory('ch-locket');
          this.shake = Math.max(this.shake, 3);
        },
      };
    }
    if (s.id.startsWith('battery')) {
      return {
        label: 'E — Take the batteries',
        action: () => {
          s.taken = true;
          this.battery = Math.min(100, this.battery + 55);
          this.batWarned25 = false;
          this.batWarned8 = false;
          fx.torchClick();
          this.ev.toast('Batteries. Your light steadies.');
        },
      };
    }
    if (s.id === 'chalk') {
      if (this.inv.includes('sigil'))
        return { label: 'Her circle is broken', action: () => this.ev.toast('Only chalk dust remains.') };
      return {
        label: 'E — Take the chalk sigil',
        action: () => {
          this.inv = [...this.inv, 'sigil'];
          fx.moan();
          fx.pickup();
          this.ev.invChanged(this.inv);
          this.ev.toast('Chalk Sigil claimed. It writhes in your palm.');
          this.pendingScare = 0.45;
          this.bumpPhase('The circle is broken. Nothing is left to hold her.');
          this.fireStory('ch-broken');
        },
      };
    }
    return null;
  }

  private zoneTarget(z: Zone) {
    if (z.id === 'mantel') {
      const has = this.inv.includes('matches');
      return {
        label: has ? 'The mantelpiece is bare now' : 'E — Take the matches',
        action: () => {
          if (has) {
            this.ev.toast('You already have them. The box hums faintly in your pocket.');
            return;
          }
          this.inv = [...this.inv, 'matches'];
          this.ev.invChanged(this.inv);
          fx.matchStrike();
          fx.pickup();
          this.ev.toast('Matches taken. The box is warm, though no fire has burned here in years.');
          this.fireStory('ch-matches');
        },
      };
    }
    if (z.id === 'salt') {
      const has = this.inv.includes('salt');
      return {
        label: has ? 'The shelf is bare now' : 'E — Take the salt pouch',
        action: () => {
          if (has) {
            this.ev.toast('The pouch is already yours. It trembles when she is near.');
            return;
          }
          this.inv = [...this.inv, 'salt'];
          this.ward = true;
          this.ev.invChanged(this.inv);
          fx.cloth();
          fx.pickup();
          this.ev.toast('Salt pouch taken. Mother\u2019s ward — it will turn her once. Only once.');
          this.fireStory('ch-salt');
        },
      };
    }
    if (z.candleIndex !== undefined) {
      const i = z.candleIndex;
      const lit = this.candles[i].lit;
      const hasMatches = this.inv.includes('matches');
      return {
        label: lit
          ? 'The flame leans toward you'
          : hasMatches
            ? 'E — Light the black candle'
            : 'A black candle — you need matches',
        action: () => {
          if (lit) {
            this.ev.toast('It is already burning. The flame bends toward your face.');
            return;
          }
          if (!hasMatches) {
            fx.whisper();
            this.ev.toast('No flame. The hall mantelpiece still holds a box of matches.');
            return;
          }
          this.candles[i].lit = true;
          const count = this.candles.filter((c) => c.lit).length;
          fx.matchStrike();
          fx.bell();
          this.ev.candlesChanged(count);
          if (count === 1) this.fireStory('ch-altar');
          if (count === 3) this.fireStory('ch-unbound');
          this.ev.log(`Black candle ${count} of 3 lit. The shadows recoil.`);
          if (count === 3) {
            this.ev.toast('All three candles burn. The seal weakens — and she knows where you are.');
            this.pendingApparition = 0.8;
            this.bumpPhase('The third flame. She screams somewhere far below.');
          }
        },
      };
    }
    const n = this.examined[z.id] ?? 0;
    return {
      label: `E — Examine ${z.label}`,
      action: () => {
        const lines = EXAMINES[z.id] ?? ['Nothing. Nothing at all.'];
        this.ev.toast(lines[Math.min(n, lines.length - 1)]);
        this.examined[z.id] = n + 1;
        if (['journal', 'diary', 'hymnal', 'bible'].includes(z.id)) fx.paper();
        if (n === 0) {
          fx.whisper();
          this.sanity = Math.max(0, this.sanity - 2);
        }
        if (z.id === 'musicbox' && n === 0) fx.melody();
        if (z.id === 'nur-window' && n >= 1) {
          this.sanity = Math.max(0, this.sanity - 4);
          this.pendingApparition = 0.6;
        }
        if (z.id === 'window' && n >= 1) {
          this.sanity = Math.max(0, this.sanity - 5);
          this.pendingApparition = 0.5;
        }
      },
    };
  }

  /* ---------------- update ---------------- */
  private update(dt: number) {
    this.time += dt;

    if (this.dead) {
      // death is terminal — exactly one final scare, exactly one died() event
      this.deadT += dt;
      if (this.deadT > 1.2 && !this.deathFired) {
        this.deathFired = true;
        this.ev.died(this.deathCause);
      }
      return;
    }
    if (this.escapeDone) return;

    /* scheduled frights */
    if (this.pendingScare >= 0) {
      this.pendingScare -= dt;
      if (this.pendingScare < 0) {
        this.pendingScare = -1;
        this.doScare();
      }
    }
    if (this.pendingApparition >= 0) {
      this.pendingApparition -= dt;
      if (this.pendingApparition < 0) {
        this.pendingApparition = -1;
        this.apparition();
      }
    }

    /* seal burn */
    if (this.sealActive && this.sealTimer > 0) {
      this.sealTimer -= dt;
      if (this.sealTimer <= 0) {
        this.grid[14 * MW + 30] = 0;
        this.ev.log('The front door bursts open onto the night.');
      }
    }

    /* movement + stamina */
    const wantSprint = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
    let mx = 0;
    let my = 0;
    const k = this.keys;
    if (k['KeyW'] || k['ArrowUp'] || (this.mouseHeld && performance.now() - this.mouseHeldAt > 170)) {
      mx += this.dirX;
      my += this.dirY;
    }
    if (k['KeyS'] || k['ArrowDown']) {
      mx -= this.dirX;
      my -= this.dirY;
    }
    const wantLeft = k['KeyA'] || false;
    const wantRight = k['KeyD'] || false;
    this.lean += ((wantRight ? 5 : 0) - (wantLeft ? 5 : 0) - this.lean) * Math.min(1, dt * 8);
    const turn = Math.max(-1, Math.min(1, this.yawAccum * 14));
    this.torchLag += (turn - this.torchLag) * Math.min(1, dt * 7);
    if (wantLeft) {
      mx += this.dirY;
      my -= this.dirX;
    }
    if (wantRight) {
      mx -= this.dirY;
      my += this.dirX;
    }
    if (k['ArrowLeft']) this.yawAccum -= 2.6 * dt;
    if (k['ArrowRight']) this.yawAccum += 2.6 * dt;
    if (k['PageUp'] || k['KeyI']) this.pitch = Math.min(0.42, this.pitch + 1.8 * dt);
    if (k['PageDown'] || k['KeyK']) this.pitch = Math.max(-0.42, this.pitch - 1.8 * dt);
    const ml = Math.hypot(mx, my);
    const sprint = wantSprint && ml > 0 && !this.exhausted && this.stamina > 2;
    if (sprint) {
      this.stamina = Math.max(0, this.stamina - dt * 26);
      if (this.stamina <= 0 && !this.exhausted) {
        this.exhausted = true;
        this.ev.log('Your legs give out. Breathe. She can hear it.');
      }
    } else {
      this.stamina = Math.min(100, this.stamina + dt * (ml > 0 ? 9 : 15));
    }
    if (this.exhausted && this.stamina > 22) this.exhausted = false;
    const speed = (sprint ? 4.1 : 2.6) * dt;
    if (ml > 0) {
      this.tryMove(this.px + (mx / ml) * speed, this.py + (my / ml) * speed);
      this.movePhase += dt * (sprint ? 11 : 7.5);
      this.bob = Math.sin(this.movePhase) * (sprint ? 4.5 : 3);
      if (Math.sin(this.movePhase - dt * 7.5) < 0 && Math.sin(this.movePhase) >= 0) {
        this.stepFoot = !this.stepFoot;
        fx.stepSound(this.stepFoot, sprint);
      }
    } else {
      this.bob *= 0.85;
    }

    /* flashlight battery — drains only while on */
    if (this.flashOn) {
      this.battery = Math.max(0, this.battery - dt * 0.55);
      if (this.battery <= 0) {
        this.flashOn = false;
        this.ev.log('Your flashlight dies in your hand.');
      }
    }
    if (!this.batWarned25 && this.battery <= 25) {
      this.batWarned25 = true;
      this.ev.toast('Your flashlight is dimming. Batteries are hidden in the house.');
    }
    if (!this.batWarned8 && this.battery <= 8) {
      this.batWarned8 = true;
      this.ev.log('The light is nearly gone. She prefers it that way.');
    }

    /* EMF reader — she has a signature */
    const gd0 = Math.hypot(this.gx - this.px, this.gy - this.py);
    const target = gd0 < 2 ? 5 : gd0 < 3.5 ? 4 : gd0 < 5.5 ? 3 : gd0 < 8 ? 2 : gd0 < 12 ? 1 : 0;
    this.emf += (target - this.emf) * Math.min(1, dt * 4);
    this.beepT -= dt;
    if (this.beepT <= 0 && this.emf >= 0.8) {
      const lvl = Math.round(this.emf);
      fx.beep(320 + lvl * 150);
      this.beepT = 1.15 - lvl * 0.18;
    }

    /* her barefoot steps, panned to where she really is */
    this.gsT -= dt;
    if (this.gsT <= 0 && this.gMode !== 'wander' && gd0 < 7.5) {
      const toG = Math.atan2(this.gy - this.py, this.gx - this.px);
      const facing = Math.atan2(this.dirY, this.dirX);
      let dd = toG - facing;
      while (dd > Math.PI) dd -= Math.PI * 2;
      while (dd < -Math.PI) dd += Math.PI * 2;
      fx.ghostStep(Math.sin(dd) * 0.9);
      this.gsT = 0.52;
    }

    /* yaw */
    if (this.yawAccum !== 0) {
      const a = this.yawAccum;
      this.yawAccum = 0;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const ndx = this.dirX * cos - this.dirY * sin;
      this.dirY = this.dirX * sin + this.dirY * cos;
      this.dirX = ndx;
      const npx = this.planeX * cos - this.planeY * sin;
      this.planeY = this.planeX * sin + this.planeY * cos;
      this.planeX = npx;
    }
    this.pitchPx = Math.tan(this.pitch) * (this.rows * 0.55);

    /* nursery giggle */
    if (!this.nurseryVisited && this.px > 5 && this.px < 11 && this.py > 5 && this.py < 12) {
      this.nurseryVisited = true;
      fx.whisper();
      this.ev.log('The doll\u2019s head turns to follow you. Very slowly.');
      this.fireStory('ch-nursery');
    }
    /* cellar */
    if (this.px > 5 && this.px < 12 && this.py > 18 && this.py < 25) this.fireStory('ch-cellar');
    /* attic */
    if (this.px > 12 && this.px < 18 && this.py < 8) this.fireStory('ch-attic');

    this.updateGhost(dt);
    this.updateAmbient(dt);

    /* sanity */
    const gd = Math.hypot(this.gx - this.px, this.gy - this.py);
    if (gd < 3) this.sanity -= dt * 2.6 * this.diff.drain;
    else if (gd > 6) this.sanity = Math.min(100, this.sanity + dt * 0.9);
    /* standing in your own darkness costs you */
    if (!this.flashOn) this.sanity -= dt * 0.5;
    /* Rite 3: once her candles burn, the chapel is a sanctuary that gives
       sanity back — but never while she is hunting you, and never while she
       is standing in it with you. */
    const inChapel = this.px > 27.5 && this.px < 30 && this.py > 12.5 && this.py < 17;
    const litCount = this.candles.filter((c) => c.lit).length;
    if (inChapel && litCount > 0 && gd > 3 && !this.chased) {
      this.sanity = Math.min(100, this.sanity + dt * (1.1 + litCount * 0.8));
      if (!this.sanctuaryTold) {
        this.sanctuaryTold = true;
        this.ev.log('The candlelight holds her out. Your hands stop shaking.');
      }
    } else if (!inChapel) {
      this.sanctuaryTold = false;
    }
    if (this.sanity <= 0 && !this.dead) {
      this.sanity = 0;
      this.deathCause = 'sanity';
      this.dying = true;
      this.dead = true;
      this.deadT = 0;
      this.scared++;
      fx.scream();
      this.ev.scare();
    }

    /* escape */
    if (this.chased && !this.escapeDone && this.px > 31.15 && Math.abs(this.py - 14.5) < 1.4) {
      this.escapeDone = true;
      fx.bell();
      this.ev.escaped();
    }

    /* prompt */
    if (this.flickerT > 0) this.flickerT -= dt;
    const t = this.currentTarget();
    this.prompt = t ? t.label : null;
    if (this.prompt && this.prompt !== this.lastPrompt) fx.tick();
    this.lastPrompt = this.prompt;

    /* camera feel: kick, shake and lean settle down */
    this.kick = Math.max(0, this.kick - dt * 14);
    this.shake = Math.max(0, this.shake - dt * 9);
  }

  private updateGhost(dt: number) {
    this.lungeCd -= dt;
    const dist = Math.hypot(this.gx - this.px, this.gy - this.py);
    const seen = this.los(this.gx, this.gy, this.px, this.py);

    /* Mother's ward: the salt turns her once, and only once. It is resolved
       before every aggressive state, so it also breaks a lunge already in
       flight — the pouch is your only active defence. */
    if (this.ward && dist < 2.4 && this.gMode !== 'wander') {
      this.ward = false;
      fx.wardWhoosh();
      fx.sting();
      this.teleportAway();
      this.path = [];
      this.pathT = 0;
      this.lungeT = 0;
      if (this.chased) {
        /* the endgame hunt is not cancelled — the salt only buys one breath */
        this.gMode = 'chase';
        this.wardGrace = 3.5;
      } else {
        this.gMode = 'wander';
        this.gTimer = 3;
      }
      this.sanity = Math.min(100, this.sanity + 8);
      this.ev.toast('The salt burns her — she recoils into the walls. It is spent now.');
      this.ev.log('For one breath, the house is quiet. It will not last.');
      this.syncGhostSprite();
      return;
    }
    if (this.wardGrace > 0) this.wardGrace -= dt;

    if (this.gMode === 'lunge') {
      this.lungeT -= dt;
      const vx = this.px - this.gx;
      const vy = this.py - this.gy;
      const vl = Math.hypot(vx, vy) || 1;
      const step = 4.6 * dt;
      const nx = this.gx + (vx / vl) * step;
      const ny = this.gy + (vy / vl) * step;
      /* she is fast but not intangible: a lunge into plaster stops dead
         instead of tunnelling through the wall to reach you */
      let blocked = false;
      if (this.solid(Math.floor(nx), Math.floor(this.gy), true)) blocked = true;
      else this.gx = nx;
      if (this.solid(Math.floor(this.gx), Math.floor(ny), true)) blocked = true;
      else this.gy = ny;
      if (blocked) this.lungeT = Math.min(this.lungeT, 0.12);
      if (this.lungeT <= 0) {
        this.doScare();
        this.sanity = Math.max(0, this.sanity - 12 * this.diff.drain);
        this.teleportAway();
        this.gMode = 'wander';
        this.gTimer = 2;
      }
      this.syncGhostSprite();
      return;
    }

    if (!this.chased) {
      if (seen && dist < 2.5 + this.phase * 0.35 && this.lungeCd <= 0) {
        this.gMode = 'lunge';
        this.lungeT = 0.55;
        this.lungeCd = (20 + Math.random() * 10) / (this.diff.fear * (1 + this.phase * 0.18));
        fx.whisper();
        this.syncGhostSprite();
        return;
      }
      if (seen && dist < 9) this.gMode = 'stalk';
      else if (this.gMode === 'stalk') this.gMode = 'wander';
    }

    this.pathT -= dt;
    this.gTimer -= dt;

    if (this.gMode === 'chase') {
      if (this.wardGrace > 0) {
        /* recoiling inside the walls — for one breath she is not hunting */
        this.syncGhostSprite();
        return;
      }
      if (dist < 1.0 && !this.dead) {
        /* she caught you — this night is over. One scare. One death. Nothing loops. */
        this.deathCause = 'caught';
        this.dying = true;
        this.dead = true;
        this.deadT = 0;
        this.scared++;
        fx.scream();
        this.ev.scare();
      }
      if (this.pathT <= 0) {
        this.pathT = 0.4;
        this.path = this.bfs(Math.floor(this.gx), Math.floor(this.gy), Math.floor(this.px), Math.floor(this.py));
      }
      this.followPath(this.ghostSpeed(2.95), dt);
    } else if (this.gMode === 'stalk') {
      if (this.pathT <= 0) {
        this.pathT = 0.6;
        this.path = this.bfs(Math.floor(this.gx), Math.floor(this.gy), Math.floor(this.px), Math.floor(this.py));
        if (this.path.length > 2) this.path = this.path.slice(0, -2);
      }
      this.followPath(this.ghostSpeed(1.8), dt);
    } else {
      if (this.gTimer <= 0) {
        this.gTimer = 4 + Math.random() * 4;
        for (let tries = 0; tries < 20; tries++) {
          const rx = 3 + Math.floor(Math.random() * 26);
          const ry = 3 + Math.floor(Math.random() * 26);
          if (this.placeable(rx, ry)) {
            this.wanderTarget = { x: rx + 0.5, y: ry + 0.5 };
            break;
          }
        }
        this.path = this.bfs(Math.floor(this.gx), Math.floor(this.gy), Math.floor(this.wanderTarget.x), Math.floor(this.wanderTarget.y));
      }
      this.followPath(this.ghostSpeed(1.05), dt);
    }

    /* whisper when she is behind you */
    this.whisperT -= dt;
    if (this.whisperT <= 0 && dist < 5.5) {
      const toG = Math.atan2(this.gy - this.py, this.gx - this.px);
      const facing = Math.atan2(this.dirY, this.dirX);
      let diff = Math.abs(toG - facing);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff > 2.2) {
        fx.whisper(Math.sin(toG - facing) * 0.9);
        this.ev.log('Breathing, just behind your left shoulder.');
        this.sanity = Math.max(0, this.sanity - 3);
        this.whisperT = 9 + Math.random() * 6;
      } else {
        this.whisperT = 3;
      }
    }

    /* guttural growl when she is close and hunting */
    this.growlT -= dt;
    if (this.growlT <= 0 && dist < 4.2 && this.gMode !== 'wander') {
      fx.growl();
      this.growlT = 2.6 + Math.random() * 2.4;
    }

    this.syncGhostSprite();
  }

  private followPath(speed: number, dt: number) {
    if (!this.path.length) return;
    const n = this.path[0];
    const dx = n.x - this.gx;
    const dy = n.y - this.gy;
    const d = Math.hypot(dx, dy);
    if (d < 0.18) {
      this.path.shift();
      return;
    }
    this.gx += (dx / d) * speed * dt;
    this.gy += (dy / d) * speed * dt;
  }

  private syncGhostSprite() {
    const g = this.sprites.find((s) => s.id === 'ghost');
    if (g) {
      g.x = this.gx;
      g.y = this.gy;
      const d = Math.hypot(this.gx - this.px, this.gy - this.py);
      if (d < 3.4) {
        // close: her face — the processed photograph, flickering between frames
        g.img = this.facePlate ?? this.faceFrames[Math.floor(this.time * 9) % this.faceFrames.length];
        g.scale = 1.3;
        g.wide = 0.8;
      } else {
        // far: the figure — plate first, procedural silhouette as fallback
        g.img = this.farPlate ?? this.farFrames[Math.floor(this.time * 7) % this.farFrames.length];
        g.scale = 1.05;
        g.wide = 0.62;
      }
    }
  }

  private teleportAway() {
    for (let tries = 0; tries < 40; tries++) {
      const rx = 3 + Math.floor(Math.random() * 26);
      const ry = 3 + Math.floor(Math.random() * 26);
      const d = Math.hypot(rx - this.px, ry - this.py);
      if (this.placeable(rx, ry) && d > 7 && d < 13) {
        this.gx = rx + 0.5;
        this.gy = ry + 0.5;
        this.path = [];
        return;
      }
    }
  }

  private doScare() {
    if (this.dying) return; // no scares after death — the red screen must end
    this.scared++;
    this.sanity = Math.max(0, this.sanity - 25);
    fx.scream();
    this.ev.scare();
  }

  private apparition() {
    for (let tries = 0; tries < 30; tries++) {
      const rx = 3 + Math.floor(Math.random() * 26);
      const ry = 3 + Math.floor(Math.random() * 26);
      const d = Math.hypot(rx - this.px, ry - this.py);
      if (this.placeable(rx, ry) && d > 3 && d < 6 && this.los(this.px, this.py, rx + 0.5, ry + 0.5)) {
        this.gx = rx + 0.5;
        this.gy = ry + 0.5;
        this.path = [];
        fx.whisper();
        this.sanity = Math.max(0, this.sanity - 6);
        this.ev.log('She is standing in the light. Do not blink.');
        return;
      }
    }
  }

  private updateAmbient(dt: number) {
    this.ambientT -= dt;
    if (this.ambientT <= 0) {
      this.ambientT = 11 + Math.random() * 9;
      const roll = Math.random();
      if (roll < 0.2) {
        fx.whisper();
        this.ev.log(WHISPERS[Math.floor(Math.random() * WHISPERS.length)]);
      } else if (roll < 0.38) {
        fx.moan();
        this.ev.log('A long, low moan travels through the walls. It is looking for a mouth.');
      } else if (roll < 0.6) {
        fx.creak();
        this.ev.log('A door opens somewhere. Or closes.');
      } else if (roll < 0.78) {
        fx.slam();
        this.sanity = Math.max(0, this.sanity - 3);
        this.ev.log('Something heavy hits the floor above you.');
      } else if (roll < 0.92) {
        this.flickerT = 0.9;
        this.ev.log('Your light gutters. Something walks through it.');
      } else {
        this.apparition();
      }
    }
  }

  /* ---------------- render ---------------- */
  private render() {
    const { ctx, cols, rows } = this;
    /* camera feel: shake impulse + strafe lean */
    const shX = this.shake > 0.05 ? (Math.random() - 0.5) * this.shake : 0;
    const shY = this.shake > 0.05 ? (Math.random() - 0.5) * this.shake : 0;
    ctx.save();
    ctx.translate(shX + this.lean * 0.5, shY);
    const bobPx = this.bob;
    const horizon = Math.floor(rows / 2 + bobPx + this.pitchPx);

    /* floor & ceiling */
    const fg = ctx.createLinearGradient(0, horizon, 0, rows);
    fg.addColorStop(0, '#1c1610');
    fg.addColorStop(1, '#0c0906');
    ctx.fillStyle = fg;
    ctx.fillRect(0, horizon, cols, rows - horizon);
    /* your torch throws a warm pool on the floorboards at your feet */
    const pool = this.flickerT > 0 ? 0.05 : 0.15;
    const pg = ctx.createRadialGradient(cols / 2, rows * 0.85 + this.pitchPx, 6, cols / 2, rows * 0.85 + this.pitchPx, cols * 0.36);
    pg.addColorStop(0, `rgba(255,213,148,${pool})`);
    pg.addColorStop(1, 'rgba(255,213,148,0)');
    ctx.fillStyle = pg;
    ctx.fillRect(0, horizon, cols, rows - horizon);
    const cg = ctx.createLinearGradient(0, 0, 0, horizon);
    cg.addColorStop(0, '#040405');
    cg.addColorStop(1, '#12100c');
    ctx.fillStyle = cg;
    ctx.fillRect(0, 0, cols, horizon);

    /* walls */
    const midCol = Math.floor(cols / 2);
    for (let x = 0; x < cols; x++) {
      const cameraX = (2 * x) / cols - 1;
      const rdx = this.dirX + this.planeX * cameraX;
      const rdy = this.dirY + this.planeY * cameraX;
      let mapX = Math.floor(this.px);
      let mapY = Math.floor(this.py);
      const dX = Math.abs(rdx) < 1e-8 ? 1e8 : Math.abs(1 / rdx);
      const dY = Math.abs(rdy) < 1e-8 ? 1e8 : Math.abs(1 / rdy);
      let stepX: number, stepY: number, sideX: number, sideY: number;
      if (rdx < 0) {
        stepX = -1;
        sideX = (this.px - mapX) * dX;
      } else {
        stepX = 1;
        sideX = (mapX + 1 - this.px) * dX;
      }
      if (rdy < 0) {
        stepY = -1;
        sideY = (this.py - mapY) * dY;
      } else {
        stepY = 1;
        sideY = (mapY + 1 - this.py) * dY;
      }
      let side = 0;
      let hit = 0;
      for (let i = 0; i < 64 && !hit; i++) {
        if (sideX < sideY) {
          sideX += dX;
          mapX += stepX;
          side = 0;
        } else {
          sideY += dY;
          mapY += stepY;
          side = 1;
        }
        const v = this.cell(mapX, mapY);
        if (v === 0) continue;
        if ((v === W_DOOR || v === W_HATCH || v === W_EXIT) && this.openDoors.has(this.key(mapX, mapY))) continue;
        hit = v;
      }
      const perp = Math.max(0.03, side === 0 ? sideX - dX : sideY - dY);
      this.zbuf[x] = perp;
      if (x === midCol) {
        this.wallDist = perp;
      }
      const lineH = rows / perp;
      const top = (rows - lineH) / 2 + bobPx + this.pitchPx;
      let wallX = side === 0 ? this.py + perp * rdy : this.px + perp * rdx;
      wallX -= Math.floor(wallX);
      let texX = Math.floor(wallX * 64);
      if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) texX = 63 - texX;
      const t = textures[hit] ?? textures[W_WALL];
      ctx.drawImage(t, texX, 0, 1, 64, x, top, 1, lineH);

      /* lighting */
      const hx = this.px + rdx * perp;
      const hy = this.py + rdy * perp;
      const light = this.lightAt(hx, hy) * (side === 1 ? 0.82 : 1);
      // cold moonlit shadow, never dead black
      const dark = Math.max(0, 1 - light) * 0.93;
      if (dark > 0.02) {
        ctx.fillStyle = `rgba(8,12,22,${dark.toFixed(3)})`;
        ctx.fillRect(x, 0, 1, rows);
      }
      /* warm tint near candles */
      if (light > 0.25) {
        ctx.fillStyle = `rgba(255,150,70,${((light - 0.25) * 0.16).toFixed(3)})`;
        ctx.fillRect(x, top, 1, lineH);
      }
    }

    this.renderSprites(bobPx);
    ctx.restore();
    this.drawView();
    this.renderMinimap();
  }

  private sizeView() {
    if (!this.vctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    const cv = this.vctx.canvas;
    cv.width = Math.floor(this.vw * dpr);
    cv.height = Math.floor(this.vh * dpr);
    this.vctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* First-person flashlight rendered on a crisp full-resolution pass:
     volumetric beam, drifting dust motes, and a photorealistic tactical torch viewmodel. */
  private drawView() {
    const c = this.vctx;
    if (!c) return;
    c.clearRect(0, 0, this.vw, this.vh);
    if (this.dead || this.escapeDone || this.paused) return;

    const vw = this.vw;
    const vh = this.vh;
    const power = this.flashOn ? 0.35 + 0.65 * (this.battery / 100) : 0;
    const flick = this.flickerT > 0 ? 0.5 + Math.random() * 0.45 : this.battery < 15 ? 0.72 + Math.random() * 0.28 : 1;
    const beam = power * flick;

    // Natural footstep bob and strafe lean (zero lag on aim)
    const swayX = Math.sin(this.movePhase * 0.5) * 12 + this.lean * 2.2;
    const swayY = Math.abs(Math.sin(this.movePhase)) * 8 + this.kick * 4;

    const s = vh * 0.88;
    const scale = s / TORCH_H;

    // Authoritative crosshair target (exact center of screen, where the camera looks):
    const tx = vw * 0.5 + this.lean * 4;
    const ty = vh * 0.5 + this.bob;

    // Tactical gloved hand anchor in lower-right viewport, responding to camera pitch:
    const pitchShift = Math.tan(this.pitch) * (vh * 0.25);
    const ax = vw * 0.76 + swayX;
    const ay = vh * 0.93 + swayY - pitchShift;

    // Aim angle from flashlight hand anchor directly to the crosshair:
    const aim = Math.atan2(ty - ay, tx - ax);

    // Flashlight barrel in sprite space has exact angle TORCH_LANDMARKS.barrelAngle (-158.79 deg).
    // Setting rot = aim - TORCH_LANDMARKS.barrelAngle guarantees that the physical barrel
    // and lens point directly at (tx, ty)!
    const rot = aim - TORCH_LANDMARKS.barrelAngle;

    // Forward kinematics: exact physical screen-space position of the flashlight lens:
    const rx = (TORCH_LANDMARKS.lensX - TORCH_LANDMARKS.gripX) * scale;
    const ry = (TORCH_LANDMARKS.lensY - TORCH_LANDMARKS.gripY) * scale;
    const lx = ax + (rx * Math.cos(rot) - ry * Math.sin(rot));
    const ly = ay + (rx * Math.sin(rot) + ry * Math.cos(rot));

    // True forward vector from the flashlight lens directly to the crosshair:
    const bx = tx - lx;
    const by = ty - ly;
    const beamLen = Math.hypot(bx, by) || 1;
    const fwdX = bx / beamLen;
    const fwdY = by / beamLen;
    const normX = -fwdY;
    const normY = fwdX;

    // Target spotlight pool radius on the wall at the crosshair:
    const rEnd = Math.max(35, Math.min(vh * 0.32, vh * 0.22 * (5.5 / Math.max(1.2, this.wallDist))));
    const rStart = 18 * scale; // aperture size at lens

    if (beam > 0.03) {
      c.save();
      c.globalCompositeOperation = 'lighter';

      /* 1. Volumetric beam casting forward into the darkness, terminating at the crosshair wall pool */
      const g = c.createLinearGradient(lx, ly, tx, ty);
      g.addColorStop(0, `rgba(255, 238, 195, ${(0.26 * beam).toFixed(3)})`);
      g.addColorStop(0.25, `rgba(255, 225, 170, ${(0.12 * beam).toFixed(3)})`);
      g.addColorStop(0.70, `rgba(255, 215, 155, ${(0.04 * beam).toFixed(3)})`);
      g.addColorStop(1, `rgba(255, 210, 150, ${(0.01 * beam).toFixed(3)})`);
      c.fillStyle = g;

      c.beginPath();
      c.moveTo(lx - normX * rStart, ly - normY * rStart);
      c.lineTo(lx + normX * rStart, ly + normY * rStart);
      c.lineTo(tx + normX * rEnd, ty + normY * rEnd);
      c.lineTo(tx - normX * rEnd, ty - normY * rEnd);
      c.closePath();
      c.fill();

      /* 2. Target ambient illumination pool on the wall, CENTERED AT CROSSHAIR */
      const pool = c.createRadialGradient(tx, ty, 0, tx, ty, rEnd * 1.25);
      pool.addColorStop(0, `rgba(255, 240, 205, ${(0.22 * beam).toFixed(3)})`);
      pool.addColorStop(0.35, `rgba(255, 225, 180, ${(0.12 * beam).toFixed(3)})`);
      pool.addColorStop(0.75, `rgba(255, 210, 150, ${(0.04 * beam).toFixed(3)})`);
      pool.addColorStop(1, 'rgba(255, 210, 150, 0)');
      c.fillStyle = pool;
      c.beginPath();
      c.arc(tx, ty, rEnd * 1.25, 0, Math.PI * 2);
      c.fill();

      /* 3. Concentrated hot core at the center of the beam (on the crosshair) */
      const coreHot = c.createRadialGradient(tx, ty, 0, tx, ty, rEnd * 0.45);
      coreHot.addColorStop(0, `rgba(255, 255, 240, ${(0.18 * beam).toFixed(3)})`);
      coreHot.addColorStop(0.5, `rgba(255, 235, 190, ${(0.08 * beam).toFixed(3)})`);
      coreHot.addColorStop(1, 'rgba(255, 235, 190, 0)');
      c.fillStyle = coreHot;
      c.beginPath();
      c.arc(tx, ty, rEnd * 0.45, 0, Math.PI * 2);
      c.fill();

      /* 4. Dust motes drifting inside the volumetric beam between lens and crosshair */
      for (const m of this.motes) {
        m.z -= 0.0018 * (0.6 + m.s);
        if (m.z <= 0.04) {
          m.z = 1;
          m.x = Math.random();
          m.y = Math.random();
        }
        const d = (1 - m.z) * beamLen;
        const curR = rStart + (rEnd - rStart) * (1 - m.z);
        const offset = (m.x - 0.5) * 2 * curR * 0.85;
        const px = lx + fwdX * d + normX * offset;
        const py = ly + fwdY * d + normY * offset;
        const tw = 0.55 + 0.45 * Math.sin(this.time * 3 + m.x * 21);
        const a = Math.max(0, 0.36 * beam * m.z * tw);
        c.fillStyle = `rgba(255, 238, 200, ${(a * 0.6).toFixed(3)})`;
        const r = m.s * (0.6 + m.z);
        c.fillRect(px, py, r, r);
      }
      c.restore();
    }

    /* 5. The torch body and tactical gloved hand */
    c.save();
    c.translate(ax, ay);
    c.rotate(rot);
    if (!this.flashOn) {
      c.globalAlpha = 0.76;
    }
    c.drawImage(
      this.torchSprite,
      -TORCH_LANDMARKS.gripX * scale,
      -TORCH_LANDMARKS.gripY * scale,
      TORCH_W * scale,
      TORCH_H * scale
    );
    c.restore();

    /* 6. Multi-layered dynamic lens bloom, reflector glare, and optical flare */
    if (beam > 0.03) {
      c.save();
      c.globalCompositeOperation = 'lighter';

      // Soft atmospheric halo around the flashlight head
      const halo = c.createRadialGradient(lx, ly, 6 * scale, lx, ly, vh * 0.12);
      halo.addColorStop(0, `rgba(255, 235, 195, ${(0.32 * beam).toFixed(3)})`);
      halo.addColorStop(0.4, `rgba(255, 210, 150, ${(0.12 * beam).toFixed(3)})`);
      halo.addColorStop(1, 'rgba(255, 200, 140, 0)');
      c.fillStyle = halo;
      c.beginPath();
      c.arc(lx, ly, vh * 0.12, 0, Math.PI * 2);
      c.fill();

      // Reflector dish inner glow matching the bezel opening
      const reflGlow = c.createRadialGradient(lx, ly, 2 * scale, lx, ly, 32 * scale);
      reflGlow.addColorStop(0, `rgba(255, 255, 255, ${(0.85 * beam).toFixed(3)})`);
      reflGlow.addColorStop(0.35, `rgba(255, 245, 220, ${(0.65 * beam).toFixed(3)})`);
      reflGlow.addColorStop(0.75, `rgba(255, 215, 140, ${(0.35 * beam).toFixed(3)})`);
      reflGlow.addColorStop(1, 'rgba(255, 200, 120, 0)');
      c.fillStyle = reflGlow;
      c.beginPath();
      c.arc(lx, ly, 32 * scale, 0, Math.PI * 2);
      c.fill();

      // Ultra-bright Cree LED emitter hot core
      const core = c.createRadialGradient(lx, ly, 0, lx, ly, 10 * scale);
      core.addColorStop(0, `rgba(255, 255, 255, ${(0.98 * beam).toFixed(3)})`);
      core.addColorStop(0.5, `rgba(255, 250, 230, ${(0.75 * beam).toFixed(3)})`);
      core.addColorStop(1, 'rgba(255, 240, 200, 0)');
      c.fillStyle = core;
      c.beginPath();
      c.arc(lx, ly, 10 * scale, 0, Math.PI * 2);
      c.fill();

      // Subtle anamorphic lens glare streak aligned with the lens face
      const flareAngle = aim + Math.PI * 0.5;
      const streak = c.createLinearGradient(
        lx - Math.cos(flareAngle) * 65 * scale,
        ly - Math.sin(flareAngle) * 65 * scale,
        lx + Math.cos(flareAngle) * 65 * scale,
        ly + Math.sin(flareAngle) * 65 * scale
      );
      streak.addColorStop(0, 'rgba(255, 230, 180, 0)');
      streak.addColorStop(0.5, `rgba(255, 245, 225, ${(0.30 * beam).toFixed(3)})`);
      streak.addColorStop(1, 'rgba(255, 230, 180, 0)');
      c.fillStyle = streak;
      c.beginPath();
      c.ellipse(lx, ly, 65 * scale, 3 * scale, flareAngle, 0, Math.PI * 2);
      c.fill();

    }
  }

  private renderSprites(bobPx: number) {
    const { ctx, cols, rows } = this;
    const invDet = 1 / (this.planeX * this.dirY - this.dirX * this.planeY);
    const list = this.sprites
      .filter((s) => !s.taken && s.img)
      .filter((s) => !s.id.startsWith('flame') || this.candles[Number(s.id.slice(5))].lit)
      .map((s) => ({ s, dx: s.x - this.px, dy: s.y - this.py }))
      .filter((e) => Math.hypot(e.dx, e.dy) < 17)
      .map((e) => ({ ...e, depth: invDet * (-this.planeY * e.dx + this.planeX * e.dy), tx: invDet * (this.dirY * e.dx - this.dirX * e.dy) }))
      .filter((e) => e.depth > 0.15)
      .sort((a, b) => b.depth - a.depth);

    for (const e of list) {
      const s = e.s;
      const screenX = (cols / 2) * (1 + e.tx / e.depth);
      const unit = rows / e.depth;
      let scale = s.scale;
      const gDist = Math.hypot(this.gx - this.px, this.gy - this.py);
      if (s.id === 'ghost') {
        if (this.gMode === 'chase') scale = 1.35;
        else if (gDist < 3.4) scale = 1.25;
      }
      const sprH = unit * scale;
      const sprW = sprH * s.wide;
      const floorY = rows / 2 + unit / 2 + bobPx + this.pitchPx;
      const bottom = floorY - unit * s.float;
      const top = bottom - sprH;
      const left = screenX - sprW / 2;

      let alpha: number;
      if (s.id === 'ghost') {
        const flick = 0.72 + 0.28 * Math.sin(this.time * 13 + Math.sin(this.time * 5) * 3);
        alpha = Math.max(0.14, this.lightAt(s.x, s.y, 1.5)) * flick;
        if (this.gMode === 'chase' || this.gMode === 'lunge') alpha = Math.max(alpha, 0.85);
      } else if (s.id.startsWith('flame')) {
        alpha = 0.72 + 0.28 * Math.sin(this.time * 11 + e.depth * 3);
      } else {
        alpha = Math.min(1, this.lightAt(s.x, s.y, 1.35) * 1.25);
      }
      if (alpha < 0.03) continue;

      const img = s.img!;
      if (s.id === 'ghost') {
        /* a real apparition: cold halo, photographic body, ground mist —
           faint in the dark, solid when your beam finds her */
        const flick = 0.82 + 0.18 * Math.sin(this.time * 8 + Math.sin(this.time * 3.1) * 2);
        const cxg = left + sprW / 2;
        const cyg = top + sprH * 0.42;

        ctx.globalCompositeOperation = 'lighter';
        const halo = ctx.createRadialGradient(cxg, cyg, sprW * 0.04, cxg, cyg, sprW * 0.82);
        halo.addColorStop(0, `rgba(150,180,225,${(alpha * 0.1 * flick).toFixed(3)})`);
        halo.addColorStop(1, 'rgba(150,180,225,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(cxg - sprW, cyg - sprH * 0.6, sprW * 2, sprH * 1.2);

        ctx.globalCompositeOperation = 'source-over';
        const jit = Math.sin(this.time * 1.9) * 0.35;
        this.blitCols(img, left + jit, top, sprW, sprH, e.depth, Math.min(0.96, alpha * 1.05) * flick);
        this.blitCols(img, left + jit + 0.7, top, sprW, sprH, e.depth, alpha * 0.1);

        ctx.globalCompositeOperation = 'lighter';
        const fy = bottom + 2;
        const mist = ctx.createRadialGradient(screenX, fy, 1, screenX, fy, sprW * 0.62);
        mist.addColorStop(0, `rgba(190,208,240,${(alpha * 0.18).toFixed(3)})`);
        mist.addColorStop(1, 'rgba(190,208,240,0)');
        ctx.save();
        ctx.translate(screenX, fy);
        ctx.scale(1, 0.3);
        ctx.translate(-screenX, -fy);
        ctx.fillStyle = mist;
        ctx.fillRect(screenX - sprW * 0.7, fy - sprW * 0.7, sprW * 1.4, sprW * 1.4);
        ctx.restore();

        if (Math.sin(this.time * 5.1) > 0.9) {
          const f0 = 0.25 + 0.45 * ((this.time * 1.9) % 1);
          ctx.globalCompositeOperation = 'source-over';
          this.blitBand(img, left + jit + 2, top, sprW, sprH, e.depth, alpha * 0.45, f0, f0 + 0.06);
        }
      } else {
        ctx.globalCompositeOperation = s.additive ? 'lighter' : 'source-over';
        this.blitCols(img, left, top, sprW, sprH, e.depth, alpha);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private blitCols(img: HTMLCanvasElement, left: number, top: number, sprW: number, sprH: number, depth: number, alpha: number) {
    const ctx = this.ctx;
    const cols = this.cols;
    const x0 = Math.max(0, Math.floor(left));
    const x1 = Math.min(cols - 1, Math.ceil(left + sprW));
    ctx.globalAlpha = alpha;
    for (let x = x0; x <= x1; x++) {
      if (this.zbuf[x] <= depth) continue;
      const u = ((x - left) / sprW) * img.width;
      ctx.drawImage(img, u, 0, Math.max(1, img.width / sprW), img.height, x, top, 1, sprH);
    }
  }

  private blitBand(img: HTMLCanvasElement, left: number, top: number, sprW: number, sprH: number, depth: number, alpha: number, f0: number, f1: number) {
    const ctx = this.ctx;
    const cols = this.cols;
    const x0 = Math.max(0, Math.floor(left));
    const x1 = Math.min(cols - 1, Math.ceil(left + sprW));
    ctx.globalAlpha = alpha;
    const sy = img.height * f0;
    const sh = Math.max(1, img.height * (f1 - f0));
    for (let x = x0; x <= x1; x++) {
      if (this.zbuf[x] <= depth) continue;
      const u = ((x - left) / sprW) * img.width;
      ctx.drawImage(img, u, sy, Math.max(1, img.width / sprW), sh, x, top + sprH * f0, 1, sprH * (f1 - f0));
    }
  }

  private renderMinimap() {
    const m = this.mini;
    const S = 144;
    const cs = S / MW;
    m.setTransform(2, 0, 0, 2, 0, 0);
    m.clearRect(0, 0, S, S);
    m.fillStyle = 'rgba(4,4,6,0.94)';
    m.fillRect(0, 0, S, S);

    for (let y = 0; y < MH; y++)
      for (let x = 0; x < MW; x++) {
        const v = this.grid[y * MW + x];
        if (v === 0) continue;
        if (v === W_DOOR) m.fillStyle = this.openDoors.has(this.key(x, y)) ? '#2a2118' : '#6b4a2a';
        else if (v === W_HATCH) m.fillStyle = this.openDoors.has(this.key(x, y)) ? '#2a2118' : '#8a2020';
        else if (v === W_EXIT) {
          const p = this.chased ? 0.55 + 0.45 * Math.sin(this.time * 9) : 1;
          m.fillStyle = `rgba(193,18,31,${p.toFixed(2)})`;
        } else m.fillStyle = '#332b22';
        m.fillRect(x * cs, y * cs, cs, cs);
      }

    /* candles: lit = ember, unlit = faint dot (so you can find them) */
    for (const c of this.candles) {
      if (c.lit) {
        m.fillStyle = '#ff9e4a';
        m.fillRect(c.x * cs - 1.8, c.y * cs - 1.8, 3.6, 3.6);
      } else {
        m.fillStyle = 'rgba(232,224,207,0.35)';
        m.fillRect(c.x * cs - 1, c.y * cs - 1, 2, 2);
      }
    }

    /* pickups still on the floor */
    for (const s of this.sprites)
      if (!s.taken && s.id !== 'ghost' && !s.id.startsWith('flame')) {
        m.fillStyle = 'rgba(232,224,207,0.85)';
        m.fillRect(s.x * cs - 1.2, s.y * cs - 1.2, 2.4, 2.4);
      }

    /* ghost blip pulses with distance */
    const gd = Math.hypot(this.gx - this.px, this.gy - this.py);
    const ga = Math.max(0, 1 - gd / 12) * (0.6 + 0.4 * Math.sin(this.time * 6));
    if (ga > 0.05) {
      m.fillStyle = `rgba(193,18,31,${ga.toFixed(2)})`;
      m.beginPath();
      m.arc(this.gx * cs, this.gy * cs, 3.2, 0, Math.PI * 2);
      m.fill();
    }

    /* player field-of-view wedge */
    const ang = Math.atan2(this.dirY, this.dirX);
    m.fillStyle = 'rgba(232,224,207,0.10)';
    m.beginPath();
    m.moveTo(this.px * cs, this.py * cs);
    m.arc(this.px * cs, this.py * cs, 16, ang - 0.55, ang + 0.55);
    m.closePath();
    m.fill();

    /* player + facing tick */
    m.fillStyle = '#e8e0cf';
    m.beginPath();
    m.arc(this.px * cs, this.py * cs, 2.4, 0, Math.PI * 2);
    m.fill();
    m.strokeStyle = '#e8e0cf';
    m.lineWidth = 1.4;
    m.beginPath();
    m.moveTo(this.px * cs, this.py * cs);
    m.lineTo((this.px + this.dirX * 2) * cs, (this.py + this.dirY * 2) * cs);
    m.stroke();
  }
}
