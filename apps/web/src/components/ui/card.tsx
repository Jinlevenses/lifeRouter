import clsx from "clsx";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <section className={clsx("card p-4 sm:p-5", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  as: Tag = "h2",
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  as?: "h2" | "h3";
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Tag className="text-[15px] font-bold">{title}</Tag>
        {description ? <p className="mt-0.5 text-[13px] text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-1.5">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-bold tracking-tight sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-canvas/60 px-4 py-6 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description ? <p className="mx-auto mt-1 max-w-sm text-[13px] text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: "neutral" | "accent" | "warn" | "danger" | "info";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold",
        tone === "neutral" && "bg-canvas text-ink-muted",
        tone === "accent" && "bg-accent-soft text-accent-strong",
        tone === "warn" && "bg-warn-soft text-warn",
        tone === "danger" && "bg-danger-soft text-danger",
        tone === "info" && "bg-info-soft text-info",
        className,
      )}
    >
      {children}
    </span>
  );
}
