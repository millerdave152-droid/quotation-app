const EventEmitter = require('events');

const eventEmitter = new EventEmitter();
eventEmitter.setMaxListeners(50);

module.exports = eventEmitter;
