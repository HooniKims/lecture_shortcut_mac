import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
const script = fileURLToPath(new URL('../scripts/release-manifest.mjs', import.meta.url));
for (const notes of ['• First change\n• Second change', '', null]) {
  test(`release manifest uses authored notes and rejects ${notes === null ? 'missing' : notes === '' ? 'empty' : 'no'} notes`, t => {
    const cwd = mkdtempSync(join(tmpdir(), 'cue-release-'));
    t.after(() => rmSync(cwd, {recursive:true, force:true}));
    const bundle = 'src-tauri/target/aarch64-apple-darwin/release/bundle';
    mkdirSync(join(cwd,bundle,'macos'),{recursive:true}); mkdirSync(join(cwd,'release-notes'));
    writeFileSync(join(cwd,'src-tauri/tauri.conf.json'),JSON.stringify({version:'0.2.0'}));
    writeFileSync(join(cwd,bundle,'macos/Cue.app.tar.gz'),'fixture');
    writeFileSync(join(cwd,bundle,'macos/Cue.app.tar.gz.sig'),'fixture-signature');
    if (notes !== null) writeFileSync(join(cwd,'release-notes/0.2.0.md'),notes);
    const result = spawnSync(process.execPath,[script],{cwd,env:{...process.env,RELEASE_TAG:'v0.2.0'},encoding:'utf8'});
    if (notes) {
      assert.equal(result.status,0,result.stderr);
      assert.equal(JSON.parse(readFileSync(join(cwd,bundle,'latest.json'))).notes,notes);
    } else assert.notEqual(result.status,0);
  });
}
