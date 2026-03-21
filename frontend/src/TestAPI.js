import React, { useEffect, useState } from 'react';

import { authFetch } from './services/authFetch';
const API_BASE = `${process.env.REACT_APP_API_URL || ''}/api`;

function TestAPI() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    
    authFetch(`${API_BASE}/products`)
      .then(response => {
        return response.json();
      })
      .then(data => {
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