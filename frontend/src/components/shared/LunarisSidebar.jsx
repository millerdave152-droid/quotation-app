/**
 * LunarisSidebar.jsx — Shared Component
 * TeleTime design system sidebar with TeleTime branding
 *
 * Props:
 *   activeItem — label string of the active nav item (e.g. "Leads & Inquiries")
 */

import {
  LayoutDashboard,
  Monitor,
  Users,
  FileText,
  ShoppingBag,
  Package,
  BarChart2,
} from 'lucide-react';

const sidebarNav = [
  {
    section: 'MAIN',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard' },
      { icon: Monitor, label: 'Point of Sale' },
      { icon: Users, label: 'Leads & Inquiries' },
      { icon: FileText, label: 'Quotes' },
      { icon: ShoppingBag, label: 'Customers' },
      { icon: Package, label: 'Inventory' },
    ],
  },
  {
    section: 'REPORTS',
    items: [
      { icon: BarChart2, label: 'Analytics' },
      { icon: FileText, label: 'Reports' },
    ],
  },
];

export default function LunarisSidebar({ activeItem }) {
  return (
    <aside className="w-[248px] shrink-0 bg-card flex flex-col border-r border-sidebar-border overflow-hidden">
      {/* Logo */}
      <div className="flex items-center gap-2 h-[88px] px-8 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded bg-primary" />
        <span className="font-primary text-[18px] font-bold text-primary">
          TeleTime
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {sidebarNav.map((group) => (
          <div key={group.section}>
            <div className="px-4 pt-4 pb-2">
              <span className="font-primary text-[14px] text-sidebar-foreground">
                {group.section}
              </span>
            </div>
            {group.items.map((item) => {
              const isActive = item.label === activeItem;
              return (
                <div
                  key={item.label}
                  className={`flex items-center gap-4 mx-2 px-4 py-3 rounded-full cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary'
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
        <span className="font-secondary text-[14px] font-medium text-foreground">
          Jane Doe
        </span>
        <span className="font-secondary text-[12px] text-muted-foreground">
          jane@acme.co
        </span>
      </div>
    </aside>
  );
}
