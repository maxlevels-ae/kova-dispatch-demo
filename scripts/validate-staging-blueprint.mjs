import { readFile } from 'node:fs/promises';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { load } from 'js-yaml';
const response = await fetch('https://render.com/schema/render.yaml.json');
if (!response.ok) throw new Error('Could not retrieve official Render schema');
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(await response.json());
if (!validate(load(await readFile('deploy/staging/render.yaml', 'utf8')))) {
  console.error(validate.errors); process.exitCode = 1;
} else console.log('Staging Blueprint passes the official Render schema.');
