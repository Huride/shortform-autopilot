const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;

function stamp(): string {
  return dim(new Date().toISOString().slice(11, 19));
}

export const log = {
  info: (msg: string) => console.log(`${stamp()} ${msg}`),
  step: (msg: string) => console.log(`${stamp()} ${green('▸')} ${msg}`),
  warn: (msg: string) => console.warn(`${stamp()} ${yellow('!')} ${msg}`),
  error: (msg: string) => console.error(`${stamp()} ${red('✗')} ${msg}`),
  ok: (msg: string) => console.log(`${stamp()} ${green('✓')} ${msg}`),
};
