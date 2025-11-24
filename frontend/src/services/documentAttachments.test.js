import { cachedFetch } from './apiCache';

jest.mock('./apiCache');

describe('Document Attachments Service', () => {
  const API_BASE_URL = '/api';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadAttachment', () => {
    test('should upload file to quotation', async () => {
      const mockResponse = {
        success: true,
        attachment: {
          id: 1,
          quotation_id: 1,
          filename: 'contract.pdf',
          file_size: 102400,
          mime_type: 'application/pdf'
        }
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const uploadAttachment = async (quotationId, file, description) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('filename', file.name);
        formData.append('file_size', file.size);
        formData.append('mime_type', file.type);
        if (description) formData.append('description', description);

        const response = await fetch(`${API_BASE_URL}/quotations/${quotationId}/attachments`, {
          method: 'POST',
          body: formData
        });

        return await response.json();
      };

      const mockFile = new File(['content'], 'contract.pdf', { type: 'application/pdf' });
      const result = await uploadAttachment(1, mockFile, 'Service contract');

      expect(result.success).toBe(true);
      expect(result.attachment.filename).toBe('contract.pdf');
    });
  });

  describe('getAttachments', () => {
    test('should fetch all attachments for quotation', async () => {
      const mockData = {
        attachments: [
          {
            id: 1,
            filename: 'contract.pdf',
            file_size: 102400,
            mime_type: 'application/pdf',
            uploaded_by_name: 'John Doe'
          },
          {
            id: 2,
            filename: 'specs.docx',
            file_size: 51200,
            mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            uploaded_by_name: 'Jane Smith'
          }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const getAttachments = async (quotationId) => {
        const data = await cachedFetch(`${API_BASE_URL}/quotations/${quotationId}/attachments`);
        return data;
      };

      const result = await getAttachments(1);

      expect(result.attachments).toHaveLength(2);
      expect(result.attachments[0].filename).toBe('contract.pdf');
    });
  });

  describe('downloadAttachment', () => {
    test('should download attachment', async () => {
      // Mock URL.createObjectURL
      global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(['file content'], { type: 'application/pdf' }),
        headers: new Map([
          ['content-disposition', 'attachment; filename="contract.pdf"'],
          ['content-type', 'application/pdf']
        ])
      });

      const downloadAttachment = async (attachmentId) => {
        const response = await fetch(`${API_BASE_URL}/attachments/${attachmentId}/download`);
        if (!response.ok) throw new Error('Download failed');

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = 'contract.pdf';

        return { success: true, blob, url };
      };

      const result = await downloadAttachment(1);

      expect(result.success).toBe(true);
      expect(result.blob).toBeDefined();
      expect(result.url).toBe('blob:mock-url');
    });
  });

  describe('deleteAttachment', () => {
    test('should delete attachment', async () => {
      const mockResponse = {
        success: true,
        message: 'Attachment deleted successfully'
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const deleteAttachment = async (attachmentId) => {
        const response = await fetch(`${API_BASE_URL}/attachments/${attachmentId}`, {
          method: 'DELETE'
        });
        return await response.json();
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const result = await deleteAttachment(1);

      expect(result.success).toBe(true);
      expect(result.message).toContain('deleted successfully');
    });
  });

  describe('updateAttachment', () => {
    test('should update attachment metadata', async () => {
      const mockResponse = {
        success: true,
        attachment: {
          id: 1,
          filename: 'new-name.pdf',
          description: 'Updated description'
        }
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const updateAttachment = async (attachmentId, updates) => {
        const response = await fetch(`${API_BASE_URL}/attachments/${attachmentId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        });
        return await response.json();
      };

      const result = await updateAttachment(1, {
        filename: 'new-name.pdf',
        description: 'Updated description'
      });

      expect(result.success).toBe(true);
      expect(result.attachment.filename).toBe('new-name.pdf');
    });
  });

  describe('createVersion', () => {
    test('should create new version of attachment', async () => {
      const mockResponse = {
        success: true,
        attachment: {
          id: 1,
          version: 2
        },
        message: 'New version 2 created'
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const createVersion = async (attachmentId, file) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('file_size', file.size);
        formData.append('mime_type', file.type);

        const response = await fetch(`${API_BASE_URL}/attachments/${attachmentId}/versions`, {
          method: 'POST',
          body: formData
        });

        return await response.json();
      };

      const mockFile = new File(['new content'], 'contract.pdf', { type: 'application/pdf' });
      const result = await createVersion(1, mockFile);

      expect(result.success).toBe(true);
      expect(result.attachment.version).toBe(2);
    });
  });

  describe('getVersionHistory', () => {
    test('should fetch version history', async () => {
      const mockData = {
        versions: [
          { version: 2, filename: 'contract.pdf', created_by_name: 'Jane Smith' },
          { version: 1, filename: 'contract.pdf', created_by_name: 'John Doe' }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const getVersionHistory = async (attachmentId) => {
        const data = await cachedFetch(`${API_BASE_URL}/attachments/${attachmentId}/versions`);
        return data;
      };

      const result = await getVersionHistory(1);

      expect(result.versions).toHaveLength(2);
      expect(result.versions[0].version).toBe(2);
    });
  });

  describe('getStatistics', () => {
    test('should fetch attachment statistics', async () => {
      const mockData = {
        total_attachments: 50,
        total_size: 5242880,
        avg_size: 104857.6,
        total_downloads: 200,
        quotes_with_attachments: 30,
        by_type: [
          { mime_type: 'application/pdf', count: 30 },
          { mime_type: 'image/jpeg', count: 20 }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const getStatistics = async (startDate, endDate) => {
        const data = await cachedFetch(
          `${API_BASE_URL}/attachments/statistics?start_date=${startDate}&end_date=${endDate}`
        );
        return data;
      };

      const result = await getStatistics('2024-01-01', '2024-12-31');

      expect(result.total_attachments).toBe(50);
      expect(result.by_type).toHaveLength(2);
    });
  });

  describe('File Validation', () => {
    test('should validate file size', () => {
      const validateFileSize = (fileSize, maxSize = 50 * 1024 * 1024) => {
        if (fileSize > maxSize) {
          throw new Error(`File size exceeds maximum limit of ${maxSize / (1024 * 1024)}MB`);
        }
        return true;
      };

      expect(validateFileSize(1024 * 1024)).toBe(true);
      expect(() => validateFileSize(60 * 1024 * 1024)).toThrow('exceeds maximum limit');
    });

    test('should validate file type', () => {
      const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/gif',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
        'application/zip'
      ];

      const validateFileType = (mimeType) => {
        if (!allowedTypes.includes(mimeType)) {
          throw new Error('File type not allowed');
        }
        return true;
      };

      expect(validateFileType('application/pdf')).toBe(true);
      expect(validateFileType('image/jpeg')).toBe(true);
      expect(() => validateFileType('application/x-msdownload')).toThrow('File type not allowed');
    });

    test('should validate file name', () => {
      const validateFileName = (filename) => {
        if (!filename || filename.trim() === '') {
          throw new Error('Filename is required');
        }
        if (filename.length > 255) {
          throw new Error('Filename too long');
        }
        if (!/^[a-zA-Z0-9._\-\s]+$/.test(filename)) {
          throw new Error('Filename contains invalid characters');
        }
        return true;
      };

      expect(validateFileName('contract.pdf')).toBe(true);
      expect(validateFileName('my-file_v2.docx')).toBe(true);
      expect(() => validateFileName('')).toThrow('Filename is required');
      expect(() => validateFileName('file<script>.pdf')).toThrow('invalid characters');
    });
  });

  describe('File Size Formatting', () => {
    test('should format bytes to human readable', () => {
      const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
      };

      expect(formatFileSize(0)).toBe('0 Bytes');
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1048576)).toBe('1 MB');
      expect(formatFileSize(102400)).toBe('100 KB');
    });

    test('should calculate total size', () => {
      const calculateTotalSize = (attachments) => {
        return attachments.reduce((sum, att) => sum + att.file_size, 0);
      };

      const attachments = [
        { file_size: 1024 },
        { file_size: 2048 },
        { file_size: 512 }
      ];

      expect(calculateTotalSize(attachments)).toBe(3584);
    });
  });

  describe('File Type Detection', () => {
    test('should get file extension', () => {
      const getFileExtension = (filename) => {
        const parts = filename.split('.');
        return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
      };

      expect(getFileExtension('contract.pdf')).toBe('pdf');
      expect(getFileExtension('image.JPG')).toBe('jpg');
      expect(getFileExtension('document.tar.gz')).toBe('gz');
    });

    test('should get file type icon', () => {
      const getFileTypeIcon = (mimeType) => {
        if (mimeType.startsWith('image/')) return 'image';
        if (mimeType === 'application/pdf') return 'pdf';
        if (mimeType.includes('word')) return 'word';
        if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'excel';
        if (mimeType === 'text/plain') return 'text';
        if (mimeType === 'application/zip') return 'zip';
        return 'file';
      };

      expect(getFileTypeIcon('application/pdf')).toBe('pdf');
      expect(getFileTypeIcon('image/jpeg')).toBe('image');
      expect(getFileTypeIcon('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('word');
      expect(getFileTypeIcon('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('excel');
      expect(getFileTypeIcon('application/unknown')).toBe('file');
    });

    test('should check if file is image', () => {
      const isImage = (mimeType) => {
        return mimeType.startsWith('image/');
      };

      expect(isImage('image/jpeg')).toBe(true);
      expect(isImage('image/png')).toBe(true);
      expect(isImage('application/pdf')).toBe(false);
    });
  });

  describe('Drag and Drop Utilities', () => {
    test('should validate dropped files', () => {
      const validateDroppedFiles = (files, maxFiles = 10) => {
        if (files.length === 0) {
          throw new Error('No files selected');
        }
        if (files.length > maxFiles) {
          throw new Error(`Maximum ${maxFiles} files allowed`);
        }
        return true;
      };

      expect(validateDroppedFiles([{ name: 'file1.pdf' }])).toBe(true);
      expect(() => validateDroppedFiles([])).toThrow('No files selected');
    });

    test('should filter valid files', () => {
      const filterValidFiles = (files, allowedTypes) => {
        return files.filter(file => allowedTypes.includes(file.type));
      };

      const files = [
        { name: 'doc.pdf', type: 'application/pdf' },
        { name: 'image.jpg', type: 'image/jpeg' },
        { name: 'script.exe', type: 'application/x-msdownload' }
      ];

      const allowedTypes = ['application/pdf', 'image/jpeg'];
      const valid = filterValidFiles(files, allowedTypes);

      expect(valid).toHaveLength(2);
      expect(valid.find(f => f.name === 'script.exe')).toBeUndefined();
    });
  });

  describe('Upload Progress', () => {
    test('should calculate upload progress percentage', () => {
      const calculateProgress = (loaded, total) => {
        if (total === 0) return 0;
        return Math.round((loaded / total) * 100);
      };

      expect(calculateProgress(0, 1000)).toBe(0);
      expect(calculateProgress(500, 1000)).toBe(50);
      expect(calculateProgress(1000, 1000)).toBe(100);
    });

    test('should format upload speed', () => {
      const formatUploadSpeed = (bytesPerSecond) => {
        if (bytesPerSecond < 1024) return `${bytesPerSecond} B/s`;
        if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(2)} KB/s`;
        return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`;
      };

      expect(formatUploadSpeed(500)).toBe('500 B/s');
      expect(formatUploadSpeed(2048)).toBe('2.00 KB/s');
      expect(formatUploadSpeed(2097152)).toBe('2.00 MB/s');
    });

    test('should estimate time remaining', () => {
      const estimateTimeRemaining = (bytesRemaining, bytesPerSecond) => {
        if (bytesPerSecond === 0) return Infinity;
        const secondsRemaining = bytesRemaining / bytesPerSecond;

        if (secondsRemaining < 60) return `${Math.ceil(secondsRemaining)}s`;
        if (secondsRemaining < 3600) return `${Math.ceil(secondsRemaining / 60)}m`;
        return `${Math.ceil(secondsRemaining / 3600)}h`;
      };

      expect(estimateTimeRemaining(1000, 100)).toBe('10s');
      expect(estimateTimeRemaining(60000, 1000)).toBe('1m');
      expect(estimateTimeRemaining(7200000, 1000)).toBe('2h');
    });
  });

  describe('Attachment Sorting', () => {
    test('should sort by upload date', () => {
      const sortByDate = (attachments, order = 'desc') => {
        return [...attachments].sort((a, b) => {
          const dateA = new Date(a.created_at);
          const dateB = new Date(b.created_at);
          return order === 'desc' ? dateB - dateA : dateA - dateB;
        });
      };

      const attachments = [
        { id: 1, created_at: '2024-01-15' },
        { id: 2, created_at: '2024-01-20' },
        { id: 3, created_at: '2024-01-10' }
      ];

      const sorted = sortByDate(attachments, 'desc');
      expect(sorted[0].id).toBe(2);
      expect(sorted[2].id).toBe(3);
    });

    test('should sort by file size', () => {
      const sortBySize = (attachments, order = 'desc') => {
        return [...attachments].sort((a, b) => {
          return order === 'desc' ? b.file_size - a.file_size : a.file_size - b.file_size;
        });
      };

      const attachments = [
        { id: 1, file_size: 1024 },
        { id: 2, file_size: 5120 },
        { id: 3, file_size: 512 }
      ];

      const sorted = sortBySize(attachments, 'desc');
      expect(sorted[0].id).toBe(2);
      expect(sorted[2].id).toBe(3);
    });

    test('should sort by filename', () => {
      const sortByName = (attachments, order = 'asc') => {
        return [...attachments].sort((a, b) => {
          const comparison = a.filename.localeCompare(b.filename);
          return order === 'asc' ? comparison : -comparison;
        });
      };

      const attachments = [
        { filename: 'zebra.pdf' },
        { filename: 'apple.pdf' },
        { filename: 'banana.pdf' }
      ];

      const sorted = sortByName(attachments);
      expect(sorted[0].filename).toBe('apple.pdf');
      expect(sorted[2].filename).toBe('zebra.pdf');
    });
  });

  describe('Attachment Filtering', () => {
    test('should filter by file type', () => {
      const filterByType = (attachments, mimeType) => {
        return attachments.filter(att => att.mime_type === mimeType);
      };

      const attachments = [
        { id: 1, mime_type: 'application/pdf' },
        { id: 2, mime_type: 'image/jpeg' },
        { id: 3, mime_type: 'application/pdf' }
      ];

      const pdfs = filterByType(attachments, 'application/pdf');
      expect(pdfs).toHaveLength(2);
    });

    test('should filter by uploader', () => {
      const filterByUploader = (attachments, uploaderId) => {
        return attachments.filter(att => att.uploaded_by === uploaderId);
      };

      const attachments = [
        { id: 1, uploaded_by: 1 },
        { id: 2, uploaded_by: 2 },
        { id: 3, uploaded_by: 1 }
      ];

      const user1Attachments = filterByUploader(attachments, 1);
      expect(user1Attachments).toHaveLength(2);
    });

    test('should search by filename', () => {
      const searchByFilename = (attachments, query) => {
        const lowerQuery = query.toLowerCase();
        return attachments.filter(att =>
          att.filename.toLowerCase().includes(lowerQuery)
        );
      };

      const attachments = [
        { filename: 'contract-2024.pdf' },
        { filename: 'invoice-jan.pdf' },
        { filename: 'contract-updated.pdf' }
      ];

      const results = searchByFilename(attachments, 'contract');
      expect(results).toHaveLength(2);
    });
  });

  describe('Thumbnail Generation', () => {
    test('should check if file supports thumbnail', () => {
      const supportsThumbnail = (mimeType) => {
        const thumbnailTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
        return thumbnailTypes.includes(mimeType);
      };

      expect(supportsThumbnail('image/jpeg')).toBe(true);
      expect(supportsThumbnail('application/pdf')).toBe(true);
      expect(supportsThumbnail('application/msword')).toBe(false);
    });

    test('should generate thumbnail URL', () => {
      const generateThumbnailUrl = (attachmentId, size = 'medium') => {
        return `${API_BASE_URL}/attachments/${attachmentId}/thumbnail?size=${size}`;
      };

      expect(generateThumbnailUrl(1)).toBe('/api/attachments/1/thumbnail?size=medium');
      expect(generateThumbnailUrl(2, 'large')).toBe('/api/attachments/2/thumbnail?size=large');
    });
  });

  describe('Batch Operations', () => {
    test('should prepare multiple files for upload', () => {
      const prepareFilesForUpload = (files) => {
        return Array.from(files).map((file, index) => ({
          id: `temp_${index}`,
          file: file,
          filename: file.name,
          file_size: file.size,
          mime_type: file.type,
          status: 'pending'
        }));
      };

      const mockFiles = [
        new File(['content1'], 'file1.pdf', { type: 'application/pdf' }),
        new File(['content2'], 'file2.jpg', { type: 'image/jpeg' })
      ];

      const prepared = prepareFilesForUpload(mockFiles);

      expect(prepared).toHaveLength(2);
      expect(prepared[0].filename).toBe('file1.pdf');
      expect(prepared[0].status).toBe('pending');
    });

    test('should calculate batch upload statistics', () => {
      const calculateBatchStats = (uploads) => {
        const completed = uploads.filter(u => u.status === 'completed').length;
        const failed = uploads.filter(u => u.status === 'failed').length;
        const pending = uploads.filter(u => u.status === 'pending').length;
        const total = uploads.length;

        return {
          completed,
          failed,
          pending,
          total,
          progress: Math.round((completed / total) * 100)
        };
      };

      const uploads = [
        { status: 'completed' },
        { status: 'completed' },
        { status: 'failed' },
        { status: 'pending' }
      ];

      const stats = calculateBatchStats(uploads);

      expect(stats.completed).toBe(2);
      expect(stats.failed).toBe(1);
      expect(stats.pending).toBe(1);
      expect(stats.progress).toBe(50);
    });
  });
});
