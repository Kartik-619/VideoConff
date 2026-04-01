import { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "outline" | "destructive";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  full?: boolean;
}

export default function Button({
  variant = "primary",
  full = false,
  className = "",
  ...props
}: Props) {
  const base =
    "rounded-xl px-5 py-3 text-sm font-semibold transition-all duration-200";

  const variants: Record<Variant, string> = {
    primary:
      "bg-gradient-to-r from-cyan-500 to-indigo-600 text-white hover:opacity-90",
    secondary:
      "bg-slate-800 text-slate-200 hover:bg-slate-700",
    outline:
      "border border-slate-600 text-slate-300 hover:bg-slate-800",
    destructive:
      "bg-red-600 text-white hover:bg-red-700",
  };

  return (
    <button
      {...props}
      className={`${base} ${variants[variant]} ${
        full ? "w-full" : ""
      } ${className}`}
    />
  );
}