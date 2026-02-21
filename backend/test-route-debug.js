// Debug: check if init functions return valid routers
require('dotenv').config();
const pool = require('./db');

// Test store-credits
try {
  const { init: initSC } = require('./routes/store-credits');
  const router = initSC({ pool, cache: null });
  console.log('store-credits init returned:', typeof router);
  console.log('store-credits stack length:', router.stack ? router.stack.length : 'no stack');
  if (router.stack) {
    router.stack.forEach((layer, i) => {
      if (layer.route) {
        console.log('  Route:', layer.route.methods ? Object.keys(layer.route.methods).join(',').toUpperCase() : '?', layer.route.path);
      } else {
        console.log('  Middleware:', layer.name || 'anonymous');
      }
    });
  }
} catch (e) {
  console.log('store-credits ERROR:', e.message);
}

// Test gift-cards
console.log('\n');
try {
  const { init: initGC } = require('./routes/gift-cards');
  const router = initGC({ pool, emailService: null });
  console.log('gift-cards init returned:', typeof router);
  console.log('gift-cards stack length:', router.stack ? router.stack.length : 'no stack');
  if (router.stack) {
    router.stack.forEach((layer, i) => {
      if (layer.route) {
        console.log('  Route:', Object.keys(layer.route.methods).join(',').toUpperCase(), layer.route.path);
      } else {
        console.log('  Middleware:', layer.name || 'anonymous');
      }
    });
  }
} catch (e) {
  console.log('gift-cards ERROR:', e.message);
}

// Test pos-payments
console.log('\n');
try {
  const { init: initPP } = require('./routes/pos-payments');
  const router = initPP({ posPaymentService: null, pool, emailService: null });
  console.log('pos-payments init returned:', typeof router);
  console.log('pos-payments stack length:', router.stack ? router.stack.length : 'no stack');
  if (router.stack) {
    router.stack.slice(0, 5).forEach((layer, i) => {
      if (layer.route) {
        console.log('  Route:', Object.keys(layer.route.methods).join(',').toUpperCase(), layer.route.path);
      } else {
        console.log('  Middleware:', layer.name || 'anonymous');
      }
    });
  }
} catch (e) {
  console.log('pos-payments ERROR:', e.message);
}

process.exit(0);
