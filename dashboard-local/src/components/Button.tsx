export enum ButtonVariant {
  Ghost = "ghost",
  Subtle = "subtle",
  Pill = "pill",
}

export enum ButtonSize {
  XS = "xs",
  SM = "sm",
}

const sizeClasses: Record<ButtonSize, string> = {
  [ButtonSize.XS]: "text-[10px] px-1.5 py-0.5",
  [ButtonSize.SM]: "text-[11px] px-2 py-0.5",
};

const variantClasses: Record<ButtonVariant, string> = {
  [ButtonVariant.Ghost]: "bg-transparent text-dim hover:text-text",
  [ButtonVariant.Subtle]: "bg-border/50 text-text hover:bg-border rounded",
  [ButtonVariant.Pill]: "bg-transparent text-dim hover:text-text hover:bg-white/[0.05] rounded",
};

export function Button({
  children,
  onClick,
  disabled,
  className = "",
  variant = ButtonVariant.Ghost,
  size = ButtonSize.SM,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  title?: string;
}) {
  const base = "border-none cursor-pointer font-sans disabled:opacity-30 disabled:cursor-default";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
