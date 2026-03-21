/**
 * QuotifySidebar.jsx — Shared Component
 * Quotify design system sidebar with QUOTIFY branding
 *
 * Props:
 *   activeItem — label string of the active nav item (e.g. "Clients")
 */

import {
  LayoutDashboard,
  FileText,
  Users,
  TrendingUp,
  BarChart2,
  Settings,
} from 'lucide-react';

const sidebarNav = [
  {
    section: null,
    items: [
      { icon: LayoutDashboard, label: 'Dashboard' },
      { icon: FileText, label: 'Quotations' },
      { icon: Users, label: 'Clients' },
    ],
  },
  {
    section: 'ANALYTICS',
    items: [
      { icon: TrendingUp, label: 'Pipeline' },
      { icon: BarChart2, label: 'Reports' },
      { icon: Settings, label: 'Settings' },
    ],
  },
];

export default function QuotifySidebar({ activeItem }) {
  return (
    <aside className="w-[280px] shrink-0 bg-sidebar flex flex-col border-r border-sidebar-border overflow-hidden">
      {/* Logo */}
      <div className="flex items-center gap-2 h-[88px] px-8 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded bg-primary" />
        <span className="font-primary text-[18px] font-bold text-primary">
          QUOTIFY
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {sidebarNav.map((group, gi) => (
          <div key={gi}>
            {group.section && (
              <div className="px-4 pt-4 pb-2">
                <span className="font-primary text-[14px] text-sidebar-foreground">
                  {group.section}
                </span>
              </div>
            )}
            {group.items.map((item) => {
              const isActive = item.label === activeItem;
              return (
                <div
                  key={item.label}
                  className={`flex items-center gap-4 mx-2 px-4 py-3 rounded-full cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground hover:bg-secondary'
                  }`}
                >
                  <item.icon size={24} />
                  <span className="font-secondary text-[16px]">
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="flex flex-col gap-1 px-6 py-4 border-t border-sidebar-border">
        <span className="font-secondary text-[16px] text-sidebar-accent-foreground">
          Sarah Chen
        </span>
        <span className="font-secondary text-[16px] text-sidebar-foreground">
          sarah@quotify.in
        </span>
      </div>
    </aside>
  );
}
