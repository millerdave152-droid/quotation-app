const express = require('express');
const TaxSummaryService = require('../services/TaxSummaryService');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

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
  router.get('/tax-summary', asyncHandler(async (req, res) => {
    const report = await TaxSummaryService.getTaxSummary(parseOpts(req.query));
    res.json(report);
  }));

  // GET /api/reports/tax-summary/export
  router.get('/tax-summary/export', asyncHandler(async (req, res) => {
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
      throw ApiError.badRequest('Supported formats: quickbooks, cra, json');
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  }));

  return router;
}

module.exports = { init };
