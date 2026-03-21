/**
 * LeadFormNew.jsx — Screen 17
 * TeleTime Design System · Lead New/Edit Form
 * Design frame: n7sdP
 */

import { motion } from 'framer-motion';
import LunarisSidebar from '../shared/LunarisSidebar';

/* ------------------------------------------------------------------ */
/*  Form Field Components                                              */
/* ------------------------------------------------------------------ */

function FormInput({ label, placeholder, required }) {
  return (
    <div className="flex flex-col gap-1.5 flex-1">
      <span className="text-foreground font-secondary text-sm font-medium">
        {label}
        {required && ' *'}
      </span>
      <input
        type="text"
        placeholder={placeholder}
        className="input input-bordered w-full h-10 rounded-lu-pill bg-background text-foreground font-secondary text-sm"
      />
    </div>
  );
}

function FormSelect({ label, options, defaultValue }) {
  return (
    <div className="flex flex-col gap-1.5 flex-1">
      <span className="text-foreground font-secondary text-sm font-medium">
        {label}
      </span>
      <select
        defaultValue={defaultValue}
        className="select select-bordered w-full h-10 rounded-lu-pill bg-background text-foreground font-secondary text-sm"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function LeadFormNew() {
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <LunarisSidebar activeItem="Leads & Inquiries" />

      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h1 className="text-foreground font-primary text-[20px] font-bold">
            New Lead
          </h1>
          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-1.5 h-10 px-4 rounded-lu-pill bg-background border border-border text-foreground font-primary text-sm font-medium shadow-lu-sm"
            >
              Cancel
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-1.5 h-10 px-4 rounded-lu-pill bg-primary text-primary-foreground font-primary text-sm font-medium"
            >
              Save Lead
            </motion.button>
          </div>
        </div>

        {/* Form Body */}
        <div className="flex-1 flex flex-col gap-6 p-6 overflow-auto">
          {/* Section 1: Contact Information */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.3 }}
            className="flex flex-col gap-4 p-5 bg-card border border-border rounded-lg"
          >
            <span className="text-foreground font-primary text-[15px] font-semibold">
              Contact Information
            </span>
            <div className="flex gap-4">
              <FormInput
                label="Name"
                placeholder="Enter contact name"
                required
              />
              <FormInput
                label="Email"
                placeholder="email@example.com"
              />
            </div>
            <div className="flex gap-4">
              <FormInput
                label="Phone"
                placeholder="(555) 000-0000"
              />
              <FormSelect
                label="Preferred Contact Method"
                options={['Phone', 'Email', 'Text', 'Any']}
                defaultValue="Phone"
              />
            </div>
            <div className="flex gap-4">
              <FormInput
                label="Best Time to Contact"
                placeholder="e.g. Mornings, After 5pm"
              />
              <div className="flex-1" />
            </div>
          </motion.div>

          {/* Section 2: Lead Source */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            className="flex flex-col gap-4 p-5 bg-card border border-border rounded-lg"
          >
            <span className="text-foreground font-primary text-[15px] font-semibold">
              Lead Source
            </span>
            <div className="flex gap-4">
              <FormSelect
                label="How did they find us?"
                options={[
                  'Walk-in',
                  'Phone',
                  'Website',
                  'Referral',
                  'Realtor/Builder',
                  'Social Media',
                  'Other',
                ]}
                defaultValue="Walk-in"
              />
              <FormInput
                label="Source Details"
                placeholder="e.g. Referred by John Smith"
              />
            </div>
          </motion.div>

          {/* Section 3: Context & Timing */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.3 }}
            className="flex flex-col gap-4 p-5 bg-card border border-border rounded-lg"
          >
            <span className="text-foreground font-primary text-[15px] font-semibold">
              Context &amp; Timing
            </span>
            <div className="flex gap-4">
              <FormSelect
                label="Reason for Inquiry"
                options={[
                  'Renovation',
                  'New Home',
                  'Replacement',
                  'Commercial',
                  'Other',
                ]}
                defaultValue="Renovation"
              />
              <FormSelect
                label="Purchase Timeline"
                options={[
                  'ASAP',
                  '1-2 Weeks',
                  '1-3 Months',
                  '3-6 Months',
                  'Just Browsing',
                ]}
                defaultValue="ASAP"
              />
              <FormInput
                label="Move-in Date"
                placeholder="MM/DD/YYYY"
              />
            </div>
          </motion.div>

          {/* Section 4: Internal */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.3 }}
            className="flex flex-col gap-4 p-5 bg-card border border-border rounded-lg"
          >
            <span className="text-foreground font-primary text-[15px] font-semibold">
              Internal
            </span>
            <div className="flex gap-4">
              <FormSelect
                label="Priority"
                options={['Hot', 'Warm', 'Cold']}
                defaultValue="Hot"
              />
              <FormInput
                label="Follow-up Date"
                placeholder="MM/DD/YYYY"
              />
            </div>
          </motion.div>

          {/* Additional Notes */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.3 }}
            className="flex flex-col gap-1.5"
          >
            <span className="text-foreground font-secondary text-sm font-medium">
              Additional Notes
            </span>
            <textarea
              placeholder="Any extra details about this lead..."
              className="textarea textarea-bordered w-full h-20 rounded-lu-md bg-background text-foreground font-secondary text-sm resize-none"
            />
          </motion.div>
        </div>
      </div>
    </div>
  );
}
