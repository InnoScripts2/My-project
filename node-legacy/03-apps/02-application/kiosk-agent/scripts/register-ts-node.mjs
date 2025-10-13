// Register ts-node ESM loader using Node 22+ recommended API
// Avoids ExperimentalWarning and potential early crashes in node --test
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('ts-node/esm', pathToFileURL('./'));
