const express = require('express');
const TaxSummaryService = require('../services/TaxSummaryService');

function init({ pool }) {
  TaxSummaryService.init({ pool });

  const router = express.Router();

  function parseOpts(query) {
    return {
      period: query.period || 'month',
      year: query.year ? parseInt(query.year) : undefined,
      month: query.month ? parseInt(query.month) : undefined,
      quarter: query.quarter ? parseInt(query.quarter) : undefined,
      location_id: query.location_id ? parseInt(query.location_id) : undefined,
    };
  }

  // GET /api/reports/tax-summary
  router.get('/tax-summary', async (req, res) => {
    try {
      const report = await TaxSummaryService.getTaxSummary(parseOpts(req.query));
      res.json(report);
    } catch (err) {
      console.error('Tax summary error:', err);
      res.status(500).json({ error: 'Failed to generate tax summary' });
    }
  });

  // GET /api/reports/tax-summary/export
  router.get('/tax-summary/export', async (req, res) => {
    try {
      const format = req.query.format || 'quickbooks';
      const opts = parseOpts(req.query);
      let content, contentType, filename;

      if (format === 'quickbooks' || format === 'csv') {
        content = await TaxSummaryService.exportQuickBooksCSV(opts);
        contentType = 'text/csv';
        filename = `tax-summary-quickbooks-${opts.year || new Date().getFullYear()}.csv`;
      } else if (format === 'cra') {
        content = await TaxSummaryService.exportCRASummary(opts);
        contentType = 'text/csv';
        filename = `cra-hst-summary-${opts.year || new Date().getFullYear()}.csv`;
      } else if (format === 'json') {
        const report = await TaxSummaryService.getTaxSummary(opts);
        contentType = 'application/json';
        content = JSON.stringify(report, null, 2);
        filename = `tax-summary-${opts.year || new Date().getFullYear()}.json`;
      } else {
        return res.status(400).json({ error: 'Supported formats: quickbooks, cra, json' });
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(content);
    } catch (err) {
      console.error('Tax summary export error:', err);
      res.status(500).json({ error: 'Failed to export tax summary' });
    }
  });

  return router;
}

module.exports = { init };
