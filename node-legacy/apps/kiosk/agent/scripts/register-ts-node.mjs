// Register ts-node ESM loader using Node 22 stable API
// See: https://nodejs.org/api/module.html#moduleregisterspecifier-parenturl
import { register } from 'node:module';

// Register ts-node/esm with current module as the parent URL
register('ts-node/esm', import.meta.url);
