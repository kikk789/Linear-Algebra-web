import { useState, useRef, useEffect, useCallback } from "react";
import mat3, { cross3, vec3Len } from "./mat3.js";

// ─── Colors (shared palette with 2D, plus kHat) ───
const COLORS = {
  bg: "#1a1a2e",
  grid: "rgba(74,85,120,0.18)",
  gridMajor: "rgba(100,120,180,0.35)",
  axis: "rgba(150,170,220,0.6)",
  iHat: "#3dd8e0",
  jHat: "#e8d44d",
  kHat: "#74b9ff",
  vecPink: "#e84393",
  vecGreen: "#55efc4",
  vecOrange: "#fdcb6e",
  detArea: "rgba(225,112,85,0.18)",
  eigenGlow: "#f9ca24",
  nullSpace: "#ff6b6b",
  text: "#e0e0e0",
  panel: "rgba(20,20,45,0.92)",
  panelBorder: "rgba(100,120,180,0.3)",
  accent: "#3dd8e0",
  timeline: "rgba(30,30,60,0.95)",
  scrubber: "#e84393",
  matVecResult: "#74b9ff",
  axisX: "#ff6b6b",
  axisY: "#55efc4",
  axisZ: "#74b9ff",
};

const PRESETS_3D = {
  "Rx 90°": mat3.rotX(Math.PI / 2),
  "Ry 90°": mat3.rotY(Math.PI / 2),
  "Rz 90°": mat3.rotZ(Math.PI / 2),
  "Rx 45°": mat3.rotX(Math.PI / 4),
  "스케일 2x": [2,0,0, 0,2,0, 0,0,2],
  "스퀴즈": [2,0,0, 0,0.5,0, 0,0,1],
  "반사 (xy)": [1,0,0, 0,1,0, 0,0,-1],
  "반사 (yz)": [-1,0,0, 0,1,0, 0,0,1],
  "전단": [1,1,0, 0,1,0, 0,0,1],
  "투영 (xy)": [1,0,0, 0,1,0, 0,0,0],
};

const VEC_COLORS = ["#e84393","#55efc4","#fdcb6e","#a29bfe","#fd79a8","#74b9ff","#ff7675","#00cec9"];

const fmtMat3 = (m, d = 1) => `[${m[0].toFixed(d)},${m[1].toFixed(d)},${m[2].toFixed(d)} ; ${m[3].toFixed(d)},${m[4].toFixed(d)},${m[5].toFixed(d)} ; ${m[6].toFixed(d)},${m[7].toFixed(d)},${m[8].toFixed(d)}]`;

// Panel style shorthand
const PS = { background: COLORS.panel, border: `1px solid ${COLORS.panelBorder}`, borderRadius: 10, backdropFilter: "blur(12px)" };

