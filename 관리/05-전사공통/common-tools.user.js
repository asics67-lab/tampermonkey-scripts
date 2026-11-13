// ==UserScript==
// @name         [관리] 전사공통 도구 (업무채팅알람봇 + 금일입고표시)
// @namespace    https://github.com/asics67-lab/tampermonkey-scripts
// @version      1.5.0
// @description  admin 전체 화면에서 공통으로 쓰는 도구 모음. 원본: 사내 만능 테스크 채팅 알람봇 v1.3 + 출고관리 피킹중/대기중 전체 합계 알림 v1.96
// @author       물류팀
// @match        https://www.platform.co.jp/admin*
// @match        https://platform.co.jp/admin*
// @exclude      https://www.platform.co.jp/admin/print/*
// @exclude      https://platform.co.jp/admin/print/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @updateURL    https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/관리/05-전사공통/common-tools.user.js
// @downloadURL  https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/관리/05-전사공통/common-tools.user.js
// ==/UserScript==

/*
 * ============================================================
 *  통합 안내
 *  - admin/* (전체 페이지)에서 공통으로 뜨는 2개 원본 스크립트를 하나로 합쳤습니다.
 *    1) 사내 만능 테스크 채팅 알람봇 (대화방 타임라인 버전) v1.3
 *    2) 출고관리 피킹중/대기중 배송방법별 전체 합계 및 추가 시간 기록 알림 v1.96
 *       (본래 packing 기능이지만 @match가 admin/* 전체라 이 카테고리로 분류했습니다)
 *  - 이 파일은 모든 admin 페이지에서 실행되므로, 배포 전 페이지 로딩 속도에
 *    체감상 문제가 없는지 확인해 주세요.
 *
 *  v1.2.0 변경 사항
 *  - 노션 공지사항 스크립트(Notion API 토큰을 다루는 부분)를 이 파일에서 완전히 분리했습니다.
 *    해당 스크립트는 "notion-notice.user.js"라는 별도 파일로 개인 보관 중이며, 이 저장소(GitHub)에는
 *    올라가지 않습니다.
 *  - [블록 1] 업무채팅 알람봇의 MY_NAME 값은 이제 최초 실행 시 1회 입력창으로 받고,
 *    그 브라우저의 Tampermonkey 저장소에만 저장됩니다. GitHub에는 개인 이름이 올라가지 않습니다.
 *    재설정: Tampermonkey 메뉴 → "👤 업무채팅 - 내 이름 재설정"
 *
 *  v1.2.1 버그 수정 (보고: "포장 라벨 인쇄 화면에 검은 네모가 같이 찍힌다")
 *  - @match가 admin 전체라서 송장/라벨 인쇄 화면(/admin/print/...)에도 [블록 2] 피킹 현황
 *    창(검은 박스)과 [블록 1] 채팅 버튼이 떠서 라벨 위에 같이 인쇄됐습니다.
 *    인쇄 화면(/admin/print/*)에서는 이 스크립트가 아예 실행되지 않도록 @exclude 추가.
 *
 *  v1.3.0 기능 추가
 *  - [블록 3] 포장화면 금일 입고 Tracking 표시: 포장 진행 리스트에서 오늘 입고처리된 Tracking이
 *    포함된 배송대행 출고건을 노란색 + "🆕 금일입고" 배지로 표시 (관리자 PC 전용, 별도 파일 대신 이 파일에 합침)
 *    최초 1회: 패널의 [URL 설정]에 입고관리 화면 오늘날짜 검색 URL을 넣고 날짜 부분을 {TODAY}로 바꿔 저장
 *  - www 없이 platform.co.jp로 접속해도 실행되도록 @match 추가
 *
 *  v1.3.1 버그 수정 (보고: "오늘 입고된 건인데 금일입고 표시가 안 됨")
 *  - 입고 목록을 날짜 조건 없이 조회해서 앞쪽 12페이지만 읽고 있었음 → 오늘 입고 건 일부 누락
 *  - 입고처리 화면의 입고일자 검색(start/end)과 pagesize=1000으로 오늘 입고 건을 한 번에 조회하도록 변경
 *    (URL 설정 없이 바로 동작. 예전에 저장한 URL 설정값은 무시됨)
 *  - Tracking 번호 외에 입고 목록의 출고번호(LH...)로도 매칭
 *
 *  v1.4.0 기능 삭제 (2026-11-02 시스템 다운 원인 조사 결과)
 *  - [블록 2] 피킹현황 카운터(LOTOS/해운 피킹중·대기중 합계 박스)를 완전히 삭제했습니다.
 *    5초마다 출고관리 화면 전체 페이지를 뒤에서 불러오는 구조라, 여러 PC·여러 탭에서
 *    동시에 돌면서 서버에 큰 부하를 주었습니다 (30분에 수천 건).
 *
 *  v1.5.0 기능 삭제 (2026-11-13)
 *  - [블록 1] 업무채팅 알람봇을 완전히 삭제했습니다. 쓰지 않는 기능인데 관리자 화면의 모든 탭에서
 *    5초마다 태스크 목록(/admin/task/index)을 불러오고 있었습니다 (11/2 피킹현황 카운터와 같은 구조).
 *    이제 이 파일은 [블록 3] 포장화면 금일 입고 Tracking 표시만 동작합니다.
 *    (@name 은 그대로 둠 — 이름을 바꾸면 Tampermonkey가 다른 스크립트로 보고 새로 설치함)
 *
 *  v1.3.2 버그 수정 (보고: "금일 입고 표시가 깜빡거림")
 *  - 화면이 조금만 바뀌어도(피킹현황·채팅 갱신, 다른 스크립트 등) 0.6초 뒤 표시를 전부 지우고 다시 그리던 방식
 *    → 바뀐 행만 고치고, 화면이 그려지기 전에 즉시 반영하도록 변경. 패널도 내용이 바뀔 때만 다시 그림
 * ============================================================
 */

