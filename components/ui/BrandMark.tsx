type Props = { className?: string }

/**
 * One receipt, divided by a G-shaped cut. The mark is deliberately drawn in
 * code rather than baked into an image: it remains crisp in a 16px favicon
 * and lets the app palette control the identity in every context.
 */
export function BrandMark({ className }: Props) {
  return (
    <svg
      className={className}
      // Cropped to the drawing (x/y 7–57). The full 0–64 box left ~11% empty
      // on every side, so the mark read small and sat far from the wordmark.
      viewBox="6.5 6.5 51 51"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="var(--primary)"
        d="M12 7h40a5 5 0 0 1 5 5v40l-7 5-6-5-6 5-6-5-6 5-6-5-7 5V12a5 5 0 0 1 5-5Z"
      />
      <path
        d="M41 20a14 14 0 1 0 1 21"
        stroke="var(--bg)"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path d="M38 35h12v10" stroke="var(--bg)" strokeWidth="6" strokeLinecap="round" />
      <path d="M17 18h12M17 25h9" stroke="var(--success)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
