import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    let file = path.resolve('src', specifier.slice(2));
    if (existsSync(file + '.js')) file += '.js';
    return next(pathToFileURL(file).href, context);
  }
  if (specifier.startsWith('.') && context.parentURL?.startsWith(pathToFileURL(path.resolve('src')).href) && !path.extname(specifier)) return next(specifier + '.js', context);
  return next(specifier, context);
}
