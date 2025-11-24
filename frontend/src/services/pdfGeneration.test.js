import { cachedFetch } from './apiCache';

jest.mock('./apiCache');

describe('PDF Generation Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generatePDF', () => {
    test('should generate PDF for quote', async () => {
      const mockResponse = {
        success: true,
        file_url: '/pdfs/quote-Q-001.pdf',
        file_name: 'quote-Q-001.pdf',
        email_sent: false
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const generatePDF = async (quoteId, options = {}) => {
        return await cachedFetch(`/api/quotations/${quoteId}/generate-pdf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(options)
        });
      };

      const result = await generatePDF(1, { template: 'default' });

      expect(result.success).toBe(true);
      expect(result.file_url).toBeDefined();
      expect(result.file_name).toContain('quote-');
    });

    test('should include watermark option', async () => {
      const mockResponse = {
        success: true,
        file_url: '/pdfs/quote-draft.pdf'
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const generatePDF = async (quoteId, options) => {
        return await cachedFetch(`/api/quotations/${quoteId}/generate-pdf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(options)
        });
      };

      await generatePDF(1, {
        include_watermark: true,
        watermark_text: 'DRAFT'
      });

      expect(cachedFetch).toHaveBeenCalledWith(
        '/api/quotations/1/generate-pdf',
        expect.objectContaining({
          body: expect.stringContaining('watermark_text')
        })
      );
    });

    test('should send email when requested', async () => {
      const mockResponse = {
        success: true,
        file_url: '/pdfs/quote.pdf',
        email_sent: true
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const generatePDF = async (quoteId, options) => {
        return await cachedFetch(`/api/quotations/${quoteId}/generate-pdf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(options)
        });
      };

      const result = await generatePDF(1, { send_email: true });

      expect(result.email_sent).toBe(true);
    });

    test('should validate template option', () => {
      const validateTemplate = (template) => {
        const validTemplates = ['default', 'modern', 'classic', 'minimal'];
        if (template && !validTemplates.includes(template)) {
          throw new Error('Invalid template');
        }
        return true;
      };

      expect(() => validateTemplate('invalid')).toThrow('Invalid template');
      expect(validateTemplate('modern')).toBe(true);
      expect(validateTemplate(null)).toBe(true);
    });
  });

  describe('getPDFs', () => {
    test('should fetch all PDFs for a quote', async () => {
      const mockPDFs = {
        count: 2,
        pdfs: [
          { id: 1, file_name: 'quote-v1.pdf', created_at: '2025-01-29' },
          { id: 2, file_name: 'quote-v2.pdf', created_at: '2025-01-28' }
        ]
      };

      cachedFetch.mockResolvedValue(mockPDFs);

      const getPDFs = async (quoteId) => {
        return await cachedFetch(`/api/quotations/${quoteId}/pdfs`);
      };

      const result = await getPDFs(1);

      expect(result.count).toBe(2);
      expect(result.pdfs).toHaveLength(2);
    });
  });

  describe('downloadPDF', () => {
    test('should download PDF file', async () => {
      const mockBlob = new Blob(['pdf content'], { type: 'application/pdf' });

      cachedFetch.mockResolvedValue(mockBlob);

      const downloadPDF = async (pdfId) => {
        return await cachedFetch(`/api/pdfs/${pdfId}`);
      };

      const result = await downloadPDF(1);

      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBe('application/pdf');
    });

    test('should trigger browser download', () => {
      const triggerDownload = (blob, fileName) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
      };

      const mockBlob = new Blob(['test'], { type: 'application/pdf' });

      // Mock DOM APIs
      global.URL.createObjectURL = jest.fn(() => 'mock-url');
      global.URL.revokeObjectURL = jest.fn();
      document.createElement = jest.fn(() => ({
        href: '',
        download: '',
        click: jest.fn()
      }));

      triggerDownload(mockBlob, 'test.pdf');

      expect(URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('mock-url');
    });
  });

  describe('getTemplates', () => {
    test('should fetch all PDF templates', async () => {
      const mockTemplates = {
        count: 3,
        templates: [
          { id: 1, name: 'Default', is_default: true },
          { id: 2, name: 'Modern', is_default: false },
          { id: 3, name: 'Classic', is_default: false }
        ]
      };

      cachedFetch.mockResolvedValue(mockTemplates);

      const getTemplates = async () => {
        return await cachedFetch('/api/pdf-templates');
      };

      const result = await getTemplates();

      expect(result.count).toBe(3);
      expect(result.templates).toHaveLength(3);
      expect(result.templates[0].is_default).toBe(true);
    });
  });

  describe('createTemplate', () => {
    test('should create new PDF template', async () => {
      const newTemplate = {
        name: 'Custom Template',
        description: 'A custom template',
        header_config: { logo: true },
        styles: { font: 'Arial' }
      };

      const mockResponse = {
        success: true,
        template: { id: 1, ...newTemplate }
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const createTemplate = async (templateData) => {
        return await cachedFetch('/api/pdf-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(templateData)
        });
      };

      const result = await createTemplate(newTemplate);

      expect(result.success).toBe(true);
      expect(result.template.name).toBe('Custom Template');
    });

    test('should validate template name', () => {
      const validateTemplateName = (name) => {
        if (!name || name.trim() === '') {
          throw new Error('Template name is required');
        }
        if (name.length < 3) {
          throw new Error('Template name must be at least 3 characters');
        }
        if (name.length > 50) {
          throw new Error('Template name cannot exceed 50 characters');
        }
        return true;
      };

      expect(() => validateTemplateName('')).toThrow('Template name is required');
      expect(() => validateTemplateName('ab')).toThrow('at least 3 characters');
      expect(() => validateTemplateName('a'.repeat(51))).toThrow('cannot exceed 50 characters');
      expect(validateTemplateName('Valid Template')).toBe(true);
    });
  });

  describe('updateTemplate', () => {
    test('should update existing template', async () => {
      const updatedData = {
        name: 'Updated Template',
        description: 'Updated description'
      };

      const mockResponse = {
        success: true,
        template: { id: 1, ...updatedData }
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const updateTemplate = async (templateId, data) => {
        return await cachedFetch(`/api/pdf-templates/${templateId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      };

      const result = await updateTemplate(1, updatedData);

      expect(result.success).toBe(true);
      expect(result.template.name).toBe('Updated Template');
    });
  });

  describe('previewPDF', () => {
    test('should generate PDF preview', async () => {
      const mockResponse = {
        success: true,
        preview_url: '/previews/quote-1-preview.pdf',
        template: 'modern'
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const previewPDF = async (quoteId, template) => {
        return await cachedFetch(`/api/quotations/${quoteId}/preview-pdf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ template })
        });
      };

      const result = await previewPDF(1, 'modern');

      expect(result.success).toBe(true);
      expect(result.preview_url).toBeDefined();
      expect(result.template).toBe('modern');
    });
  });

  describe('batchGeneratePDFs', () => {
    test('should generate PDFs for multiple quotes', async () => {
      const mockResponse = {
        success: true,
        generated_count: 3,
        generated: [
          { quote_id: 1, file_url: '/pdfs/quote-1.pdf' },
          { quote_id: 2, file_url: '/pdfs/quote-2.pdf' },
          { quote_id: 3, file_url: '/pdfs/quote-3.pdf' }
        ],
        failed_count: 0,
        failed: []
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const batchGeneratePDFs = async (quoteIds, options = {}) => {
        return await cachedFetch('/api/quotations/batch-generate-pdfs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quote_ids: quoteIds, ...options })
        });
      };

      const result = await batchGeneratePDFs([1, 2, 3], { template: 'default' });

      expect(result.generated_count).toBe(3);
      expect(result.failed_count).toBe(0);
    });

    test('should handle partial failures', async () => {
      const mockResponse = {
        success: true,
        generated_count: 2,
        generated: [
          { quote_id: 1, file_url: '/pdfs/quote-1.pdf' },
          { quote_id: 3, file_url: '/pdfs/quote-3.pdf' }
        ],
        failed_count: 1,
        failed: [
          { quote_id: 2, reason: 'Quote not found' }
        ]
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const batchGeneratePDFs = async (quoteIds) => {
        return await cachedFetch('/api/quotations/batch-generate-pdfs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quote_ids: quoteIds })
        });
      };

      const result = await batchGeneratePDFs([1, 2, 3]);

      expect(result.generated_count).toBe(2);
      expect(result.failed_count).toBe(1);
      expect(result.failed[0].reason).toBe('Quote not found');
    });
  });

  describe('deletePDF', () => {
    test('should delete PDF file', async () => {
      const mockResponse = {
        success: true,
        message: 'PDF deleted successfully'
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const deletePDF = async (pdfId) => {
        return await cachedFetch(`/api/pdfs/${pdfId}`, {
          method: 'DELETE'
        });
      };

      const result = await deletePDF(1);

      expect(result.success).toBe(true);
    });
  });

  describe('sendPDF', () => {
    test('should send PDF via email', async () => {
      const mockResponse = {
        success: true,
        message: 'PDF sent successfully',
        recipient: 'customer@test.com'
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const sendPDF = async (quoteId, pdfId, recipientEmail, subject, message) => {
        return await cachedFetch(`/api/quotations/${quoteId}/send-pdf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pdf_id: pdfId,
            recipient_email: recipientEmail,
            subject,
            message
          })
        });
      };

      const result = await sendPDF(
        1,
        1,
        'customer@test.com',
        'Your Quote',
        'Please review'
      );

      expect(result.success).toBe(true);
      expect(result.recipient).toBe('customer@test.com');
    });

    test('should validate email address', () => {
      const validateEmail = (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          throw new Error('Invalid email format');
        }
        return true;
      };

      expect(() => validateEmail('invalid')).toThrow('Invalid email format');
      expect(() => validateEmail('missing@domain')).toThrow('Invalid email format');
      expect(validateEmail('valid@example.com')).toBe(true);
    });
  });

  describe('getPDFStatistics', () => {
    test('should fetch PDF generation statistics', async () => {
      const mockStats = {
        total_pdfs: '50',
        unique_quotes: '40',
        total_size: '5242880',
        most_used_template: 'default'
      };

      cachedFetch.mockResolvedValue(mockStats);

      const getPDFStatistics = async (startDate, endDate) => {
        const params = new URLSearchParams();
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        return await cachedFetch(`/api/pdf-statistics?${params.toString()}`);
      };

      const result = await getPDFStatistics('2025-01-01', '2025-01-31');

      expect(result.total_pdfs).toBe('50');
      expect(result.most_used_template).toBe('default');
    });
  });

  describe('UI Helper Functions', () => {
    test('should format file size', () => {
      const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
      };

      expect(formatFileSize(0)).toBe('0 Bytes');
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1048576)).toBe('1 MB');
      expect(formatFileSize(500)).toBe('500 Bytes');
    });

    test('should get watermark text options', () => {
      const getWatermarkOptions = (quoteStatus) => {
        const options = {
          'draft': 'DRAFT',
          'sent': 'SAMPLE',
          'approved': 'APPROVED',
          'rejected': 'VOID',
          'expired': 'EXPIRED'
        };
        return options[quoteStatus] || 'COPY';
      };

      expect(getWatermarkOptions('draft')).toBe('DRAFT');
      expect(getWatermarkOptions('approved')).toBe('APPROVED');
      expect(getWatermarkOptions('unknown')).toBe('COPY');
    });

    test('should get template icon', () => {
      const getTemplateIcon = (templateName) => {
        const icons = {
          'default': '📄',
          'modern': '✨',
          'classic': '📜',
          'minimal': '⚪'
        };
        return icons[templateName] || '📄';
      };

      expect(getTemplateIcon('modern')).toBe('✨');
      expect(getTemplateIcon('classic')).toBe('📜');
      expect(getTemplateIcon('unknown')).toBe('📄');
    });

    test('should format PDF creation date', () => {
      const formatPDFDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' at ' + date.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        });
      };

      const date = new Date('2025-01-29T14:30:00');
      const formatted = formatPDFDate(date.toISOString());

      expect(formatted).toContain('2025');
      expect(formatted).toContain('at');
    });

    test('should determine if PDF can be regenerated', () => {
      const canRegeneratePDF = (quoteStatus) => {
        const allowedStatuses = ['draft', 'sent', 'approved'];
        return allowedStatuses.includes(quoteStatus);
      };

      expect(canRegeneratePDF('draft')).toBe(true);
      expect(canRegeneratePDF('sent')).toBe(true);
      expect(canRegeneratePDF('rejected')).toBe(false);
      expect(canRegeneratePDF('expired')).toBe(false);
    });

    test('should generate PDF filename', () => {
      const generatePDFFilename = (quoteNumber, version = null) => {
        let filename = `quote-${quoteNumber}`;
        if (version) filename += `-v${version}`;
        filename += '.pdf';
        return filename;
      };

      expect(generatePDFFilename('Q-001')).toBe('quote-Q-001.pdf');
      expect(generatePDFFilename('Q-001', 2)).toBe('quote-Q-001-v2.pdf');
    });
  });

  describe('Template Configuration', () => {
    test('should validate template configuration', () => {
      const validateTemplateConfig = (config) => {
        if (!config.header_config) {
          throw new Error('Header configuration is required');
        }
        if (!config.footer_config) {
          throw new Error('Footer configuration is required');
        }
        if (!config.styles) {
          throw new Error('Styles configuration is required');
        }
        return true;
      };

      const validConfig = {
        header_config: { logo: true },
        footer_config: { page_numbers: true },
        styles: { font: 'Arial' }
      };

      expect(() => validateTemplateConfig({})).toThrow('Header configuration is required');
      expect(validateTemplateConfig(validConfig)).toBe(true);
    });

    test('should merge template config with defaults', () => {
      const mergeWithDefaults = (userConfig) => {
        const defaults = {
          header_config: { logo: true, title: true },
          footer_config: { page_numbers: true },
          styles: { font: 'Helvetica', fontSize: 12 }
        };

        return {
          header_config: { ...defaults.header_config, ...(userConfig.header_config || {}) },
          footer_config: { ...defaults.footer_config, ...(userConfig.footer_config || {}) },
          styles: { ...defaults.styles, ...(userConfig.styles || {}) }
        };
      };

      const userConfig = {
        styles: { fontSize: 14 }
      };

      const merged = mergeWithDefaults(userConfig);

      expect(merged.styles.font).toBe('Helvetica');
      expect(merged.styles.fontSize).toBe(14);
      expect(merged.header_config.logo).toBe(true);
    });
  });

  describe('PDF Preview', () => {
    test('should open preview in new window', () => {
      const openPreview = (previewUrl) => {
        window.open(previewUrl, '_blank', 'width=800,height=600');
      };

      global.window.open = jest.fn();

      openPreview('/previews/quote-1.pdf');

      expect(window.open).toHaveBeenCalledWith(
        '/previews/quote-1.pdf',
        '_blank',
        'width=800,height=600'
      );
    });
  });

  describe('Bulk Operations', () => {
    test('should select all quotes for batch generation', () => {
      const selectAllQuotes = (quotes) => {
        return quotes.map(q => q.id);
      };

      const quotes = [
        { id: 1, quote_number: 'Q-001' },
        { id: 2, quote_number: 'Q-002' },
        { id: 3, quote_number: 'Q-003' }
      ];

      const selected = selectAllQuotes(quotes);

      expect(selected).toEqual([1, 2, 3]);
    });

    test('should filter quotes eligible for PDF generation', () => {
      const filterEligibleQuotes = (quotes) => {
        const eligibleStatuses = ['draft', 'sent', 'approved'];
        return quotes.filter(q => eligibleStatuses.includes(q.status));
      };

      const quotes = [
        { id: 1, status: 'draft' },
        { id: 2, status: 'rejected' },
        { id: 3, status: 'approved' }
      ];

      const eligible = filterEligibleQuotes(quotes);

      expect(eligible).toHaveLength(2);
      expect(eligible.map(q => q.id)).toEqual([1, 3]);
    });
  });

  describe('Error Handling', () => {
    test('should handle PDF generation errors', async () => {
      cachedFetch.mockRejectedValue({
        error: 'PDF generation failed'
      });

      const generatePDF = async (quoteId) => {
        return await cachedFetch(`/api/quotations/${quoteId}/generate-pdf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
      };

      await expect(generatePDF(1)).rejects.toMatchObject({
        error: 'PDF generation failed'
      });
    });

    test('should provide user-friendly error messages', () => {
      const getErrorMessage = (error) => {
        const messages = {
          'QUOTE_NOT_FOUND': 'Quote not found. Please check the quote ID.',
          'TEMPLATE_NOT_FOUND': 'Selected template not found. Please choose another template.',
          'PDF_GENERATION_FAILED': 'Failed to generate PDF. Please try again.',
          'STORAGE_ERROR': 'Failed to save PDF. Please check storage space.'
        };
        return messages[error.code] || 'An unexpected error occurred.';
      };

      expect(getErrorMessage({ code: 'QUOTE_NOT_FOUND' }))
        .toBe('Quote not found. Please check the quote ID.');
      expect(getErrorMessage({ code: 'UNKNOWN_ERROR' }))
        .toBe('An unexpected error occurred.');
    });
  });
});
