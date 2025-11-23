const http = require('http');

function testEndpoint() {
  const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/analytics/revenue-features?period=30',
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  console.log('Testing GET /api/analytics/revenue-features...\n');

  const req = http.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      console.log(`Status Code: ${res.statusCode}\n`);

      try {
        const jsonData = JSON.parse(data);
        console.log('Response:');
        console.log(JSON.stringify(jsonData, null, 2));

        if (res.statusCode === 200) {
          console.log('\n✅ Analytics endpoint is working correctly!');
        } else {
          console.log('\n❌ Analytics endpoint returned an error');
        }
      } catch (error) {
        console.log('Raw response:', data);
        console.log('\n❌ Failed to parse JSON response');
      }

      process.exit(res.statusCode === 200 ? 0 : 1);
    });
  });

  req.on('error', (error) => {
    console.error('❌ Request error:', error.message);
    process.exit(1);
  });

  req.end();
}

testEndpoint();
