/**
 * EditUserModalNew.jsx
 * Screen 34 — Edit User Modal (Pencil frame lzUjI)
 * Fixed overlay, centered 520px card, 3 form sections
 */

import { useState } from 'react';

export default function EditUserModalNew() {
  const [canApprove, setCanApprove] = useState(true);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="w-[520px] bg-card rounded-xl border border-border shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <span className="font-primary text-lg font-bold text-foreground">Edit User</span>
          <button className="w-8 h-8 rounded-lg border border-border flex items-center justify-center">
            <span className="material-symbols-rounded text-lg text-muted-foreground">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-5">
          {/* Section 1 — Basic Information */}
          <div className="flex flex-col gap-3">
            <span className="font-secondary text-[14px] font-semibold text-foreground">Basic Information</span>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="font-secondary text-xs font-medium text-muted-foreground">First Name</label>
                <input type="text" defaultValue="Sarah" className="h-10 px-3 rounded-lg border border-border bg-background text-foreground font-secondary text-sm" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-secondary text-xs font-medium text-muted-foreground">Last Name</label>
                <input type="text" defaultValue="Mitchell" className="h-10 px-3 rounded-lg border border-border bg-background text-foreground font-secondary text-sm" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="font-secondary text-xs font-medium text-muted-foreground">Email</label>
              <input type="email" defaultValue="sarah@lumaries.com" className="h-10 px-3 rounded-lg border border-border bg-background text-foreground font-secondary text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="font-secondary text-xs font-medium text-muted-foreground">Job Title</label>
                <input type="text" defaultValue="Sales Manager" className="h-10 px-3 rounded-lg border border-border bg-background text-foreground font-secondary text-sm" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-secondary text-xs font-medium text-muted-foreground">Department</label>
                <input type="text" defaultValue="Sales" className="h-10 px-3 rounded-lg border border-border bg-background text-foreground font-secondary text-sm" />
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Section 2 — Role & Status */}
          <div className="flex flex-col gap-3">
            <span className="font-secondary text-[14px] font-semibold text-foreground">Role & Status</span>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="font-secondary text-xs font-medium text-muted-foreground">Role</label>
                <select className="h-10 px-3 rounded-lg border border-border bg-background text-foreground font-secondary text-sm">
                  <option>Manager</option>
                  <option>Admin</option>
                  <option>Cashier</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-secondary text-xs font-medium text-muted-foreground">Status</label>
                <select className="h-10 px-3 rounded-lg border border-border bg-background text-foreground font-secondary text-sm">
                  <option>Active</option>
                  <option>Inactive</option>
                </select>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Section 3 — Approval Settings */}
          <div className="flex flex-col gap-3">
            <span className="font-secondary text-[14px] font-semibold text-foreground">Approval Settings</span>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={canApprove} onChange={(e) => setCanApprove(e.target.checked)}
                className="w-4 h-4 rounded border-border accent-primary" />
              <span className="font-secondary text-[13px] text-foreground">Can approve quotes</span>
            </label>
            {canApprove && (
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="font-secondary text-xs font-medium text-muted-foreground">Approval Threshold %</label>
                  <input type="text" defaultValue="15" className="h-10 px-3 rounded-lg border border-border bg-background text-foreground font-primary text-sm" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="font-secondary text-xs font-medium text-muted-foreground">Max Approval Amount ($)</label>
                  <input type="text" defaultValue="5,000" className="h-10 px-3 rounded-lg border border-border bg-background text-foreground font-primary text-sm" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-border">
          <button className="h-8 px-4 rounded-full border border-border text-foreground font-primary text-xs font-medium">Cancel</button>
          <button className="h-8 px-4 rounded-full bg-primary text-primary-foreground font-primary text-xs font-medium">Save Changes</button>
        </div>
      </div>
    </div>
  );
}
