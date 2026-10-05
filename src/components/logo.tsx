const logoSizes = {
  default: {
    width: 42,
    height: 27,
    text: "text-[1.05rem]",
  },
  lg: {
    width: 56,
    height: 36,
    text: "text-xl",
  },
} as const;

export function LogoMark({
  width,
  height,
  className,
}: {
  width: number;
  height: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 128 80"
      width={width}
      height={height}
      aria-hidden="true"
      className={className}
    >
      <circle cx="22" cy="17" r="11" fill="var(--primary)" />
      <path
        d="M10 72C6 63 7 50 11 41c4-8 11-12 18-10 8 2 10 11 14 18 4 6 9 8 15 6l5-2 5 13-5 2c-13 6-25 1-32-7-1 7-7 12-14 13-3 0-5-1-7-2Z"
        fill="var(--primary)"
      />
      <circle cx="106" cy="17" r="11" fill="currentColor" />
      <path
        d="M118 72c4-9 3-22-1-31-4-8-11-12-18-10-8 2-10 11-14 18-4 6-9 8-15 6l-5-2-5 13 5 2c13 6 25 1 32-7 1 7 7 12 14 13 3 0 5-1 7-2Z"
        fill="currentColor"
      />
      <g transform="rotate(7 64 49)">
        <rect
          x="54"
          y="39"
          width="20"
          height="19"
          rx="5"
          fill="var(--primary)"
          stroke="currentColor"
          strokeWidth="3"
        />
        <circle cx="60" cy="46" r="2" fill="currentColor" />
        <path
          d="M65 45h5M59 51h11"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

export function Logo({
  className,
  size = "default",
}: {
  className?: string;
  size?: keyof typeof logoSizes;
}) {
  const dimensions = logoSizes[size];

  return (
    <span className={className}>
      <LogoMark
        width={dimensions.width}
        height={dimensions.height}
        className="shrink-0"
      />
      <span
        className={`font-[family-name:var(--font-geist-sans)] ${dimensions.text} font-semibold tracking-[-0.04em]`}
      >
        Passoff
      </span>
    </span>
  );
}
