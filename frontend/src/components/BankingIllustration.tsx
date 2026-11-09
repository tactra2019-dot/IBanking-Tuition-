export function BankingIllustration({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <svg
      className={`banking-art ${compact ? "compact" : ""}`}
      viewBox="0 0 540 390"
      role="img"
      aria-label="Minh họa máy tính thanh toán học phí, sách và mũ tốt nghiệp"
    >
      <defs>
        <linearGradient id="screen" x2="0.9" y2="1">
          <stop stopColor="#168ffc" />
          <stop offset="1" stopColor="#0754c9" />
        </linearGradient>
        <linearGradient id="metal" x2="1" y2="1">
          <stop stopColor="#e5f8ff" />
          <stop offset="1" stopColor="#82c5f7" />
        </linearGradient>
        <linearGradient id="cap" x2="1" y2="1">
          <stop stopColor="#16c8f3" />
          <stop offset="1" stopColor="#0754c9" />
        </linearGradient>
        <filter id="shadow">
          <feDropShadow
            dx="0"
            dy="12"
            stdDeviation="9"
            floodColor="#0754c9"
            floodOpacity=".17"
          />
        </filter>
      </defs>
      <ellipse
        cx="280"
        cy="352"
        rx="228"
        ry="23"
        fill="#80c9fb"
        opacity=".18"
      />
      <g opacity=".45" fill="#bfE5fb">
        <path d="M264 117h231v136H264z" />
        <path d="M245 116l132-81 135 81z" />
        <path d="M368 21h4v29h-4z" />
        <path d="M372 22q18-14 35 0v22q-17-14-35 0z" />
        {[280, 325, 370, 415, 460].map((x) => (
          <rect key={x} x={x} y="140" width="17" height="94" fill="#f1faff" />
        ))}
        <circle cx="377" cy="89" r="16" fill="#f1faff" />
      </g>
      <g transform="translate(92 124)">
        <path d="M39 142Q5 45 28 0q46 43 11 142" fill="#68d6ae" />
        <path d="M40 150Q-31 105-20 58q61 1 60 92" fill="#9ce9d0" />
        <path d="M40 150q2-85 61-105 4 69-61 105" fill="#36bf9b" />
        <path d="M39 160V34" stroke="#31a98e" strokeWidth="3" />
      </g>
      <g filter="url(#shadow)">
        <path d="M73 287l128-20 50 29-129 22z" fill="#0877df" />
        <path d="M77 291v20l45 22 123-20v-18l-123 21z" fill="#e8f7ff" />
        <path
          d="M73 313l49 23 126-21"
          fill="none"
          stroke="#0754c9"
          strokeWidth="5"
        />
        <path d="M83 260l119-19 43 27-123 21z" fill="#69c7fa" />
        <path d="M87 264v19l35 19 119-20v-16l-119 21z" fill="white" />
        <path d="M93 238v26q38 28 74 2v-25z" fill="#083e9d" />
        <path d="M49 228l88-29 83 29-83 30z" fill="url(#cap)" />
        <path
          d="M137 228l49 13v37"
          fill="none"
          stroke="#ffd459"
          strokeWidth="4"
        />
        <path d="M180 276h12l4 21h-20z" fill="#ffc13c" />
      </g>
      <g filter="url(#shadow)">
        <path
          d="M231 129q1-13 15-12l229 27q15 2 12 17l-32 154-248-37z"
          fill="#083e9d"
        />
        <path d="M244 130l230 28-28 137-227-31z" fill="url(#screen)" />
        <path
          d="M207 278l248 37 51 29q8 9-7 13l-277-40-75-27z"
          fill="url(#metal)"
        />
        <path d="M225 286l217 31 26 15-224-31z" fill="#478dd7" />
        <path d="M286 312l54 8 17 9-59-9z" fill="#add9fa" />
        <path d="M222 318l278 39" stroke="#6fb0ea" strokeWidth="4" />
        <rect
          x="266"
          y="176"
          width="162"
          height="82"
          rx="10"
          fill="#f8fdff"
          transform="rotate(7 266 176)"
        />
        <path d="M280 166l20-10 20 14-22 8z" fill="#d3f5ff" />
        <path d="M287 173v10l12 6 13-3v-9" fill="#fff" />
        <path
          d="M333 169l91 12"
          stroke="#e7faff"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <path
          d="M284 201l103 13M280 217l70 9M277 232l80 10"
          stroke="#c4e5fa"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <circle cx="404" cy="246" r="18" fill="#21c58c" />
        <path
          d="M396 245l6 7 12-13"
          stroke="white"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <g fill="#ffcd4f" stroke="#e9a921" strokeWidth="2">
        {[334, 326, 318].map((y) => (
          <g key={y}>
            <path d={`M66 ${y}v8c0 12 47 12 47 0v-8z`} />
            <ellipse cx="89.5" cy={y} rx="23.5" ry="8" />
          </g>
        ))}
        <ellipse cx="130" cy="344" rx="23" ry="8" />
        <path d="M107 344v8c0 12 46 12 46 0v-8" />
      </g>
    </svg>
  );
}
