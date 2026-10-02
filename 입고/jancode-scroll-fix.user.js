// ==UserScript==
// @name         JAN입고 스크롤 고정 수정 (맨 아래/맨 위 · F4)
// @namespace    asics67-lab
// @version      1.0.0
// @description  JAN코드 입고처리 팝업에서 마우스 휠·맨 아래(F4)·맨 위 버튼 스크롤이 막히는 문제 수정. 스크롤 영역을 매번 자동으로 찾아서 움직임.
// @match        https://platform.co.jp/admin/store/jancode*
// @match        https://www.platform.co.jp/admin/store/jancode*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // 1) 팝업(모달)이 열려 있을 때 마우스 휠 스크롤이 막히지 않도록 강제
  const style = document.createElement('style');
  style.textContent = `
    .modal.show, .modal.in, .modal[style*="display: block"] {
      overflow-y: auto !important;
    }
  `;
  document.head.appendChild(style);

  // 2) 지금 열려 있는 팝업 찾기 (없으면 페이지 전체)
  function getOpenModal() {
    const list = document.querySelectorAll('.modal.show, .modal.in, .modal[style*="display: block"]');
    for (const m of list) {
      if (m.offsetParent !== null || getComputedStyle(m).display !== 'none') return m;
    }
    return null;
  }

  // 3) 기준 행(첫 행/마지막 행) 찾기
  function getEdgeRow(root, toBottom) {
    const rows = Array.from(root.querySelectorAll('table tbody tr')).filter(r => r.offsetParent !== null);
    if (!rows.length) return null;
    return toBottom ? rows[rows.length - 1] : rows[0];
  }

  // 4) 기준 요소에서 위로 올라가며 "실제로 스크롤이 생긴 영역"을 모두 찾아서 이동
  function scrollAllAncestors(el, toBottom) {
    let node = el;
    while (node && node !== document.documentElement) {
      if (node.scrollHeight > node.clientHeight + 2) {
        const oy = getComputedStyle(node).overflowY;
        if (oy === 'auto' || oy === 'scroll' || node.classList.contains('modal')) {
          node.scrollTop = toBottom ? node.scrollHeight : 0;
        }
      }
      node = node.parentElement;
    }
    const page = document.scrollingElement || document.documentElement;
    page.scrollTop = toBottom ? page.scrollHeight : 0;
  }

  function scrollToEdge(toBottom) {
    const modal = getOpenModal();
    const root = modal || document;
    const row = getEdgeRow(root, toBottom);
    const target = row || (modal ? (modal.querySelector('.modal-body') || modal) : document.body);

    scrollAllAncestors(target, toBottom);
    // 마지막 보정: 해당 행이 화면에 보이게
    if (row) row.scrollIntoView({ block: toBottom ? 'end' : 'start', behavior: 'auto' });
    // 화면이 늦게 그려지는 경우 대비 한 번 더
    setTimeout(() => {
      scrollAllAncestors(target, toBottom);
      if (row) row.scrollIntoView({ block: toBottom ? 'end' : 'start', behavior: 'auto' });
    }, 60);
  }

  // 5) F4 키 → 맨 아래 (기존 스크립트보다 먼저 가로채서 처리)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F4' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      scrollToEdge(true);
    }
  }, true);

  // 6) 입고 합계 박스의 "맨 아래" / "맨 위" 버튼 클릭 가로채기
  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('button, a, div[role="button"], span');
    if (!btn) return;
    const text = (btn.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.length > 20) return; // 큰 영역 클릭은 무시
    if (text.includes('맨 아래')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      scrollToEdge(true);
    } else if (text.includes('맨 위')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      scrollToEdge(false);
    }
  }, true);
})();
