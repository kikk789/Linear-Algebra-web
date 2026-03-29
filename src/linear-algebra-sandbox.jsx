import { useState, useRef, useEffect, useCallback } from "react";

// ─── Math utilities ───
const mat2 = {
  identity: () => [1, 0, 0, 1],
  mul: (a, b) => [
    a[0]*b[0]+a[1]*b[2], a[0]*b[1]+a[1]*b[3],
    a[2]*b[0]+a[3]*b[2], a[2]*b[1]+a[3]*b[3]
  ],
  apply: (m, v) => [m[0]*v[0]+m[1]*v[1], m[2]*v[0]+m[3]*v[1]],
  det: (m) => m[0]*m[3]-m[1]*m[2],
  inv: (m) => {
    const d = mat2.det(m);
    if (Math.abs(d) < 1e-10) return null;
    return [m[3]/d, -m[1]/d, -m[2]/d, m[0]/d];
  },
  lerp: (a, b, t) => a.map((v, i) => v + (b[i] - v) * t),
  eigen: (m) => {
    const a2 = 1, b2 = -(m[0]+m[3]), c2 = mat2.det(m);
    const disc = b2*b2 - 4*a2*c2;
    if (disc < -1e-10) return [];
    const sqrtD = Math.sqrt(Math.max(0, disc));
    const l1 = (-b2 + sqrtD) / 2, l2 = (-b2 - sqrtD) / 2;
    const results = [];
    const getVec = (l) => {
      const ax = m[0]-l, bx = m[1], cx = m[2], dx = m[3]-l;
      if (Math.abs(bx) > 1e-10) return [-bx, ax];
      if (Math.abs(dx) > 1e-10) return [-dx, cx];
      if (Math.abs(ax) > 1e-10) return [1, 0];
      return [0, 1];
    };
    const v1 = getVec(l1);
    const len1 = Math.sqrt(v1[0]**2+v1[1]**2);
    results.push({ value: l1, vector: [v1[0]/len1, v1[1]/len1] });
    if (Math.abs(l1 - l2) > 1e-8) {
      const v2 = getVec(l2);
      const len2 = Math.sqrt(v2[0]**2+v2[1]**2);
      results.push({ value: l2, vector: [v2[0]/len2, v2[1]/len2] });
    }
    return results;
  }
};

const COLORS = {
  bg: "#1a1a2e",
  grid: "rgba(74,85,120,0.25)",
  gridMajor: "rgba(100,120,180,0.4)",
  axis: "rgba(150,170,220,0.6)",
  iHat: "#3dd8e0",
  jHat: "#e8d44d",
  vecPink: "#e84393",
  vecGreen: "#55efc4",
  vecOrange: "#fdcb6e",
  detArea: "rgba(225,112,85,0.25)",
  eigenGlow: "#f9ca24",
  nullSpace: "#ff6b6b",
  altBasis1: "#a29bfe",
  altBasis2: "#fd79a8",
  text: "#e0e0e0",
  panel: "rgba(20,20,45,0.92)",
  panelBorder: "rgba(100,120,180,0.3)",
  accent: "#3dd8e0",
  timeline: "rgba(30,30,60,0.95)",
  scrubber: "#e84393",
  matVecResult: "#74b9ff",
};

const PRESETS = {
  "회전 90° ↺": [0, -1, 1, 0],
  "회전 90° ↻": [0, 1, -1, 0],
  "회전 45° ↺": [0.707, -0.707, 0.707, 0.707],
  "회전 45° ↻": [0.707, 0.707, -0.707, 0.707],
  "전단 (Shear)": [1, 1, 0, 1],
  "스케일 2x": [2, 0, 0, 2],
  "반사 (x축)": [1, 0, 0, -1],
  "반사 (y축)": [-1, 0, 0, 1],
  "축소 (Squeeze)": [2, 0, 0, 0.5],
  "차원 축소": [1, 2, 0.5, 1],
  "영행렬식": [1, 2, 2, 4],
  "투영 (x축)": [1, 0, 0, 0],
};

const VEC_COLORS = ["#e84393", "#55efc4", "#fdcb6e", "#a29bfe", "#fd79a8", "#74b9ff", "#ff7675", "#00cec9"];

// ★ Matrix display format: [a,b ; c,d]
const fmtMat = (m, d = 1) => `[${m[0].toFixed(d)},${m[1].toFixed(d)} ; ${m[2].toFixed(d)},${m[3].toFixed(d)}]`;
const fmtMatStr = (arr, d = 1) => `[${Number(arr[0]).toFixed(d)},${Number(arr[1]).toFixed(d)} ; ${Number(arr[2]).toFixed(d)},${Number(arr[3]).toFixed(d)}]`;

