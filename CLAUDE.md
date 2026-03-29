# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server (Vite, hot reload)
npm run build     # Production build → dist/
npm run preview   # Preview production build locally
npm run lint      # ESLint check
```

No test suite exists.

## Architecture

선형대수학 샌드박스 — an interactive 2D linear algebra visualization. Single JSX file, Korean UI, no routing, no backend, no external math libraries.

**Entry flow:** `index.html` → `src/main.jsx` → `src/App.jsx` → `src/linear-algebra-sandbox.jsx`

Everything meaningful lives in [src/linear-algebra-sandbox.jsx](src/linear-algebra-sandbox.jsx) (~1491 lines).

---

## Core Architectural Patterns

### 1. Dual ref pattern (state + ref mirrors)

Canvas render loop reads from refs, not state (to avoid stale closures in rAF). Most state that `render()` needs is mirrored:

```js
const [transformHistory, setTransformHistory] = useState([]);
const transformHistoryRef = useRef(transformHistory);
transformHistoryRef.current = transformHistory;
```

When modifying these values, always update **both** the state setter AND the `.current` on the ref.

### 2. Always-running rAF render loop

A `requestAnimationFrame` loop runs every frame regardless of animation state. During animation, the loop lerps `animRef.current.from → targetMatrix` with easing, writing the result into `currentMatrixRef.current`. When done, commits to `setCurrentMatrix`. Auto-play chains the next step with a 200ms delay.

### 3. Transform history + parallel metadata

Two parallel arrays:
- `transformHistory`: array of `[a,b,c,d]` matrices applied so far
- `transformMeta`: array of display labels (preset Korean name, `"사용자정의 [...]"`, or `"A[...] × B[...]"`)

`timelinePos` (0 to `history.length`) is the scrubber position. `getEffectiveMatrix(pos)` recomputes the cumulative matrix by multiplying entries up to `pos`.

### 4. Coordinate system

Camera `{ x, y, zoom }` — `zoom` = pixels per world unit (default 60, range 10–300). Origin at canvas center. Y axis flipped (world y-up = canvas y-down). Vector dragging applies `mat2.inv(currentMatrix)` to map back to pre-transform space (0.5-unit snapping).

---

## Toolbox Sections (① through ⑪)

Right-side collapsible panel, 11 `<Sec>` sections:

| # | Title | Function |
|---|-------|----------|
| ① | 벡터 추가 | Add user vectors by coords or presets; drag arrow tips |
| ② | 선형 변환 | 10 preset matrices + custom 2×2 input |
| ③ | 행렬 × 벡터 | Click vector → canvas shows before/after highlight |
| ④ | 행렬 × 행렬 | Compute A×B, optionally apply to canvas |
| ⑤ | 변환 이력 | History list, highlighted by `timelinePos` |
| ⑥ | 격자 & 행렬식 | Toggle reference grid and det area shading |
| ⑦ | 역변환 & 영공간 | Rewind (checks det≠0), reset; null space dashed line |
| ⑧ | 내적 & 쌍대성 | Dot product projection onto selected base vector |
| ⑨ | 외적 (3D) | Cross product: select 2 vectors → 3D SVG overlay (DOM, not canvas) |
| ⑩ | 고유벡터 | Eigenvalue/eigenvector overlay (gold); warns on identity |
| ⑪ | 기저 변환 | Alt basis grid with custom b₁, b₂; shows alt coords on vectors |

---

## Key Edge Cases

- **Rewind on det=0**: `rewindLast` checks `|det(lastTransform)| < 1e-10` and shows a toast instead of animating (information lost, no inverse)
- **Eigenvectors on identity**: toast warns it's meaningless (every vector is an eigenvector). For complex eigenvalues (pure rotation), `mat2.eigen` returns `[]` → UI shows "실수 고유값 없음"
- **Vector drag through singular matrix**: if `mat2.inv` returns `null`, falls back to screen-world space directly
- **Adaptive grid**: `gridStep` switches between 0.5–100 based on zoom; transformed grid lines capped at 200 to prevent perf issues

---

## Matrix format

`[a, b, c, d]` = row-major `[[a,b],[c,d]]`. Display format: `[a,b ; c,d]`. All operations in the `mat2` object at the top of the file.
