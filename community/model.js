/* Local-only demo domain model. This is NOT an authorization boundary. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CommunityModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const categories = { btc: 'BTC 토론', eth: 'ETH 토론', question: '계산기 질문', general: '자유 이야기' };
  const users = { member: { id: 'demo-member', name: '데이터탐험가', role: 'member' }, moderator: { id: 'demo-moderator', name: '운영자 체험', role: 'moderator' } };
  const reasons = ['스팸·광고', '욕설·혐오', '사기·개인정보', '기타 규칙 위반'];
  function seed() {
    const rows = [
      ['p1', 'question', '같은 기간인데 BTC와 ETH의 공급 증가율은 왜 다를까요?', '계산기에서 같은 시작일과 종료일을 골라 봤어요. 두 자산의 발행 방식과 소각을 함께 비교할 때 어떤 점을 먼저 보면 좋을까요?\n\n계산 조건과 참고 자료를 함께 남기며 이야기해요.', '온체인노트', '2026-11-08T02:10:00Z', ['공급량', '계산기']],
      ['p2', 'btc', '반감기 이후, 신규 발행량은 어떻게 읽어야 할까요?', '반감기 전후를 비교할 때 일 단위 변동과 긴 기간의 추세를 구분해서 보고 싶어요. 블록 생성 간격의 차이도 함께 고려하면 좋겠습니다.', '블록산책', '2026-11-08T01:20:00Z', ['반감기', '발행량']],
      ['p3', 'eth', 'ETH 발행과 소각을 따로 보면 보이는 것들', '순공급량의 변화만 보면 발행과 소각의 방향이 가려질 수 있어요. EIP-1559 가이드와 함께 각 항목의 의미를 정리해 봅시다.', '이더리서치', '2026-11-07T23:40:00Z', ['EIP-1559', '소각']],
      ['p4', 'question', '처음 계산할 때 시작일과 종료일은 어떻게 정하나요?', '월별 변화량을 비교하려고 합니다. 서로 다른 길이의 기간을 비교하면 어떤 한계가 있을까요?', '차트입문', '2026-11-07T21:00:00Z', ['사용법']],
      ['p5', 'general', '여러분은 어떤 온체인 지표를 함께 보시나요?', '가격 예측보다 데이터의 의미를 이해하는 데 도움이 되는 자료를 나누고 싶어요. 자료 이름과 원문 출처를 함께 소개해 주세요.', '느린관찰', '2026-11-07T18:00:00Z', ['자료공유']]
    ];
    return { version: 1, posts: rows.map(([id, category, title, body, author, createdAt, tags]) => ({ id, category, title, body, author, authorId: `sample-${id}`, createdAt, tags, hidden: false })), comments: [
      { id: 'c1', postId: 'p1', authorId: 'sample-a', author: '블록산책', body: 'BTC는 신규 발행, ETH는 발행과 소각을 나누어 살펴보면 출발점이 될 것 같아요.', createdAt: '2026-11-08T02:25:00Z', hidden: false },
      { id: 'c2', postId: 'p1', authorId: 'sample-b', author: '이더리서치', body: '기간과 데이터 출처를 먼저 맞추는 것도 중요해요. 실제 수치는 계산기에서 확인해 주세요.', createdAt: '2026-11-08T02:30:00Z', hidden: false },
      { id: 'c3', postId: 'p3', authorId: 'sample-c', author: '온체인노트', body: '총발행량과 순공급량의 차이를 비교해 보면 좋겠어요.', createdAt: '2026-11-08T00:20:00Z', hidden: false }
    ], reports: [], audit: [] };
  }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function requireUser(user) { if (!user || !Object.values(users).some(u => u.id === user.id && u.role === user.role)) throw new Error('먼저 데모 로그인을 해 주세요.'); }
  function requireMod(user) { requireUser(user); if (user.role !== 'moderator') throw new Error('운영자 체험 모드에서만 사용할 수 있어요.'); }
  function text(value, min, max, label) { if (typeof value !== 'string') throw new Error(`${label}을 확인해 주세요.`); const v = value.trim(); if (v.length < min || v.length > max) throw new Error(`${label}은 ${min}~${max}자로 입력해 주세요.`); return v; }
  function id(prefix) { return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`; }
  function visiblePost(state, postId) { const p = state.posts.find(p => p.id === postId && !p.hidden); if (!p) throw new Error('게시글이 없거나 숨김 처리되었어요.'); return p; }
  function listPosts(state, { category = 'all', query = '', sort = 'newest' } = {}) {
    const q = String(query).trim().toLocaleLowerCase();
    const list = state.posts.filter(p => !p.hidden && (category === 'all' || p.category === category) && (!q || `${p.title} ${p.body} ${p.author}`.toLocaleLowerCase().includes(q)));
    const count = p => state.comments.filter(c => c.postId === p.id && !c.hidden).length;
    return list.sort((a, b) => sort === 'comments' ? count(b) - count(a) || b.createdAt.localeCompare(a.createdAt) : b.createdAt.localeCompare(a.createdAt));
  }
  function addPost(state, user, input) {
    requireUser(user); if (!Object.hasOwn(categories, input.category)) throw new Error('게시판을 선택해 주세요.');
    if (state.posts.length >= 100) throw new Error('데모 글 한도에 도달했어요. 데모를 초기화해 주세요.');
    const p = { id: id('p'), category: input.category, title: text(input.title, 4, 100, '제목'), body: text(input.body, 10, 5000, '내용'), author: user.name, authorId: user.id, createdAt: new Date().toISOString(), tags: [], hidden: false };
    state.posts.push(p); return p;
  }
  function addComment(state, user, postId, body) {
    requireUser(user); visiblePost(state, postId); if (state.comments.length >= 300) throw new Error('데모 댓글 한도에 도달했어요.');
    const c = { id: id('c'), postId, body: text(body, 2, 1000, '댓글'), author: user.name, authorId: user.id, createdAt: new Date().toISOString(), hidden: false };
    state.comments.push(c); return c;
  }
  function target(state, kind, targetId) { if (!['post', 'comment'].includes(kind)) throw new Error('잘못된 신고 대상이에요.'); const value = (kind === 'post' ? state.posts : state.comments).find(x => x.id === targetId); if (!value) throw new Error('대상을 찾을 수 없어요.'); return value; }
  function report(state, user, kind, targetId, reason) {
    requireUser(user); const item = target(state, kind, targetId);
    if (item.hidden) throw new Error('이미 숨김 처리된 내용이에요.');
    if (kind === 'comment') visiblePost(state, item.postId);
    if (!reasons.includes(reason)) throw new Error('신고 사유를 선택해 주세요.');
    if (state.reports.some(r => r.kind === kind && r.targetId === targetId && r.reporterId === user.id)) throw new Error('이미 신고한 내용이에요.');
    if (state.reports.length >= 500) throw new Error('데모 신고 한도에 도달했어요.');
    const r = { id: id('r'), kind, targetId, reason, reporterId: user.id, createdAt: new Date().toISOString(), status: 'pending' };
    state.reports.push(r); return r;
  }
  function moderate(state, user, kind, targetId, hidden, reason) {
    requireMod(user); const item = target(state, kind, targetId); const note = text(reason, 4, 300, '처리 사유');
    if (typeof hidden !== 'boolean') throw new Error('처리 상태가 올바르지 않아요.');
    if (item.hidden === hidden) throw new Error('이미 같은 상태로 처리되었어요.');
    item.hidden = hidden;
    state.reports.filter(r => r.kind === kind && r.targetId === targetId && r.status === 'pending').forEach(r => { r.status = 'resolved'; });
    state.audit.push({ id: id('a'), kind, targetId, action: hidden ? 'hide' : 'restore', reason: note, actorId: user.id, createdAt: new Date().toISOString() });
    state.audit = state.audit.slice(-500);
  }
  function dismissReport(state, user, reportId, reason) {
    requireMod(user); const note = text(reason, 4, 300, '처리 사유'); const r = state.reports.find(r => r.id === reportId && r.status === 'pending');
    if (!r) throw new Error('이미 처리했거나 없는 신고예요.'); r.status = 'dismissed';
    state.audit.push({ id: id('a'), kind: r.kind, targetId: r.targetId, action: 'dismiss', reason: note, actorId: user.id, createdAt: new Date().toISOString() });
    state.audit = state.audit.slice(-500);
  }
  // Stored demo data is untrusted. Reject corrupted/oversized snapshots, never execute markup.
  function parseStored(raw) {
    if (typeof raw !== 'string' || raw.length > 1500000) throw new Error('저장 데이터가 올바르지 않아요.');
    const s = JSON.parse(raw); const str = (v, max) => typeof v === 'string' && v.length <= max; const date = v => str(v, 30) && Number.isFinite(Date.parse(v));
    if (!s || s.version !== 1 || !Array.isArray(s.posts) || !Array.isArray(s.comments) || !Array.isArray(s.reports) || !Array.isArray(s.audit) || s.posts.length > 100 || s.comments.length > 300 || s.reports.length > 500 || s.audit.length > 500) throw new Error('저장 데이터 형식이 달라요.');
    const common = x => x && str(x.id, 100) && x.id.length && str(x.authorId, 100) && str(x.author, 100) && date(x.createdAt) && typeof x.hidden === 'boolean';
    if (!s.posts.every(p => common(p) && Object.hasOwn(categories, p.category) && str(p.title, 100) && str(p.body, 5000) && Array.isArray(p.tags) && p.tags.length <= 5 && p.tags.every(t => str(t, 30))) || !s.comments.every(c => common(c) && str(c.body, 1000) && s.posts.some(p => p.id === c.postId))) throw new Error('저장된 글을 읽을 수 없어요.');
    const validTarget = x => ['post', 'comment'].includes(x.kind) && (x.kind === 'post' ? s.posts : s.comments).some(y => y.id === x.targetId);
    if (!s.reports.every(r => r && str(r.id, 100) && validTarget(r) && reasons.includes(r.reason) && str(r.reporterId, 100) && date(r.createdAt) && ['pending', 'resolved', 'dismissed'].includes(r.status)) || !s.audit.every(a => a && str(a.id, 100) && validTarget(a) && ['hide', 'restore', 'dismiss'].includes(a.action) && str(a.reason, 300) && str(a.actorId, 100) && date(a.createdAt))) throw new Error('저장된 처리 내역을 읽을 수 없어요.');
    for (const rows of [s.posts, s.comments, s.reports, s.audit]) if (new Set(rows.map(x => x.id)).size !== rows.length) throw new Error('중복 데이터가 있어요.');
    return copy(s);
  }
  return { categories, users, reasons, seed, copy, listPosts, addPost, addComment, report, moderate, dismissReport, parseStored };
});
