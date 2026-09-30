import { cn } from "@/lib/utils";
import { Badge as UiBadge } from "@/components/ui/badge";
import {
  Card as UiCard,
  CardAction,
  CardDescription,
  CardHeader as UiCardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

/**
 * LifeRoute section card on the shadcn/ui Card: compact padding, children follow the header.
 * A labelled card is a landmark region, as the former <section> was.
 */
export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <UiCard
      role={props["aria-labelledby"] || props["aria-label"] ? "region" : undefined}
      className={cn("gap-3 px-4 py-4 shadow-xs sm:px-5 sm:py-5", className)}
      {...props}
    />
  );
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
    <UiCardHeader className="gap-1 px-0">
      <CardTitle>
        <Tag className="text-[15px] leading-snug font-semibold">{title}</Tag>
      </CardTitle>
      {description ? <CardDescription className="text-[13px]">{description}</CardDescription> : null}
      {action ? <CardAction className="flex items-center gap-1.5">{action}</CardAction> : null}
    </UiCardHeader>
  );
}

export function PageHeader({
  title,
  eyebrow,
  description,
  action,
}: {
  title: string;
  eyebrow?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? <p className="text-sm font-semibold text-primary">{eyebrow}</p> : null}
        <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <Empty className="gap-3 border border-dashed bg-muted/40 p-5 md:p-6">
      <EmptyHeader className="gap-1">
        {icon ? <div className="mb-1 text-muted-foreground [&_svg]:size-5">{icon}</div> : null}
        <EmptyTitle className="text-sm font-semibold">{title}</EmptyTitle>
        {description ? <EmptyDescription className="text-[13px]">{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

const TONES = {
  neutral: "bg-secondary text-muted-foreground",
  accent: "bg-primary/10 text-primary",
  warn: "bg-warning/10 text-warning",
  danger: "bg-destructive/10 text-destructive",
  info: "bg-info/10 text-info",
} as const;

/** Status label on the shadcn/ui Badge with LifeRoute tones. */
export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: keyof typeof TONES;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <UiBadge variant="secondary" className={cn("font-semibold", TONES[tone], className)}>
      {children}
    </UiBadge>
  );
}
