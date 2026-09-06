import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const tag = process.env.RELEASE_TAG;
if (tag !== `v${config.version}`) throw new Error('태그와 앱 버전이 다릅니다.');
const root = 'src-tauri/target/aarch64-apple-darwin/release/bundle';
const archive = 'Cue.app.tar.gz';
if (!existsSync(`${root}/macos/${archive}`)) throw new Error('업데이트 압축파일이 없습니다.');
const signature = readFileSync(`${root}/macos/${archive}.sig`, 'utf8').trim();
if (!signature) throw new Error('업데이트 서명이 없습니다.');
const notes = readFileSync(`release-notes/${config.version}.md`, 'utf8').trim();
if (!notes) throw new Error('사용자에게 안내할 변경 내용을 작성해 주세요.');
writeFileSync(`${root}/latest.json`, JSON.stringify({
  version: config.version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    'darwin-aarch64': {
      signature,
      url: `https://github.com/HooniKims/lecture_shortcut_mac/releases/download/${tag}/${archive}`,
    },
  },
}, null, 2));
