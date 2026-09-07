export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <img
      src="/brand/passoff-mark-128.png"
      alt=""
      width={size}
      height={size}
      className="rounded-md"
      decoding="async"
    />
  );
}
