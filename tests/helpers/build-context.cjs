const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..', '..');

const readIgnoreFile = (name) =>
  fs
    .readFileSync(path.join(repositoryRoot, name), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

const readDockerignore = () => readIgnoreFile('.dockerignore');

/**
 * Docker matches each pattern against the whole path and the last pattern that
 * matches decides, with `!` inverting. `**` crosses directory separators, `*`
 * and `?` do not.
 */
const patternToRegExp = (pattern) => {
  let source = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '*') {
      if (pattern[index + 1] === '*') {
        source += '.*';
        index += 1;
        // `**/` also matches zero directories, which is how `**/*.md` catches
        // a file at the root.
        if (pattern[index + 1] === '/') {
          source += '(?:/)?';
          index += 1;
        }
      } else {
        source += '[^/]*';
      }
      continue;
    }
    if (character === '?') {
      source += '[^/]';
      continue;
    }
    source += character.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  // A directory pattern also excludes everything under it.
  return new RegExp(`^${source}(?:/.*)?$`);
};

const isExcludedFromBuildContext = (relativePath, patterns) => {
  let excluded = false;
  for (const pattern of patterns) {
    const negated = pattern.startsWith('!');
    const body = (negated ? pattern.slice(1) : pattern).replace(/^\/+/, '');
    if (patternToRegExp(body).test(relativePath)) {
      excluded = !negated;
    }
  }
  return excluded;
};

module.exports = {
  repositoryRoot,
  readIgnoreFile,
  readDockerignore,
  patternToRegExp,
  isExcludedFromBuildContext,
};
