/**
 * NomenclatureAdminNew.jsx — Screen 35
 * TeleTime Design System · Admin — Nomenclature Admin
 * Design frame: sMm3f
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Play, Loader } from 'lucide-react';
// import AdminSidebar from '../shared/AdminSidebar'; // removed — MainLayout provides sidebar

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const statCards = [
  { label: 'Total Templates', value: '148', color: 'text-foreground' },
  { label: 'Brands', value: '24', color: 'text-foreground' },
  { label: 'Scraped', value: '112', color: 'text-primary' },
  { label: 'Scrape Jobs', value: '37', color: 'text-foreground' },
];

const tabs = ['Overview', 'Templates', 'Scrape Jobs', 'Change Log'];

const brandCards = [
  {
    name: 'Whirlpool',
    categories: 'Refrigerators, Dishwashers, Washers',
  },
  {
    name: 'Samsung',
    categories: 'Refrigerators, Ranges, Microwaves',
  },
  {
    name: 'LG',
    categories: 'Refrigerators, Washers, Dryers',
  },
  {
    name: 'GE Appliances',
    categories: 'Ranges, Dishwashers, Microwaves',
  },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function NomenclatureAdminNew() {
  const [activeTab, setActiveTab] = useState('Overview');

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-5"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex flex-col gap-1">
            <h1 className="text-foreground font-primary text-[22px] font-bold">
              Nomenclature Admin
            </h1>
            <p className="text-muted-foreground font-secondary text-[13px]">
              Manage SKU nomenclature templates for model number decoding
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-1.5 h-10 px-4 rounded-lu-pill bg-background border border-border text-foreground font-primary text-sm font-medium shadow-lu-sm"
            >
              <Download size={16} />
              Export Training Data
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-1.5 h-10 px-4 rounded-lu-pill bg-primary text-primary-foreground font-primary text-sm font-medium"
            >
              <Play size={16} />
              Start Full Scrape
            </motion.button>
          </div>
        </div>

        {/* Job Banner */}
        <div className="flex items-center gap-2.5 px-6 py-2.5 bg-[#EFF6FF]">
          <Loader size={16} className="text-[#2563EB] animate-spin" />
          <span className="text-[#2563EB] font-secondary text-[12px] font-medium">
            Scrape in Progress — Templates: 24 · Rules: 156 · Codes: 1,892
          </span>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-4 px-6 py-4">
          {statCards.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
              className="flex flex-col gap-1 bg-card border border-border rounded-lg p-4"
            >
              <span className="text-muted-foreground font-secondary text-[11px]">
                {stat.label}
              </span>
              <span
                className={`font-primary text-2xl font-bold ${stat.color}`}
              >
                {stat.value}
              </span>
            </motion.div>
          ))}
        </div>

        {/* Tabs */}
        <div
          className="flex items-center gap-1 px-6 pb-3"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center px-3 py-1.5 rounded-lu-pill font-secondary text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-background text-foreground shadow-lu-sm border border-border'
                  : 'text-muted-foreground'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content — Brand Cards */}
        <div className="flex-1 overflow-auto p-6">
          <div className="flex flex-col gap-4">
            {brandCards.map((brand, i) => (
              <motion.div
                key={brand.name}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.04, duration: 0.3 }}
                className="flex items-center justify-between bg-card border border-border rounded-lg p-4"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-foreground font-primary text-sm font-semibold">
                    {brand.name}
                  </span>
                  <span className="text-muted-foreground font-secondary text-[11px]">
                    {brand.categories}
                  </span>
                </div>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-1.5 h-10 px-4 rounded-lu-pill bg-secondary text-secondary-foreground font-primary text-sm font-medium"
                >
                  <Play size={16} />
                  Scrape
                </motion.button>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
  );
}
