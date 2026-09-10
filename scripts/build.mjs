import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const key = process.env.TAURI_SIGNING_PRIVATE_KEY || join(homedir(), '.config', 'cue-signing', 'updater.key');
if (!process.env.TAURI_SIGNING_PRIVATE_KEY && !existsSync(key)) {
  console.error('업데이트 서명키가 없습니다. docs/development.md의 서명키 준비를 먼저 진행하세요.');
  process.exit(1);
}
const env = { ...process.env, TAURI_SIGNING_PRIVATE_KEY: key, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? '' };
for (const [command, args] of [['bash', ['native/build.sh']], ['node_modules/.bin/tauri', ['build', ...process.argv.slice(2)]]]) {
  const result = spawnSync(command, args, { env, stdio: 'inherit' });
  if (result.error) { console.error(result.error.message); process.exit(1); }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const targetIndex = process.argv.indexOf('--target');
const target = targetIndex === -1 ? '' : process.argv[targetIndex + 1];
const dmgDirectory = join('src-tauri', 'target', target, 'release', 'bundle', 'dmg');
if (existsSync(dmgDirectory)) {
  for (const file of readdirSync(dmgDirectory).filter(file => file.endsWith('.dmg'))) {
    const result = spawnSync('bash', ['scripts/finalize-dmg.sh', join(dmgDirectory, file)], { stdio: 'inherit' });
    if (result.error) { console.error(result.error.message); process.exit(1); }
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
