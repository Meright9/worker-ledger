export default function Scenery() {
  return (
    <div className="scenery" aria-hidden="true">
      <svg viewBox="0 0 1440 600" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="mtnFar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#C9DAE4" />
            <stop offset="1" stopColor="#AFC9DA" />
          </linearGradient>
          <linearGradient id="mtnMid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#9CC2A6" />
            <stop offset="1" stopColor="#7FA98C" />
          </linearGradient>
          <linearGradient id="mtnNear" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5E8C72" />
            <stop offset="1" stopColor="#456A56" />
          </linearGradient>
          <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#F3D58A" stopOpacity="0.95" />
            <stop offset="60%" stopColor="#FBF1D8" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#FBF1D8" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="1140" cy="120" r="120" fill="url(#sunGlow)" />
        <circle cx="1140" cy="120" r="46" fill="#F3D58A" />
        <g className="cloud" opacity="0.75">
          <ellipse cx="360" cy="150" rx="120" ry="26" fill="#FFFDF9" />
          <ellipse cx="470" cy="138" rx="80" ry="22" fill="#FFFDF9" />
        </g>
        <g className="cloud b" opacity="0.6">
          <ellipse cx="900" cy="96" rx="100" ry="22" fill="#FFFDF9" />
        </g>
        <path d="M0 360 L150 250 L320 340 L520 210 L720 330 L940 240 L1160 350 L1440 270 L1440 600 L0 600 Z" fill="url(#mtnFar)" opacity="0.55" />
        <path d="M0 430 L200 320 L420 410 L640 300 L880 420 L1120 330 L1440 430 L1440 600 L0 600 Z" fill="url(#mtnMid)" opacity="0.62" />
        <path d="M0 520 L260 430 L540 510 L820 420 L1120 520 L1440 470 L1440 600 L0 600 Z" fill="url(#mtnNear)" opacity="0.7" />
        <path d="M0 560 q180 -34 360 0 t360 0 t360 0 t360 0 V600 H0 Z" fill="#FBF6EE" opacity="0.55" />
      </svg>
    </div>
  )
}
