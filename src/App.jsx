import { useState, lazy, Suspense } from 'react'
import LinearAlgebraSandbox from './linear-algebra-sandbox'

const LinearAlgebraSandbox3D = lazy(() => import('./linear-algebra-sandbox-3d'))

function App() {
  const [mode, setMode] = useState("2d");

  return (
    <>
      {/* Mode toggle */}
      <button onClick={() => setMode(mode === "2d" ? "3d" : "2d")} style={{
        position: "fixed", top: 14, right: mode === "2d" ? 270 : 300, zIndex: 9999,
        background: "rgba(20,20,45,0.92)", border: "1px solid rgba(100,120,180,0.3)",
        borderRadius: 8, padding: "6px 14px", cursor: "pointer",
        color: "#3dd8e0", fontSize: 12, fontWeight: 700,
        fontFamily: "'JetBrains Mono', monospace",
        backdropFilter: "blur(12px)", transition: "right 0.3s",
      }}>
        {mode === "2d" ? "3D 모드 →" : "← 2D 모드"}
      </button>

      {mode === "2d" ? (
        <LinearAlgebraSandbox />
      ) : (
        <Suspense fallback={
          <div style={{ width: "100vw", height: "100vh", background: "#1a1a2e", display: "flex", alignItems: "center", justifyContent: "center", color: "#3dd8e0", fontFamily: "'JetBrains Mono', monospace" }}>
            3D 모드 로딩 중...
          </div>
        }>
          <LinearAlgebraSandbox3D />
        </Suspense>
      )}
    </>
  );
}

export default App
