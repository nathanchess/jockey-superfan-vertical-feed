type LogoProps = {
  className?: string;
};

/** TwelveLabs wordmark + mark from strand/assets (light on dark UI). */
export function LogoFull({ className = "h-6 w-auto" }: LogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/strand/assets/logo-full.svg"
      alt="TwelveLabs"
      className={`strand-logo ${className}`}
    />
  );
}

/** TwelveLabs mark only — used when sidebar is collapsed. */
export function LogoMark({ className = "h-8 w-auto" }: LogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/strand/assets/logo-mark.svg"
      alt="TwelveLabs"
      className={`strand-logo ${className}`}
    />
  );
}
