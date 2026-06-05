type StrandIconProps = {
  name: string;
  className?: string;
  label?: string;
};

/** Strand icon via CSS mask — SVGs use currentColor in source. */
export function StrandIcon({ name, className = "h-4 w-4", label }: StrandIconProps) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`inline-block shrink-0 bg-current ${className}`}
      style={{
        maskImage: `url(/strand/icons/${name}.svg)`,
        WebkitMaskImage: `url(/strand/icons/${name}.svg)`,
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
        maskSize: "contain",
        WebkitMaskSize: "contain",
      }}
    />
  );
}
