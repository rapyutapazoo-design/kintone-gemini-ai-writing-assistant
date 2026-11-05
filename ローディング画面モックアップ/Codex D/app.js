'use strict';
const $ = (selector) => document.querySelector(selector);
const configs = {
  bloom: { name: '01 / WARM BLOOM', title: '想いを、言葉にしています', eyebrow: 'THOUGHTFULLY CRAFTING', description: '伝えたいことを整理して、<br>あなたの意図に沿った文章を作成しています。', note: 'Claudeを連想するテラコッタと生成り。花のようなモチーフがゆっくり呼吸し、待ち時間にやわらかなリズムを添えます。' },
  orbit: { name: '02 / NEURAL ORBIT', title: '考えをつなぎ、文章へ', eyebrow: 'CONNECTING YOUR IDEAS', description: '大切なポイントを結びながら、<br>伝わりやすい文章にまとめています。', note: 'セージグリーンの軌道と光の粒。情報がつながる様子を静かな動きで表し、AIの知性と安心感を両立します。' },
  draft: { name: '03 / QUIET DRAFT', title: '一文ずつ、整えています', eyebrow: 'FINDING THE RIGHT WORDS', description: '言葉の流れと表現を確かめながら、<br>読みやすい文章を紡いでいます。', note: '紙に文章が現れる、身近なメタファー。淡いラベンダーと控えめな筆記の動きで、文章作成の目的が直感的に伝わります。' }
};
let theme = 'bloom';
let running = false;
let started = 0;
let currentPhase = -1;
const phaseText = ['内容を読み解いています', '文章を組み立てています', '表現を整えています'];
const petals = $('#bloom-art');
for (let i = 0; i < 8; i++) { const petal = document.createElement('span'); petal.className = 'petal'; petal.style.setProperty('--i', i); petals.append(petal); }
function phase(index) {
  if (index === currentPhase) return;
  currentPhase = index;
  $('#phase-label').innerHTML = '<i></i>' + phaseText[index];
  document.querySelectorAll('.steps span').forEach((el, i) => el.classList.toggle('active', i === index));
}
function start() {
  const config = configs[theme];
  document.body.dataset.theme = theme;
  $('.loading-card').classList.remove('finished', 'cancelled');
  $('.loading-card').setAttribute('aria-busy', 'true');
  $('#loading-title').textContent = config.title;
  $('#loading-description').innerHTML = config.description;
  $('#card-eyebrow').textContent = config.eyebrow;
  $('#preview-name').textContent = config.name;
  $('#design-note').textContent = config.note;
  $('#status-pill').textContent = 'WRITING';
  $('#footer-note').textContent = '少しだけ、お待ちください';
  $('#cancel').textContent = '作成を中止';
  $('#elapsed').textContent = '00:00';
  $('#complete').disabled = false;
  currentPhase = -1; phase(0); started = performance.now(); running = true;
}
function finish(cancelled = false) {
  running = false;
  $('.loading-card').classList.add('finished');
  $('.loading-card').classList.toggle('cancelled', cancelled);
  $('.loading-card').setAttribute('aria-busy', 'false');
  $('.result-symbol').textContent = cancelled ? '−' : '✓';
  $('#status-pill').textContent = cancelled ? 'STOPPED' : 'COMPLETE';
  $('#card-eyebrow').textContent = cancelled ? 'TAKE YOUR TIME' : 'READY FOR YOUR REVIEW';
  $('#loading-title').textContent = cancelled ? '作成を中止しました' : '文章ができあがりました';
  $('#loading-description').innerHTML = cancelled ? '準備ができたら、<br>いつでも作成を再開できます。' : 'あなたの想いを、一つの文章に。<br>内容を確認して、最後の仕上げを。';
  $('#phase-label').textContent = cancelled ? 'デモを停止しました' : '作成が完了しました';
  document.querySelectorAll('.steps span').forEach(el => el.classList.toggle('active', !cancelled));
  $('#footer-note').textContent = 'モックアップの表示です';
  $('#cancel').textContent = 'もう一度見る';
  $('#complete').disabled = true;
}
document.querySelectorAll('[data-design]').forEach(button => button.addEventListener('click', () => {
  theme = button.dataset.design;
  document.querySelectorAll('[data-design]').forEach(el => { el.classList.toggle('selected', el === button); el.setAttribute('aria-pressed', String(el === button)); });
  start();
}));
$('#replay').addEventListener('click', start);
$('#complete').addEventListener('click', () => finish());
$('#cancel').addEventListener('click', () => running ? finish(true) : start());
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
function setPaused(paused) { document.body.classList.toggle('paused', paused); $('#motion').setAttribute('aria-pressed', String(paused)); $('#motion').textContent = paused ? '動きを再開する' : '動きを止める'; }
setPaused(motionPreference.matches);
function syncMotionPreference() {
  setPaused(motionPreference.matches);
  $('#motion').disabled = motionPreference.matches;
  if (motionPreference.matches) $('#motion').textContent = '動きを抑制中';
}
syncMotionPreference();
motionPreference.addEventListener('change', syncMotionPreference);
$('#motion').addEventListener('click', () => setPaused(!document.body.classList.contains('paused')));
setInterval(() => {
  if (!running) return;
  const elapsed = Math.floor((performance.now() - started) / 1000);
  $('#elapsed').textContent = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  phase(Math.min(2, Math.floor(elapsed / 6)));
  if (elapsed >= 18) finish();
}, 250);
start();
