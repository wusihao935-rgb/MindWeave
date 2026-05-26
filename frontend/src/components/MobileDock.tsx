import { BookOpen, Home, Layers3, Network, PlusCircle, Settings } from "lucide-react";
import type { ViewKey } from "../types";

interface MobileDockProps {
  view: ViewKey;
  onViewChange: (view: ViewKey) => void;
}

const mobileItems = [
  { key: "home", label: "首页", icon: Home },
  { key: "graph", label: "图谱", icon: Network },
  { key: "library", label: "资料", icon: BookOpen },
  { key: "cards", label: "复习", icon: Layers3 },
  { key: "settings", label: "设置", icon: Settings }
] as const;

export function MobileDock({ view, onViewChange }: MobileDockProps) {
  return (
    <nav className="mobile-dock" aria-label="移动端主导航">
      {mobileItems.map((item) => {
        const Icon = item.icon;
        return (
          <button key={item.key} className={view === item.key ? "active" : ""} type="button" onClick={() => onViewChange(item.key)}>
            <Icon size={20} />
            <span>{item.label}</span>
          </button>
        );
      })}
      <button className="capture-action" type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
        <PlusCircle size={22} />
        <span>导入</span>
      </button>
    </nav>
  );
}
