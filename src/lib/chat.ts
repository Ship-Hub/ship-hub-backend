import { EventEmitter } from 'events';

// SSE broadcast emitter — keyed by channel slug
export const chatEmitter = new EventEmitter();
chatEmitter.setMaxListeners(1000);