export default function LinearAlgebraSandbox() {
  const canvasRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 60 });
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  const [vectors, setVectors] = useState([
    { id: 1, x: 1, y: 0, color: COLORS.iHat, label: "î", basis: true },
    { id: 2, x: 0, y: 1, color: COLORS.jHat, label: "ĵ", basis: true },
  ]);
  const vectorsRef = useRef(vectors);
  vectorsRef.current = vectors;
  const nextVecId = useRef(10);

  const [vecInputX, setVecInputX] = useState("1");
  const [vecInputY, setVecInputY] = useState("1");

  const [transformHistory, setTransformHistory] = useState([]);
  const transformHistoryRef = useRef(transformHistory);
  transformHistoryRef.current = transformHistory;
  // ★ Parallel metadata: tracks where each transform came from
  const [transformMeta, setTransformMeta] = useState([]);
  const transformMetaRef = useRef(transformMeta);
  transformMetaRef.current = transformMeta;
  const [currentMatrix, setCurrentMatrix] = useState(mat2.identity());
  const currentMatrixRef = useRef(currentMatrix);
  currentMatrixRef.current = currentMatrix;

  const [, setAnimProgress] = useState(1);
  const [isAnimating, setIsAnimating] = useState(false);
  const animRef = useRef({ active: false, from: null, to: null, start: 0, duration: 800, progress: 0 });
  const [timelinePos, setTimelinePos] = useState(0);

  // ★ Animation settings
  const [animSpeed, setAnimSpeed] = useState(800); // ms per step
  const animSpeedRef = useRef(800);
  animSpeedRef.current = animSpeed;
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const autoPlayRef = useRef({ active: false, currentStep: 0 });

  const [activeTool, setActiveTool] = useState("select");
  const [showDeterminant, setShowDeterminant] = useState(true);
  const [showRefGrid, setShowRefGrid] = useState(true);
  const [showEigen, setShowEigen] = useState(false);
  const [showAltBasis, setShowAltBasis] = useState(false);
  const [altBasis, setAltBasis] = useState([[1, 1], [-1, 1]]);
  const [showDotProjection, setShowDotProjection] = useState(false);
  const [dotVecIdx, setDotVecIdx] = useState(null);

  const [matInput, setMatInput] = useState(["1","0","0","1"]);
  const [showMatrixEditor, setShowMatrixEditor] = useState(false);

  // ★ Mat×Vec
  const [matVecHighlight, setMatVecHighlight] = useState(null);

  // ★ Mat×Mat
  const [compMatA, setCompMatA] = useState(["1","0","0","1"]);
  const [compMatB, setCompMatB] = useState(["1","0","0","1"]);
  const [compResult, setCompResult] = useState(null);
  const [appliedComp, setAppliedComp] = useState(null); // ★ only set when "캔버스에 적용" is clicked

  const dragRef = useRef({ type: null });
  const [, setHoveredVec] = useState(null);
  const [tooltip, setTooltip] = useState(null);

  const [show3D, setShow3D] = useState(false);
  const [crossResult, setCrossResult] = useState(null);
  const [selectedForCross, setSelectedForCross] = useState([]);

  const [toolboxOpen, setToolboxOpen] = useState(true);

  // ★ Toast notifications
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = useCallback((msg, duration = 3500) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), duration);
  }, []);

  // ★ 3D rotation for cross product view
  const [rot3D, setRot3D] = useState({ ax: -25, ay: 35 });
  const drag3DRef = useRef(null);

  const worldToScreen = useCallback((wx, wy) => {
    const c = cameraRef.current;
    return [canvasSize.w/2 + (wx - c.x)*c.zoom, canvasSize.h/2 - (wy - c.y)*c.zoom];
  }, [canvasSize]);

  const screenToWorld = useCallback((sx, sy) => {
    const c = cameraRef.current;
    return [(sx - canvasSize.w/2)/c.zoom + c.x, -(sy - canvasSize.h/2)/c.zoom + c.y];
  }, [canvasSize]);

  const getEffectiveMatrix = useCallback((progress) => {
    const hist = transformHistoryRef.current;
    if (hist.length === 0) return mat2.identity();
    const fullSteps = Math.floor(progress);
    const frac = progress - fullSteps;
    let m = mat2.identity();
    for (let i = 0; i < Math.min(fullSteps, hist.length); i++) m = mat2.mul(hist[i], m);
    if (fullSteps < hist.length && frac > 0) {
      const partial = mat2.lerp(mat2.identity(), hist[fullSteps], frac);
      m = mat2.mul(partial, m);
    }
    return m;
  }, []);

  // ─── Canvas Rendering ───
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const cam = cameraRef.current;
    const hist = transformHistoryRef.current;
    // ★ During ANY animation (forward or reverse), the animation loop updates
    // currentMatrixRef via lerp, so we always just use it directly.
    const effMatrix = currentMatrixRef.current;

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    // ★ Adaptive grid step based on zoom level
    const pixelsPerUnit = cam.zoom;
    let gridStep;
    if (pixelsPerUnit > 150) gridStep = 0.5;
    else if (pixelsPerUnit > 60) gridStep = 1;
    else if (pixelsPerUnit > 25) gridStep = 2;
    else if (pixelsPerUnit > 12) gridStep = 5;
    else if (pixelsPerUnit > 5) gridStep = 10;
    else if (pixelsPerUnit > 2) gridStep = 25;
    else if (pixelsPerUnit > 0.8) gridStep = 50;
    else gridStep = 100;

    const majorEvery = gridStep >= 5 ? 1 : 5; // major line every N steps
    const viewW = W / cam.zoom, viewH = H / cam.zoom;
    const minX = Math.floor((cam.x - viewW/2) / gridStep) * gridStep - gridStep;
    const maxX = Math.ceil((cam.x + viewW/2) / gridStep) * gridStep + gridStep;
    const minY = Math.floor((cam.y - viewH/2) / gridStep) * gridStep - gridStep;
    const maxY = Math.ceil((cam.y + viewH/2) / gridStep) * gridStep + gridStep;

    // ★ Fixed reference grid (untransformed)
    if (showRefGrid) {
      ctx.lineWidth = 1;
      for (let val = minX; val <= maxX; val += gridStep) {
        const stepIdx = Math.round(val / gridStep);
        const isMajor = val === 0 || (stepIdx % majorEvery === 0 && gridStep < 5) || gridStep >= 5;
        ctx.strokeStyle = val === 0 ? "rgba(150,170,220,0.35)" : (isMajor ? "rgba(74,85,120,0.18)" : "rgba(74,85,120,0.08)");
        ctx.beginPath();
        const [rx1, ry1] = worldToScreen(val, minY);
        const [rx2, ry2] = worldToScreen(val, maxY);
        ctx.moveTo(rx1, ry1); ctx.lineTo(rx2, ry2); ctx.stroke();
      }
      for (let val = minY; val <= maxY; val += gridStep) {
        const stepIdx = Math.round(val / gridStep);
        const isMajor = val === 0 || (stepIdx % majorEvery === 0 && gridStep < 5) || gridStep >= 5;
        ctx.strokeStyle = val === 0 ? "rgba(150,170,220,0.35)" : (isMajor ? "rgba(74,85,120,0.18)" : "rgba(74,85,120,0.08)");
        ctx.beginPath();
        const [rx1, ry1] = worldToScreen(minX, val);
        const [rx2, ry2] = worldToScreen(maxX, val);
        ctx.moveTo(rx1, ry1); ctx.lineTo(rx2, ry2); ctx.stroke();
      }

      // ★ Number labels on axes
      ctx.font = "10px 'JetBrains Mono', monospace";
      ctx.fillStyle = "rgba(150,170,220,0.45)";
      const labelStep = gridStep * (gridStep < 5 ? majorEvery : 1);
      for (let val = Math.ceil(minX / labelStep) * labelStep; val <= maxX; val += labelStep) {
        if (Math.abs(val) < 0.001) continue;
        const [sx, sy] = worldToScreen(val, 0);
        ctx.textAlign = "center";
        ctx.fillText(Number.isInteger(val) ? val.toString() : val.toFixed(1), sx, sy + 14);
      }
      for (let val = Math.ceil(minY / labelStep) * labelStep; val <= maxY; val += labelStep) {
        if (Math.abs(val) < 0.001) continue;
        const [sx, sy] = worldToScreen(0, val);
        ctx.textAlign = "right";
        ctx.fillText(Number.isInteger(val) ? val.toString() : val.toFixed(1), sx - 6, sy + 4);
      }

      // Origin label
      const [ox0, oy0] = worldToScreen(0, 0);
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(150,170,220,0.3)";
      ctx.fillText("0", ox0 - 6, oy0 + 14);
    }

    // Transformed grid — uses same adaptive range
    const tgRange = Math.max(Math.abs(minX), Math.abs(maxX), Math.abs(minY), Math.abs(maxY)) + gridStep * 2;
    const tg = (gx, gy) => { const [tx, ty] = mat2.apply(effMatrix, [gx, gy]); return worldToScreen(tx, ty); };

    ctx.lineWidth = 1;
    const tgSteps = Math.min(200, Math.ceil(tgRange));
    for (let i = -tgSteps; i <= tgSteps; i++) {
      ctx.strokeStyle = i === 0 ? COLORS.axis : (i % 5 === 0 ? COLORS.gridMajor : COLORS.grid);
      ctx.beginPath();
      let [x1, y1] = tg(i, -tgSteps), [x2, y2] = tg(i, tgSteps);
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = i === 0 ? COLORS.axis : (i % 5 === 0 ? COLORS.gridMajor : COLORS.grid);
      ctx.beginPath();
      [x1, y1] = tg(-tgSteps, i); [x2, y2] = tg(tgSteps, i);
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }

    // Det area
    if (showDeterminant) {
      const corners = [[0,0],[1,0],[1,1],[0,1]].map(([x,y]) => { const [tx, ty] = mat2.apply(effMatrix, [x, y]); return worldToScreen(tx, ty); });
      ctx.fillStyle = COLORS.detArea;
      ctx.beginPath(); ctx.moveTo(corners[0][0], corners[0][1]);
      corners.slice(1).forEach(([x,y]) => ctx.lineTo(x, y)); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(225,112,85,0.6)"; ctx.lineWidth = 1.5; ctx.stroke();
      const det = mat2.det(effMatrix);
      const cx2 = corners.reduce((s, c) => s + c[0], 0) / 4;
      const cy2 = corners.reduce((s, c) => s + c[1], 0) / 4;
      ctx.font = "bold 14px 'JetBrains Mono', monospace";
      ctx.fillStyle = Math.abs(det) < 0.01 ? COLORS.nullSpace : (det < 0 ? "#ff6b6b" : "#e0e0e0");
      ctx.textAlign = "center";
      ctx.fillText(`det = ${det.toFixed(2)}`, cx2, cy2);
    }

    // Alt basis
    if (showAltBasis) {
      const [b1, b2] = altBasis;
      ctx.globalAlpha = 0.3;
      for (let i = -tgSteps; i <= tgSteps; i++) {
        ctx.strokeStyle = COLORS.altBasis1; ctx.lineWidth = 1; ctx.beginPath();
        let s = worldToScreen(i*b1[0]+(-tgSteps)*b2[0], i*b1[1]+(-tgSteps)*b2[1]);
        let e = worldToScreen(i*b1[0]+tgSteps*b2[0], i*b1[1]+tgSteps*b2[1]);
        ctx.moveTo(s[0], s[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
        ctx.strokeStyle = COLORS.altBasis2; ctx.beginPath();
        s = worldToScreen((-tgSteps)*b1[0]+i*b2[0], (-tgSteps)*b1[1]+i*b2[1]);
        e = worldToScreen(tgSteps*b1[0]+i*b2[0], tgSteps*b1[1]+i*b2[1]);
        ctx.moveTo(s[0], s[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Null space
    const det = mat2.det(effMatrix);
    if (Math.abs(det) < 0.05) {
      let nullDir = Math.abs(effMatrix[0]) > 1e-10 || Math.abs(effMatrix[2]) > 1e-10
        ? [-effMatrix[1], effMatrix[0]] : [1, 0];
      const len = Math.sqrt(nullDir[0]**2 + nullDir[1]**2);
      if (len > 1e-10) {
        nullDir = [nullDir[0]/len, nullDir[1]/len];
        ctx.strokeStyle = COLORS.nullSpace; ctx.lineWidth = 2.5; ctx.setLineDash([8, 4]);
        const [sx, sy] = worldToScreen(nullDir[0]*-tgSteps, nullDir[1]*-tgSteps);
        const [ex, ey] = worldToScreen(nullDir[0]*tgSteps, nullDir[1]*tgSteps);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]);
        const [lx, ly] = worldToScreen(nullDir[0]*4, nullDir[1]*4);
        ctx.font = "12px 'JetBrains Mono', monospace"; ctx.fillStyle = COLORS.nullSpace;
        ctx.fillText("Null Space", lx + 10, ly - 10);
      }
    }

    // Dot product
    if (showDotProjection && dotVecIdx !== null) {
      const dv = vectorsRef.current.find(v => v.id === dotVecIdx);
      if (dv) {
        const len = Math.sqrt(dv.x**2 + dv.y**2);
        if (len > 0.01) {
          const dir = [dv.x/len, dv.y/len];
          ctx.strokeStyle = "rgba(253,203,110,0.5)"; ctx.lineWidth = 2;
          const [s1x, s1y] = worldToScreen(dir[0]*-tgSteps, dir[1]*-tgSteps);
          const [s2x, s2y] = worldToScreen(dir[0]*tgSteps, dir[1]*tgSteps);
          ctx.beginPath(); ctx.moveTo(s1x, s1y); ctx.lineTo(s2x, s2y); ctx.stroke();
          vectorsRef.current.filter(v => !v.basis && v.id !== dotVecIdx).forEach(v => {
            const proj = v.x*dir[0] + v.y*dir[1];
            const px = dir[0]*proj, py = dir[1]*proj;
            const [psx, psy] = worldToScreen(px, py);
            const [vsx, vsy] = worldToScreen(v.x, v.y);
            ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.setLineDash([4, 4]);
            ctx.beginPath(); ctx.moveTo(vsx, vsy); ctx.lineTo(psx, psy); ctx.stroke(); ctx.setLineDash([]);
            ctx.fillStyle = COLORS.vecOrange; ctx.beginPath(); ctx.arc(psx, psy, 5, 0, Math.PI*2); ctx.fill();
            ctx.font = "11px 'JetBrains Mono', monospace";
            ctx.fillText(`dot=${proj.toFixed(2)}`, psx + 8, psy - 8);
          });
        }
      }
    }

    // Eigenvectors
    if (showEigen) {
      mat2.eigen(effMatrix).forEach(({ value, vector }) => {
        ctx.strokeStyle = COLORS.eigenGlow; ctx.lineWidth = 3;
        ctx.shadowColor = COLORS.eigenGlow; ctx.shadowBlur = 12;
        const [sx, sy] = worldToScreen(vector[0]*-tgSteps, vector[1]*-tgSteps);
        const [ex, ey] = worldToScreen(vector[0]*tgSteps, vector[1]*tgSteps);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.shadowBlur = 0;
        const [lx, ly] = worldToScreen(vector[0]*3.5, vector[1]*3.5);
        ctx.font = "bold 12px 'JetBrains Mono', monospace"; ctx.fillStyle = COLORS.eigenGlow; ctx.textAlign = "left";
        ctx.fillText(`λ=${value.toFixed(2)}`, lx + 10, ly - 5);
      });
    }

    // Arrow helper
    const drawArrow = (ox, oy, ex2, ey2, color, label, lineW = 3, headLen = 12) => {
      const [sox, soy] = worldToScreen(ox, oy);
      const [sex, sey] = worldToScreen(ex2, ey2);
      const dx = sex - sox, dy = sey - soy;
      const angle = Math.atan2(dy, dx);
      if (Math.sqrt(dx*dx+dy*dy) < 2) return;
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lineW; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(sox, soy); ctx.lineTo(sex, sey); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sex, sey);
      ctx.lineTo(sex - headLen*Math.cos(angle-0.35), sey - headLen*Math.sin(angle-0.35));
      ctx.lineTo(sex - headLen*Math.cos(angle+0.35), sey - headLen*Math.sin(angle+0.35));
      ctx.closePath(); ctx.fill();
      if (label) {
        ctx.font = "bold 13px 'JetBrains Mono', monospace"; ctx.textAlign = "center";
        ctx.fillText(label, sex + 14*Math.cos(angle+Math.PI/2), sey + 14*Math.sin(angle+Math.PI/2));
      }
    };

    // Basis
    const iT = mat2.apply(effMatrix, [1, 0]), jT = mat2.apply(effMatrix, [0, 1]);
    drawArrow(0, 0, iT[0], iT[1], COLORS.iHat, "î", 3.5);
    drawArrow(0, 0, jT[0], jT[1], COLORS.jHat, "ĵ", 3.5);

    // User vectors
    vectorsRef.current.filter(v => !v.basis).forEach(v => {
      const [tx, ty] = mat2.apply(effMatrix, [v.x, v.y]);
      drawArrow(0, 0, tx, ty, v.color, v.label, 2.5, 10);
      const [sx, sy] = worldToScreen(tx, ty);
      ctx.font = "11px 'JetBrains Mono', monospace"; ctx.fillStyle = v.color; ctx.textAlign = "left";
      ctx.fillText(`(${v.x.toFixed(1)}, ${v.y.toFixed(1)})`, sx + 12, sy - 4);
      if (showAltBasis) {
        const [b1, b2] = altBasis;
        const bDet = b1[0]*b2[1] - b1[1]*b2[0];
        if (Math.abs(bDet) > 1e-10) {
          const c1 = (v.x*b2[1] - v.y*b2[0]) / bDet;
          const c2 = (v.y*b1[0] - v.x*b1[1]) / bDet;
          ctx.fillStyle = COLORS.altBasis1;
          ctx.fillText(`alt:(${c1.toFixed(1)}, ${c2.toFixed(1)})`, sx + 12, sy + 12);
        }
      }
      if (selectedForCross.includes(v.id)) {
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.arc(sx, sy, 10, 0, Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
      }
    });

    // ★ Mat×Vec highlight
    if (matVecHighlight) {
      const { before, after } = matVecHighlight;
      ctx.globalAlpha = 0.4; ctx.setLineDash([6, 4]);
      drawArrow(0, 0, before[0], before[1], COLORS.matVecResult, null, 2, 8);
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      drawArrow(0, 0, after[0], after[1], COLORS.matVecResult, "Mv", 3, 12);
      const [bsx, bsy] = worldToScreen(before[0], before[1]);
      const [asx, asy] = worldToScreen(after[0], after[1]);
      ctx.strokeStyle = "rgba(116,185,255,0.4)"; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bsx, bsy); ctx.lineTo(asx, asy); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = "bold 11px 'JetBrains Mono', monospace"; ctx.fillStyle = COLORS.matVecResult; ctx.textAlign = "left";
      ctx.fillText(`(${before[0].toFixed(1)},${before[1].toFixed(1)}) → (${after[0].toFixed(1)},${after[1].toFixed(1)})`, asx + 14, asy + 16);
    }

    // Origin
    const [oxx, oyy] = worldToScreen(0, 0);
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(oxx, oyy, 4, 0, Math.PI*2); ctx.fill();

    // 3D cross product — moved to DOM overlay (canvas version gets hidden by toolbox)

    // Tooltip
    if (tooltip) {
      ctx.font = "12px 'JetBrains Mono', monospace"; ctx.fillStyle = "rgba(20,20,45,0.9)";
      const tw = ctx.measureText(tooltip.text).width + 16;
      ctx.beginPath(); ctx.roundRect(tooltip.x - tw/2, tooltip.y - 30, tw, 24, 4); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.textAlign = "center";
      ctx.fillText(tooltip.text, tooltip.x, tooltip.y - 14);
    }
  }, [canvasSize, showDeterminant, showRefGrid, showEigen, showAltBasis, altBasis, showDotProjection, dotVecIdx, selectedForCross, tooltip, matVecHighlight, worldToScreen, getEffectiveMatrix]);

  // Animation loop
  useEffect(() => {
    let frame;
    const loop = () => {
      if (animRef.current.active) {
        const elapsed = Date.now() - animRef.current.start;
        if (elapsed < 0) { render(); frame = requestAnimationFrame(loop); return; }
        const t = Math.min(1, elapsed / animRef.current.duration);
        const eased = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2;
        animRef.current.progress = eased;
        setAnimProgress(eased);

        // ★ ALL animations use lerp: from → targetMatrix
        const lerpedMat = mat2.lerp(animRef.current.from, animRef.current.targetMatrix, eased);
        currentMatrixRef.current = lerpedMat;

        if (t >= 1) {
          animRef.current.active = false;
          const tm = animRef.current.targetMatrix;
          setCurrentMatrix(tm); currentMatrixRef.current = tm;

          // Auto-play: chain to next step
          if (autoPlayRef.current.active) {
            const nextStep = autoPlayRef.current.currentStep + 1;
            const hist = transformHistoryRef.current;
            if (nextStep < hist.length) {
              autoPlayRef.current.currentStep = nextStep;
              setTimelinePos(nextStep + 1);
              const nextTarget = mat2.mul(hist[nextStep], currentMatrixRef.current);
              animRef.current = { active: true, from: currentMatrixRef.current, targetMatrix: nextTarget, start: Date.now() + 200, duration: animSpeedRef.current, progress: 0 };
            } else {
              autoPlayRef.current.active = false;
              setIsAutoPlaying(false);
              setIsAnimating(false);
            }
          } else {
            setIsAnimating(false);
          }
        }
      }
      render();
      frame = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(frame);
  }, [render]);

  useEffect(() => {
    const resize = () => {
      const c = canvasRef.current?.parentElement;
      if (c) setCanvasSize({ w: c.clientWidth, h: c.clientHeight });
    };
    resize(); window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const applyTransform = useCallback((matrix, label = null) => {
    if (isAnimating) return;
    const newHist = [...transformHistoryRef.current, matrix];
    setTransformHistory(newHist); transformHistoryRef.current = newHist;
    // ★ Store metadata
    const meta = label || fmtMat(matrix);
    const newMeta = [...transformMetaRef.current, meta];
    setTransformMeta(newMeta); transformMetaRef.current = newMeta;

    setTimelinePos(newHist.length);
    const targetMatrix = mat2.mul(matrix, currentMatrixRef.current);
    animRef.current = { active: true, from: currentMatrixRef.current, targetMatrix, start: Date.now(), duration: animSpeedRef.current, progress: 0 };
    setIsAnimating(true);
  }, [isAnimating]);

  const resetAll = useCallback(() => {
    setTransformHistory([]); transformHistoryRef.current = [];
    setTransformMeta([]); transformMetaRef.current = [];
    setCurrentMatrix(mat2.identity()); currentMatrixRef.current = mat2.identity();
    setTimelinePos(0); setAnimProgress(1); setIsAnimating(false);
    animRef.current.active = false; autoPlayRef.current.active = false;
    setIsAutoPlaying(false); setCrossResult(null); setShow3D(false);
    setSelectedForCross([]); setMatVecHighlight(null); setAppliedComp(null);
  }, []);

  const rewindLast = useCallback(() => {
    if (isAnimating) return;
    const hist = transformHistoryRef.current;
    if (hist.length === 0) return;
    if (Math.abs(mat2.det(hist[hist.length-1])) < 1e-10) {
      showToast("⚠ 행렬식 = 0 → 역행렬이 존재하지 않습니다! 차원이 축소되어 정보가 손실되었습니다.");
      return;
    }
    // Calculate target matrix (without last transform)
    const newHist = hist.slice(0, -1);
    let targetMat = mat2.identity();
    newHist.forEach(h => { targetMat = mat2.mul(h, targetMat); });

    // Update history immediately (so timeline reflects correctly)
    setTransformHistory(newHist); transformHistoryRef.current = newHist;
    const newMeta = transformMetaRef.current.slice(0, -1);
    setTransformMeta(newMeta); transformMetaRef.current = newMeta;
    setTimelinePos(newHist.length);

    // Animate from current → target (reverse)
    animRef.current = { active: true, from: currentMatrixRef.current, targetMatrix: targetMat, start: Date.now(), duration: animSpeedRef.current, progress: 0 };
    setIsAnimating(true);
  }, [isAnimating]);

  const scrubTimeline = useCallback((pos) => {
    if (isAnimating) return;
    const clamped = Math.max(0, Math.min(transformHistoryRef.current.length, pos));
    setTimelinePos(clamped);
    const m = getEffectiveMatrix(clamped);
    setCurrentMatrix(m); currentMatrixRef.current = m;
  }, [isAnimating, getEffectiveMatrix]);

  // ★ Animated step forward (apply next transform with animation)
  const stepForward = useCallback(() => {
    if (isAnimating) return;
    const hist = transformHistoryRef.current;
    if (timelinePos >= hist.length) return;
    const nextPos = timelinePos + 1;
    const targetMatrix = getEffectiveMatrix(nextPos);
    setTimelinePos(nextPos);
    animRef.current = { active: true, from: currentMatrixRef.current, targetMatrix, start: Date.now(), duration: animSpeedRef.current, progress: 0 };
    setIsAnimating(true);
  }, [isAnimating, timelinePos, getEffectiveMatrix]);

  // ★ Animated step backward (reverse last transform with animation)
  const stepBackward = useCallback(() => {
    if (isAnimating) return;
    if (timelinePos <= 0) return;
    const targetPos = timelinePos - 1;
    const targetMatrix = getEffectiveMatrix(targetPos);
    setTimelinePos(targetPos);
    animRef.current = { active: true, from: currentMatrixRef.current, targetMatrix, start: Date.now(), duration: animSpeedRef.current, progress: 0 };
    setIsAnimating(true);
  }, [isAnimating, timelinePos, getEffectiveMatrix]);

  // ★ Auto-play: play all transform history from beginning
  const autoPlayAll = useCallback(() => {
    const hist = transformHistoryRef.current;
    if (hist.length === 0 || isAnimating) return;
    // Reset to identity first
    setCurrentMatrix(mat2.identity()); currentMatrixRef.current = mat2.identity();
    setTimelinePos(1);
    // Start chain
    autoPlayRef.current = { active: true, currentStep: 0 };
    setIsAutoPlaying(true);
    setIsAnimating(true);
    animRef.current = { active: true, from: mat2.identity(), targetMatrix: hist[0], start: Date.now(), duration: animSpeedRef.current, progress: 0 };
  }, [isAnimating]);

  const stopAutoPlay = useCallback(() => {
    autoPlayRef.current.active = false;
    setIsAutoPlaying(false);
    animRef.current.active = false;
    setIsAnimating(false);
  }, []);

  // Mouse
  const handleMouseDown = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const [wx, wy] = screenToWorld(mx, my);
    if (activeTool === "select" || activeTool === "cross") {
      const effM = currentMatrixRef.current;
      for (const v of vectorsRef.current) {
        let vx, vy;
        if (v.basis) { [vx, vy] = mat2.apply(effM, v.id === 1 ? [1, 0] : [0, 1]); }
        else { [vx, vy] = mat2.apply(effM, [v.x, v.y]); }
        if (Math.sqrt((wx-vx)**2 + (wy-vy)**2) < 0.4) {
          if (activeTool === "cross" && !v.basis) {
            setSelectedForCross(prev => {
              const ns = prev.includes(v.id) ? prev.filter(id => id !== v.id) : [...prev, v.id].slice(-2);
              if (ns.length === 2) {
                const va = vectorsRef.current.find(vv => vv.id === ns[0]);
                const vb = vectorsRef.current.find(vv => vv.id === ns[1]);
                if (va && vb) { setCrossResult({ v1: [va.x,va.y], v2: [vb.x,vb.y], cross: va.x*vb.y-va.y*vb.x, area: va.x*vb.y-va.y*vb.x }); setShow3D(true); }
              }
              return ns;
            });
            return;
          }
          if (!v.basis) dragRef.current = { type: "vector", id: v.id, startMouse: [mx, my], startVal: [v.x, v.y] };
          return;
        }
      }
    }
    dragRef.current = { type: "pan", startMouse: [mx, my], startVal: [cameraRef.current.x, cameraRef.current.y] };
  }, [activeTool, screenToWorld]);

  const handleMouseMove = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const [wx, wy] = screenToWorld(mx, my);
    const drag = dragRef.current;
    if (drag.type === "pan") {
      const dx = (mx - drag.startMouse[0]) / cameraRef.current.zoom;
      const dy = (my - drag.startMouse[1]) / cameraRef.current.zoom;
      setCamera(c => ({ ...c, x: drag.startVal[0] - dx, y: drag.startVal[1] + dy }));
    } else if (drag.type === "vector") {
      const inv = mat2.inv(currentMatrixRef.current);
      const snap = v => Math.round(v * 2) / 2;
      if (inv) { const [ox2, oy2] = mat2.apply(inv, [wx, wy]); setVectors(vs => vs.map(v => v.id === drag.id ? { ...v, x: snap(ox2), y: snap(oy2) } : v)); }
      else { setVectors(vs => vs.map(v => v.id === drag.id ? { ...v, x: snap(wx), y: snap(wy) } : v)); }
    } else {
      const effM = currentMatrixRef.current;
      let found = false;
      for (const v of vectorsRef.current) {
        let vx, vy;
        if (v.basis) { [vx, vy] = mat2.apply(effM, v.id === 1 ? [1, 0] : [0, 1]); }
        else { [vx, vy] = mat2.apply(effM, [v.x, v.y]); }
        if (Math.sqrt((wx-vx)**2 + (wy-vy)**2) < 0.5) {
          setHoveredVec(v.id);
          const [sx, sy] = worldToScreen(vx, vy);
          setTooltip({ text: `${v.label||'v'} = (${v.x.toFixed(1)}, ${v.y.toFixed(1)})`, x: sx, y: sy });
          found = true; break;
        }
      }
      if (!found) { setHoveredVec(null); setTooltip(null); }
    }
  }, [screenToWorld, worldToScreen]);

  const handleMouseUp = useCallback(() => { dragRef.current = { type: null }; }, []);
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    setCamera(c => ({ ...c, zoom: Math.max(10, Math.min(300, c.zoom * (e.deltaY > 0 ? 0.9 : 1.1))) }));
  }, []);

  // ★ Add vector with coords
  const addVector = useCallback((x, y) => {
    const id = nextVecId.current++;
    setVectors(vs => [...vs, { id, x, y, color: VEC_COLORS[(id-10) % VEC_COLORS.length], label: `v${id-9}`, basis: false }]);
  }, []);

  const addVectorFromInput = useCallback(() => {
    const x = parseFloat(vecInputX), y = parseFloat(vecInputY);
    if (!isNaN(x) && !isNaN(y)) addVector(x, y);
  }, [vecInputX, vecInputY, addVector]);

  const applyCustomMatrix = useCallback(() => {
    const m = matInput.map(Number);
    if (!m.some(isNaN)) applyTransform(m, `사용자정의 ${fmtMat(m)}`);
  }, [matInput, applyTransform]);

  // ★ Mat×Vec
  const calcMatVec = useCallback((vecId) => {
    const v = vectorsRef.current.find(vv => vv.id === vecId);
    if (!v) return;
    const [rx, ry] = mat2.apply(currentMatrixRef.current, [v.x, v.y]);
    setMatVecHighlight({ vecId, before: [v.x, v.y], after: [rx, ry] });
  }, []);

  // ★ Mat×Mat
  const calcMatMul = useCallback(() => {
    const a = compMatA.map(Number), b = compMatB.map(Number);
    if (!a.some(isNaN) && !b.some(isNaN)) setCompResult(mat2.mul(a, b));
  }, [compMatA, compMatB]);

  const computeCross = useCallback(() => {
    if (selectedForCross.length !== 2) return;
    const va = vectorsRef.current.find(v => v.id === selectedForCross[0]);
    const vb = vectorsRef.current.find(v => v.id === selectedForCross[1]);
    if (va && vb) { const area = va.x*vb.y - va.y*vb.x; setCrossResult({ v1: [va.x,va.y], v2: [vb.x,vb.y], cross: area, area }); setShow3D(true); }
  }, [selectedForCross]);

  // Styles
  const PS = { background: COLORS.panel, border: `1px solid ${COLORS.panelBorder}`, borderRadius: 10, backdropFilter: "blur(12px)", color: COLORS.text, fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: 12 };
  const btn = (a = false) => ({ padding: "6px 10px", border: `1px solid ${a ? COLORS.accent : COLORS.panelBorder}`, borderRadius: 6, background: a ? "rgba(61,216,224,0.15)" : "rgba(40,40,80,0.6)", color: a ? COLORS.accent : COLORS.text, cursor: "pointer", fontFamily: "inherit", fontSize: 11, transition: "all 0.2s", whiteSpace: "nowrap" });
  const sBtn = (c = COLORS.accent) => ({ ...btn(), padding: "4px 8px", fontSize: 10, borderColor: c, color: c });
  const inp = (c = COLORS.text) => ({ background: "rgba(40,40,80,0.8)", border: `1px solid ${COLORS.panelBorder}`, borderRadius: 4, color: c, padding: "4px 6px", fontSize: 12, textAlign: "center", fontFamily: "inherit", width: "100%", boxSizing: "border-box" });

  const userVecs = vectors.filter(v => !v.basis);

  return (
    <div style={{ width: "100vw", height: "100vh", background: COLORS.bg, overflow: "hidden", position: "relative", fontFamily: "'JetBrains Mono', monospace" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;600;700&display=swap" rel="stylesheet" />

      <div style={{ position: "absolute", inset: 0 }}>
        <canvas ref={canvasRef} width={canvasSize.w} height={canvasSize.h}
          style={{ width: "100%", height: "100%", cursor: "crosshair" }}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onWheel={handleWheel} />
      </div>

      {/* Title */}
      <div style={{ position: "absolute", top: 14, left: 16, color: COLORS.text, pointerEvents: "none" }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1, color: COLORS.accent }}>선형대수학 샌드박스</div>
        <div style={{ fontSize: 10, opacity: 0.5, marginTop: 2 }}>드래그: 이동 • 스크롤: 확대/축소 • 화살표 끝 드래그: 벡터 조작</div>
      </div>

      {/* Current Matrix */}
      <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", ...PS, padding: "8px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ opacity: 0.6, fontSize: 10 }}>현재 행렬</span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 8px", fontSize: 13, fontWeight: 600 }}>
          <span style={{ color: COLORS.iHat }}>{currentMatrix[0].toFixed(2)}</span>
          <span style={{ color: COLORS.jHat }}>{currentMatrix[1].toFixed(2)}</span>
          <span style={{ color: COLORS.iHat }}>{currentMatrix[2].toFixed(2)}</span>
          <span style={{ color: COLORS.jHat }}>{currentMatrix[3].toFixed(2)}</span>
        </div>
        <div style={{ borderLeft: `1px solid ${COLORS.panelBorder}`, paddingLeft: 10 }}>
          <span style={{ opacity: 0.6, fontSize: 10 }}>det = </span>
          <span style={{ color: mat2.det(currentMatrix) < 0 ? COLORS.nullSpace : COLORS.accent, fontWeight: 700 }}>{mat2.det(currentMatrix).toFixed(3)}</span>
        </div>
      </div>

      {/* ─── Toolbox ─── */}
      <div style={{ position: "absolute", top: 60, right: 12, width: toolboxOpen ? 252 : 36, ...PS, padding: toolboxOpen ? 12 : 6, transition: "width 0.3s", maxHeight: "calc(100vh - 140px)", overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: `${COLORS.panelBorder} transparent` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: toolboxOpen ? 8 : 0 }}>
          {toolboxOpen && <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.accent }}>🧰 도구상자</span>}
          <button onClick={() => setToolboxOpen(!toolboxOpen)} style={{ ...btn(), padding: "2px 6px", fontSize: 10 }}>{toolboxOpen ? "◁" : "▷"}</button>
        </div>

        {toolboxOpen && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

            {/* ★ 1. Vector with coord input */}
            <Sec title="① 벡터 추가">
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <span style={{ fontSize: 10, opacity: 0.6 }}>x:</span>
                <input value={vecInputX} onChange={e => setVecInputX(e.target.value)} style={{ ...inp(COLORS.iHat), width: 50 }} onKeyDown={e => e.key === "Enter" && addVectorFromInput()} />
                <span style={{ fontSize: 10, opacity: 0.6 }}>y:</span>
                <input value={vecInputY} onChange={e => setVecInputY(e.target.value)} style={{ ...inp(COLORS.jHat), width: 50 }} onKeyDown={e => e.key === "Enter" && addVectorFromInput()} />
                <button onClick={addVectorFromInput} style={{ ...btn(), padding: "4px 8px" }}>+</button>
              </div>
              <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 4 }}>
                {[["(1,0)",1,0],["(0,1)",0,1],["(1,1)",1,1],["(2,-1)",2,-1],["(-1,3)",-1,3]].map(([l,x,y]) => (
                  <button key={l} onClick={() => addVector(x, y)} style={{ ...sBtn("#888"), fontSize: 9, padding: "2px 5px" }}>{l}</button>
                ))}
              </div>
              <div style={{ fontSize: 9, opacity: 0.4, marginTop: 2 }}>좌표 입력 or 프리셋 • 화살표 끝 드래그</div>
              <Help>
{`📌 벡터란? 원점에서 시작하는 화살표 (크기 + 방향)

🔧 사용법
1. x, y에 숫자 입력 → + 클릭 (또는 Enter)
2. 프리셋 버튼으로 빠르게 추가
3. 캔버스에서 화살표 끝을 드래그하여 조작
4. ✕ 클릭으로 삭제

📝 예시
• (1, 0) → x축 방향 단위벡터
• (0, 1) → y축 방향 단위벡터
• (3, 2) → 오른쪽 3, 위로 2 이동
• (-1, 3) → 왼쪽 1, 위로 3 이동

💡 여러 벡터를 추가한 뒤 선형 변환을 적용하면
   각 벡터가 어떻게 이동하는지 비교할 수 있습니다.`}
              </Help>
              {userVecs.length > 0 && (
                <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {userVecs.map(v => (
                    <div key={v.id} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: `${v.color}22`, border: `1px solid ${v.color}44`, color: v.color, display: "flex", alignItems: "center", gap: 4 }}>
                      {v.label} ({v.x.toFixed(1)},{v.y.toFixed(1)})
                      <span onClick={() => setVectors(vs => vs.filter(vv => vv.id !== v.id))} style={{ cursor: "pointer", opacity: 0.6 }}>✕</span>
                    </div>
                  ))}
                </div>
              )}
            </Sec>

            {/* 2. Transform */}
            <Sec title="② 선형 변환">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                {Object.entries(PRESETS).map(([name, mat]) => (
                  <button key={name} onClick={() => applyTransform(mat, name)} style={{ ...sBtn(), textAlign: "center" }} disabled={isAnimating}>{name}</button>
                ))}
              </div>
              {/* Custom rotation input */}
              <div style={{ marginTop: 6, display: "flex", gap: 4, alignItems: "center" }}>
                <span style={{ fontSize: 9, opacity: 0.6, whiteSpace: "nowrap" }}>회전</span>
                <input id="rotAngleInput" defaultValue="30" style={{ ...inp(COLORS.accent), width: 48, textAlign: "center" }} />
                <span style={{ fontSize: 9, opacity: 0.5 }}>°</span>
                <button onClick={() => { const v = parseFloat(document.getElementById("rotAngleInput").value); if (isNaN(v)) return; const r = v * Math.PI / 180; applyTransform([Math.cos(r), -Math.sin(r), Math.sin(r), Math.cos(r)], `회전 ${v}° ↺`); }} disabled={isAnimating} style={{ ...sBtn(COLORS.accent), fontSize: 9, padding: "3px 6px" }}>↺</button>
                <button onClick={() => { const v = parseFloat(document.getElementById("rotAngleInput").value); if (isNaN(v)) return; const r = -v * Math.PI / 180; applyTransform([Math.cos(r), -Math.sin(r), Math.sin(r), Math.cos(r)], `회전 ${v}° ↻`); }} disabled={isAnimating} style={{ ...sBtn(COLORS.accent), fontSize: 9, padding: "3px 6px" }}>↻</button>
              </div>
              {/* Custom shear input */}
              <div style={{ marginTop: 4, display: "flex", gap: 4, alignItems: "center" }}>
                <span style={{ fontSize: 9, opacity: 0.6, whiteSpace: "nowrap" }}>전단</span>
                <input id="shearInput" defaultValue="1" style={{ ...inp(COLORS.vecOrange), width: 48, textAlign: "center" }} />
                <button onClick={() => { const v = parseFloat(document.getElementById("shearInput").value); if (isNaN(v)) return; applyTransform([1, v, 0, 1], `전단 x→ ${v}`); }} disabled={isAnimating} style={{ ...sBtn(COLORS.vecOrange), fontSize: 9, padding: "3px 6px" }}>x→</button>
                <button onClick={() => { const v = parseFloat(document.getElementById("shearInput").value); if (isNaN(v)) return; applyTransform([1, -v, 0, 1], `전단 x← ${v}`); }} disabled={isAnimating} style={{ ...sBtn(COLORS.vecOrange), fontSize: 9, padding: "3px 6px" }}>x←</button>
                <button onClick={() => { const v = parseFloat(document.getElementById("shearInput").value); if (isNaN(v)) return; applyTransform([1, 0, v, 1], `전단 y↑ ${v}`); }} disabled={isAnimating} style={{ ...sBtn(COLORS.vecOrange), fontSize: 9, padding: "3px 6px" }}>y↑</button>
                <button onClick={() => { const v = parseFloat(document.getElementById("shearInput").value); if (isNaN(v)) return; applyTransform([1, 0, -v, 1], `전단 y↓ ${v}`); }} disabled={isAnimating} style={{ ...sBtn(COLORS.vecOrange), fontSize: 9, padding: "3px 6px" }}>y↓</button>
              </div>
              <button onClick={() => setShowMatrixEditor(!showMatrixEditor)} style={{ ...btn(showMatrixEditor), marginTop: 6, width: "100%" }}>사용자 정의 행렬</button>
              <Help>
{`📌 선형 변환이란? 행렬을 공간에 적용하면 모든 격자가 변형됩니다.
   î(x축 기저)와 ĵ(y축 기저)가 행렬의 각 열 위치로 이동합니다.

🔧 프리셋 설명
• 회전 90° [0,-1 ; 1,0] → 공간을 반시계 90° 회전
• 회전 45° → 반시계 45° 회전
• 전단 [1,1 ; 0,1] → x축은 고정, y축이 기울어짐
• 스케일 2x [2,0 ; 0,2] → 모든 방향 2배 확대
• 반사 (x축) [1,0 ; 0,-1] → 위아래 뒤집기
• 반사 (y축) [-1,0 ; 0,1] → 좌우 뒤집기
• 축소 [2,0 ; 0,0.5] → x방향 2배, y방향 절반
• 영행렬식 [1,2 ; 2,4] → det=0, 차원이 축소됨
• 투영 (x축) [1,0 ; 0,0] → y성분 제거, x축에 투영

📝 사용자 정의 행렬
• 4개 숫자 = [a, b ; c, d]
• 첫 행(a,b) = î가 이동할 위치
• 둘째 행(c,d) = ĵ가 이동할 위치

💡 여러 변환을 연달아 적용하면 합성(Composition)이 됩니다.
   순서를 바꾸면 결과가 달라집니다! (행렬곱은 비교환)`}
              </Help>
              {showMatrixEditor && (
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                    {[0,1,2,3].map(i => (
                      <input key={i} value={matInput[i]} onChange={e => setMatInput(mi => { const n=[...mi]; n[i]=e.target.value; return n; })} style={inp(i%2===0?COLORS.iHat:COLORS.jHat)} />
                    ))}
                  </div>
                  <button onClick={applyCustomMatrix} style={btn()} disabled={isAnimating}>캔버스에 적용</button>
                </div>
              )}
            </Sec>

            {/* ★ 3. Mat×Vec */}
            <Sec title="③ 행렬 × 벡터">
              <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 4 }}>현재 행렬 M × 벡터 → 결과 (클릭시 캔버스 표시)</div>
              <Help>
{`📌 행렬 × 벡터란?
   행렬을 벡터에 곱하면 그 벡터가 이동하는 위치를 알 수 있습니다.
   [a,b ; c,d] × (x,y) = (ax+by, cx+dy)

🔧 사용법
1. 벡터를 먼저 추가하세요 (①번)
2. 목록에서 벡터를 클릭 → 캔버스에 변환 전(점선)과 후(실선) 표시
3. 하단 오버레이에도 계산 과정이 표시됩니다

📝 예시
• 행렬 [0,-1 ; 1,0] × 벡터 (2,1) = (-1, 2) → 90° 회전됨
• 행렬 [2,0 ; 0,2] × 벡터 (3,1) = (6, 2) → 2배 확대됨

💡 여러 벡터를 추가하고 같은 변환을 적용하면
   각 벡터가 어디로 이동하는지 비교 가능합니다.`}
              </Help>
              {userVecs.length === 0 ? (
                <div style={{ fontSize: 10, opacity: 0.4 }}>↑ 먼저 벡터를 추가하세요</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {userVecs.map(v => {
                    const [rx, ry] = mat2.apply(currentMatrix, [v.x, v.y]);
                    const hl = matVecHighlight?.vecId === v.id;
                    return (
                      <div key={v.id} onClick={() => calcMatVec(v.id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px", borderRadius: 5, cursor: "pointer", background: hl ? "rgba(116,185,255,0.15)" : "rgba(40,40,80,0.4)", border: `1px solid ${hl ? COLORS.matVecResult : "transparent"}`, transition: "all 0.2s" }}>
                        <span style={{ color: v.color, fontWeight: 600, fontSize: 11 }}>{v.label}</span>
                        <span style={{ fontSize: 10, color: v.color }}>({v.x.toFixed(1)},{v.y.toFixed(1)})</span>
                        <span style={{ fontSize: 10, opacity: 0.5 }}>→</span>
                        <span style={{ fontSize: 10, color: COLORS.matVecResult, fontWeight: 600 }}>({rx.toFixed(2)}, {ry.toFixed(2)})</span>
                      </div>
                    );
                  })}
                  {matVecHighlight && <button onClick={() => setMatVecHighlight(null)} style={{ ...sBtn(COLORS.nullSpace), fontSize: 9 }}>하이라이트 해제</button>}
                </div>
              )}
            </Sec>

            {/* ★ 4. Mat×Mat */}
            <Sec title="④ 행렬 × 행렬">
              <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 4 }}>A × B 결과 미리 계산</div>
              <Help>
{`📌 행렬 × 행렬이란?
   두 변환을 합성한 결과를 하나의 행렬로 만드는 것입니다.
   A × B = "B를 먼저 적용하고, 그 다음 A를 적용"

🔧 사용법
1. A와 B에 각각 2×2 행렬 값 입력
2. = 클릭 → 결과 행렬과 det 값이 표시됨
3. "이 결과를 캔버스에 적용" → 변환이 적용되고 하단 오버레이에 표시

📝 예시
• 회전90° × 스케일2x
  A=[0,-1;1,0] × B=[2,0;0,2] = [0,-2;2,0]
  → "2배 확대 후 90° 회전"과 같은 효과

💡 "현재 행렬 → A에 복사"로 누적 행렬을 A에 가져올 수 있습니다.
💡 A×B ≠ B×A — 순서가 바뀌면 결과도 달라집니다!`}
              </Help>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 9, opacity: 0.5, textAlign: "center", marginBottom: 2 }}>A</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                    {[0,1,2,3].map(i => <input key={`a${i}`} value={compMatA[i]} onChange={e => setCompMatA(m => { const n=[...m]; n[i]=e.target.value; return n; })} style={{ ...inp(COLORS.iHat), width: 36, padding: "3px 2px", fontSize: 10 }} />)}
                  </div>
                </div>
                <span style={{ fontSize: 14, opacity: 0.5 }}>×</span>
                <div>
                  <div style={{ fontSize: 9, opacity: 0.5, textAlign: "center", marginBottom: 2 }}>B</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                    {[0,1,2,3].map(i => <input key={`b${i}`} value={compMatB[i]} onChange={e => setCompMatB(m => { const n=[...m]; n[i]=e.target.value; return n; })} style={{ ...inp(COLORS.jHat), width: 36, padding: "3px 2px", fontSize: 10 }} />)}
                  </div>
                </div>
                <button onClick={calcMatMul} style={{ ...btn(), padding: "4px 6px", fontSize: 10 }}>=</button>
              </div>
              {compResult && (
                <div style={{ marginTop: 6, padding: "6px 8px", borderRadius: 6, background: "rgba(61,216,224,0.1)", border: `1px solid ${COLORS.accent}33` }}>
                  <div style={{ fontSize: 9, opacity: 0.5, marginBottom: 4 }}>A×B 결과</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 12px", fontSize: 13, fontWeight: 600 }}>
                    <span style={{ color: COLORS.iHat }}>{compResult[0].toFixed(3)}</span>
                    <span style={{ color: COLORS.jHat }}>{compResult[1].toFixed(3)}</span>
                    <span style={{ color: COLORS.iHat }}>{compResult[2].toFixed(3)}</span>
                    <span style={{ color: COLORS.jHat }}>{compResult[3].toFixed(3)}</span>
                  </div>
                  <div style={{ fontSize: 10, marginTop: 4, opacity: 0.6 }}>det(A×B) = {mat2.det(compResult).toFixed(3)}</div>
                  <button onClick={() => {
                    const aStr = fmtMatStr(compMatA);
                    const bStr = fmtMatStr(compMatB);
                    setAppliedComp({ a: compMatA.map(Number), b: compMatB.map(Number), result: compResult });
                    applyTransform(compResult, `A${aStr} × B${bStr}`);
                  }} style={{ ...btn(), marginTop: 4, width: "100%", fontSize: 10 }} disabled={isAnimating}>이 결과를 캔버스에 적용</button>
                </div>
              )}
              <button onClick={() => setCompMatA(currentMatrix.map(String))} style={{ ...sBtn("#888"), fontSize: 9, marginTop: 4 }}>현재 행렬 → A에 복사</button>
            </Sec>

            {/* ★ 5. History */}
            <Sec title="⑤ 변환 이력">
              <Help>
{`📌 적용된 변환들이 순서대로 기록됩니다.

🔧 사용법
• 각 항목에 변환 이름/행렬값과 det값이 표시됩니다
• 타임라인(하단)의 ◀ ▶ 버튼으로 스텝 이동 가능
• ▶▶ 버튼으로 처음부터 전체 자동 재생
• 🐇🐢 슬라이더로 애니메이션 속도 조절

💡 프리셋 변환은 이름이, 사용자 정의는 행렬값이,
   행렬×행렬 결과는 A×B 형태로 출처가 표시됩니다.`}
              </Help>
              {transformHistory.length === 0 ? (
                <div style={{ fontSize: 10, opacity: 0.4 }}>변환 적용 시 이력이 기록됩니다</div>
              ) : (
                <div style={{ maxHeight: 100, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
                  {transformHistory.map((m, i) => {
                    const label = transformMeta[i] || fmtMat(m);
                    return (
                      <div key={i} style={{ fontSize: 10, padding: "3px 6px", borderRadius: 4, background: i < timelinePos ? "rgba(61,216,224,0.1)" : "rgba(40,40,80,0.3)", border: `1px solid ${i < timelinePos ? COLORS.accent+"33" : "transparent"}`, display: "flex", justifyContent: "space-between", gap: 6 }}>
                        <span style={{ opacity: 0.5, flexShrink: 0 }}>#{i+1}</span>
                        <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }} title={label}>{label}</span>
                        <span style={{ opacity: 0.4, flexShrink: 0 }}>det={mat2.det(m).toFixed(1)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Sec>

            {/* 6-11: Existing tools */}
            <Sec title="⑥ 격자 & 행렬식">
              <Help>
{`📌 원본 기준 격자
   변환과 무관하게 고정된 좌표축/격자를 희미하게 표시합니다.
   변환된 격자와 비교하면 "얼마나 뒤틀렸는지" 확인 가능.

📌 단위 면적 (행렬식, det)
   î와 ĵ가 만드는 단위 정사각형의 면적 변화율입니다.
   • det > 0 → 면적이 확대/축소되지만 방향 유지
   • det < 0 → 공간이 뒤집힘 (거울 반사)
   • det = 0 → 면적이 0, 차원 축소 (역변환 불가)

📝 예시
• 스케일 2x → det = 4 (면적 4배)
• 회전 90° → det = 1 (면적 변화 없음)
• 반사 → det = -1 (면적 같지만 뒤집힘)
• 영행렬식 → det = 0 (선으로 찌그러짐)`}
              </Help>
              <button onClick={() => setShowRefGrid(!showRefGrid)} style={btn(showRefGrid)}>{showRefGrid ? "■" : "□"} 원본 기준 격자</button>
              <div style={{ fontSize: 9, opacity: 0.4, marginTop: 2 }}>변환 전 좌표축을 희미하게 고정 표시</div>
              <button onClick={() => setShowDeterminant(!showDeterminant)} style={btn(showDeterminant)}>{showDeterminant ? "■" : "□"} 단위 면적 표시</button>
            </Sec>

            <Sec title="⑦ 역변환 & 영공간">
              <Help>
{`📌 역변환 (되감기)
   마지막 변환을 취소하고 이전 상태로 되돌립니다.
   수학적으로 역행렬(A⁻¹)을 곱하는 것과 같습니다.

📌 영공간 (Null Space)
   det=0인 변환을 적용하면 차원이 축소됩니다.
   이때 원점으로 찌그러진 벡터들의 집합이 영공간입니다.
   빨간 점선으로 표시됩니다.

🔧 사용법
• ⏪ 되감기 → 마지막 변환 역재생 (애니메이션)
• ⟲ 초기화 → 모든 변환 제거, 원래 상태로

📝 예시
• 전단 적용 → 되감기 → 원래 격자로 복귀
• 영행렬식 [1,2;2,4] 적용 → 되감기 시 에러
  → "차원이 축소되어 정보 손실" 토스트 표시`}
              </Help>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={rewindLast} style={btn()} disabled={isAnimating || transformHistory.length === 0}>⏪ 되감기</button>
                <button onClick={resetAll} style={btn()}>⟲ 초기화</button>
              </div>
              <div style={{ fontSize: 10, opacity: 0.5, marginTop: 4 }}>det=0이면 역행렬 불가 (영공간 표시)</div>
            </Sec>

            <Sec title="⑧ 내적 & 쌍대성">
              <Help>
{`📌 내적(Dot Product)이란?
   두 벡터가 얼마나 같은 방향인지를 숫자로 표현합니다.
   v₁·v₂ = |v₁||v₂|cos(θ)

📌 쌍대성(Duality)
   내적은 사실 "1×2 행렬을 곱하는 것"과 같습니다.
   벡터를 행렬로 보면 공간을 수직선으로 투영하는 변환입니다.

🔧 사용법
1. 벡터를 2개 이상 추가 (①번)
2. "투영선 표시" 켜기
3. 드롭다운에서 기준 벡터 선택 (예: v1)
4. 나머지 벡터(v2, v3...)가 v1 방향 직선에 수직 투영됨
5. 점선 + dot=값 표시

📝 예시
• v1=(1,0), v2=(3,2) → dot=3 (x성분만 살아남음)
• v1=(1,1), v2=(2,-1) → dot=1 (직교에 가까움)
• v1=(1,0), v2=(0,5) → dot=0 (완전 수직 = 투영길이 0)

💡 dot > 0: 같은 방향, dot < 0: 반대 방향, dot = 0: 수직`}
              </Help>
              <button onClick={() => {
                if (userVecs.length < 2) { showToast("벡터를 2개 이상 추가해주세요. 1개는 투영 기준선, 나머지가 투영됩니다."); return; }
                setShowDotProjection(!showDotProjection); if (!showDotProjection) setDotVecIdx(userVecs[0].id);
              }} style={btn(showDotProjection)}>{showDotProjection ? "■" : "□"} 투영선 표시</button>
              <div style={{ fontSize: 9, opacity: 0.4, marginTop: 2 }}>기준 벡터 1개 선택 → 나머지 벡터들이 그 방향에 투영됩니다</div>
              {showDotProjection && <select value={dotVecIdx||""} onChange={e => setDotVecIdx(Number(e.target.value))} style={{ ...inp(), marginTop: 4 }}>{userVecs.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select>}
              {showDotProjection && userVecs.length < 2 && (
                <div style={{ fontSize: 10, color: COLORS.vecOrange, marginTop: 4 }}>⚠ 투영할 벡터가 없습니다. 벡터를 추가해주세요.</div>
              )}
            </Sec>

            <Sec title="⑨ 외적 (3D)">
              <Help>
{`📌 외적(Cross Product)이란?
   두 2D 벡터가 만드는 평행사변형의 면적을 구합니다.
   결과는 그 면적을 길이로 가진 z축 방향 벡터입니다.
   v₁×v₂ = v1.x·v2.y - v1.y·v2.x

🔧 사용법
1. 벡터를 2개 이상 추가 (①번)
2. "두 벡터 선택" 클릭 → 선택 모드 진입
3. 캔버스에서 벡터 화살표 끝을 클릭 (2개 선택)
4. 자동으로 3D 미니뷰 표시 (드래그로 회전 가능)
   • 분홍 = v₁, 초록 = v₂, 주황 = 외적 벡터
5. "3D 닫기"로 종료

📝 예시
• v1=(1,0), v2=(0,1) → |v₁×v₂| = 1 (단위 정사각형)
• v1=(2,0), v2=(0,3) → |v₁×v₂| = 6 (직사각형 면적)
• v1=(1,0), v2=(2,0) → |v₁×v₂| = 0 (평행 = 면적 없음)

💡 î, ĵ(기저 벡터)는 선택 불가. 사용자 벡터만 선택됩니다.
💡 방향: z+ = 오른손 법칙, z- = 왼손 방향`}
              </Help>
              <button onClick={() => {
                if (userVecs.length < 2) { showToast("벡터를 2개 이상 추가해주세요. 캔버스에서 화살표 끝을 클릭하여 2개를 선택합니다. (î, ĵ 기저 벡터는 선택 불가)"); return; }
                setActiveTool(activeTool === "cross" ? "select" : "cross");
              }} style={btn(activeTool === "cross")}>{activeTool === "cross" ? "✓ 선택 모드" : "두 벡터 선택"}</button>
              {activeTool === "cross" && (
                <div style={{ fontSize: 9, color: COLORS.vecOrange, marginTop: 2 }}>
                  캔버스에서 벡터 화살표 끝을 클릭하세요 ({selectedForCross.length}/2 선택됨)
                </div>
              )}
              {selectedForCross.length === 2 && <button onClick={computeCross} style={{ ...sBtn(COLORS.vecOrange), marginTop: 4 }}>외적 계산</button>}
              {show3D && <button onClick={() => { setShow3D(false); setCrossResult(null); setSelectedForCross([]); }} style={{ ...sBtn(COLORS.nullSpace), marginTop: 4 }}>3D 닫기</button>}
            </Sec>

            <Sec title="⑩ 고유벡터">
              <Help>
{`📌 고유벡터란?
   선형 변환을 해도 방향이 안 꺾이고, 자기 방향 위에서
   늘어나거나 줄어들기만 하는 특별한 벡터입니다.
   그 늘어나는 배수가 고유값(λ)입니다.

🔧 사용법
1. 먼저 선형 변환을 적용 (②번)
2. "고유벡터 하이라이트" 켜기
3. 금색 선 = 고유벡터 방향, λ값 = 고유값

📝 추천 실험
• 전단 [1,1;0,1] → λ=1 하나 (x축 방향만 안 꺾임)
• 축소 [2,0;0,0.5] → λ=2(x축), λ=0.5(y축)
  → x방향 2배, y방향 절반으로 각각 고유벡터
• 스케일 2x [2,0;0,2] → λ=2 두 개 (모든 방향이 고유)
• 회전 90° [0,-1;1,0] → 실수 고유값 없음!
  → 순수 회전은 어떤 방향도 보존 안 합니다
• 사용자정의 [2,1;0,3] → λ=2, λ=3 두 방향

💡 항등행렬(변환 없음) 상태에서는 모든 벡터가 고유벡터라
   의미가 없습니다. 반드시 변환을 먼저 적용하세요.`}
              </Help>
              <button onClick={() => {
                if (currentMatrix.every((v, i) => Math.abs(v - [1,0,0,1][i]) < 0.01)) {
                  showToast("먼저 선형 변환을 적용해주세요. 항등행렬 상태에서는 모든 벡터가 고유벡터입니다.");
                }
                setShowEigen(!showEigen);
              }} style={btn(showEigen)}>{showEigen ? "■" : "□"} 고유벡터 하이라이트</button>
              <div style={{ fontSize: 9, opacity: 0.4, marginTop: 2 }}>변환 시 방향이 안 꺾이고 늘거나 줄기만 하는 벡터</div>
              {showEigen && (() => { const eigs = mat2.eigen(currentMatrix); return eigs.length > 0 ? (
                <div style={{ marginTop: 4 }}>
                  {eigs.map((e,i) => <div key={i} style={{ color: COLORS.eigenGlow, marginTop: 2, fontSize: 10 }}>λ{i+1}={e.value.toFixed(3)} → ({e.vector[0].toFixed(2)}, {e.vector[1].toFixed(2)})</div>)}
                  <div style={{ fontSize: 9, opacity: 0.35, marginTop: 4 }}>λ = 고유값 (늘어나는 배수)</div>
                </div>
              ) : <div style={{ marginTop: 4, fontSize: 10, color: COLORS.nullSpace }}>실수 고유값 없음 (복소수 — 순수 회전 등)</div>; })()}
            </Sec>

            <Sec title="⑪ 기저 변환">
              <Help>
{`📌 기저 변환이란?
   같은 벡터를 다른 좌표계(기저)로 보면 좌표가 달라집니다.
   우리 기준과 "다른 사람의 기준"을 동시에 비교합니다.

🔧 사용법
1. "대안 기저 격자" 켜기
2. b₁, b₂ 값을 입력 → 보라/분홍 격자가 캔버스에 표시
3. 벡터 옆에 alt:(x,y)로 대안 좌표가 자동 표시

📝 추천 실험
• b₁=(1,0) b₂=(0,1) → 표준좌표와 동일 (변화 없음)
• b₁=(2,0) b₂=(0,2) → 모든 좌표가 절반
  → (4,2) 벡터가 alt:(2,1)로 표시됨
• b₁=(1,1) b₂=(-1,1) → 45° 회전된 좌표계
  → (3,2) 벡터가 alt:(2.5,-0.5) 등으로 표시됨
• b₁=(1,0.5) b₂=(0,1) → 기울어진 좌표계

💡 변환 없이도 동작합니다.
💡 벡터를 여러 개 추가하고 비교하면 효과적입니다.`}
              </Help>
              <button onClick={() => setShowAltBasis(!showAltBasis)} style={btn(showAltBasis)}>{showAltBasis ? "■" : "□"} 대안 기저 격자</button>
              <div style={{ fontSize: 9, opacity: 0.4, marginTop: 2 }}>같은 벡터를 다른 좌표계로 보면 좌표가 달라집니다</div>
              {showAltBasis && (
                <div style={{ marginTop: 6, fontSize: 10 }}>
                  <div style={{ color: COLORS.altBasis1, marginBottom: 4 }}>b₁ = <input value={altBasis[0][0]} onChange={e => setAltBasis(b => [[Number(e.target.value)||0, b[0][1]], b[1]])} style={{ width: 32, ...inp(COLORS.altBasis1) }} />, <input value={altBasis[0][1]} onChange={e => setAltBasis(b => [[b[0][0], Number(e.target.value)||0], b[1]])} style={{ width: 32, ...inp(COLORS.altBasis1) }} /></div>
                  <div style={{ color: COLORS.altBasis2 }}>b₂ = <input value={altBasis[1][0]} onChange={e => setAltBasis(b => [b[0], [Number(e.target.value)||0, b[1][1]]])} style={{ width: 32, ...inp(COLORS.altBasis2) }} />, <input value={altBasis[1][1]} onChange={e => setAltBasis(b => [b[0], [b[1][0], Number(e.target.value)||0]])} style={{ width: 32, ...inp(COLORS.altBasis2) }} /></div>
                </div>
              )}
            </Sec>
          </div>
        )}
      </div>

      {/* ─── Timeline ─── */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 64, background: COLORS.timeline, borderTop: `1px solid ${COLORS.panelBorder}`, display: "flex", alignItems: "center", padding: "0 16px", gap: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: COLORS.text }}>
        <button onClick={resetAll} style={btn()} title="초기화">⟲</button>
        <button onClick={rewindLast} style={btn()} disabled={isAnimating || transformHistory.length === 0}>⏪</button>
        <button onClick={stepBackward} style={btn()} disabled={isAnimating || timelinePos <= 0}>◀</button>
        <button onClick={stepForward} style={btn()} disabled={isAnimating || timelinePos >= transformHistory.length}>▶</button>

        {/* ★ Auto-play / Stop */}
        {isAutoPlaying ? (
          <button onClick={stopAutoPlay} style={{ ...btn(true), borderColor: COLORS.scrubber, color: COLORS.scrubber, background: "rgba(232,67,147,0.15)" }} title="정지">⏹</button>
        ) : (
          <button onClick={autoPlayAll} style={btn()} disabled={isAnimating || transformHistory.length === 0} title="처음부터 전체 재생">▶▶</button>
        )}

        {/* Scrubber bar */}
        <div style={{ flex: 1, position: "relative", height: 28, display: "flex", alignItems: "center" }}>
          <div style={{ position: "absolute", left: 0, right: 0, height: 4, background: "rgba(80,80,140,0.4)", borderRadius: 2 }}>
            <div style={{ width: transformHistory.length > 0 ? `${(timelinePos/transformHistory.length)*100}%` : "0%", height: "100%", background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.scrubber})`, borderRadius: 2, transition: isAnimating ? `width ${animSpeed/1000}s` : "none" }} />
          </div>
          {transformHistory.map((m, i) => {
            const label = transformMeta[i] || "custom";
            return <div key={i} onClick={() => !isAnimating && scrubTimeline(i+1)} title={`#${i+1}: ${label}`} style={{ position: "absolute", left: `${((i+1)/transformHistory.length)*100}%`, width: 10, height: 10, borderRadius: "50%", background: i+1<=timelinePos ? COLORS.accent : "rgba(80,80,140,0.6)", border: `2px solid ${COLORS.bg}`, transform: "translate(-50%, 0)", cursor: "pointer", zIndex: 1 }} />;
          })}
          <input type="range" min={0} max={Math.max(1, transformHistory.length)} value={timelinePos} step={1} onChange={e => scrubTimeline(Number(e.target.value))} disabled={isAnimating} style={{ position: "absolute", left: 0, right: 0, top: -4, height: 28, opacity: 0, cursor: "pointer", zIndex: 2 }} />
        </div>

        <span style={{ opacity: 0.5, minWidth: 60, textAlign: "right", fontSize: 10 }}>Step {timelinePos}/{transformHistory.length}</span>

        {/* ★ Speed slider */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 90 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9 }}>
            <span style={{ opacity: 0.4 }}>🐇</span>
            <input type="range" min={200} max={3000} step={100} value={animSpeed}
              onChange={e => setAnimSpeed(Number(e.target.value))}
              style={{ width: 60, height: 4, accentColor: COLORS.accent, cursor: "pointer" }} />
            <span style={{ opacity: 0.4 }}>🐢</span>
          </div>
          <span style={{ fontSize: 9, opacity: 0.4 }}>{(animSpeed/1000).toFixed(1)}s/step</span>
        </div>
      </div>

      {/* Warnings */}
      {Math.abs(mat2.det(currentMatrix)) < 0.05 && transformHistory.length > 0 && (
        <div style={{ position: "absolute", bottom: 78, left: "50%", transform: "translateX(-50%)", ...PS, padding: "8px 16px", borderColor: COLORS.nullSpace, color: COLORS.nullSpace, fontSize: 11, textAlign: "center", animation: "pulse 1.5s infinite" }}>⚠ det ≈ 0 — 차원 축소! 역변환 불가</div>
      )}
      {mat2.det(currentMatrix) < -0.01 && (
        <div style={{ position: "absolute", bottom: 78, right: 20, ...PS, padding: "6px 12px", borderColor: "#ff6b6b", color: "#ff9f9f", fontSize: 10 }}>🔄 공간 방향 반전 (det &lt; 0)</div>
      )}

      {/* ★ Process Overlay — shows what's applied */}
      {(transformHistory.length > 0 || matVecHighlight || appliedComp) && (
        <div style={{
          position: "absolute", bottom: 78, left: 16,
          background: "rgba(15,15,35,0.85)", border: `1px solid ${COLORS.panelBorder}`,
          borderRadius: 10, padding: "10px 14px", maxWidth: "calc(100vw - 300px)",
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: COLORS.text,
          backdropFilter: "blur(8px)", pointerEvents: "none",
          display: "flex", flexDirection: "column", gap: 8,
        }}>

          {/* 1. Transform chain */}
          {transformHistory.length > 0 && (
            <div>
              <div style={{ fontSize: 9, opacity: 0.4, marginBottom: 4 }}>변환 과정</div>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, lineHeight: 2 }}>
                {transformHistory.slice(0, timelinePos).map((m, i) => {
                  const label = transformMeta[i] || fmtMat(m);
                  const isComposition = label.includes("×");
                  return (
                    <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {i > 0 && <span style={{ color: COLORS.accent, opacity: 0.5, fontSize: 12, fontWeight: 700 }}>→</span>}
                      <span style={{
                        padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                        background: isComposition ? "rgba(253,203,110,0.12)" : "rgba(61,216,224,0.1)",
                        border: `1px solid ${isComposition ? COLORS.vecOrange + "44" : COLORS.accent + "33"}`,
                        color: isComposition ? COLORS.vecOrange : COLORS.accent,
                        whiteSpace: "nowrap",
                      }}>
                        {label}
                      </span>
                    </span>
                  );
                })}
                <span style={{ color: COLORS.accent, opacity: 0.5 }}>=</span>
                <span style={{
                  padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                  background: "rgba(232,67,147,0.12)", border: `1px solid ${COLORS.scrubber}33`,
                  color: COLORS.scrubber, whiteSpace: "nowrap",
                }}>
                  {fmtMat(currentMatrix, 2)}
                </span>
              </div>
            </div>
          )}

          {/* 2. Mat × Vec */}
          {matVecHighlight && (() => {
            const v = vectors.find(vv => vv.id === matVecHighlight.vecId);
            if (!v) return null;
            return (
              <div>
                <div style={{ fontSize: 9, opacity: 0.4, marginBottom: 4 }}>행렬 × 벡터</div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                  <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 10, background: "rgba(61,216,224,0.1)", border: `1px solid ${COLORS.accent}33`, color: COLORS.accent, fontWeight: 600 }}>
                    {fmtMat(currentMatrix)}
                  </span>
                  <span style={{ opacity: 0.5 }}>×</span>
                  <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 10, background: `${v.color}15`, border: `1px solid ${v.color}44`, color: v.color, fontWeight: 600 }}>
                    {v.label} ({v.x.toFixed(1)}, {v.y.toFixed(1)})
                  </span>
                  <span style={{ opacity: 0.5 }}>=</span>
                  <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 10, background: "rgba(116,185,255,0.12)", border: `1px solid ${COLORS.matVecResult}44`, color: COLORS.matVecResult, fontWeight: 700 }}>
                    ({matVecHighlight.after[0].toFixed(2)}, {matVecHighlight.after[1].toFixed(2)})
                  </span>
                </div>
              </div>
            );
          })()}

          {/* 3. Mat × Mat */}
          {appliedComp && (
            <div>
              <div style={{ fontSize: 9, opacity: 0.4, marginBottom: 4 }}>행렬 × 행렬 (캔버스 적용됨)</div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 10, background: "rgba(61,216,224,0.1)", border: `1px solid ${COLORS.iHat}33`, color: COLORS.iHat, fontWeight: 600 }}>
                  A {fmtMat(appliedComp.a)}
                </span>
                <span style={{ opacity: 0.5 }}>×</span>
                <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 10, background: "rgba(232,212,77,0.1)", border: `1px solid ${COLORS.jHat}33`, color: COLORS.jHat, fontWeight: 600 }}>
                  B {fmtMat(appliedComp.b)}
                </span>
                <span style={{ opacity: 0.5 }}>=</span>
                <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 10, background: "rgba(232,67,147,0.12)", border: `1px solid ${COLORS.scrubber}33`, color: COLORS.scrubber, fontWeight: 700 }}>
                  {fmtMat(appliedComp.result, 2)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ★ 3D Cross Product DOM Overlay — rotatable */}
      {show3D && crossResult && (() => {
        const { v1, v2, cross, area } = crossResult;
        const ax = rot3D.ax * Math.PI / 180, ay = rot3D.ay * Math.PI / 180;
        const cosA = Math.cos(ax), sinA = Math.sin(ax), cosB = Math.cos(ay), sinB = Math.sin(ay);
        const project3D = (x, y, z) => {
          // Rotate around Y then X
          const x1 = x*cosB + z*sinB, z1 = -x*sinB + z*cosB;
          const y1 = y*cosA - z1*sinA, z2 = y*sinA + z1*cosA;
          const scale = 18;
          return [110 + x1*scale, 90 - y1*scale];
        };
        const ln = (fx,fy,fz,tx,ty,tz) => {
          const [sx,sy]=project3D(fx,fy,fz),[ex,ey]=project3D(tx,ty,tz);
          return `M${sx},${sy}L${ex},${ey}`;
        };
        const [c0x,c0y]=project3D(0,0,0),[c1x,c1y]=project3D(v1[0],v1[1],0);
        const [c2x,c2y]=project3D(v1[0]+v2[0],v1[1]+v2[1],0),[c3x,c3y]=project3D(v2[0],v2[1],0);
        const handleDrag3DStart = (e) => {
          e.preventDefault();
          const startX = e.clientX || e.touches?.[0]?.clientX;
          const startY = e.clientY || e.touches?.[0]?.clientY;
          drag3DRef.current = { startX, startY, startAx: rot3D.ax, startAy: rot3D.ay };
          const handleMove = (ev) => {
            const mx = ev.clientX || ev.touches?.[0]?.clientX;
            const my = ev.clientY || ev.touches?.[0]?.clientY;
            if (drag3DRef.current) {
              setRot3D({
                ax: drag3DRef.current.startAx + (my - drag3DRef.current.startY) * 0.5,
                ay: drag3DRef.current.startAy + (mx - drag3DRef.current.startX) * 0.5,
              });
            }
          };
          const handleUp = () => {
            drag3DRef.current = null;
            window.removeEventListener("mousemove", handleMove);
            window.removeEventListener("mouseup", handleUp);
            window.removeEventListener("touchmove", handleMove);
            window.removeEventListener("touchend", handleUp);
          };
          window.addEventListener("mousemove", handleMove);
          window.addEventListener("mouseup", handleUp);
          window.addEventListener("touchmove", handleMove);
          window.addEventListener("touchend", handleUp);
        };
        return (
          <div style={{
            position: "absolute", top: 60, left: 16,
            background: "rgba(15,15,35,0.92)", border: `1px solid ${COLORS.panelBorder}`,
            borderRadius: 10, padding: 10, width: 220,
            fontFamily: "'JetBrains Mono', monospace", userSelect: "none",
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.accent, textAlign: "center", marginBottom: 4 }}>외적 (Cross Product)</div>
            <div style={{ fontSize: 8, opacity: 0.35, textAlign: "center", marginBottom: 4 }}>드래그하여 회전</div>
            <svg viewBox="0 0 220 180" width="220" height="180"
              style={{ cursor: "grab", display: "block" }}
              onMouseDown={handleDrag3DStart} onTouchStart={handleDrag3DStart}>
              {/* Grid plane (xy) */}
              {[-2,-1,0,1,2].map(i => (
                <g key={`grid${i}`}>
                  <path d={ln(i,-3,0,i,3,0)} stroke="#444" strokeWidth="0.5" opacity="0.3"/>
                  <path d={ln(-3,i,0,3,i,0)} stroke="#444" strokeWidth="0.5" opacity="0.3"/>
                </g>
              ))}
              {/* Axes */}
              <path d={ln(0,0,0,4,0,0)} stroke="#ff6b6b" strokeWidth="1.2" opacity="0.6"/>
              <path d={ln(0,0,0,0,4,0)} stroke="#55efc4" strokeWidth="1.2" opacity="0.6"/>
              <path d={ln(0,0,0,0,0,4)} stroke="#74b9ff" strokeWidth="1.2" opacity="0.6"/>
              <text x={project3D(4.3,0,0)[0]} y={project3D(4.3,0,0)[1]} fill="#ff6b6b" fontSize="9" fontWeight="600">x</text>
              <text x={project3D(0,4.3,0)[0]} y={project3D(0,4.3,0)[1]} fill="#55efc4" fontSize="9" fontWeight="600">y</text>
              <text x={project3D(0,0,4.3)[0]} y={project3D(0,0,4.3)[1]} fill="#74b9ff" fontSize="9" fontWeight="600">z</text>
              {/* Parallelogram */}
              <polygon points={`${c0x},${c0y} ${c1x},${c1y} ${c2x},${c2y} ${c3x},${c3y}`} fill="rgba(225,112,85,0.25)" stroke="rgba(225,112,85,0.5)" strokeWidth="1"/>
              {/* v1 */}
              <path d={ln(0,0,0,v1[0],v1[1],0)} stroke={COLORS.vecPink} strokeWidth="2.5"/>
              <circle cx={project3D(v1[0],v1[1],0)[0]} cy={project3D(v1[0],v1[1],0)[1]} r="4" fill={COLORS.vecPink}/>
              {/* v2 */}
              <path d={ln(0,0,0,v2[0],v2[1],0)} stroke={COLORS.vecGreen} strokeWidth="2.5"/>
              <circle cx={project3D(v2[0],v2[1],0)[0]} cy={project3D(v2[0],v2[1],0)[1]} r="4" fill={COLORS.vecGreen}/>
              {/* Cross product vector (z-axis) */}
              <path d={ln(0,0,0,0,0,cross)} stroke={COLORS.vecOrange} strokeWidth="3"/>
              <circle cx={project3D(0,0,cross)[0]} cy={project3D(0,0,cross)[1]} r="5" fill={COLORS.vecOrange}/>
              {/* Dashed projection lines from tips to z-axis */}
              <path d={ln(v1[0],v1[1],0,0,0,0)} stroke={COLORS.vecPink} strokeWidth="0.5" strokeDasharray="3,3" opacity="0.4"/>
              <path d={ln(v2[0],v2[1],0,0,0,0)} stroke={COLORS.vecGreen} strokeWidth="0.5" strokeDasharray="3,3" opacity="0.4"/>
            </svg>
            <div style={{ textAlign: "center", marginTop: 4 }}>
              <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
                <span style={{ fontSize: 10, color: COLORS.vecPink }}>v₁ ({v1[0].toFixed(1)}, {v1[1].toFixed(1)})</span>
                <span style={{ fontSize: 10, color: COLORS.vecGreen }}>v₂ ({v2[0].toFixed(1)}, {v2[1].toFixed(1)})</span>
              </div>
              <div style={{ fontSize: 12, color: COLORS.vecOrange, fontWeight: 700, marginTop: 4 }}>
                |v₁ × v₂| = {Math.abs(area).toFixed(2)}
              </div>
              <div style={{ fontSize: 9, opacity: 0.5, marginTop: 2 }}>
                방향: {cross >= 0 ? "↑ z+ (오른손 법칙)" : "↓ z- (왼손 방향)"}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ★ Toast notification */}
      {toast && (
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          background: "rgba(20,20,50,0.95)", border: `1px solid ${COLORS.accent}`,
          borderRadius: 12, padding: "16px 24px", maxWidth: 400,
          fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
          color: COLORS.text, textAlign: "center", zIndex: 100,
          backdropFilter: "blur(12px)",
          animation: "toastIn 0.3s ease",
        }}>
          {toast}
          <div onClick={() => setToast(null)} style={{
            marginTop: 10, fontSize: 10, color: COLORS.accent,
            cursor: "pointer", opacity: 0.7,
          }}>닫기</div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        @keyframes toastIn { from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(100,120,180,0.3); border-radius: 2px; }
      `}</style>
    </div>
  );
}

function Sec({ title, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ borderBottom: "1px solid rgba(100,120,180,0.15)", paddingBottom: 8 }}>
      <div onClick={() => setOpen(!open)} style={{ cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#8899bb", marginBottom: open ? 6 : 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>{title}</span><span style={{ fontSize: 8, opacity: 0.5 }}>{open ? "▼" : "▶"}</span>
      </div>
      {open && <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{children}</div>}
    </div>
  );
}

function Help({ children }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 4 }}>
      <div onClick={() => setOpen(!open)} style={{ cursor: "pointer", fontSize: 9, color: "#6677aa", display: "flex", alignItems: "center", gap: 4 }}>
        <span>{open ? "▾" : "▸"}</span><span style={{ textDecoration: "underline", textUnderlineOffset: 2 }}>사용법 & 예시 {open ? "접기" : "보기"}</span>
      </div>
      {open && (
        <div style={{ marginTop: 4, padding: "6px 8px", borderRadius: 6, background: "rgba(40,50,80,0.4)", border: "1px solid rgba(100,120,180,0.15)", fontSize: 9, lineHeight: 1.6, color: "rgba(200,210,230,0.8)", whiteSpace: "pre-wrap" }}>
          {children}
        </div>
      )}
    </div>
  );
}