export default function LinearAlgebraSandbox3D() {
  const canvasRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });

  // Camera (orbit)
  const [camera, setCamera] = useState({ rotX: -25, rotY: 35, zoom: 60, panX: 0, panY: 0 });
  const cameraRef = useRef(camera);
  useEffect(() => { cameraRef.current = camera; }, [camera]);

  // Vectors
  const [vectors, setVectors] = useState([]);
  const [nextVecId, setNextVecId] = useState(10);
  const [vecInputX, setVecInputX] = useState("1");
  const [vecInputY, setVecInputY] = useState("0");
  const [vecInputZ, setVecInputZ] = useState("0");

  // Transform
  const [transformHistory, setTransformHistory] = useState([]);
  const transformHistoryRef = useRef(transformHistory);
  const [transformMeta, setTransformMeta] = useState([]);
  const transformMetaRef = useRef(transformMeta);
  const [currentMatrix, setCurrentMatrix] = useState(mat3.identity());
  const currentMatrixRef = useRef(currentMatrix);
  const [timelinePos, setTimelinePos] = useState(0);
  const timelinePosRef = useRef(0);

  // Sync refs in effect to avoid ref-during-render lint errors
  useEffect(() => {
    transformHistoryRef.current = transformHistory;
    transformMetaRef.current = transformMeta;
    currentMatrixRef.current = currentMatrix;
    timelinePosRef.current = timelinePos;
  }, [transformHistory, transformMeta, currentMatrix, timelinePos]);

  // Animation
  const animRef = useRef({ active: false, from: null, targetMatrix: null, start: 0, duration: 500, progress: 0 });
  const [isAnimating, setIsAnimating] = useState(false);
  const [animSpeed, setAnimSpeed] = useState(500);
  // eslint-disable-next-line no-unused-vars
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);

  // UI
  const [toolboxOpen, setToolboxOpen] = useState(true);
  const [toast, setToast] = useState(null);
  const [showDeterminant, setShowDeterminant] = useState(true);
  const [showRefGrid, setShowRefGrid] = useState(true);
  const [showEigen, setShowEigen] = useState(false);
  const [matInput, setMatInput] = useState(["1","0","0","0","1","0","0","0","1"]);
  const [showMatrixEditor, setShowMatrixEditor] = useState(false);

  // Mat×Vec highlight
  const [matVecHighlight, setMatVecHighlight] = useState(null);

  // Mat×Mat composition
  const [compMatA, setCompMatA] = useState(["1","0","0","0","1","0","0","0","1"]);
  const [compMatB, setCompMatB] = useState(["1","0","0","0","1","0","0","0","1"]);
  const [compResult, setCompResult] = useState(null);

  // Drag state
  const dragRef = useRef(null);

  // ─── Projection ───
  const project3D = useCallback((x, y, z, cam) => {
    const c = cam || cameraRef.current;
    const ax = c.rotX * Math.PI / 180;
    const ay = c.rotY * Math.PI / 180;
    const cosA = Math.cos(ay), sinA = Math.sin(ay);
    const cosB = Math.cos(ax), sinB = Math.sin(ax);
    // Rotate around Y, then X
    const x1 = x * cosA + z * sinA;
    const z1 = -x * sinA + z * cosA;
    const y1 = y * cosB - z1 * sinB;
    const z2 = y * sinB + z1 * cosB;
    const sx = x1 * c.zoom + c.panX;
    const sy = -y1 * c.zoom + c.panY;
    return [sx, sy, z2];
  }, []);

  // ─── getEffectiveMatrix ───
  const getEffectiveMatrix = useCallback((pos) => {
    let m = mat3.identity();
    const hist = transformHistoryRef.current;
    for (let i = 0; i < pos && i < hist.length; i++) m = mat3.mul(hist[i], m);
    return m;
  }, []);

  // ─── Apply transform ───
  const applyTransform = useCallback((matrix, label) => {
    if (animRef.current.active) return;
    const newHist = [...transformHistoryRef.current, matrix];
    const newMeta = [...transformMetaRef.current, label];
    setTransformHistory(newHist);
    transformHistoryRef.current = newHist;
    setTransformMeta(newMeta);
    transformMetaRef.current = newMeta;
    const newPos = newHist.length;
    setTimelinePos(newPos);
    timelinePosRef.current = newPos;

    const from = currentMatrixRef.current;
    const target = getEffectiveMatrix(newPos);
    animRef.current = { active: true, from, targetMatrix: target, start: performance.now(), duration: animSpeed, progress: 0 };
    setIsAnimating(true);
  }, [animSpeed, getEffectiveMatrix]);

  const showToast = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); }, []);

  // ─── Rewind ───
  const rewindLast = useCallback(() => {
    if (animRef.current.active) return;
    const hist = transformHistoryRef.current;
    if (hist.length === 0) { showToast("되감을 변환이 없습니다."); return; }
    const last = hist[hist.length - 1];
    if (Math.abs(mat3.det(last)) < 1e-10) { showToast("det = 0 → 정보 손실로 역변환 불가"); return; }
    const newHist = hist.slice(0, -1);
    const newMeta = transformMetaRef.current.slice(0, -1);
    setTransformHistory(newHist);
    transformHistoryRef.current = newHist;
    setTransformMeta(newMeta);
    transformMetaRef.current = newMeta;
    const newPos = newHist.length;
    setTimelinePos(newPos);
    timelinePosRef.current = newPos;
    const from = currentMatrixRef.current;
    const target = getEffectiveMatrix(newPos);
    animRef.current = { active: true, from, targetMatrix: target, start: performance.now(), duration: animSpeed, progress: 0 };
    setIsAnimating(true);
  }, [animSpeed, getEffectiveMatrix, showToast]);

  const resetAll = useCallback(() => {
    setTransformHistory([]); transformHistoryRef.current = [];
    setTransformMeta([]); transformMetaRef.current = [];
    setCurrentMatrix(mat3.identity()); currentMatrixRef.current = mat3.identity();
    setTimelinePos(0); timelinePosRef.current = 0;
    setIsAutoPlaying(false); setMatVecHighlight(null);
  }, []);

  // ─── Add vector ───
  const addVector = useCallback((x, y, z) => {
    setVectors(prev => [...prev, { id: nextVecId, x, y, z, color: VEC_COLORS[(nextVecId - 10) % VEC_COLORS.length], label: `v${nextVecId - 9}` }]);
    setNextVecId(prev => prev + 1);
  }, [nextVecId]);

  const addVectorFromInput = useCallback(() => {
    const x = parseFloat(vecInputX), y = parseFloat(vecInputY), z = parseFloat(vecInputZ);
    if (isNaN(x) || isNaN(y) || isNaN(z)) { showToast("유효한 좌표를 입력하세요"); return; }
    addVector(x, y, z);
  }, [vecInputX, vecInputY, vecInputZ, addVector, showToast]);

  // ─── Render loop ───
  useEffect(() => {
    let rafId;
    const render = () => {
      rafId = requestAnimationFrame(render);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const W = canvas.width, H = canvas.height;
      const cx = W / 2, cy = H / 2;
      const cam = cameraRef.current;

      // Animation step
      if (animRef.current.active) {
        const elapsed = performance.now() - animRef.current.start;
        let t = Math.min(elapsed / animRef.current.duration, 1);
        const eased = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2;
        const m = mat3.lerp(animRef.current.from, animRef.current.targetMatrix, eased);
        currentMatrixRef.current = m;
        if (t >= 1) {
          currentMatrixRef.current = animRef.current.targetMatrix;
          setCurrentMatrix(animRef.current.targetMatrix);
          animRef.current.active = false;
          setIsAnimating(false);
        }
      }

      const proj = (x, y, z) => {
        const [sx, sy] = project3D(x, y, z, cam);
        return [cx + sx, cy + sy];
      };

      const effMatrix = currentMatrixRef.current;

      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, W, H);

      // ─── Adaptive grid step ───
      const pxPerUnit = cam.zoom;
      const steps = [0.5,1,2,5,10,25,50,100];
      let gridStep = 1;
      for (const s of steps) { if (pxPerUnit * s >= 30) { gridStep = s; break; } }
      const range = Math.ceil(8 / gridStep) * gridStep;

      // ─── Reference grid (XZ plane, Y=0) ───
      if (showRefGrid) {
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = COLORS.grid;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        for (let v = -range; v <= range; v += gridStep) {
          const [x1,y1] = proj(v, 0, -range);
          const [x2,y2] = proj(v, 0, range);
          ctx.moveTo(x1,y1); ctx.lineTo(x2,y2);
          const [x3,y3] = proj(-range, 0, v);
          const [x4,y4] = proj(range, 0, v);
          ctx.moveTo(x3,y3); ctx.lineTo(x4,y4);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // ─── Transformed grid (XZ plane through transform) ───
      {
        ctx.strokeStyle = COLORS.gridMajor;
        ctx.lineWidth = 0.8;
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        let lineCount = 0;
        for (let v = -range; v <= range && lineCount < 200; v += gridStep) {
          // Lines along Z (constant X)
          const a1 = mat3.apply(effMatrix, [v, 0, -range]);
          const a2 = mat3.apply(effMatrix, [v, 0, range]);
          const [sx1,sy1] = proj(a1[0],a1[1],a1[2]);
          const [sx2,sy2] = proj(a2[0],a2[1],a2[2]);
          ctx.moveTo(sx1,sy1); ctx.lineTo(sx2,sy2);
          lineCount++;
          // Lines along X (constant Z)
          const b1 = mat3.apply(effMatrix, [-range, 0, v]);
          const b2 = mat3.apply(effMatrix, [range, 0, v]);
          const [sx3,sy3] = proj(b1[0],b1[1],b1[2]);
          const [sx4,sy4] = proj(b2[0],b2[1],b2[2]);
          ctx.moveTo(sx3,sy3); ctx.lineTo(sx4,sy4);
          lineCount++;
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // ─── Axes ───
      const axisLen = range + 1;
      const drawAxis = (dx, dy, dz, color, label) => {
        const [ex, ey] = proj(dx*axisLen, dy*axisLen, dz*axisLen);
        const [nx, ny] = proj(-dx*axisLen, -dy*axisLen, -dz*axisLen);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.7;
        ctx.beginPath(); ctx.moveTo(nx,ny); ctx.lineTo(ex,ey); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
        ctx.font = "bold 12px 'JetBrains Mono', monospace";
        ctx.fillText(label, ex + 4, ey - 4);
      };
      drawAxis(1,0,0, COLORS.axisX, "x");
      drawAxis(0,1,0, COLORS.axisY, "y");
      drawAxis(0,0,1, COLORS.axisZ, "z");

      // ─── Axis tick marks & number labels ───
      {
        const labelStep = gridStep * (gridStep < 5 ? (gridStep >= 5 ? 1 : 5) : 1);
        const fmtVal = (v) => Number.isInteger(v) ? v.toString() : v.toFixed(1);
        ctx.font = "10px 'JetBrains Mono', monospace";

        const tickSize = 3; // px half-length of tick mark

        // Helper: draw ticks along one axis
        const drawTicks = (axDir, color) => {
          ctx.fillStyle = color;
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.5;
          ctx.lineWidth = 1;

          for (let v = -range; v <= range; v += labelStep) {
            if (Math.abs(v) < 0.001) continue;
            const px = axDir[0] * v, py = axDir[1] * v, pz = axDir[2] * v;
            const [sx, sy] = proj(px, py, pz);

            // Tick mark (small cross)
            ctx.beginPath();
            ctx.moveTo(sx - tickSize, sy); ctx.lineTo(sx + tickSize, sy);
            ctx.moveTo(sx, sy - tickSize); ctx.lineTo(sx, sy + tickSize);
            ctx.stroke();

            // Number label
            ctx.globalAlpha = 0.45;
            ctx.textAlign = "center";
            ctx.fillText(fmtVal(v), sx, sy + 14);
            ctx.globalAlpha = 0.5;
          }
          ctx.globalAlpha = 1;
        };

        drawTicks([1,0,0], COLORS.axisX);
        drawTicks([0,1,0], COLORS.axisY);
        drawTicks([0,0,1], COLORS.axisZ);

        // Origin label
        const [ox0, oy0] = proj(0, 0, 0);
        ctx.textAlign = "right";
        ctx.fillStyle = "rgba(150,170,220,0.3)";
        ctx.font = "10px 'JetBrains Mono', monospace";
        ctx.fillText("0", ox0 - 6, oy0 + 14);
      }

      // ─── Determinant volume (unit cube) ───
      if (showDeterminant) {
        const cubeVerts = [
          [0,0,0],[1,0,0],[1,1,0],[0,1,0],
          [0,0,1],[1,0,1],[1,1,1],[0,1,1],
        ];
        const transformed = cubeVerts.map(v => mat3.apply(effMatrix, v));
        const projected = transformed.map(v => {
          const [sx, sy, sz] = project3D(v[0], v[1], v[2], cam);
          return [cx + sx, cy + sy, sz];
        });
        // 6 faces with indices
        const faces = [
          [0,1,2,3], [4,5,6,7], // bottom, top (z)
          [0,1,5,4], [2,3,7,6], // front, back (y)
          [0,3,7,4], [1,2,6,5], // left, right (x)
        ];
        // Sort faces by average depth (painter's algorithm)
        const facesWithDepth = faces.map(f => {
          const avgZ = f.reduce((s, i) => s + projected[i][2], 0) / 4;
          return { f, avgZ };
        });
        facesWithDepth.sort((a, b) => a.avgZ - b.avgZ);

        for (const { f } of facesWithDepth) {
          ctx.fillStyle = COLORS.detArea;
          ctx.strokeStyle = "rgba(225,112,85,0.5)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(projected[f[0]][0], projected[f[0]][1]);
          for (let k = 1; k < 4; k++) ctx.lineTo(projected[f[k]][0], projected[f[k]][1]);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }

        // Det label
        const detVal = mat3.det(effMatrix);
        const center = transformed.reduce((acc, v) => [acc[0]+v[0], acc[1]+v[1], acc[2]+v[2]], [0,0,0]).map(v => v/8);
        const [dcx, dcy] = proj(center[0], center[1], center[2]);
        ctx.fillStyle = detVal < 0 ? COLORS.nullSpace : COLORS.accent;
        ctx.font = "bold 11px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillText(`det=${detVal.toFixed(2)}`, dcx, dcy);
        ctx.textAlign = "start";
      }

      // ─── Eigenvectors ───
      if (showEigen) {
        const eigens = mat3.eigen(effMatrix);
        if (eigens.length === 0) {
          // Will show toast via state
        } else {
          for (const { value, vector } of eigens) {
            const scale = range * 0.8;
            const [sx1,sy1] = proj(-vector[0]*scale, -vector[1]*scale, -vector[2]*scale);
            const [sx2,sy2] = proj(vector[0]*scale, vector[1]*scale, vector[2]*scale);
            ctx.strokeStyle = COLORS.eigenGlow;
            ctx.lineWidth = 2.5;
            ctx.shadowColor = COLORS.eigenGlow;
            ctx.shadowBlur = 8;
            ctx.beginPath(); ctx.moveTo(sx1,sy1); ctx.lineTo(sx2,sy2); ctx.stroke();
            ctx.shadowBlur = 0;
            // Label
            const [lx, ly] = proj(vector[0]*scale*0.5, vector[1]*scale*0.5, vector[2]*scale*0.5);
            ctx.fillStyle = COLORS.eigenGlow;
            ctx.font = "bold 10px 'JetBrains Mono', monospace";
            ctx.fillText(`λ=${value.toFixed(2)}`, lx + 6, ly - 6);
          }
        }
      }

      // ─── Basis vectors (transformed î, ĵ, k̂) ───
      const drawArrow3D = (fx, fy, fz, tx, ty, tz, color, lw, label) => {
        const [sx1,sy1] = proj(fx,fy,fz);
        const [sx2,sy2] = proj(tx,ty,tz);
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(sx1,sy1); ctx.lineTo(sx2,sy2); ctx.stroke();
        // Arrowhead
        const dx = sx2-sx1, dy = sy2-sy1;
        const len = Math.sqrt(dx*dx+dy*dy);
        if (len > 5) {
          const ux = dx/len, uy = dy/len;
          const hl = 10, hw = 4;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(sx2, sy2);
          ctx.lineTo(sx2 - ux*hl + uy*hw, sy2 - uy*hl - ux*hw);
          ctx.lineTo(sx2 - ux*hl - uy*hw, sy2 - uy*hl + ux*hw);
          ctx.closePath(); ctx.fill();
        }
        if (label) {
          ctx.fillStyle = color;
          ctx.font = "bold 10px 'JetBrains Mono', monospace";
          ctx.fillText(label, sx2 + 6, sy2 - 6);
        }
      };

      // Basis vectors
      const iT = mat3.apply(effMatrix, [1,0,0]);
      const jT = mat3.apply(effMatrix, [0,1,0]);
      const kT = mat3.apply(effMatrix, [0,0,1]);
      drawArrow3D(0,0,0, iT[0],iT[1],iT[2], COLORS.iHat, 2.5, "î");
      drawArrow3D(0,0,0, jT[0],jT[1],jT[2], COLORS.jHat, 2.5, "ĵ");
      drawArrow3D(0,0,0, kT[0],kT[1],kT[2], COLORS.kHat, 2.5, "k̂");

      // ─── User vectors ───
      for (const v of vectors) {
        const tv = mat3.apply(effMatrix, [v.x, v.y, v.z]);
        drawArrow3D(0,0,0, tv[0],tv[1],tv[2], v.color, 2, v.label);
        // Coords tooltip at tip
        const [tipX, tipY] = proj(tv[0], tv[1], tv[2]);
        ctx.fillStyle = "rgba(200,210,230,0.6)";
        ctx.font = "9px 'JetBrains Mono', monospace";
        ctx.fillText(`(${tv[0].toFixed(1)},${tv[1].toFixed(1)},${tv[2].toFixed(1)})`, tipX + 14, tipY + 4);
      }

      // ─── Mat×Vec highlight ───
      if (matVecHighlight) {
        const { before, after } = matVecHighlight;
        // before (dashed)
        const [bx1,by1] = proj(0,0,0);
        const [bx2,by2] = proj(before[0],before[1],before[2]);
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.setLineDash([4,4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(bx1,by1); ctx.lineTo(bx2,by2); ctx.stroke();
        ctx.setLineDash([]);
        // after (solid)
        drawArrow3D(0,0,0, after[0],after[1],after[2], COLORS.matVecResult, 2.5, "결과");
      }

      // ─── Null space indicator ───
      {
        const d = mat3.det(effMatrix);
        if (Math.abs(d) < 1e-6) {
          // Find null space direction
          const inv = mat3.inv(effMatrix);
          if (!inv) {
            // Compute null space by finding a vector that maps to ~zero
            // Try cross product of transformed basis
            const cols = [[effMatrix[0],effMatrix[3],effMatrix[6]], [effMatrix[1],effMatrix[4],effMatrix[7]], [effMatrix[2],effMatrix[5],effMatrix[8]]];
            const candidates = [cross3(cols[0], cols[1]), cross3(cols[0], cols[2]), cross3(cols[1], cols[2])];
            let best = candidates[0], bestL = vec3Len(best);
            for (let k = 1; k < 3; k++) { const l = vec3Len(candidates[k]); if (l > bestL) { best = candidates[k]; bestL = l; } }
            if (bestL > 1e-10) {
              const nv = [best[0]/bestL, best[1]/bestL, best[2]/bestL];
              const sc = range * 0.8;
              const [nx1,ny1] = proj(-nv[0]*sc, -nv[1]*sc, -nv[2]*sc);
              const [nx2,ny2] = proj(nv[0]*sc, nv[1]*sc, nv[2]*sc);
              ctx.strokeStyle = COLORS.nullSpace;
              ctx.setLineDash([6,4]);
              ctx.lineWidth = 2;
              ctx.beginPath(); ctx.moveTo(nx1,ny1); ctx.lineTo(nx2,ny2); ctx.stroke();
              ctx.setLineDash([]);
              ctx.fillStyle = COLORS.nullSpace;
              ctx.font = "bold 9px 'JetBrains Mono', monospace";
              ctx.fillText("Null Space", nx2+4, ny2-4);
            }
          }
        }
      }
    };
    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [project3D, showDeterminant, showEigen, showRefGrid, vectors, matVecHighlight]);

  // ─── Canvas resize ───
  useEffect(() => {
    const el = canvasRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        setCanvasSize({ w: Math.round(width * devicePixelRatio), h: Math.round(height * devicePixelRatio) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ─── Mouse handlers ───
  const handleMouseDown = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (e.shiftKey) {
      dragRef.current = { type: "pan", startX: mx, startY: my, startPanX: cameraRef.current.panX, startPanY: cameraRef.current.panY };
    } else {
      dragRef.current = { type: "orbit", startX: mx, startY: my, startRotX: cameraRef.current.rotX, startRotY: cameraRef.current.rotY };
    }
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!dragRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const d = dragRef.current;
    if (d.type === "orbit") {
      setCamera(prev => ({
        ...prev,
        rotX: d.startRotX + (my - d.startY) * 0.4,
        rotY: d.startRotY + (mx - d.startX) * 0.4,
      }));
    } else if (d.type === "pan") {
      setCamera(prev => ({
        ...prev,
        panX: d.startPanX + (mx - d.startX) * devicePixelRatio,
        panY: d.startPanY + (my - d.startY) * devicePixelRatio,
      }));
    }
  }, []);

  const handleMouseUp = useCallback(() => { dragRef.current = null; }, []);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    setCamera(prev => ({
      ...prev,
      zoom: Math.max(10, Math.min(300, prev.zoom * (e.deltaY < 0 ? 1.1 : 0.9))),
    }));
  }, []);

  // ─── Timeline scrub ───
  const scrubTo = useCallback((pos) => {
    if (animRef.current.active) return;
    const target = getEffectiveMatrix(pos);
    const from = currentMatrixRef.current;
    setTimelinePos(pos);
    timelinePosRef.current = pos;
    animRef.current = { active: true, from, targetMatrix: target, start: performance.now(), duration: animSpeed, progress: 0 };
    setIsAnimating(true);
  }, [animSpeed, getEffectiveMatrix]);

  // ─── Compute cross for mat×mat ───
  const computeComp = useCallback(() => {
    const a = compMatA.map(Number), b = compMatB.map(Number);
    if (a.some(isNaN) || b.some(isNaN)) { showToast("유효한 행렬을 입력하세요"); return; }
    setCompResult(mat3.mul(a, b));
  }, [compMatA, compMatB, showToast]);

  // ─── Style helpers ───
  const btn = (active) => ({
    background: active ? "rgba(61,216,224,0.2)" : "rgba(60,70,100,0.5)",
    border: `1px solid ${active ? COLORS.accent : COLORS.panelBorder}`,
    borderRadius: 6, color: active ? COLORS.accent : COLORS.text,
    cursor: "pointer", fontSize: 10, padding: "4px 8px",
    transition: "all 0.15s",
  });
  const sBtn = (color) => ({
    background: `${color}22`, border: `1px solid ${color}55`, borderRadius: 4,
    color, cursor: "pointer", fontSize: 10, padding: "3px 7px",
  });
  const inp = (color) => ({
    background: "rgba(30,30,60,0.6)", border: `1px solid ${color || COLORS.panelBorder}`,
    borderRadius: 4, color: COLORS.text, fontSize: 11, padding: "3px 5px",
    outline: "none", fontFamily: "'JetBrains Mono', monospace",
  });

  const matGrid9 = (vals, setVals, readOnly) => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2 }}>
      {vals.map((v, i) => (
        <input key={i} value={readOnly ? (typeof v === "number" ? v.toFixed(2) : v) : v}
          readOnly={readOnly}
          onChange={readOnly ? undefined : (e => { const nv = [...vals]; nv[i] = e.target.value; setVals(nv); })}
          style={{ ...inp(i < 3 ? COLORS.iHat : i < 6 ? COLORS.jHat : COLORS.kHat), width: "100%", textAlign: "center", fontSize: 10 }} />
      ))}
    </div>
  );

  return (
    <div style={{ width: "100vw", height: "100vh", background: COLORS.bg, overflow: "hidden", position: "relative", fontFamily: "'JetBrains Mono', monospace" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;600;700&display=swap" rel="stylesheet" />

      <div style={{ position: "absolute", inset: 0 }}>
        <canvas ref={canvasRef} width={canvasSize.w} height={canvasSize.h}
          style={{ width: "100%", height: "100%", cursor: "grab" }}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onWheel={handleWheel} />
      </div>

      {/* Title */}
      <div style={{ position: "absolute", top: 14, left: 16, color: COLORS.text, pointerEvents: "none" }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1, color: COLORS.accent }}>선형대수학 3D 샌드박스</div>
        <div style={{ fontSize: 10, opacity: 0.5, marginTop: 2 }}>드래그: 회전 • Shift+드래그: 이동 • 스크롤: 확대/축소</div>
      </div>

      {/* Current Matrix 3×3 */}
      <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", ...PS, padding: "8px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ opacity: 0.6, fontSize: 10 }}>현재 행렬</span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "2px 6px", fontSize: 12, fontWeight: 600 }}>
          <span style={{ color: COLORS.iHat }}>{currentMatrix[0].toFixed(2)}</span>
          <span style={{ color: COLORS.jHat }}>{currentMatrix[1].toFixed(2)}</span>
          <span style={{ color: COLORS.kHat }}>{currentMatrix[2].toFixed(2)}</span>
          <span style={{ color: COLORS.iHat }}>{currentMatrix[3].toFixed(2)}</span>
          <span style={{ color: COLORS.jHat }}>{currentMatrix[4].toFixed(2)}</span>
          <span style={{ color: COLORS.kHat }}>{currentMatrix[5].toFixed(2)}</span>
          <span style={{ color: COLORS.iHat }}>{currentMatrix[6].toFixed(2)}</span>
          <span style={{ color: COLORS.jHat }}>{currentMatrix[7].toFixed(2)}</span>
          <span style={{ color: COLORS.kHat }}>{currentMatrix[8].toFixed(2)}</span>
        </div>
        <div style={{ borderLeft: `1px solid ${COLORS.panelBorder}`, paddingLeft: 10 }}>
          <span style={{ opacity: 0.6, fontSize: 10 }}>det = </span>
          <span style={{ color: mat3.det(currentMatrix) < 0 ? COLORS.nullSpace : COLORS.accent, fontWeight: 700 }}>{mat3.det(currentMatrix).toFixed(3)}</span>
        </div>
      </div>

      {/* ─── Toolbox ─── */}
      <div style={{ position: "absolute", top: 60, right: 12, width: toolboxOpen ? 280 : 36, ...PS, padding: toolboxOpen ? 12 : 6, transition: "width 0.3s", maxHeight: "calc(100vh - 140px)", overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: `${COLORS.panelBorder} transparent` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: toolboxOpen ? 8 : 0 }}>
          {toolboxOpen && <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.accent }}>도구상자 (3D)</span>}
          <button onClick={() => setToolboxOpen(!toolboxOpen)} style={{ ...btn(), padding: "2px 6px", fontSize: 10 }}>{toolboxOpen ? "◁" : "▷"}</button>
        </div>

        {toolboxOpen && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

            {/* ① 벡터 추가 (3D) */}
            <Sec title="① 벡터 추가 (3D)">
              <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                <span style={{ fontSize: 9, opacity: 0.6 }}>x:</span>
                <input value={vecInputX} onChange={e => setVecInputX(e.target.value)} style={{ ...inp(COLORS.iHat), width: 38 }} onKeyDown={e => e.key === "Enter" && addVectorFromInput()} />
                <span style={{ fontSize: 9, opacity: 0.6 }}>y:</span>
                <input value={vecInputY} onChange={e => setVecInputY(e.target.value)} style={{ ...inp(COLORS.jHat), width: 38 }} onKeyDown={e => e.key === "Enter" && addVectorFromInput()} />
                <span style={{ fontSize: 9, opacity: 0.6 }}>z:</span>
                <input value={vecInputZ} onChange={e => setVecInputZ(e.target.value)} style={{ ...inp(COLORS.kHat), width: 38 }} onKeyDown={e => e.key === "Enter" && addVectorFromInput()} />
                <button onClick={addVectorFromInput} style={{ ...btn(), padding: "4px 8px" }}>+</button>
              </div>
              <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 4 }}>
                {[["(1,0,0)",1,0,0],["(0,1,0)",0,1,0],["(0,0,1)",0,0,1],["(1,1,1)",1,1,1],["(1,-1,0)",1,-1,0]].map(([l,x,y,z]) => (
                  <button key={l} onClick={() => addVector(x, y, z)} style={{ ...sBtn("#888"), fontSize: 9, padding: "2px 5px" }}>{l}</button>
                ))}
              </div>
              {vectors.length > 0 && (
                <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                  {vectors.map(v => (
                    <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9 }}>
                      <span style={{ color: v.color, fontWeight: 700 }}>{v.label}</span>
                      <span style={{ opacity: 0.6 }}>({v.x},{v.y},{v.z})</span>
                      <button onClick={() => setVectors(prev => prev.filter(p => p.id !== v.id))} style={{ ...sBtn(COLORS.nullSpace), fontSize: 8, padding: "1px 4px", marginLeft: "auto" }}>x</button>
                    </div>
                  ))}
                </div>
              )}
              <Help>
{`벡터란? 원점에서 시작하는 화살표 (크기 + 방향)
1. x, y, z 좌표 입력 후 + 버튼
2. 프리셋 클릭으로 빠르게 추가
3. 변환 적용 시 벡터도 함께 변환됨
• î(시안) = x축, ĵ(노랑) = y축, k̂(파랑) = z축`}
              </Help>
            </Sec>

            {/* ② 선형 변환 (3D) */}
            <Sec title="② 선형 변환 (3D)">
              <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                {Object.entries(PRESETS_3D).map(([name, m]) => (
                  <button key={name} onClick={() => applyTransform(m, name)}
                    disabled={isAnimating}
                    style={{ ...sBtn(COLORS.accent), opacity: isAnimating ? 0.4 : 1, fontSize: 9, padding: "3px 6px" }}>{name}</button>
                ))}
              </div>
              <button onClick={() => setShowMatrixEditor(!showMatrixEditor)} style={{ ...btn(showMatrixEditor), marginTop: 4, width: "100%" }}>
                {showMatrixEditor ? "▼ 커스텀 행렬 닫기" : "▶ 커스텀 3×3 행렬"}
              </button>
              {showMatrixEditor && (
                <div style={{ marginTop: 4 }}>
                  {matGrid9(matInput, setMatInput)}
                  <button onClick={() => {
                    const m = matInput.map(Number);
                    if (m.some(isNaN)) { showToast("유효한 숫자를 입력하세요"); return; }
                    applyTransform(m, `사용자정의 ${fmtMat3(m)}`);
                  }} disabled={isAnimating} style={{ ...sBtn(COLORS.accent), marginTop: 4, width: "100%", opacity: isAnimating ? 0.4 : 1 }}>적용</button>
                </div>
              )}
              <Help>
{`선형 변환: 3×3 행렬로 3D 공간을 변환
• Rx/Ry/Rz: 각 축 기준 회전
• 스케일: 모든 방향 2배 확대
• 반사: 평면 기준 뒤집기
• 투영 (xy): z축을 0으로 (det=0)
• 커스텀: 원하는 3×3 행렬 직접 입력`}
              </Help>
            </Sec>

            {/* ③ 행렬 × 벡터 */}
            <Sec title="③ 행렬 × 벡터">
              <div style={{ fontSize: 9, opacity: 0.5, marginBottom: 4 }}>벡터 클릭 → 변환 전/후 표시</div>
              {vectors.map(v => (
                <button key={v.id} onClick={() => {
                  const before = [v.x, v.y, v.z];
                  const after = mat3.apply(currentMatrix, before);
                  setMatVecHighlight({ before, after });
                  showToast(`${v.label}: (${before.map(n=>n.toFixed(1))}) → (${after.map(n=>n.toFixed(1))})`);
                }} style={{ ...sBtn(v.color), fontSize: 9, marginBottom: 2, width: "100%" }}>
                  {v.label} ({v.x},{v.y},{v.z})
                </button>
              ))}
              {matVecHighlight && (
                <button onClick={() => setMatVecHighlight(null)} style={{ ...sBtn(COLORS.nullSpace), fontSize: 8, marginTop: 4 }}>하이라이트 제거</button>
              )}
            </Sec>

            {/* ④ 행렬 × 행렬 */}
            <Sec title="④ 행렬 × 행렬">
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 8, opacity: 0.5, marginBottom: 2 }}>A</div>
                  {matGrid9(compMatA, setCompMatA)}
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.6 }}>×</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 8, opacity: 0.5, marginBottom: 2 }}>B</div>
                  {matGrid9(compMatB, setCompMatB)}
                </div>
              </div>
              <button onClick={computeComp} style={{ ...sBtn(COLORS.accent), marginTop: 4, width: "100%" }}>= 계산</button>
              {compResult && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontSize: 9, opacity: 0.5, marginBottom: 2 }}>결과 A×B:</div>
                  {matGrid9(compResult, () => {}, true)}
                  <button onClick={() => {
                    const labelA = fmtMat3(compMatA.map(Number));
                    const labelB = fmtMat3(compMatB.map(Number));
                    applyTransform(compResult, `A${labelA} × B${labelB}`);
                  }} disabled={isAnimating} style={{ ...sBtn(COLORS.vecGreen), marginTop: 4, width: "100%", opacity: isAnimating ? 0.4 : 1 }}>캔버스에 적용</button>
                </div>
              )}
            </Sec>

            {/* ⑤ 변환 이력 */}
            <Sec title="⑤ 변환 이력">
              {transformHistory.length === 0 ? (
                <div style={{ fontSize: 9, opacity: 0.4 }}>아직 변환 없음</div>
              ) : (
                <>
                  <div style={{ maxHeight: 120, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
                    {transformHistory.map((m, i) => (
                      <div key={i} onClick={() => scrubTo(i + 1)}
                        style={{ fontSize: 9, padding: "3px 6px", borderRadius: 4, cursor: "pointer",
                          background: i < timelinePos ? "rgba(61,216,224,0.1)" : "transparent",
                          border: `1px solid ${i === timelinePos - 1 ? COLORS.accent : "transparent"}`,
                          color: i < timelinePos ? COLORS.text : "rgba(200,210,230,0.4)",
                        }}>
                        <span style={{ fontWeight: 600 }}>{i + 1}.</span>{" "}
                        <span>{transformMeta[i] || fmtMat3(m)}</span>
                        <span style={{ opacity: 0.4, marginLeft: 4 }}>det={mat3.det(m).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  {/* Scrubber */}
                  <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 8, opacity: 0.5 }}>0</span>
                    <input type="range" min={0} max={transformHistory.length} value={timelinePos}
                      onChange={e => scrubTo(Number(e.target.value))}
                      style={{ flex: 1, accentColor: COLORS.scrubber }} />
                    <span style={{ fontSize: 8, opacity: 0.5 }}>{transformHistory.length}</span>
                  </div>
                  {/* Speed */}
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                    <span style={{ fontSize: 8, opacity: 0.4 }}>속도</span>
                    <input type="range" min={200} max={3000} step={100} value={animSpeed}
                      onChange={e => setAnimSpeed(Number(e.target.value))}
                      style={{ flex: 1, accentColor: COLORS.accent }} />
                    <span style={{ fontSize: 8, opacity: 0.4 }}>{animSpeed}ms</span>
                  </div>
                </>
              )}
            </Sec>

            {/* ⑥ 격자 & 행렬식 */}
            <Sec title="⑥ 격자 & 행렬식">
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => setShowRefGrid(!showRefGrid)} style={btn(showRefGrid)}>참조 격자</button>
                <button onClick={() => setShowDeterminant(!showDeterminant)} style={btn(showDeterminant)}>det 부피</button>
              </div>
              <div style={{ fontSize: 9, opacity: 0.5, marginTop: 4 }}>
                det = {mat3.det(currentMatrix).toFixed(4)} {Math.abs(mat3.det(currentMatrix)) < 1e-6 ? "(특이 행렬!)" : ""}
              </div>
              <Help>
{`• 참조 격자: 변환 전 원래 좌표 격자
• det 부피: 단위 큐브가 변환 후 얼마나 커지는지
  - det > 0: 방향 보존
  - det < 0: 방향 반전 (거울상)
  - det = 0: 차원 축소 (부피 → 0)`}
              </Help>
            </Sec>

            {/* ⑦ 역변환 & 영공간 */}
            <Sec title="⑦ 역변환 & 영공간">
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={rewindLast} disabled={isAnimating || transformHistory.length === 0}
                  style={{ ...sBtn(COLORS.accent), opacity: isAnimating || transformHistory.length === 0 ? 0.4 : 1 }}>되감기</button>
                <button onClick={resetAll} style={sBtn(COLORS.nullSpace)}>리셋</button>
              </div>
              <Help>
{`• 되감기: 마지막 변환을 역변환으로 취소
  (det=0이면 정보 손실로 불가)
• 리셋: 모든 변환 초기화
• det≈0일 때 빨간 점선 = 영공간 방향`}
              </Help>
            </Sec>

            {/* ⑧ 고유벡터 (3D) */}
            <Sec title="⑧ 고유벡터 (3D)">
              <button onClick={() => {
                const eigens = mat3.eigen(currentMatrix);
                if (eigens.length === 0) showToast("실수 고유값 없음 (복소 고유값)");
                const isId = currentMatrix.every((v, i) => Math.abs(v - (i % 4 === 0 ? 1 : 0)) < 1e-8);
                if (isId) showToast("항등행렬: 모든 벡터가 고유벡터");
                setShowEigen(!showEigen);
              }} style={btn(showEigen)}>
                {showEigen ? "✓ 고유벡터 표시 중" : "고유벡터 표시"}
              </button>
              {showEigen && (() => {
                const eigens = mat3.eigen(currentMatrix);
                return eigens.length > 0 ? (
                  <div style={{ marginTop: 4, fontSize: 9 }}>
                    {eigens.map((e, i) => (
                      <div key={i} style={{ color: COLORS.eigenGlow, marginBottom: 2 }}>
                        λ{i+1} = {e.value.toFixed(3)} → ({e.vector.map(v=>v.toFixed(2)).join(", ")})
                      </div>
                    ))}
                  </div>
                ) : <div style={{ fontSize: 9, opacity: 0.5, marginTop: 4 }}>실수 고유값 없음</div>;
              })()}
              <Help>
{`고유벡터: 변환해도 방향이 안 바뀌는 벡터
• 금색 선 = 고유벡터 방향
• λ(람다) = 고유값 (얼마나 늘어나는지)
• 3D 회전의 고유벡터 = 회전축!
• 복소 고유값이면 실수 고유벡터 없음`}
              </Help>
            </Sec>

          </div>
        )}
      </div>

      {/* ─── Timeline bar ─── */}
      {transformHistory.length > 0 && (
        <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", ...PS, background: COLORS.timeline, padding: "8px 16px", display: "flex", alignItems: "center", gap: 10, minWidth: 300 }}>
          <span style={{ fontSize: 10, opacity: 0.5 }}>단계</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.accent }}>{timelinePos}</span>
          <span style={{ fontSize: 10, opacity: 0.3 }}>/ {transformHistory.length}</span>
          <input type="range" min={0} max={transformHistory.length} value={timelinePos}
            onChange={e => scrubTo(Number(e.target.value))}
            style={{ flex: 1, accentColor: COLORS.scrubber }} />
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          ...PS, borderRadius: 12, padding: "16px 24px", maxWidth: 400,
          fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
          color: COLORS.text, textAlign: "center", zIndex: 100,
          backdropFilter: "blur(12px)", animation: "toastIn 0.3s ease",
        }}>
          {toast}
          <div onClick={() => setToast(null)} style={{ marginTop: 10, fontSize: 10, color: COLORS.accent, cursor: "pointer", opacity: 0.7 }}>닫기</div>
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

// ─── Reusable section/help components (same pattern as 2D) ───
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
