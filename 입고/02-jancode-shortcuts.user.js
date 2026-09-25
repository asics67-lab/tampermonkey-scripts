// ==UserScript==
// @name         [입고] JAN코드 화면 단축키 통합 (JAN이동 + Enter이동 + F1/F2/F3 + 합계패널)
// @namespace    https://github.com/asics67-lab/tampermonkey-scripts
// @version      1.1.1
// @description  jancode 페이지 통합본. 원본: A-1-9(JAN 검색이동) + A-1-6(Enter 행이동) + A-1-7(F3) + A-1-8(F1) + A-1-10(F2)
// @author       물류팀
// @match        https://www.platform.co.jp/admin/store/jancode*
// @match        *://platform.co.jp/admin/store/jancode*
// @updateURL    https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/입고/02-jancode-shortcuts.user.js
// @downloadURL  https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/입고/02-jancode-shortcuts.user.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    /* [블록 1] A-1-9 — Enter: JAN CODE 입력 후 리스트 이동 + 수량 포커스 */
    (function janSearchFocusBlock() {
        window.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                const activeEl = document.activeElement;
                const isJanInput = activeEl.closest('div')?.innerText.includes('JAN CODE') ||
                                   activeEl.parentElement?.innerText.includes('JAN CODE');

                if (isJanInput || activeEl.getAttribute('name')?.includes('jan')) {
                    const searchVal = activeEl.value.trim();
                    if (!searchVal) return;

                    setTimeout(() => {
                        const rows = Array.from(document.querySelectorAll('table tbody tr'));
                        let targetRow = rows.find(row => row.innerText.includes(searchVal));

                        if (targetRow) {
                            targetRow.parentElement.prepend(targetRow);
                            targetRow.style.backgroundColor = "#fff3cd";
                            targetRow.style.outline = "2px solid #ff4d4d";

                            const qtyInput = targetRow.querySelector('input[type="number"]') ||
                                             targetRow.querySelector('input:not([readonly])');

                            if (qtyInput) {
                                qtyInput.focus();
                                qtyInput.select();
                                console.log("[JAN 이동] 스캔 성공: 수량 칸으로 이동했습니다.");
                            }
                        }
                    }, 400);
                }
            }
        }, true);
    })();

    /* [블록 2] A-1-6 — Enter: 같은 행 안에서 수량→가격 이동, 가격→사업자통관 체크 */
    (function rowEnterNavigateBlock() {
        document.addEventListener('keydown', function(e) {
            if (e.key !== 'Enter') return;

            const active = document.activeElement;
            if (!active || active.tagName !== 'INPUT') return;

            const tr = active.closest('tr');
            if (!tr) return;

            const inputs = Array.from(tr.querySelectorAll('input'));
            const index = inputs.indexOf(active);
            if (index === -1) return;

            e.preventDefault();

            const nextInput = inputs[index + 1];

            if (nextInput && nextInput.type !== 'radio') {
                nextInput.focus();
                nextInput.select();
                return;
            }

            const radios = tr.querySelectorAll('input[type="radio"]');
            if (radios.length > 0) {
                radios[0].checked = true;
                radios[0].dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    })();

    /* [블록 3] A-1-7 — F3: 브라우저 찾기 차단 + JAN코드 칸 강제 포커스 */
    (function f3JanFocusBlock() {
        window.addEventListener('keydown', function(event) {
            if (event.key === 'F3' || event.keyCode === 114) {
                event.preventDefault();
                event.stopImmediatePropagation();

                console.log("[F3] JAN코드 칸 탐색 시작...");

                const focusJAN = () => {
                    const allInputs = Array.from(document.querySelectorAll('.el-input__inner, input:not([type="hidden"])'));
                    let target = allInputs.find(el =>
                        el.getAttribute('placeholder')?.includes('JAN') ||
                        el.name?.includes('jan') ||
                        el.id?.includes('jan')
                    );
                    if (!target && allInputs.length >= 4) target = allInputs[3];

                    if (target) {
                        target.focus();
                        if (typeof target.select === 'function') target.select();
                        target.dispatchEvent(new Event('input', { bubbles: true }));
                        target.click();
                        console.log("[F3] 성공: JAN코드 칸에 포커스를 주었습니다.");
                    } else {
                        console.log("[F3] 실패: JAN코드 입력칸을 찾을 수 없습니다.");
                    }
                };

                focusJAN();
                setTimeout(focusJAN, 100);
            }
        }, true);
    })();

    /* [블록 4] A-1-8 — F1: 도움말 차단 + 화면 좌표 기준 첫 번째 입력칸(발주서번호) 포커스 */
    (function f1FirstFieldFocusBlock() {
        window.addEventListener('help', function(e) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }, true);

        window.addEventListener('keydown', function(event) {
            if (event.key === 'F1' || event.keyCode === 112) {
                event.preventDefault();
                event.stopImmediatePropagation();

                console.log("[F1] 최적의 입력칸을 검색합니다...");

                const executeFocus = () => {
                    let inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), .el-input__inner'));
                    let visibleInputs = inputs.filter(el => {
                        const rect = el.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0;
                    });
                    visibleInputs.sort((a, b) => {
                        const rectA = a.getBoundingClientRect();
                        const rectB = b.getBoundingClientRect();
                        return rectA.top - rectB.top || rectA.left - rectB.left;
                    });
                    const target = visibleInputs[0];

                    if (target) {
                        target.focus();
                        if (target.select) target.select();
                        target.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
                        target.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
                        target.click();
                        console.log("[F1] 성공: 첫 번째 칸에 포커스 완료");
                    } else {
                        console.log("[F1] 실패: 화면에서 입력칸을 찾을 수 없습니다.");
                    }
                };

                executeFocus();
                setTimeout(executeFocus, 100);
            }
        }, true);
    })();

    /* [블록 5] A-1-10 — F2: Location 입력칸 포커스 */
    (function f2LocationFocusBlock() {
        window.addEventListener('keydown', function(event) {
            if (event.key === 'F2' || event.keyCode === 113) {
                console.log("[F2] pressed.");

                const locationInput =
                    document.querySelector('input[name="location"]') ||
                    document.querySelector('input[placeholder*="Location"]') ||
                    document.querySelectorAll('.el-input__inner')[1] ||
                    document.querySelectorAll('input')[1];

                if (locationInput) {
                    event.preventDefault();
                    setTimeout(() => {
                        locationInput.focus();
                        if (typeof locationInput.select === 'function') locationInput.select();
                    }, 50);
                    console.log("[F2] Location field focused successfully.", locationInput);
                } else {
                    console.warn("[F2] Location input element NOT found.");
                }
            }
        }, true);
    })();


    /* [블록 6] v1.1.0 — JAN CODE 입고 처리 창: 실시간 합계 패널 + 맨 아래/맨 위 이동 (F4)
     * 잔코드별로 하나씩 입고하면 창이 위쪽에 머물러 있어서, 맨 아래 총금액을 보려면
     * 매번 스크롤을 끝까지 내려야 했습니다. 오른쪽 아래에 항상 떠 있는 합계 패널을 띄우고,
     * 버튼(또는 F4)으로 창 맨 아래/맨 위로 바로 이동할 수 있게 했습니다.
     * - 합계 = 각 행의 (수량 × 매입 가격) 을 더한 값 (수량이 0인 행은 제외)
     */
    (function totalPanelBlock() {
        const num = (v) => parseFloat(String(v || '').replace(/[^0-9.\-]/g, '')) || 0;
        const fmt = (n) => Math.round(n).toLocaleString('ja-JP');

        function findModal() {
            return Array.from(document.querySelectorAll('.modal')).find(m => {
                const visible = m.classList.contains('show') || getComputedStyle(m).display === 'block';
                if (!visible) return false;
                const title = (m.querySelector('.modal-title, h5, h4')?.textContent || '').replace(/\s+/g, '');
                return title.includes('JANCODE입고');
            }) || null;
        }

        function calc(modal) {
            let kinds = 0, qtySum = 0, amount = 0;
            modal.querySelectorAll('table tbody tr').forEach(tr => {
                const inputs = Array.from(tr.querySelectorAll('input'))
                    .filter(i => !['radio', 'checkbox', 'hidden'].includes((i.type || '').toLowerCase()));
                if (inputs.length < 2) return;
                const qty = num(inputs[0].value);   // 수량
                const price = num(inputs[1].value); // 매입 가격
                if (qty <= 0) return;
                kinds++;
                qtySum += qty;
                amount += qty * price;
            });
            return { kinds, qtySum, amount };
        }

        // [v1.1.1] 입고량이 많을 때 맨 아래로 안 내려가던 문제 수정.
        // 기존에는 창(.modal)과 .modal-body 두 곳만 스크롤했는데, 실제로 스크롤되는
        // 영역이 그 사이의 다른 칸이거나 페이지 자체인 경우 움직이지 않았습니다.
        // → 표에서 바깥쪽으로 올라가며 "실제로 스크롤 가능한 영역"을 모두 찾아 함께 움직이고,
        //   마지막으로 창의 맨 끝 요소를 화면에 보이도록(scrollIntoView) 한 번 더 맞춥니다.
        //   또 창 내용이 화면보다 긴데 스크롤이 막혀 있으면 스크롤을 강제로 켭니다.
        function isScrollable(el) {
            if (!el || el.scrollHeight <= el.clientHeight + 5) return false;
            if (el === document.scrollingElement || el === document.documentElement || el === document.body) return true;
            const oy = getComputedStyle(el).overflowY;
            return oy === 'auto' || oy === 'scroll' || oy === 'overlay';
        }
        function scrollBoxes(modal) {
            const boxes = [];
            let el = modal.querySelector('table') || modal.querySelector('.modal-body') || modal;
            while (el && el !== document) {
                if (isScrollable(el) && !boxes.includes(el)) boxes.push(el);
                el = el.parentElement;
            }
            const root = document.scrollingElement;
            if (isScrollable(root) && !boxes.includes(root)) boxes.push(root);
            return boxes;
        }
        function ensureScrollable(modal) {
            // 창 내용이 화면보다 긴데 창 자체 스크롤이 꺼져 있으면 켭니다.
            const content = modal.querySelector('.modal-dialog') || modal.firstElementChild;
            if (content && content.getBoundingClientRect().height > window.innerHeight &&
                getComputedStyle(modal).overflowY !== 'auto' && getComputedStyle(modal).overflowY !== 'scroll') {
                modal.style.setProperty('overflow-y', 'auto', 'important');
            }
        }
        function lastVisibleEl(modal) {
            const content = modal.querySelector('.modal-content') || modal;
            let el = content.lastElementChild;
            while (el && el.getBoundingClientRect().height === 0) el = el.previousElementSibling;
            return el || content;
        }
        function goBottom(modal) {
            ensureScrollable(modal);
            scrollBoxes(modal).forEach(el => { el.scrollTop = el.scrollHeight; });
            const last = lastVisibleEl(modal);
            if (last) last.scrollIntoView({ block: 'end' });
            lastDir = 'bottom';
        }
        function goTop(modal) {
            scrollBoxes(modal).forEach(el => { el.scrollTop = 0; });
            const head = modal.querySelector('.modal-header, .modal-title') || modal.querySelector('.modal-content');
            if (head) head.scrollIntoView({ block: 'start' });
            lastDir = 'top';
        }
        let lastDir = 'top';
        function isAtBottom() { return lastDir === 'bottom'; }

        const panel = document.createElement('div');
        panel.id = 'tm-jan-total-panel';
        panel.style.cssText = `
            position: fixed; right: 110px; bottom: 20px; z-index: 20000; display: none;
            background: #1f2937; color: #fff; border-radius: 10px; padding: 10px 14px;
            box-shadow: 0 6px 20px rgba(0,0,0,0.35); font-size: 13px; line-height: 1.5;
            min-width: 230px; font-family: inherit;
        `;
        panel.innerHTML = `
            <div style="font-weight:700; color:#93c5fd; margin-bottom:4px;">📦 입고 합계 (실시간)</div>
            <div>입력 종류: <b id="tm-jt-kinds">0</b> 종 · 수량: <b id="tm-jt-qty">0</b></div>
            <div style="font-size:16px; margin-top:2px;">매입 금액: <b id="tm-jt-amount" style="color:#fde68a;">0</b> 円</div>
            <div style="font-size:11px; color:#9ca3af;">(수량 × 매입 가격 · 세금 미포함)</div>
            <div style="display:flex; gap:6px; margin-top:8px;">
                <button type="button" id="tm-jt-bottom" style="flex:1; border:0; border-radius:6px; padding:5px 0; background:#2563eb; color:#fff; font-weight:700; cursor:pointer;">⬇ 맨 아래 (F4)</button>
                <button type="button" id="tm-jt-top" style="flex:1; border:0; border-radius:6px; padding:5px 0; background:#4b5563; color:#fff; font-weight:700; cursor:pointer;">⬆ 맨 위</button>
            </div>
        `;
        document.body.appendChild(panel);

        panel.querySelector('#tm-jt-bottom').addEventListener('click', () => { const m = findModal(); if (m) goBottom(m); });
        panel.querySelector('#tm-jt-top').addEventListener('click', () => { const m = findModal(); if (m) goTop(m); });

        // F4: 맨 아래로 (이미 맨 아래면 맨 위로)
        window.addEventListener('keydown', function(e) {
            if (e.key !== 'F4' || e.altKey) return;
            const m = findModal();
            if (!m) return;
            e.preventDefault();
            if (isAtBottom()) goTop(m); else goBottom(m);
        }, true);

        setInterval(() => {
            const m = findModal();
            if (!m) { panel.style.display = 'none'; return; }
            panel.style.display = 'block';
            ensureScrollable(m);
            const r = calc(m);
            panel.querySelector('#tm-jt-kinds').textContent = r.kinds;
            panel.querySelector('#tm-jt-qty').textContent = fmt(r.qtySum);
            panel.querySelector('#tm-jt-amount').textContent = fmt(r.amount);
        }, 400);
    })();

})();
