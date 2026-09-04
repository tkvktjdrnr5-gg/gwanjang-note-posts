// 사용법: node publish.mjs <post-slug>
// 예: node publish.mjs posts/01-deungrok-jeon-5
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
if (!slug) { console.error('사용법: node publish.mjs posts/<slug>'); process.exit(1); }

const dir = path.join(process.cwd(), slug);
const captionRaw = fs.readFileSync(path.join(dir, 'caption.txt'), 'utf8');
const [caption, firstComment] = captionRaw.split('---FIRST_COMMENT---').map(s => s.trim());

const images = fs.readdirSync(dir)
  .filter(f => /^\d+\.png$/.test(f))
  .sort((a, b) => parseInt(a) - parseInt(b));

async function post(url, params) {
  const r = await fetch(url, { method: 'POST', body: new URLSearchParams({ ...params, access_token: TOKEN }) });
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j;
}

async function main() {
  console.log(`발행 대상: ${slug} (${images.length}장)`);

  // 1) 캐러셀 아이템 컨테이너 생성
  const itemIds = [];
  for (const f of images) {
    const image_url = `${REPO_RAW}/${slug}/${f}`;
    const { id } = await post(`${API}/${IG_ID}/media`, { image_url, is_carousel_item: 'true' });
    console.log(`  컨테이너 생성: ${f} -> ${id}`);
    itemIds.push(id);
  }

  // 2) 부모(캐러셀) 컨테이너 생성
  const { id: carouselId } = await post(`${API}/${IG_ID}/media`, {
    media_type: 'CAROUSEL',
    children: itemIds.join(','),
    caption,
  });
  console.log(`캐러셀 컨테이너: ${carouselId}`);

  // 3) 발행
  const { id: mediaId } = await post(`${API}/${IG_ID}/media_publish`, { creation_id: carouselId });
  console.log(`✅ 발행 완료: media id ${mediaId}`);

  // 4) 첫 댓글
  if (firstComment) {
    const { id: commentId } = await post(`${API}/${mediaId}/comments`, { message: firstComment });
    console.log(`💬 첫 댓글 등록: ${commentId}`);
  }
}

main().catch(e => { console.error('❌ 실패:', e.message); process.exit(1); });
