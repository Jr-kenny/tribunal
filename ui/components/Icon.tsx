import {
  Gavel,
  Wallet,
  ArrowRight,
  ArrowLeft,
  Github,
  FileBadge2,
  Banknote,
  Landmark,
  LineChart,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Play,
  Loader2,
  ExternalLink,
  Check,
  X,
  HelpCircle,
  Search,
  ShieldAlert,
  RefreshCw,
  Plus,
  type LucideIcon,
} from "lucide-react";

const MAP: Record<string, LucideIcon> = {
  gavel: Gavel,
  wallet: Wallet,
  "arrow-right": ArrowRight,
  "arrow-left": ArrowLeft,
  github: Github,
  "file-certificate": FileBadge2,
  "shield-dollar": Banknote,
  "building-bank": Landmark,
  "chart-line": LineChart,
  "alert-triangle": AlertTriangle,
  "arrow-up": ArrowUp,
  "arrow-down": ArrowDown,
  play: Play,
  loader: Loader2,
  "external-link": ExternalLink,
  check: Check,
  x: X,
  help: HelpCircle,
  search: Search,
  "shield-alert": ShieldAlert,
  refresh: RefreshCw,
  plus: Plus,
};

export function Icon({
  name,
  size = 18,
  className,
  color,
  strokeWidth = 2,
}: {
  name: string;
  size?: number;
  className?: string;
  color?: string;
  strokeWidth?: number;
}) {
  const Cmp = MAP[name] ?? HelpCircle;
  return <Cmp size={size} className={className} color={color} strokeWidth={strokeWidth} aria-hidden />;
}
