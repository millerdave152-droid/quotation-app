/**
 * UserManagementNew.jsx — Screen 33
 * TeleTime Design System · Admin — User Management
 * Design frame: Ta6ZB
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Search,
  Eye,
  Pencil,
  Trash2,
} from 'lucide-react';
// import AdminSidebar from '../shared/AdminSidebar'; // removed — MainLayout provides sidebar

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const tableColumns = [
  { label: 'User', w: 'w-[200px]' },
  { label: 'Email', w: 'w-[180px]' },
  { label: 'Job Title', w: 'w-[120px]' },
  { label: 'Role', w: 'w-[90px]' },
  { label: 'Approval Settings', w: 'w-[160px]' },
  { label: 'Status', w: 'w-[70px]' },
  { label: 'Actions', w: 'w-[80px]' },
];

const users = [
  {
    name: 'John Doe',
    initials: 'JD',
    gradient: 'from-purple-500 to-indigo-500',
    email: 'john@lumaries.com',
    jobTitle: 'Store Manager',
    role: 'Manager',
    roleClass: 'text-blue-600 bg-blue-500/10',
    approval: 'Unlimited · Can approve',
    status: 'Active',
    statusClass: 'text-emerald-600 bg-emerald-500/10',
  },
  {
    name: 'Sarah Mitchell',
    initials: 'SM',
    gradient: 'from-blue-500 to-cyan-500',
    email: 'sarah@lumaries.com',
    jobTitle: 'Sales Manager',
    role: 'Manager',
    roleClass: 'text-blue-600 bg-blue-500/10',
    approval: '15% · $5,000 max',
    status: 'Active',
    statusClass: 'text-emerald-600 bg-emerald-500/10',
  },
  {
    name: 'Mike Roberts',
    initials: 'MR',
    gradient: 'from-emerald-500 to-teal-500',
    email: 'mike@lumaries.com',
    jobTitle: 'Floor Supervisor',
    role: 'Supervisor',
    roleClass: 'text-purple-600 bg-purple-500/10',
    approval: '10% · $2,000 max',
    status: 'Active',
    statusClass: 'text-emerald-600 bg-emerald-500/10',
  },
  {
    name: 'Lisa Wang',
    initials: 'LW',
    gradient: 'from-amber-500 to-orange-500',
    email: 'lisa@lumaries.com',
    jobTitle: 'Sales Associate',
    role: 'Staff',
    roleClass: 'text-gray-600 bg-gray-500/10',
    approval: '— · No approval',
    status: 'Active',
    statusClass: 'text-emerald-600 bg-emerald-500/10',
  },
  {
    name: 'Tom Johnson',
    initials: 'TJ',
    gradient: 'from-gray-400 to-gray-500',
    email: 'tom@lumaries.com',
    jobTitle: 'Sales Associate',
    role: 'Staff',
    roleClass: 'text-gray-600 bg-gray-500/10',
    approval: '— · No approval',
    status: 'Inactive',
    statusClass: 'text-gray-500 bg-gray-500/10',
  },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function UserManagementNew() {
  const [showInactive] = useState(false);

  return (
    <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:0.2}} className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-5 border-b border-border/50"
        >
          <div className="flex flex-col gap-1">
            <h1 className="text-foreground font-secondary text-2xl font-semibold tracking-tight">
              User Management
            </h1>
            <p className="text-muted-foreground font-secondary text-sm">
              Manage users, roles, and approval permissions
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 h-10 px-4 rounded-lg bg-primary text-primary-foreground font-primary text-sm font-medium shadow-sm hover:shadow transition font-secondary"
          >
            <Plus size={14} />
            Add User
          </motion.button>
        </div>

        {/* Filters */}
        <div
          className="flex items-center gap-3 px-6 py-3 bg-card border-b border-border/50"
        >
          {/* Search */}
          <div className="relative w-[280px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search..."
              className="w-full h-9 pl-9 pr-3 bg-background border border-border rounded-lg font-secondary text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary transition"
            />
          </div>

          {/* Role filter */}
          <select className="select select-bordered select-sm w-[180px] bg-background border-border text-foreground font-secondary text-sm">
            <option>All Roles</option>
            <option>Manager</option>
            <option>Supervisor</option>
            <option>Staff</option>
          </select>

          {/* Show Inactive */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              readOnly
              className="checkbox checkbox-sm checkbox-primary"
            />
            <span className="text-foreground font-secondary text-[13px]">
              Show Inactive
            </span>
          </label>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {/* Table Header */}
          <div
            className="flex items-center px-6 py-2.5 bg-muted/50 border-b border-border/50 sticky top-0 z-10"
          >
            {tableColumns.map((col) => (
              <span
                key={col.label}
                className={`${col.w} shrink-0 text-muted-foreground font-secondary text-[11px] font-semibold uppercase tracking-wider`}
              >
                {col.label}
              </span>
            ))}
          </div>

          {/* Rows */}
          {users.map((user, idx) => {
            const isInactive = user.status === 'Inactive';
            return (
              <motion.div
                key={user.email}
                initial={{opacity:0,y:6}}
                animate={{opacity:1,y:0}}
                transition={{duration:0.15,delay:idx*0.03}}
                className={`flex items-center px-6 py-3 border-b border-border/50 group hover:bg-muted/30 transition-colors cursor-pointer ${
                  isInactive ? 'opacity-50 bg-gray-500/5' : ''
                }`}
              >
                {/* User */}
                <div className="w-[200px] shrink-0 flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-full bg-gradient-to-br ${user.gradient} flex items-center justify-center shrink-0`}
                  >
                    <span className="text-white font-primary text-[10px] font-bold">
                      {user.initials}
                    </span>
                  </div>
                  <span className="text-foreground font-secondary text-[12px] font-medium truncate">
                    {user.name}
                  </span>
                </div>

                {/* Email */}
                <span className="w-[180px] shrink-0 text-muted-foreground font-secondary text-[12px] truncate">
                  {user.email}
                </span>

                {/* Job Title */}
                <span className="w-[120px] shrink-0 text-foreground font-secondary text-[12px]">
                  {user.jobTitle}
                </span>

                {/* Role Badge */}
                <div className="w-[90px] shrink-0">
                  <span
                    className={`inline-flex items-center px-2 py-[2px] rounded-full font-primary text-[10px] font-medium ${user.roleClass}`}
                  >
                    {user.role}
                  </span>
                </div>

                {/* Approval */}
                <span className="w-[160px] shrink-0 text-muted-foreground font-secondary text-[11px]">
                  {user.approval}
                </span>

                {/* Status Badge */}
                <div className="w-[70px] shrink-0">
                  <span
                    className={`inline-flex items-center px-2 py-[2px] rounded-full font-primary text-[10px] font-medium ${user.statusClass}`}
                  >
                    {user.status}
                  </span>
                </div>

                {/* Actions */}
                <div className="w-[80px] shrink-0 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="w-7 h-7 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 flex items-center justify-center">
                    <Eye size={14} />
                  </button>
                  <button className="w-7 h-7 rounded-lg bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center">
                    <Pencil size={14} />
                  </button>
                  <button className="w-7 h-7 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 flex items-center justify-center">
                    <Trash2 size={14} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
  );
}
