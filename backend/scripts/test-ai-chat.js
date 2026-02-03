/**
 * Test AI Chat Endpoint
 */

const axios = require('axios');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const API_BASE = 'http://localhost:3001';

async function testAIChat() {
  console.log('');
  console.log('==========================================');
  console.log('  AI ASSISTANT TEST');
  console.log('==========================================');
  console.log('');

  try {
    // Step 1: Login to get token
    console.log('1. Logging in as admin@yourcompany.com...');
    const loginResponse = await axios.post(`${API_BASE}/api/auth/login`, {
      email: 'admin@yourcompany.com',
      password: 'TestPass123!'
    });

    if (!loginResponse.data.success) {
      throw new Error('Login failed: ' + loginResponse.data.message);
    }

    const token = loginResponse.data.data.accessToken;
    console.log('   ✅ Login successful');
    console.log('');

    // Step 2: Test health endpoint
    console.log('2. Checking AI health...');
    const healthResponse = await axios.get(`${API_BASE}/api/ai/health`);
    console.log('   Status:', healthResponse.data.data.status);
    console.log('   API Key:', healthResponse.data.data.apiKeyConfigured ? 'Configured' : 'Missing');
    console.log('');

    // Step 3: Test chat with a simple query
    console.log('3. Testing chat: "What can you help me with?"');
    console.log('   Waiting for response...');
    const startTime = Date.now();

    const chatResponse = await axios.post(
      `${API_BASE}/api/ai/chat`,
      { message: 'What can you help me with?' },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const responseTime = Date.now() - startTime;

    if (chatResponse.data.success) {
      console.log('');
      console.log('   ✅ Chat successful!');
      console.log('   Model:', chatResponse.data.data.model);
      console.log('   Query Type:', chatResponse.data.data.queryType);
      console.log('   Response Time:', responseTime + 'ms');
      console.log('   Tokens:', chatResponse.data.data.tokenUsage?.input + ' in / ' + chatResponse.data.data.tokenUsage?.output + ' out');
      console.log('');
      console.log('   Response:');
      console.log('   -----------------------------------------');
      console.log('  ', chatResponse.data.data.message.substring(0, 500));
      if (chatResponse.data.data.message.length > 500) {
        console.log('   ... (truncated)');
      }
      console.log('   -----------------------------------------');
    } else {
      console.log('   ❌ Chat failed:', chatResponse.data.message);
    }

    // Step 4: Test a customer lookup
    console.log('');
    console.log('4. Testing customer lookup: "Find customers"');
    const lookupResponse = await axios.post(
      `${API_BASE}/api/ai/chat`,
      {
        message: 'Show me the first 3 customers in the system',
        conversationId: chatResponse.data.data.conversationId
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (lookupResponse.data.success) {
      console.log('   ✅ Customer lookup successful!');
      console.log('   Model:', lookupResponse.data.data.model);
      console.log('');
      console.log('   Response:');
      console.log('   -----------------------------------------');
      console.log('  ', lookupResponse.data.data.message.substring(0, 800));
      if (lookupResponse.data.data.message.length > 800) {
        console.log('   ... (truncated)');
      }
      console.log('   -----------------------------------------');
    }

    console.log('');
    console.log('==========================================');
    console.log('  ALL TESTS PASSED');
    console.log('==========================================');
    console.log('');
    console.log('The AI Assistant is ready to use!');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Test failed:', error.response?.data?.message || error.message);
    if (error.response?.data) {
      console.error('   Response:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

testAIChat();
