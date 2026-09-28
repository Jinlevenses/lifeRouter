import { forwardRef } from "react";
import clsx from "clsx";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "icon";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-strong",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-canvas",
  ghost: "text-ink-muted hover:bg-canvas hover:text-ink",
  subtle: "bg-accent-soft text-accent-strong hover:bg-[#d5ece8]",
  danger: "bg-danger text-white hover:bg-[#912018]",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-2.5 text-[13px] gap-1.5",
  md: "h-10 px-3.5 text-[15px] gap-2",
  icon: "size-9 justify-center",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={clsx(
        "inline-flex shrink-0 items-center rounded-[10px] font-semibold transition-colors disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
});
