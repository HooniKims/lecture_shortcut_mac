import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const tag = process.env.RELEASE_TAG;
if (tag !== `v${config.version}`) throw new Error('태그와 앱 버전이 다릅니다.');
const root = 'src-tauri/target/aarch64-apple-darwin/release/bundle';
const archive = 'Cue.app.tar.gz';
if (!existsSync(`${root}/macos/${archive}`)) throw new Error('업데이트 압축파일이 없습니다.');
const signature = readFileSync(`${root}/macos/${archive}.sig`, 'utf8').trim();
if (!signature) throw new Error('업데이트 서명이 없습니다.');
writeFileSync(`${root}/latest.json`, JSON.stringify({
  version: config.version,
  notes: `Cue ${config.version} 업데이트입니다. 자세한 변경 내용은 GitHub 배포 페이지에서 확인해 주세요.`,
  pub_date: new Date().toISOString(),
  platforms: {
    'darwin-aarch64': {
      signature,
      url: `https://github.com/HooniKims/lecture_shortcut_mac/releases/download/${tag}/${archive}`,
    },
  },
}, null, 2));
