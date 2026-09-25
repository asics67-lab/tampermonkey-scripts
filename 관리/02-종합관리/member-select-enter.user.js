// ==UserScript==
// @name         [종합관리] 회원 선택 - 엔터로 선택
// @namespace    asics67-lab
// @version      1.0
// @description  회원 선택 드롭다운 검색창에서 엔터를 누르면 강조된(또는 첫 번째) 업체가 선택됩니다. 한글 입력 중 엔터도 처리.
// @match        *://*.platform.co.jp/*
// @match        *://platform.co.jp/*
// @match        *://*.platform.aispel.com/*
// @match        *://platform.aispel.com/*
// @updateURL    https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/관리/02-종합관리/member-select-enter.user.js
// @downloadURL  https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/관리/02-종합관리/member-select-enter.user.js
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  // 드롭다운 검색창 (Select2 v4 / v3, Chosen 모두 대응)
  const SEARCH_INPUT = [
    '.select2-search__field',
    '.select2-search input',
    '.select2-input',
    '.chosen-search input',
    '.chosen-search-input',
  ].join(',');

  // 현재 열려있는 드롭다운의 결과 목록
  const RESULTS_BOX = [
    '.select2-container--open .select2-results',
    '.select2-drop-active .select2-results',
    '.select2-dropdown .select2-results',
    '.chosen-with-drop .chosen-results',
  ].join(',');

  // 선택 불가 항목(“검색 중…”, “결과 없음” 등)
  const NOT_SELECTABLE =
    '.select2-results__message, .loading-results, .select2-no-results, .select2-searching, ' +
    '.no-results, [aria-disabled="true"], .select2-disabled, .disabled-result';

  function findTarget(input) {
    // 드롭다운 컨테이너 기준으로 결과 목록 찾기
    const scope =
      input.closest('.select2-dropdown, .select2-drop, .chosen-drop, .chosen-container') || document;
    const box = scope.querySelector('.select2-results, .chosen-results') ||
                document.querySelector(RESULTS_BOX);
    if (!box) return null;

    // 1순위: 강조(파란색)된 항목
    const hi = box.querySelector(
      '.select2-results__option--highlighted, .select2-highlighted, .highlighted'
    );
    if (hi && !hi.matches(NOT_SELECTABLE)) return hi;

    // 2순위: 첫 번째 선택 가능한 항목
    const opts = box.querySelectorAll(
      '.select2-results__option, .select2-result-selectable, .active-result'
    );
    for (const o of opts) {
      if (!o.matches(NOT_SELECTABLE) && !o.querySelector('.select2-results__options')) return o;
    }
    return null;
  }

  function choose(el) {
    // Select2 / Chosen은 마우스 이벤트(mouseup)로 선택 처리 → 실제 클릭과 동일하게 발생
    const opt = { bubbles: true, cancelable: true, view: window, button: 0 };
    ['mouseenter', 'mouseover', 'mousemove', 'mousedown', 'mouseup', 'click'].forEach((t) =>
      el.dispatchEvent(new MouseEvent(t, opt))
    );
  }

  function trySelect(input, retries) {
    const el = findTarget(input);
    if (el) {
      choose(el);
      return;
    }
    // 검색 결과가 아직 갱신 중이면 잠깐 기다렸다 재시도 (최대 ~1초)
    if (retries > 0) setTimeout(() => trySelect(input, retries - 1), 100);
  }

  document.addEventListener(
    'keydown',
    (e) => {
      const isEnter = e.key === 'Enter' || e.keyCode === 13 || e.keyCode === 229 && e.code === 'Enter';
      if (!isEnter) return;
      const input = e.target;
      if (!(input instanceof HTMLElement) || !input.matches(SEARCH_INPUT)) return;

      // 다른 엔터 기능(검색 실행 등)이 먼저 동작하지 않도록 차단
      e.preventDefault();
      e.stopImmediatePropagation();

      // 한글 입력 조합 중이면 글자 확정 + 목록 갱신을 기다린 뒤 선택
      const delay = e.isComposing || e.keyCode === 229 ? 150 : 30;
      setTimeout(() => trySelect(input, 10), delay);
    },
    true // 캡처 단계에서 가장 먼저 처리
  );
})();
