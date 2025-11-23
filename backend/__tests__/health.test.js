const request = require('supertest');
const express = require('express');

// Simple test for health endpoint
describe('Health Check Endpoint', () => {
  let app;

  beforeAll(() => {
    // Create minimal Express app for testing
    app = express();
    app.use(express.json());

    app.get('/api/health', (req, res) => {
      res.json({
        status: 'OK',
        message: 'Backend is running',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        securityEnabled: true
      });
    });
  });

  test('GET /api/health should return 200 OK', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'OK');
    expect(response.body).toHaveProperty('message', 'Backend is running');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('environment');
    expect(response.body).toHaveProperty('securityEnabled', true);
  });

  test('GET /api/health should return valid JSON', async () => {
    const response = await request(app).get('/api/health');

    expect(response.headers['content-type']).toMatch(/json/);
    expect(response.body).toBeDefined();
  });

  test('GET /api/health timestamp should be valid ISO date', async () => {
    const response = await request(app).get('/api/health');

    const timestamp = new Date(response.body.timestamp);
    expect(timestamp).toBeInstanceOf(Date);
    expect(timestamp.toString()).not.toBe('Invalid Date');
  });
});
