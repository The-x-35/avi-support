import { cn } from "@/lib/utils/cn";

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function Header({ title, subtitle, actions, className }: HeaderProps) {
  return (
    <div
      className={cn(
        "h-14 flex items-center justify-between px-6 border-b border-gray-100 bg-white shrink-0",
        className
      )}
    >
      <div>
        <h1 className="text-[15px] font-semibold text-gray-900">{title}</h1>
        {subtitle && (
          <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