/* ------------------------------------------------------------
 * [블록 3] 포장화면 금일 입고 Tracking 표시 v1.0.0
 * 포장 진행 리스트(TrackingNo. 칸 + 포장 진행 버튼이 있는 표)가 있는 화면에서만 동작합니다.
 * 입고 관리(트래킹넘버) 목록을 뒤에서 조회해 오늘 입고처리된 Tracking을 찾고, 해당 출고건을 표시합니다.
 * 설정 메뉴: Tampermonkey → "⚙ 금일입고 조회 URL 설정" (또는 패널의 [URL 설정] 버튼)
 * ------------------------------------------------------------ */
(function () {
  'use strict';

  /* ===== 설정 ===== */
  // 입고 관리(트래킹넘버) 목록 URL. {TODAY} 는 오늘 날짜(YYYY-MM-DD)로 바뀜.
  const DEFAULT_URL = '/admin/store/trackingno?pagesize=1000&start={TODAY}&end={TODAY}';
  const MAX_PAGES = 30;          // 페이지가 여러 개일 때 최대 조회 페이지 수
  const CACHE_MS = 5 * 60 * 1000; // 5분 동안은 다시 조회하지 않음

  const getUrlTemplate = () => GM_getValue('ta_url_v2', DEFAULT_URL);

  GM_registerMenuCommand('⚙ 금일입고 조회 URL 설정', openSetting);

  function openSetting() {
    const v = prompt(
      '입고 관리(트래킹넘버) 화면에서 "오늘 날짜"로 검색한 뒤 주소창 URL을 붙여넣으세요.\n' +
      '날짜 부분은 {TODAY} 로 바꿔두면 매일 자동으로 오늘 날짜가 들어갑니다.\n' +
      '기본값) /admin/store/trackingno?pagesize=1000&start={TODAY}&end={TODAY}',
      getUrlTemplate()
    );
    if (v !== null && v.trim()) {
      GM_setValue('ta_url_v2', v.trim());
      cache = null;
      run(true);
    }
  }

  /* ===== 날짜 ===== */
  function todayParts() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return { y, m, day, iso: `${y}-${m}-${day}` };
  }
  function todayPatterns() {
    const { y, m, day } = todayParts();
    return [`${y}-${m}-${day}`, `${y}/${m}/${day}`, `${y}.${m}.${day}`, `${y}년 ${+m}월 ${+day}일`];
  }

  /* ===== 포장 리스트 찾기 ===== */
  function findPackingTable() {
    for (const t of document.querySelectorAll('table')) {
      const head = t.querySelector('thead') || t.querySelector('tr');
      if (!head) continue;
      const txt = head.textContent.replace(/\s+/g, '');
      if (txt.includes('TrackingNo') && txt.includes('포장')) return t;
    }
    return null;
  }

  function trackingColIndex(table) {
    const headRow = (table.querySelector('thead tr') || table.querySelector('tr'));
    const cells = [...headRow.children];
    return cells.findIndex(c => c.textContent.replace(/\s+/g, '').includes('TrackingNo'));
  }

  function rowTrackings(tr, colIdx) {
    const cell = tr.children[colIdx];
    if (!cell) return [];
    return (cell.innerText || cell.textContent)
      .split(/[\s,、/]+/)
      .map(s => s.trim())
      .filter(s => /^[A-Za-z0-9-]{8,}$/.test(s));
  }

  /* ===== 금일 입고 데이터 조회 ===== */
  let cache = null; // { time, rowsText: [] , pages }

  async function fetchDoc(url) {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    return new DOMParser().parseFromString(html, 'text/html');
  }

  function todayRowsFrom(doc) {
    const pats = todayPatterns();
    const out = [];
    doc.querySelectorAll('tr').forEach(tr => {
      const t = tr.textContent;
      if (pats.some(p => t.includes(p))) out.push(t);
    });
    return out;
  }

  async function loadTodayRows(force) {
    if (!force && cache && Date.now() - cache.time < CACHE_MS) return cache;
    const tpl = getUrlTemplate().replace(/\{TODAY\}/g, todayParts().iso);
    const first = new URL(tpl, location.origin);
    const doc = await fetchDoc(first.href);
    let rows = todayRowsFrom(doc);

    // 페이지 링크(page=) 수집 후 추가 조회
    const pageUrls = new Set();
    doc.querySelectorAll('a[href*="page="]').forEach(a => {
      try {
        const u = new URL(a.getAttribute('href'), first.href);
        if (u.pathname === first.pathname && u.href !== first.href) pageUrls.add(u.href);
      } catch (e) { /* ignore */ }
    });
    const list = [...pageUrls].slice(0, MAX_PAGES);
    for (const u of list) {
      try {
        const d = await fetchDoc(u);
        const r = todayRowsFrom(d);
        rows = rows.concat(r);
      } catch (e) { /* 한 페이지 실패해도 계속 */ }
    }
    cache = { time: Date.now(), rowsText: rows, pages: 1 + list.length };
    return cache;
  }

  /* ===== 표시 ===== */
  let onlyToday = false;

  function ensureStyle() {
    if (document.getElementById('ta-style')) return;
    const s = document.createElement('style');
    s.id = 'ta-style';
    s.textContent = `
      tr.ta-hit > td { background: #fff4c2 !important; }
      .ta-badge { display:inline-block; margin-top:3px; padding:1px 6px; border-radius:10px;
        background:#e8590c; color:#fff; font-size:11px; font-weight:bold; white-space:nowrap; }
      #ta-panel { position:fixed; top:70px; right:16px; z-index:99999; background:#fff;
        border:2px solid #e8590c; border-radius:8px; padding:8px 10px; font-size:13px;
        box-shadow:0 2px 8px rgba(0,0,0,.2); min-width:210px; }
      #ta-panel b { color:#e8590c; font-size:15px; }
      #ta-panel button { margin:6px 4px 0 0; padding:3px 8px; font-size:12px; cursor:pointer;
        border:1px solid #ccc; border-radius:4px; background:#f8f8f8; }
      #ta-panel button.on { background:#e8590c; color:#fff; border-color:#e8590c; }
      #ta-panel .ta-sub { color:#888; font-size:11px; margin-top:4px; }
    `;
    document.head.appendChild(s);
  }

  function panel() {
    let p = document.getElementById('ta-panel');
    if (p) return p;
    p = document.createElement('div');
    p.id = 'ta-panel';
    document.body.appendChild(p);
    return p;
  }

  let lastPanelKey = '';
  function renderPanel(hitCount, info, err) {
    const key = err ? 'E:' + err : `${hitCount}|${info.rowsText.length}|${info.pages}|${onlyToday}|${todayParts().iso}`;
    if (key === lastPanelKey && document.getElementById('ta-panel')) return; // 내용이 같으면 다시 그리지 않음
    lastPanelKey = key;
    const p = panel();
    if (err) {
      p.innerHTML = `🆕 금일 입고 표시<br><span style="color:red">조회 실패: ${err}</span>
        <div><button id="ta-refresh">다시 조회</button><button id="ta-set">URL 설정</button></div>`;
    } else {
      p.innerHTML = `🆕 금일 입고 포함 출고건: <b>${hitCount}</b>건
        <div class="ta-sub">오늘(${todayParts().iso}) 입고 행 ${info.rowsText.length}개 · ${info.pages}페이지 조회</div>
        <div>
          <button id="ta-only" class="${onlyToday ? 'on' : ''}">${onlyToday ? '전체 보기' : '금일건만 보기'}</button>
          <button id="ta-refresh">새로고침</button>
          <button id="ta-set">URL 설정</button>
        </div>`;
    }
    p.querySelector('#ta-refresh').onclick = () => run(true);
    p.querySelector('#ta-set').onclick = openSetting;
    const o = p.querySelector('#ta-only');
    if (o) o.onclick = () => { onlyToday = !onlyToday; applyNow(); };
  }

  // 행마다 "지금 상태"와 "원하는 상태"를 비교해서, 다를 때만 화면을 고침 (깜빡임 방지)
  function applyRows(table, info) {
    const colIdx = trackingColIndex(table);
    if (colIdx < 0) return 0;
    let hits = 0;
    // 1단계: 먼저 전부 읽기 (읽기·쓰기를 섞으면 브라우저가 매 행마다 다시 계산해서 느려짐)
    const plan = [];
    table.querySelectorAll('tbody tr').forEach(tr => {
      const cell = tr.children[colIdx];
      if (!cell) return;
      const trks = rowTrackings(tr, colIdx);
      const outNos = ((tr.innerText || tr.textContent).match(/\b[LO]H\d{8,}\b/g) || []);
      const hitTrk = trks.filter(t => info.rowsText.some(rt => rt.includes(t)));
      if (!hitTrk.length && outNos.some(o => info.rowsText.some(rt => rt.includes(o)))) hitTrk.push(trks[0] || '출고번호');
      const label = hitTrk.length
        ? (trks.length > 1 ? `🆕 금일입고 ${hitTrk.length}/${trks.length}` : '🆕 금일입고')
        : '';
      plan.push({ tr, cell, label });
    });
    // 2단계: 바뀐 것만 쓰기
    plan.forEach(({ tr, cell, label }) => {
      const badges = cell.querySelectorAll('.ta-badge');
      if (label) {
        hits++;
        if (!tr.classList.contains('ta-hit')) tr.classList.add('ta-hit');
        if (!badges.length) {
          const b = document.createElement('div');
          b.className = 'ta-badge';
          b.textContent = label;
          cell.appendChild(b);
        } else {
          if (badges[0].textContent !== label) badges[0].textContent = label;
          for (let i = 1; i < badges.length; i++) badges[i].remove();
        }
        if (tr.dataset.taHidden) { tr.style.display = ''; delete tr.dataset.taHidden; }
      } else {
        if (tr.classList.contains('ta-hit')) tr.classList.remove('ta-hit');
        badges.forEach(b => b.remove());
        if (onlyToday && !tr.dataset.taHidden) { tr.style.display = 'none'; tr.dataset.taHidden = '1'; }
        if (!onlyToday && tr.dataset.taHidden) { tr.style.display = ''; delete tr.dataset.taHidden; }
      }
    });
    return hits;
  }

  function removePanel() {
    const p = document.getElementById('ta-panel');
    if (p) { observer.disconnect(); p.remove(); lastPanelKey = ''; observer.takeRecords(); startObserve(); }
  }

  // 저장된 데이터로 즉시(같은 순간에) 다시 칠함 — 화면이 그려지기 전에 끝나서 깜빡이지 않음
  function applyNow() {
    const table = findPackingTable();
    if (!table) { removePanel(); return; }
    if (!cache) return;
    ensureStyle();
    observer.disconnect();
    try {
      const hits = applyRows(table, cache);
      renderPanel(hits, cache);
    } finally {
      observer.takeRecords();
      startObserve();
    }
  }

  let loading = false;
  async function run(force) {
    if (!findPackingTable()) { removePanel(); return; }
    if (!force && cache && Date.now() - cache.time < CACHE_MS) { applyNow(); return; }
    if (loading) return;
    loading = true;
    try {
      await loadTodayRows(force);
      applyNow();
    } catch (e) {
      ensureStyle();
      observer.disconnect();
      renderPanel(0, null, e.message);
      observer.takeRecords();
      startObserve();
    } finally {
      loading = false;
    }
  }

  /* ===== 리스트 변경 감지 (검색·페이지 이동·다른 스크립트의 화면 변경 등) ===== */
  const observer = new MutationObserver(muts => {
    // 금일입고 패널 안에서만 생긴 변화는 무시
    const relevant = muts.some(m => {
      const t = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      return !(t && t.closest && t.closest('#ta-panel'));
    });
    if (relevant) run(false);
  });
  function startObserve() {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  run(false);
  startObserve();
})();
