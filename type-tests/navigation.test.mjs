import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('..', import.meta.url));
const configPath = ts.findConfigFile(
  `${root}/projects/taste-track`,
  ts.sys.fileExists,
  'tsconfig.app.json',
);
assert.ok(configPath);
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, `${root}/projects/taste-track`);
assert.deepEqual(parsed.errors, []);

const host = {
  getCompilationSettings: () => parsed.options,
  getScriptFileNames: () => parsed.fileNames,
  getScriptVersion: () => '0',
  getScriptSnapshot(fileName) {
    const source = ts.sys.readFile(fileName);
    return source === undefined ? undefined : ts.ScriptSnapshot.fromString(source);
  },
  getCurrentDirectory: ts.sys.getCurrentDirectory,
  getDefaultLibFileName: ts.getDefaultLibFilePath,
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  readDirectory: ts.sys.readDirectory,
};
const languageService = ts.createLanguageService(host);

test('Go to Definition from a generated route node reaches its routeName key', () => {
  const consumer = parsed.fileNames.find((file) => file.endsWith('/catalog-links.ts'));
  assert.ok(consumer);
  const source = readFileSync(consumer, 'utf8');
  const declaration = readFileSync(`${root}/projects/taste-track/src/app/app-router.ts`, 'utf8');

  for (const name of ['MOVIE_DETAIL', 'SHOW_DETAIL', 'EPISODE_DETAIL']) {
    const access = `this.routes.routes.${name}`;
    const start = source.indexOf(access);
    assert.notEqual(start, -1);
    const position = start + access.indexOf(name) + 1;
    const definitions = languageService.getDefinitionAtPosition(consumer, position) ?? [];
    assert.ok(
      definitions.some(
        ({ fileName, textSpan }) =>
          fileName.endsWith('/projects/taste-track/src/app/app-router.ts') &&
          declaration.slice(textSpan.start, textSpan.start + textSpan.length) === name,
      ),
      `${name} should navigate to its routeName key, not a library type`,
    );
  }
});
