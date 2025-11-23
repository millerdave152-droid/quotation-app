import React, { useEffect, useState } from 'react';

const API_BASE = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

function TestAPI() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    console.log('Fetching from API...');
    
    fetch(`${API_BASE}/products`)
      .then(response => {
        console.log('Response status:', response.status);
        return response.json();
      })
      .then(data => {
        console.log('Data received:', data.length, 'products');
        setData(data);
      })
      .catch(err => {
        console.error('Error:', err);
        setError(err.message);
      });
  }, []);

  return (
    <div style={{ padding: '20px' }}>
      <h1>API Test</h1>
      {error && <div style={{ color: 'red' }}>Error: {error}</div>}
      {data && (
        <div>
          <h2>Success! Got {data.length} products</h2>
          <pre>{JSON.stringify(data[0], null, 2)}</pre>
        </div>
      )}
      {!data && !error && <div>Loading...</div>}
    </div>
  );
}

export default TestAPI;