/**
 * Authentication Endpoints Test Script
 * Tests all authentication endpoints with various scenarios
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3001/api/auth';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  bold: '\x1b[1m'
};

let testResults = {
  passed: 0,
  failed: 0,
  warnings: 0
};

let authTokens = {
  accessToken: null,
  refreshToken: null
};

// Test helper functions
function pass(message) {
  console.log(`${colors.green}✓ PASS${colors.reset} ${message}`);
  testResults.passed++;
}

function fail(message, error = '') {
  console.log(`${colors.red}✗ FAIL${colors.reset} ${message}`);
  if (error) console.log(`  ${colors.red}Error:${colors.reset} ${error}`);
  testResults.failed++;
}

function warn(message) {
  console.log(`${colors.yellow}⚠ WARN${colors.reset} ${message}`);
  testResults.warnings++;
}

function info(message) {
  console.log(`${colors.blue}ℹ${colors.reset} ${message}`);
}

function section(title) {
  console.log(`\n${colors.bold}${colors.blue}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.bold}${title}${colors.reset}`);
  console.log(`${colors.bold}${colors.blue}${'='.repeat(60)}${colors.reset}\n`);
}

// Test cases
async function testHealthCheck() {
  section('TEST 1: Health Check');
  try {
    const response = await axios.get('http://localhost:3001/health');
    if (response.status === 200) {
      pass('Server health check');
      info(`Response: ${JSON.stringify(response.data)}`);
    } else {
      fail('Server health check', `Unexpected status: ${response.status}`);
    }
  } catch (error) {
    fail('Server health check', error.message);
  }
}

async function testRegistrationValidation() {
  section('TEST 2: Registration Input Validation');

  // Test missing email
  try {
    await axios.post(`${BASE_URL}/register`, {
      password: 'TestPass123!',
      firstName: 'Test',
      lastName: 'User'
    });
    fail('Should reject missing email');
  } catch (error) {
    if (error.response && error.response.status === 400) {
      pass('Rejects missing email');
    } else {
      fail('Should reject missing email', error.message);
    }
  }

  // Test invalid email format
  try {
    await axios.post(`${BASE_URL}/register`, {
      email: 'not-an-email',
      password: 'TestPass123!',
      firstName: 'Test',
      lastName: 'User'
    });
    fail('Should reject invalid email format');
  } catch (error) {
    if (error.response && error.response.status === 400) {
      pass('Rejects invalid email format');
    } else {
      fail('Should reject invalid email format', error.message);
    }
  }

  // Test weak password
  try {
    await axios.post(`${BASE_URL}/register`, {
      email: 'test@example.com',
      password: '123',
      firstName: 'Test',
      lastName: 'User'
    });
    fail('Should reject weak password');
  } catch (error) {
    if (error.response && error.response.status === 400) {
      pass('Rejects weak password');
    } else {
      fail('Should reject weak password', error.message);
    }
  }
}

async function testSuccessfulRegistration() {
  section('TEST 3: Successful User Registration');

  const timestamp = Date.now();
  const testUser = {
    email: `testuser${timestamp}@example.com`,
    password: 'SecurePass123!',
    firstName: 'Test',
    lastName: 'User'
  };

  try {
    const response = await axios.post(`${BASE_URL}/register`, testUser);

    if (response.status === 201 && response.data.success) {
      pass('User registration successful');

      if (response.data.data.accessToken && response.data.data.refreshToken) {
        pass('Received access and refresh tokens');
        authTokens.accessToken = response.data.data.accessToken;
        authTokens.refreshToken = response.data.data.refreshToken;
        info(`Access Token: ${authTokens.accessToken.substring(0, 20)}...`);
      } else {
        fail('Missing tokens in registration response');
      }

      if (response.data.data.user) {
        pass('User data returned');
        info(`User: ${JSON.stringify(response.data.data.user)}`);
      } else {
        fail('Missing user data in response');
      }
    } else {
      fail('User registration', 'Unexpected response structure');
    }
  } catch (error) {
    fail('User registration', error.response?.data?.message || error.message);
  }
}

async function testDuplicateRegistration() {
  section('TEST 4: Duplicate Email Prevention');

  const duplicateUser = {
    email: 'admin@yourcompany.com',  // This should already exist
    password: 'SecurePass123!',
    firstName: 'Test',
    lastName: 'User'
  };

  try {
    await axios.post(`${BASE_URL}/register`, duplicateUser);
    fail('Should reject duplicate email');
  } catch (error) {
    if (error.response && error.response.status === 409) {
      pass('Rejects duplicate email registration');
    } else {
      fail('Should reject duplicate email', error.message);
    }
  }
}

async function testLoginValidation() {
  section('TEST 5: Login Input Validation');

  // Test missing credentials
  try {
    await axios.post(`${BASE_URL}/login`, {});
    fail('Should reject missing credentials');
  } catch (error) {
    if (error.response && error.response.status === 400) {
      pass('Rejects missing credentials');
    } else {
      fail('Should reject missing credentials', error.message);
    }
  }

  // Test invalid credentials
  try {
    await axios.post(`${BASE_URL}/login`, {
      email: 'nonexistent@example.com',
      password: 'WrongPass123!'
    });
    fail('Should reject invalid credentials');
  } catch (error) {
    if (error.response && error.response.status === 401) {
      pass('Rejects invalid credentials');
    } else {
      fail('Should reject invalid credentials', error.message);
    }
  }
}

async function testSuccessfulLogin() {
  section('TEST 6: Successful Login');

  const loginData = {
    email: 'admin@yourcompany.com',
    password: 'admin123'
  };

  try {
    const response = await axios.post(`${BASE_URL}/login`, loginData);

    if (response.status === 200 && response.data.success) {
      pass('Login successful');

      if (response.data.data.accessToken && response.data.data.refreshToken) {
        pass('Received access and refresh tokens');
        authTokens.accessToken = response.data.data.accessToken;
        authTokens.refreshToken = response.data.data.refreshToken;
      } else {
        fail('Missing tokens in login response');
      }

      if (response.data.data.user) {
        pass('User data returned');
        info(`User: ${JSON.stringify(response.data.data.user)}`);
      } else {
        fail('Missing user data in response');
      }
    } else {
      fail('Login', 'Unexpected response structure');
    }
  } catch (error) {
    fail('Login', error.response?.data?.message || error.message);
  }
}

async function testProtectedEndpoint() {
  section('TEST 7: Protected Endpoint Access');

  // Test without token
  try {
    await axios.get(`${BASE_URL}/me`);
    fail('Should reject request without token');
  } catch (error) {
    if (error.response && error.response.status === 401) {
      pass('Rejects request without authentication token');
    } else {
      fail('Should reject request without token', error.message);
    }
  }

  // Test with invalid token
  try {
    await axios.get(`${BASE_URL}/me`, {
      headers: { 'Authorization': 'Bearer invalid-token' }
    });
    fail('Should reject invalid token');
  } catch (error) {
    if (error.response && error.response.status === 401) {
      pass('Rejects invalid authentication token');
    } else {
      fail('Should reject invalid token', error.message);
    }
  }

  // Test with valid token
  if (authTokens.accessToken) {
    try {
      const response = await axios.get(`${BASE_URL}/me`, {
        headers: { 'Authorization': `Bearer ${authTokens.accessToken}` }
      });

      if (response.status === 200 && response.data.success) {
        pass('Access granted with valid token');
        info(`Current user: ${JSON.stringify(response.data.data.user)}`);
      } else {
        fail('Valid token should grant access');
      }
    } catch (error) {
      fail('Valid token should grant access', error.message);
    }
  } else {
    warn('Skipping valid token test - no token available');
  }
}

async function testTokenRefresh() {
  section('TEST 8: Token Refresh');

  if (!authTokens.refreshToken) {
    warn('Skipping token refresh test - no refresh token available');
    return;
  }

  try {
    const response = await axios.post(`${BASE_URL}/refresh`, {
      refreshToken: authTokens.refreshToken
    });

    if (response.status === 200 && response.data.success) {
      pass('Token refresh successful');

      if (response.data.data.accessToken && response.data.data.refreshToken) {
        pass('Received new tokens');
        authTokens.accessToken = response.data.data.accessToken;
        authTokens.refreshToken = response.data.data.refreshToken;
      } else {
        fail('Missing tokens in refresh response');
      }
    } else {
      fail('Token refresh', 'Unexpected response structure');
    }
  } catch (error) {
    fail('Token refresh', error.response?.data?.message || error.message);
  }
}

async function testLogout() {
  section('TEST 9: Logout');

  if (!authTokens.refreshToken) {
    warn('Skipping logout test - no refresh token available');
    return;
  }

  try {
    const response = await axios.post(`${BASE_URL}/logout`, {
      refreshToken: authTokens.refreshToken
    });

    if (response.status === 200 && response.data.success) {
      pass('Logout successful');
    } else {
      fail('Logout', 'Unexpected response structure');
    }
  } catch (error) {
    fail('Logout', error.response?.data?.message || error.message);
  }

  // Verify token is revoked
  try {
    await axios.post(`${BASE_URL}/refresh`, {
      refreshToken: authTokens.refreshToken
    });
    fail('Should reject revoked refresh token');
  } catch (error) {
    if (error.response && error.response.status === 401) {
      pass('Revoked token cannot be used');
    } else {
      fail('Should reject revoked token', error.message);
    }
  }
}

async function testRateLimiting() {
  section('TEST 10: Rate Limiting');

  info('Testing authentication rate limiter (5 requests per 15 minutes)...');

  const requests = [];
  for (let i = 0; i < 6; i++) {
    requests.push(
      axios.post(`${BASE_URL}/login`, {
        email: 'test@test.com',
        password: 'wrong'
      }).catch(err => err.response)
    );
  }

  const responses = await Promise.all(requests);
  const rateLimited = responses.filter(r => r && r.status === 429);

  if (rateLimited.length > 0) {
    pass('Rate limiting is active');
    info(`Blocked ${rateLimited.length} requests`);
  } else {
    warn('Rate limiting may not be working as expected');
  }
}

// Main test runner
async function runTests() {
  console.log(`\n${colors.bold}${colors.blue}╔${'═'.repeat(58)}╗${colors.reset}`);
  console.log(`${colors.bold}${colors.blue}║${colors.reset}  ${colors.bold}AUTHENTICATION ENDPOINTS TEST SUITE${colors.reset}                 ${colors.bold}${colors.blue}║${colors.reset}`);
  console.log(`${colors.bold}${colors.blue}╚${'═'.repeat(58)}╝${colors.reset}\n`);

  try {
    await testHealthCheck();
    await testRegistrationValidation();
    await testSuccessfulRegistration();
    await testDuplicateRegistration();
    await testLoginValidation();
    await testSuccessfulLogin();
    await testProtectedEndpoint();
    await testTokenRefresh();
    await testLogout();
    await testRateLimiting();

    // Print summary
    section('TEST RESULTS SUMMARY');
    console.log(`${colors.green}Passed:   ${testResults.passed}${colors.reset}`);
    console.log(`${colors.red}Failed:   ${testResults.failed}${colors.reset}`);
    console.log(`${colors.yellow}Warnings: ${testResults.warnings}${colors.reset}`);
    console.log(`Total:    ${testResults.passed + testResults.failed}\n`);

    const successRate = ((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1);
    console.log(`Success Rate: ${successRate}%\n`);

    if (testResults.failed === 0) {
      console.log(`${colors.bold}${colors.green}✓ ALL TESTS PASSED!${colors.reset}\n`);
      process.exit(0);
    } else {
      console.log(`${colors.bold}${colors.red}✗ SOME TESTS FAILED${colors.reset}\n`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`${colors.red}Test suite error:${colors.reset}`, error.message);
    process.exit(1);
  }
}

// Run tests
runTests();
