/* UI for an isolated, offline demo. No network calls or real authentication. */
(() => {
  'use strict';
  const M = window.CommunityModel;
  const $ = selector => document.querySelector(selector);
  const KEY = 'cryptoflow.community.demo.v1';
  let state = M.seed(), user = null, category = 'all', query = '', sort = 'newest', remember = false;
  let selectedPost = null, pendingAction = null, returnFocus = null, toastTimer;
  const dialog = $('#dialog');
  function node(tag, className, value) { const n = document.createElement(tag); if (className) n.className = className; if (value != null) n.textContent = value; return n; }
  function button(label, className, onClick) { const b = node('button', className, label); b.type = 'button'; b.addEventListener('click', onClick); return b; }
  function formattedDate(date) { return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', timeZone: 'Asia/Seoul' }).format(new Date(date)); }
  function say(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500); }
  function storageStatus(message) { $('#storage-status').textContent = message || (remember ? '이 브라우저에만 저장됩니다. 다른 기기와 공유되지 않습니다.' : '기본은 메모리 모드입니다. 새로고침하면 초기화됩니다.'); }
  function persist() {
    if (!remember) return;
    try { localStorage.setItem(KEY, JSON.stringify(state)); storageStatus(); }
    catch { remember = false; $('#remember').checked = false; storageStatus('저장할 수 없어 메모리 모드로 전환했어요. 기존 저장본은 남아 있을 수 있어요.'); say('기기 저장 실패. 현재 내용은 이 탭에서 계속 사용할 수 있어요.'); }
  }
  try { const raw = localStorage.getItem(KEY); if (raw) { state = M.parseStored(raw); remember = true; $('#remember').checked = true; } } catch { storageStatus('저장소를 사용할 수 없거나 데이터가 손상되어 예시로 시작합니다.'); }
  if (remember) storageStatus();
  function render() {
    const list = M.listPosts(state, { category, query, sort });
    $('#result-count').textContent = list.length;
    $('#total-count').textContent = M.listPosts(state).length;
    const label = category === 'all' ? '전체 이야기 ' : `${M.categories[category]} `;
    $('#board-title').firstChild.textContent = label;
    document.querySelectorAll('[data-category]').forEach(b => { b.classList.toggle('active', b.dataset.category === category); b.setAttribute('aria-pressed', String(b.dataset.category === category)); });
    $('#login-button').textContent = user ? `${user.role === 'moderator' ? '운영자 체험' : '체험 회원'} · 로그아웃` : '데모 로그인';
    $('#welcome-login').textContent = user ? '새 이야기 작성하기 →' : '데모로 참여해 보기 →';
    const posts = $('#posts'); posts.replaceChildren();
    if (!list.length) { const empty = node('div', 'empty-state'); empty.append(node('span', '', '⌕'), node('strong', '', '아직 이곳에 이야기가 없어요.'), node('p', '', '다른 검색어를 입력하거나 첫 질문을 남겨 보세요.'), button('검색 초기화', 'button button-outline', () => { query = ''; category = 'all'; $('#search').value = ''; render(); })); posts.append(empty); }
    for (const p of list) {
      const item = node('article', 'post'), main = node('div', 'post-main'), meta = node('div', 'post-meta');
      meta.append(node('span', `category-label ${p.category}`, M.categories[p.category]), node('span', '', p.authorId.startsWith('sample-') ? '샘플 게시글' : '내 데모 게시글'), node('time', '', formattedDate(p.createdAt)));
      const title = button(p.title, 'post-title', () => showPost(p.id));
      const bottom = node('div', 'post-bottom'); bottom.append(node('span', 'avatar', p.author.slice(0, 1)), node('span', '', p.author), node('span', 'post-tags', p.tags.map(t => `#${t}`).join('  ')));
      main.append(meta, title, node('p', 'post-excerpt', p.body.replace(/\n/g, ' ')), bottom);
      const count = state.comments.filter(c => c.postId === p.id && !c.hidden).length;
      const comments = node('div', 'comment-count'); comments.setAttribute('aria-label', `댓글 ${count}개`); comments.append(node('span', '', '▤'), node('strong', '', count));
      item.append(main, comments); posts.append(item);
    }
    renderModeration();
  }
  function openDialog(title, kicker = 'COMMUNITY') {
    if (!dialog.open) returnFocus = document.activeElement;
    $('#dialog-content').replaceChildren(); $('#dialog-kicker').textContent = kicker;
    const heading = node('h2', '', title); heading.id = 'dialog-title'; $('#dialog-content').append(heading);
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    return $('#dialog-content');
  }
  function closeDialog() { dialog.close(); pendingAction = null; selectedPost = null; }
  dialog.addEventListener('close', () => { if (dialog.open) return; pendingAction = null; selectedPost = null; if (returnFocus?.isConnected) returnFocus.focus(); });
  $('#dialog-close').addEventListener('click', closeDialog);
  dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDialog(); } });
  function formError(form, error) { let p = form.querySelector('.form-error'); if (!p) { p = node('p', 'form-error'); p.setAttribute('role', 'alert'); form.prepend(p); } p.textContent = error.message || '처리하지 못했어요. 다시 시도해 주세요.'; }
  function field(form, label, id, type, options = {}) {
    const wrap = node('div', 'form-field'), l = node('label', '', label); l.htmlFor = id;
    const input = node(type === 'textarea' ? 'textarea' : type === 'select' ? 'select' : 'input'); input.id = id; input.name = id;
    if (type === 'select') for (const [value, text] of Object.entries(options.choices)) { const opt = node('option', '', text); opt.value = value; input.append(opt); }
    else if (type !== 'textarea') input.type = type;
    for (const prop of ['maxLength', 'minLength', 'required', 'placeholder', 'value']) if (options[prop] !== undefined) input[prop] = options[prop];
    wrap.append(l, input); if (options.help) wrap.append(node('small', '', options.help)); form.append(wrap); return input;
  }
  function auth(next) { if (user) return next(); showLogin(next); }
  function showLogin(next) {
    pendingAction = next || null;
    const body = openDialog('가입 없이 커뮤니티를 체험해 보세요', 'LOCAL DEMO LOGIN');
    body.append(node('p', 'dialog-description', '이메일·비밀번호를 수집하지 않습니다. 아래 역할은 화면 체험용이며, 실제 인증이나 관리자 권한이 아닙니다. 개인정보와 비밀 정보를 입력하지 마세요.'));
    const options = node('div', 'role-options');
    for (const role of ['member', 'moderator']) {
      const b = button('', 'role-option', () => { const action = pendingAction; user = M.users[role]; pendingAction = null; dialog.close(); render(); say(`${role === 'member' ? '회원' : '운영자'} 체험을 시작했어요. 실제 로그인은 아닙니다.`); if (action) action(); });
      b.dataset.role = role; b.append(node('strong', '', role === 'member' ? '회원으로 체험하기 →' : '운영자로 체험하기 →'), node('span', '', role === 'member' ? '글쓰기 · 댓글 · 신고를 경험해 보세요' : '신고 처리 · 숨김 · 복원 흐름을 확인해 보세요')); options.append(b);
    }
    body.append(options);
  }
  function showComposer(initialCategory) {
    auth(() => {
      const body = openDialog('새로운 이야기를 남겨 보세요', 'START A CONVERSATION');
      body.append(node('p', 'dialog-description', '예시 데이터에만 추가됩니다. 가격 전망·수익 보장·개인정보 없이, 질문의 조건과 근거를 함께 적어 주세요.'));
      const form = node('form'); form.id = 'post-form';
      const board = field(form, '게시판', 'post-category', 'select', { choices: M.categories, value: initialCategory || (category === 'all' ? 'question' : category) });
      const title = field(form, '제목', 'post-title', 'text', { required: true, minLength: 4, maxLength: 100, placeholder: '어떤 점이 궁금한가요? (4~100자)' });
      const content = field(form, '내용', 'post-body', 'textarea', { required: true, minLength: 10, maxLength: 5000, placeholder: '코인, 비교 기간, 계산 조건을 함께 적어 주세요. (10~5,000자)', help: '텍스트만 지원합니다. 링크는 클릭되지 않으며 이미지 업로드는 지원하지 않습니다.' });
      const actions = node('div', 'form-actions'); actions.append(button('취소', 'button button-outline', closeDialog)); const submit = node('button', 'button button-blue', '데모 게시글 등록'); submit.type = 'submit'; actions.append(submit); form.append(actions);
      form.addEventListener('submit', e => { e.preventDefault(); if (submit.disabled) return; try { const p = M.addPost(state, user, { category: board.value, title: title.value, body: content.value }); submit.disabled = true; persist(); query = ''; $('#search').value = ''; category = 'all'; render(); showPost(p.id); say('이 기기의 데모에 게시글을 추가했어요.'); } catch (err) { formError(form, err); } });
      body.append(form); title.focus();
    });
  }
  function showPost(postId) {
    const p = state.posts.find(p => p.id === postId && !p.hidden); if (!p) { closeDialog(); say('게시글이 없거나 숨김 처리되었어요.'); return; }
    selectedPost = postId;
    const body = openDialog(p.title, 'DISCUSSION · LOCAL DEMO'); const meta = node('div', 'post-detail-meta'); meta.append(node('span', `category-label ${p.category}`, M.categories[p.category]), node('span', '', p.author), node('time', '', formattedDate(p.createdAt))); body.append(meta, node('div', 'post-body', p.body));
    const actions = node('div', 'detail-actions'); const calc = node('a', '', '공급량 계산기로 조건 확인 →'); calc.href = '../index.html'; actions.append(calc, button('게시글 신고', 'quiet', () => auth(() => showReport('post', postId, postId)))); body.append(actions);
    const comments = state.comments.filter(c => c.postId === postId && !c.hidden);
    body.append(node('h3', 'comments-title', `댓글 ${comments.length}`));
    if (!comments.length) body.append(node('p', 'muted', '아직 댓글이 없어요. 첫 의견을 남겨 주세요.'));
    for (const c of comments) { const item = node('div', 'comment'), header = node('div', 'comment-header'); header.append(node('span', 'avatar', c.author.slice(0, 1)), node('strong', '', c.author), button('신고', 'quiet', () => auth(() => showReport('comment', c.id, postId)))); item.append(header, node('p', '', c.body), node('time', '', formattedDate(c.createdAt))); body.append(item); }
    if (!user) body.append(button('데모 로그인 후 댓글 남기기', 'button button-outline', () => showLogin(() => showPost(postId))));
    else {
      const form = node('form', 'comment-form'); form.id = 'comment-form'; const input = field(form, '댓글 남기기', 'comment-body', 'textarea', { required: true, minLength: 2, maxLength: 1000, placeholder: '서로를 존중하며 의견을 나눠 주세요. (2~1,000자)' });
      const submit = node('button', 'button button-blue', '댓글 등록'); submit.type = 'submit'; form.append(submit);
      form.addEventListener('submit', e => { e.preventDefault(); if (submit.disabled) return; try { M.addComment(state, user, postId, input.value); submit.disabled = true; persist(); render(); showPost(postId); $('#comment-body').focus(); say('데모 댓글을 남겼어요.'); } catch (err) { formError(form, err); } }); body.append(form);
    }
  }
  function showReport(kind, targetId, postId) {
    const body = openDialog('신고 사유를 알려 주세요', 'REPORT · LOCAL DEMO');
    body.append(node('p', 'dialog-description', '이 신고는 실제 운영자에게 전달되지 않습니다. 운영자 체험 모드에서 확인하고 숨김 처리할 수 있어요.'));
    const form = node('form'); const reason = field(form, '신고 사유', 'report-reason', 'select', { choices: Object.fromEntries(M.reasons.map(x => [x, x])) }); const actions = node('div', 'form-actions'); actions.append(button('취소', 'button button-outline', () => showPost(postId))); const submit = node('button', 'button button-blue', '데모 신고 접수'); submit.type = 'submit'; actions.append(submit); form.append(actions);
    form.addEventListener('submit', e => { e.preventDefault(); if (submit.disabled) return; try { M.report(state, user, kind, targetId, reason.value); submit.disabled = true; persist(); render(); showPost(postId); say('데모 신고를 접수했어요. 운영자 체험에서 확인할 수 있어요.'); } catch (err) { formError(form, err); } }); body.append(form);
  }
  function showRules() { const body = openDialog('숫자에도, 사람에게도 정직하게', 'COMMUNITY GUIDELINES'); const list = node('ol', 'rules-list'); ['데이터의 출처와 비교 기간을 남겨 주세요. 확인되지 않은 수치나 현재 트렌드를 사실처럼 쓰지 않아요.', '수익 보장, 매매 유도, 리딩방·추천인 광고, 사기성 홍보를 허용하지 않아요.', '비판은 근거로, 대화는 존중으로. 욕설·혐오·개인정보 노출은 신고 대상이에요.', '타인의 글·사진·밈을 그대로 복제하지 않아요. 직접 작성한 설명과 권리를 확인한 자료만 사용해요.', '운영자는 신고를 검토한 뒤 사유를 남겨 숨김·복원할 수 있어요. 데모에는 광고를 배치하지 않습니다.'].forEach(t => list.append(node('li', '', t))); body.append(list, node('p', 'muted', '이 화면은 로컬 프로토타입입니다. 운영 서비스의 인증·이용약관·정책 적용과는 별개입니다.')); }
  function openModeration() { if (!user || user.role !== 'moderator') return showLogin(() => { if (user?.role === 'moderator') openModeration(); else say('신고 관리는 운영자 체험 모드에서 확인해 주세요.'); }); $('#moderation-panel').hidden = false; renderModeration(); $('#moderation-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function showModerationAction(kind, targetId, action, reportId) {
    const body = openDialog(action === 'hide' ? '내용을 숨김 처리할까요?' : action === 'restore' ? '내용을 다시 공개할까요?' : '신고를 기각할까요?', 'MODERATION · LOCAL ONLY');
    body.append(node('p', 'dialog-description', '이 기기의 데모에만 반영되며, 처리 사유가 데모 기록에 남습니다. 숨긴 내용은 운영자 체험에서 복원할 수 있습니다.'));
    const form = node('form'); const reason = field(form, '처리 사유', 'moderation-reason', 'textarea', { required: true, minLength: 4, maxLength: 300, placeholder: '검토 결과와 처리 사유를 적어 주세요. (4~300자)' });
    const actions = node('div', 'form-actions'); actions.append(button('취소', 'button button-outline', closeDialog)); const submit = node('button', 'button button-blue', '처리 확정'); submit.type = 'submit'; actions.append(submit); form.append(actions);
    form.addEventListener('submit', e => { e.preventDefault(); if (submit.disabled) return; try { if (action === 'dismiss') M.dismissReport(state, user, reportId, reason.value); else M.moderate(state, user, kind, targetId, action === 'hide', reason.value); submit.disabled = true; persist(); closeDialog(); render(); say('처리 내용과 사유를 데모에 기록했어요.'); } catch (err) { formError(form, err); } }); body.append(form); reason.focus();
  }
  function renderModeration() {
    if (!user || user.role !== 'moderator') { $('#moderation-panel').hidden = true; return; }
    const root = $('#moderation-content'); root.replaceChildren(); const pending = state.reports.filter(r => r.status === 'pending'); root.append(node('h3', 'comments-title', `검토 대기 ${pending.length}건`));
    if (!pending.length) root.append(node('p', 'muted', '대기 중인 신고가 없어요. 게시글이나 댓글을 신고해 기능을 체험해 보세요.'));
    for (const r of pending) {
      const t = (r.kind === 'post' ? state.posts : state.comments).find(t => t.id === r.targetId); if (!t) continue;
      const item = node('div', 'moderation-item'); item.append(node('small', '', `${r.kind === 'post' ? '게시글' : '댓글'} 신고 · ${r.reason}`), node('p', '', t.title || t.body));
      const actions = node('div', 'moderation-actions'); actions.append(button('숨김 처리', 'quiet', () => showModerationAction(r.kind, r.targetId, 'hide')), button('신고 기각', 'quiet', () => showModerationAction(r.kind, r.targetId, 'dismiss', r.id))); item.append(actions); root.append(item);
    }
    const hidden = [...state.posts.filter(t => t.hidden).map(t => ({ ...t, kind: 'post' })), ...state.comments.filter(t => t.hidden).map(t => ({ ...t, kind: 'comment' }))]; root.append(node('h3', 'comments-title', `숨김 콘텐츠 ${hidden.length}건`));
    if (!hidden.length) root.append(node('p', 'muted', '숨김 처리한 콘텐츠가 없어요.'));
    for (const t of hidden) { const item = node('div', 'moderation-item'); item.append(node('small', '', t.kind === 'post' ? '게시글' : '댓글'), node('p', '', t.title || t.body), button('복원하기', 'quiet', () => showModerationAction(t.kind, t.id, 'restore'))); root.append(item); }
    root.append(node('h3', 'comments-title', '최근 처리 기록'));
    if (!state.audit.length) root.append(node('p', 'muted', '처리 기록이 아직 없어요.'));
    for (const a of state.audit.slice(-10).reverse()) root.append(node('div', 'audit-row', `${formattedDate(a.createdAt)} · ${{ hide: '숨김', restore: '복원', dismiss: '신고 기각' }[a.action]} · ${a.reason}`));
  }
  $('#login-button').addEventListener('click', () => { if (user) { user = null; closeDialog(); render(); say('체험을 종료했어요. 작성한 데모 내용은 그대로 남아 있어요.'); } else showLogin(); });
  $('#welcome-login').addEventListener('click', () => user ? showComposer() : showLogin());
  ['#hero-write', '#write-button'].forEach(sel => $(sel).addEventListener('click', () => showComposer()));
  $('#question-button').addEventListener('click', () => showComposer('question'));
  ['#rules-button', '#notice-rules'].forEach(sel => $(sel).addEventListener('click', showRules));
  $('#moderator-button').addEventListener('click', openModeration);
  $('#close-moderation').addEventListener('click', () => { $('#moderation-panel').hidden = true; });
  document.querySelectorAll('[data-category]').forEach(b => b.addEventListener('click', () => { category = b.dataset.category; render(); }));
  $('#search').addEventListener('input', e => { query = e.target.value; render(); }); $('#search-form').addEventListener('submit', e => e.preventDefault());
  $('#sort').addEventListener('change', e => { sort = e.target.value; render(); });
  $('#remember').addEventListener('change', e => { remember = e.target.checked; if (remember) { persist(); if (remember) say('이 기기에 데모를 저장했어요. 개인정보는 입력하지 마세요.'); } else { try { localStorage.removeItem(KEY); storageStatus(); say('저장된 데모를 지웠어요. 현재 탭에서는 계속 사용할 수 있어요.'); } catch { storageStatus('기기 저장본을 지우지 못했어요. 브라우저 사이트 데이터 설정에서 직접 삭제해 주세요.'); say('저장본 삭제 실패. 브라우저 사이트 데이터 설정을 확인해 주세요.'); } } });
  $('#reset-button').addEventListener('click', () => { const body = openDialog('데모를 처음 상태로 되돌릴까요?', 'RESET LOCAL DEMO'); body.append(node('p', 'dialog-description', '이 브라우저의 데모 글·댓글·신고·처리 기록만 지웁니다. 저장 옵션과 체험 로그인도 꺼집니다. 이 작업은 되돌릴 수 없습니다.')); const actions = node('div', 'form-actions'); actions.append(button('취소', 'button button-outline', closeDialog), button('데모 초기화 확인', 'button danger', () => { let removed = true; try { localStorage.removeItem(KEY); } catch { removed = false; } state = M.seed(); user = null; remember = false; $('#remember').checked = false; category = 'all'; query = ''; sort = 'newest'; $('#search').value = ''; $('#sort').value = 'newest'; storageStatus(removed ? undefined : '현재 탭은 초기화했지만 저장본 삭제에 실패했어요. 브라우저 사이트 데이터 설정에서 삭제해 주세요.'); closeDialog(); render(); say(removed ? '데모를 초기화했어요.' : '현재 탭을 초기화했어요. 남아 있을 수 있는 저장본은 브라우저 설정에서 삭제해 주세요.'); })); body.append(actions); });
  render();
})();
