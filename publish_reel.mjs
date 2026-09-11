// 릴스 발행: node publish_reel.mjs reels/<slug>
// <slug> 폴더에 video.mp4 + caption.txt (캐러셀과 동일한 3단 캡션 포맷)
import fs from 'fs';
import path from 'path';

function loadEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
const env = loadEnv(new URL('.env', import.meta.url));
const TOKEN = env.IG_ACCESS_TOKEN;
const IG_ID = env.IG_USER_ID;
const REPO_RAW = 'https://raw.githubusercontent.com/tkvktjdrnr5-gg/gwanjang-note-posts/main';
const API = 'https://graph.instagram.com/v21.0';

const slug = process.argv[2];
if (!slug) { console.error('사용법: node publish_reel.mjs reels/<slug>'); process.exit(1); }
const dir = path.join(process.cwd(), slug);

const captionRaw = fs.readFileSync(path.join(dir, 'caption.txt'), 'utf8');
const [caption, afterCaption = ''] = captionRaw.split('---FIRST_COMMENT---').map(s => s.trim());
let firstComment = afterCaption, reply = '';
if (afterCaption.includes('---REPLY---')) {
  [firstComment, reply] = afterCaption.split('---REPLY---').map(s => s.trim());
}

const videoUrl = `${REPO_RAW}/${slug}/video.mp4`;
console.log('발행 대상:', slug);
console.log('video_url:', videoUrl);

async function post(url, params) {
  const r = await fetch(url, { method: 'POST', body: new URLSearchParams({ ...params, access_token: TOKEN }) });
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j;
}

// 1) 릴스 컨테이너 생성
const { id: containerId } = await post(`${API}/${IG_ID}/media`, {
  media_type: 'REELS',
  video_url: videoUrl,
  caption,
  share_to_feed: 'true',
});
console.log('  릴스 컨테이너:', containerId);

// 2) 처리 완료 대기 (인스타가 영상 다운로드+트랜스코딩, 수 분 소요 가능)
let ok = false;
for (let i = 0; i < 60; i++) {
  await new Promise(r => setTimeout(r, 5000));
  const r = await fetch(`${API}/${containerId}?fields=status_code,status&access_token=${TOKEN}`);
  const j = await r.json();
  if (j.status_code === 'FINISHED') { ok = true; break; }
  if (j.status_code === 'ERROR') throw new Error('트랜스코딩 실패: ' + JSON.stringify(j));
  console.log(`  처리 대기 중... (${j.status_code})`);
}
if (!ok) throw new Error('타임아웃: 컨테이너가 FINISHED 되지 않음');

// 3) 발행
const { id: mediaId } = await post(`${API}/${IG_ID}/media_publish`, { creation_id: containerId });
const { permalink } = await (await fetch(`${API}/${mediaId}?fields=permalink&access_token=${TOKEN}`)).json();
console.log('✅ 릴스 발행 완료: media id', mediaId);
console.log('🔗', permalink);

// 4) 첫 댓글 + 재댓글(해시태그)
if (firstComment) {
  const c = await post(`${API}/${mediaId}/comments`, { message: firstComment });
  console.log('💬 첫 댓글 등록:', c.id);
  if (reply) {
    const rr = await post(`${API}/${c.id}/replies`, { message: reply });
    console.log('  ↳ 재댓글(해시태그) 등록:', rr.id);
  }
}
