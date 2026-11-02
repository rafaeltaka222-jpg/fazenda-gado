export default function BullLogo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
      role="img"
      aria-label="Fazenda Gado Logo"
    >
      {/* Chifre Esquerdo */}
      <path
        d="M5 9C4 3 10 3 13 8L14 10"
        stroke="#10b981"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Chifre Direito */}
      <path
        d="M27 9C28 3 22 3 19 8L18 10"
        stroke="#10b981"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Cabeça / Escudo Frontal */}
      <path
        d="M13 8H19L22 14C22 20.5 16 26 16 26C16 26 10 20.5 10 14L13 8Z"
        fill="rgba(16, 185, 129, 0.16)"
        stroke="#34d399"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Olhos */}
      <circle cx="13.5" cy="14.5" r="1.4" fill="#10b981" />
      <circle cx="18.5" cy="14.5" r="1.4" fill="#10b981" />
      {/* Focinho */}
      <path
        d="M13.5 19.5C14.5 20.5 17.5 20.5 18.5 19.5"
        stroke="#10b981"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
