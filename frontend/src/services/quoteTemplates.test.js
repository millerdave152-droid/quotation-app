import { cachedFetch } from './apiCache';

// Mock the cachedFetch function
jest.mock('./apiCache');

describe('Quote Templates Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchTemplates', () => {
    test('should fetch all quote templates', async () => {
      const mockTemplates = [
        { id: 1, name: 'Standard Package', items: [] },
        { id: 2, name: 'Premium Package', items: [] }
      ];

      cachedFetch.mockResolvedValue(mockTemplates);

      const fetchTemplates = async () => {
        return await cachedFetch('/api/quote-templates');
      };

      const templates = await fetchTemplates();

      expect(cachedFetch).toHaveBeenCalledWith('/api/quote-templates');
      expect(templates).toEqual(mockTemplates);
      expect(templates).toHaveLength(2);
    });

    test('should handle fetch errors', async () => {
      cachedFetch.mockRejectedValue(new Error('Network error'));

      const fetchTemplates = async () => {
        return await cachedFetch('/api/quote-templates');
      };

      await expect(fetchTemplates()).rejects.toThrow('Network error');
    });
  });

  describe('createTemplate', () => {
    test('should create a new template', async () => {
      const newTemplate = {
        name: 'New Package',
        description: 'Test description',
        items: [{ product_id: 1, quantity: 1 }]
      };

      const createdTemplate = { id: 1, ...newTemplate };

      cachedFetch.mockResolvedValue(createdTemplate);

      const createTemplate = async (data) => {
        return await cachedFetch('/api/quote-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      };

      const result = await createTemplate(newTemplate);

      expect(result).toHaveProperty('id');
      expect(result.name).toBe(newTemplate.name);
    });

    test('should validate template data', () => {
      const validateTemplate = (template) => {
        if (!template.name || template.name.trim() === '') {
          throw new Error('Template name is required');
        }
        if (!template.items || template.items.length === 0) {
          throw new Error('At least one item is required');
        }
        return true;
      };

      const invalidTemplate1 = { items: [{ product_id: 1 }] };
      const invalidTemplate2 = { name: 'Test', items: [] };
      const validTemplate = { name: 'Test', items: [{ product_id: 1 }] };

      expect(() => validateTemplate(invalidTemplate1)).toThrow('Template name is required');
      expect(() => validateTemplate(invalidTemplate2)).toThrow('At least one item is required');
      expect(validateTemplate(validTemplate)).toBe(true);
    });
  });

  describe('applyTemplate', () => {
    test('should create quotation from template', async () => {
      const templateId = 1;
      const customerId = 1;
      const mockQuotation = {
        id: 1,
        customer_id: customerId,
        template_id: templateId,
        status: 'draft'
      };

      cachedFetch.mockResolvedValue(mockQuotation);

      const applyTemplate = async (templateId, customerId, additionalItems = []) => {
        return await cachedFetch(`/api/quotations/from-template/${templateId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customer_id: customerId, additional_items: additionalItems })
        });
      };

      const result = await applyTemplate(templateId, customerId);

      expect(result.template_id).toBe(templateId);
      expect(result.customer_id).toBe(customerId);
      expect(result.status).toBe('draft');
    });

    test('should include additional items when applying template', async () => {
      const additionalItems = [{ product_id: 2, quantity: 1 }];

      cachedFetch.mockResolvedValue({ id: 1 });

      const applyTemplate = async (templateId, customerId, additionalItems = []) => {
        return await cachedFetch(`/api/quotations/from-template/${templateId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customer_id: customerId, additional_items: additionalItems })
        });
      };

      await applyTemplate(1, 1, additionalItems);

      expect(cachedFetch).toHaveBeenCalledWith(
        '/api/quotations/from-template/1',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('additional_items')
        })
      );
    });
  });

  describe('updateTemplate', () => {
    test('should update existing template', async () => {
      const templateId = 1;
      const updatedData = {
        name: 'Updated Package',
        items: [{ product_id: 2, quantity: 2 }]
      };

      const updatedTemplate = { id: templateId, ...updatedData };

      cachedFetch.mockResolvedValue(updatedTemplate);

      const updateTemplate = async (id, data) => {
        return await cachedFetch(`/api/quote-templates/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      };

      const result = await updateTemplate(templateId, updatedData);

      expect(result.id).toBe(templateId);
      expect(result.name).toBe(updatedData.name);
    });
  });

  describe('deleteTemplate', () => {
    test('should delete template', async () => {
      const templateId = 1;

      cachedFetch.mockResolvedValue({ message: 'Template deleted successfully' });

      const deleteTemplate = async (id) => {
        return await cachedFetch(`/api/quote-templates/${id}`, {
          method: 'DELETE'
        });
      };

      const result = await deleteTemplate(templateId);

      expect(cachedFetch).toHaveBeenCalledWith(
        `/api/quote-templates/${templateId}`,
        { method: 'DELETE' }
      );
      expect(result).toHaveProperty('message');
    });
  });

  describe('Template name helpers', () => {
    test('should generate template name from items', () => {
      const generateTemplateName = (items) => {
        if (!items || items.length === 0) return 'Empty Template';
        if (items.length === 1) return '1 Item Package';
        return `${items.length} Item Package`;
      };

      expect(generateTemplateName([])).toBe('Empty Template');
      expect(generateTemplateName([{ product_id: 1 }])).toBe('1 Item Package');
      expect(generateTemplateName([{ product_id: 1 }, { product_id: 2 }])).toBe('2 Item Package');
    });

    test('should sanitize template name', () => {
      const sanitizeTemplateName = (name) => {
        return name.trim().replace(/[^a-zA-Z0-9\s-]/g, '').substring(0, 100);
      };

      expect(sanitizeTemplateName('  Test  ')).toBe('Test');
      expect(sanitizeTemplateName('Test@#$%Package')).toBe('TestPackage');
      expect(sanitizeTemplateName('Valid-Name 123')).toBe('Valid-Name 123');
    });
  });
});
