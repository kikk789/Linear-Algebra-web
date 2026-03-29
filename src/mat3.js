// ─── 3×3 Matrix utilities ───
// Format: [a,b,c, d,e,f, g,h,i] = row-major [[a,b,c],[d,e,f],[g,h,i]]
const mat3 = {
  identity: () => [1,0,0, 0,1,0, 0,0,1],

  mul: (a, b) => [
    a[0]*b[0]+a[1]*b[3]+a[2]*b[6], a[0]*b[1]+a[1]*b[4]+a[2]*b[7], a[0]*b[2]+a[1]*b[5]+a[2]*b[8],
    a[3]*b[0]+a[4]*b[3]+a[5]*b[6], a[3]*b[1]+a[4]*b[4]+a[5]*b[7], a[3]*b[2]+a[4]*b[5]+a[5]*b[8],
    a[6]*b[0]+a[7]*b[3]+a[8]*b[6], a[6]*b[1]+a[7]*b[4]+a[8]*b[7], a[6]*b[2]+a[7]*b[5]+a[8]*b[8],
  ],

  apply: (m, v) => [
    m[0]*v[0]+m[1]*v[1]+m[2]*v[2],
    m[3]*v[0]+m[4]*v[1]+m[5]*v[2],
    m[6]*v[0]+m[7]*v[1]+m[8]*v[2],
  ],

  det: (m) =>
    m[0]*(m[4]*m[8]-m[5]*m[7])
    - m[1]*(m[3]*m[8]-m[5]*m[6])
    + m[2]*(m[3]*m[7]-m[4]*m[6]),

  inv: (m) => {
    const d = mat3.det(m);
    if (Math.abs(d) < 1e-10) return null;
    const id = 1 / d;
    return [
      (m[4]*m[8]-m[5]*m[7])*id, (m[2]*m[7]-m[1]*m[8])*id, (m[1]*m[5]-m[2]*m[4])*id,
      (m[5]*m[6]-m[3]*m[8])*id, (m[0]*m[8]-m[2]*m[6])*id, (m[2]*m[3]-m[0]*m[5])*id,
      (m[3]*m[7]-m[4]*m[6])*id, (m[1]*m[6]-m[0]*m[7])*id, (m[0]*m[4]-m[1]*m[3])*id,
    ];
  },

  transpose: (m) => [m[0],m[3],m[6], m[1],m[4],m[7], m[2],m[5],m[8]],

  lerp: (a, b, t) => a.map((v, i) => v + (b[i] - v) * t),

  // Axis rotation matrices
  rotX: (angle) => {
    const c = Math.cos(angle), s = Math.sin(angle);
    return [1,0,0, 0,c,-s, 0,s,c];
  },
  rotY: (angle) => {
    const c = Math.cos(angle), s = Math.sin(angle);
    return [c,0,s, 0,1,0, -s,0,c];
  },
  rotZ: (angle) => {
    const c = Math.cos(angle), s = Math.sin(angle);
    return [c,-s,0, s,c,0, 0,0,1];
  },

  // Eigenvalue/eigenvector for 3×3 real matrix
  // Returns array of { value, vector } for real eigenvalues only
  eigen: (m) => {
    const [a,b,c, d,e,f, g,h,i] = m;
    // Characteristic polynomial: -λ³ + pλ² + qλ + r = 0
    // Or λ³ - pλ² - qλ - r = 0 where:
    const p = a + e + i; // trace
    const q = b*d + c*g + f*h - a*e - a*i - e*i; // -(sum of 2x2 minors on diagonal)
    const r = mat3.det(m);
    // Solve λ³ - pλ² - qλ - r = 0  using Cardano / trigonometric method
    // Rewrite as t³ + pt' + q' = 0  via substitution λ = t + p/3
    const p3 = p / 3;
    const A = q + p * p / 3;       // coefficient of t
    const B = r + (2*p*p*p)/27 + (p*q)/3; // constant term
    // t³ + At + B = 0
    const disc = -(4*A*A*A + 27*B*B);
    const eigenvalues = [];

    if (disc > 1e-10) {
      // Three distinct real roots — trigonometric solution
      const sqrtNegA3 = Math.sqrt(-A / 3);
      const theta = Math.acos((-3*B) / (2*A * sqrtNegA3)) / 3;
      const two_sqrt = 2 * sqrtNegA3;
      eigenvalues.push(two_sqrt * Math.cos(theta) + p3);
      eigenvalues.push(two_sqrt * Math.cos(theta - 2*Math.PI/3) + p3);
      eigenvalues.push(two_sqrt * Math.cos(theta - 4*Math.PI/3) + p3);
    } else if (disc > -1e-10) {
      // Repeated root
      if (Math.abs(A) < 1e-10) {
        eigenvalues.push(p3);
      } else {
        const u = 3*B / (2*A);
        eigenvalues.push(2*u + p3);
        eigenvalues.push(-u + p3);
      }
    } else {
      // One real root, two complex conjugates
      const sqrtDisc27 = Math.sqrt(-disc / 27);
      const half = -B / 2;
      const u = Math.cbrt(half + sqrtDisc27);
      const v = Math.cbrt(half - sqrtDisc27);
      eigenvalues.push(u + v + p3);
    }

    // Deduplicate
    const unique = [];
    for (const ev of eigenvalues) {
      if (!unique.some(u => Math.abs(u - ev) < 1e-8)) unique.push(ev);
    }

    // For each eigenvalue, find eigenvector by solving (M - λI)v = 0
    const results = [];
    for (const lam of unique) {
      const M = [a-lam,b,c, d,e-lam,f, g,h,i-lam];
      // Use cross product of two rows to find null space direction
      const r0 = [M[0],M[1],M[2]], r1 = [M[3],M[4],M[5]], r2 = [M[6],M[7],M[8]];
      const crosses = [
        cross3(r0, r1),
        cross3(r0, r2),
        cross3(r1, r2),
      ];
      // Pick the cross product with largest magnitude
      let best = crosses[0], bestLen = vec3Len(best);
      for (let k = 1; k < 3; k++) {
        const l = vec3Len(crosses[k]);
        if (l > bestLen) { best = crosses[k]; bestLen = l; }
      }
      if (bestLen > 1e-10) {
        const inv = 1 / bestLen;
        results.push({ value: lam, vector: [best[0]*inv, best[1]*inv, best[2]*inv] });
      } else {
        // Degenerate — try coordinate axes
        results.push({ value: lam, vector: [1, 0, 0] });
      }
    }
    return results;
  },
};

function cross3(a, b) {
  return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
}

function vec3Len(v) {
  return Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);
}

export default mat3;
export { cross3, vec3Len };
