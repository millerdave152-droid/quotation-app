/**
 * AdminSidebar.jsx — Shared Component
 * TeleTime design system admin sidebar with ADMIN + SETTINGS sections
 *
 * Props:
 *   activeItem — label string of the active nav item (e.g. "User Management")
 */

import {
  Users,
  Tags,
  Activity,
  Upload,
  ShieldAlert,
} from 'lucide-react';

const sidebarNav = [
  {
    section: 'ADMIN',
    items: [
      { icon: Users, label: 'User Management' },
      { icon: Tags, label: 'Nomenclature' },
      { icon: Activity, label: 'Monitoring' },
    ],
  },
  {
    section: 'SETTINGS',
    items: [
      { icon: Upload, label: 'Data Import' },
      { icon: ShieldAlert, label: 'Fraud Rules' },
    ],
  },
];

export default function AdminSidebar({ activeItem }) {
  return (
    <aside className="w-[280px] shrink-0 bg-sidebar flex flex-col border-r border-sidebar-border overflow-hidden">
      {/* Logo */}
      <div className="flex items-center gap-2 h-[88px] px-8 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded bg-primary" />
        <span className="font-primary text-[18px] font-bold text-primary">
          LUNARIS
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-4 py-2">
        {sidebarNav.map((group) => (
          <div key={group.section}>
            <div className="pt-4 pb-2">
              <span className="font-primary text-[14px] text-sidebar-foreground">
                {group.section}
              </span>
            </div>
            {group.items.map((item) => {
              const isActive = item.label === activeItem;
              return (
                <div
                  key={item.label}
                  className={`flex items-center gap-4 px-4 py-3 rounded-full cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
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
      <div className="flex items-center gap-2 px-8 py-6 border-t border-sidebar-border">
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <span className="font-secondary text-[16px] text-sidebar-accent-foreground truncate">
            Joe Doe
          </span>
          <span className="font-secondary text-[16px] text-sidebar-foreground truncate">
            joe@acmecorp.com
          </span>
        </div>
      </div>
    </aside>
  );
}
