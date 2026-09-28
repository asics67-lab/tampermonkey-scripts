// ==UserScript==
// @name         [입고] JAN코드 화면 단축키 통합 (JAN이동 + Enter이동 + F1/F2/F3 + 합계패널)
// @namespace    https://github.com/asics67-lab/tampermonkey-scripts
// @version      1.2.0
// @description  jancode 페이지 통합본. 원본: A-1-9(JAN 검색이동) + A-1-6(Enter 행이동) + A-1-7(F3) + A-1-8(F1) + A-1-10(F2)
// @author       물류팀
// @match        https://www.platform.co.jp/admin/store/jancode*
// @match        *://platform.co.jp/admin/store/jancode*
// @updateURL    https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/입고/02-jancode-shortcuts.user.js
// @downloadURL  https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/입고/02-jancode-shortcuts.user.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

/* [v1.2.0 변경 사항] 입고 창 스크롤이 안 내려가던 문제
 * 1) 커서를 옮길 때 화면이 따라 튀지 않게 focus({ preventScroll: true }) 사용 (블록 1·3·4·5)
 * 2) 블록 1: JAN 스캔 칸(#scan_jancode)에서만 동작. 행은 JAN코드 "완전 일치"로 찾고,
 *    행을 맨 위로 올리는 건 사이트가 이미 하므로 스크립트에서는 다시 하지 않음.
 *    또 한 번 스캔에 한 번만 실행되도록 중복 실행 방지.
 * 3) 블록 6: 입고 창을 찾는 조건이 한국어 제목("JANCODE입고")만 인식해서
 *    일본어 화면(JANコード入庫処理)에서는 합계 패널·F4가 아예 안 떴음 → 창 id(#storeModal)로 찾도록 수정.
 * 4) 블록 7(신규): 사이트 업데이트로 "커서가 들어간 숫자 칸 위에서는 휠이 막히는" 코드가 생겨서,
 *    수량 칸 위에서 휠을 굴리면 창이 안 내려갔음 → 그때는 스크립트가 대신 창을 스크롤.
 *    (숫자 값이 휠로 바뀌는 건 사이트 코드가 계속 막아줌)
 */

(function() {
    'use strict';

    const focusNoScroll = (el) => {
        try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); }
    };

    function findStoreModal() {
        const byId = document.getElementById('storeModal');
        if (byId && (byId.classList.contains('show') || getComputedStyle(byId).display === 'block')) return byId;
        return Array.from(document.querySelectorAll('.modal')).find(m => {
            const visible = m.classList.contains('show') || getComputedStyle(m).display === 'block';
            if (!visible) return false;
            const title = (m.querySelector('.modal-title, h5, h4')?.textContent || '').replace(/\s+/g, '').toUpperCase();
            return title.includes('JAN') && (title.includes('입고') || title.includes('入庫'));
        }) || null;
    }

    /* [블록 1] A-1-9 — Enter: JAN 스캔 후 해당 행 수량 칸으로 커서 이동 */
    (function janSearchFocusBlock() {
        let timer = null;
        window.addEventListener('keydown', function(e) {
            if (e.key !== 'Enter') return;
            const activeEl = document.activeElement;
            if (!activeEl || activeEl.id !== 'scan_jancode') return;

            const searchVal = activeEl.value.trim();
            if (!searchVal) return;

            clearTimeout(timer); // 중복 실행 방지: 마지막 스캔 한 번만 처리
            timer = setTimeout(() => {
                const rows = Array.from(document.querySelectorAll('#scan-tbody tr'));
                const targetRow = rows.find(row => String(row.getAttribute('data-jancode')) === searchVal);
                if (!targetRow) return;

                targetRow.style.backgroundColor = "#fff3cd";
                targetRow.style.outline = "2px solid #ff4d4d";

                const qtyInput = targetRow.querySelector('input.quantity:not([readonly])') ||
                                 targetRow.querySelector('input[type="number"]:not([readonly])');
                if (qtyInput) {
                    focusNoScroll(qtyInput);
                    qtyInput.select();
                    console.log("[JAN 이동] 스캔 성공: 수량 칸으로 이동했습니다.");
                }
            }, 400);
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
                focusNoScroll(nextInput);
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
                    let target = document.getElementById('scan_jancode');
                    if (!target || target.getBoundingClientRect().width === 0) {
                        const allInputs = Array.from(document.querySelectorAll('.el-input__inner, input:not([type="hidden"])'));
                        target = allInputs.find(el =>
                            el.getAttribute('placeholder')?.includes('JAN') ||
                            el.name?.includes('jan') ||
                            el.id?.includes('jan')
                        );
                        if (!target && allInputs.length >= 4) target = allInputs[3];
                    }

                    if (target) {
                        focusNoScroll(target);
                        if (typeof target.select === 'function') target.select();
                        target.dispatchEvent(new Event('input', { bubbles: true }));
                        console.log("[F3] 성공: JAN코드 칸에 포커스를 주었습니다.");
                    } else {
                        console.log("[F3] 실패: JAN코드 입력칸을 찾을 수 없습니다.");
                    }
                };

                focusJAN();
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

                let target = document.getElementById('scan_purchase_no');
                if (!target || target.getBoundingClientRect().width === 0) {
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
                    target = visibleInputs[0];
                }

                if (target) {
                    focusNoScroll(target);
                    if (target.select) target.select();
                    console.log("[F1] 성공: 첫 번째 칸에 포커스 완료");
                } else {
                    console.log("[F1] 실패: 화면에서 입력칸을 찾을 수 없습니다.");
                }
            }
        }, true);
    })();

    /* [블록 5] A-1-10 — F2: Location 입력칸 포커스 */
    (function f2LocationFocusBlock() {
        window.addEventListener('keydown', function(event) {
            if (event.key === 'F2' || event.keyCode === 113) {
                console.log("[F2] pressed.");

                const locationInput =
                    document.getElementById('scan_location') ||
                    document.querySelector('input[name="location"]') ||
                    document.querySelector('input[placeholder*="Location"]') ||
                    document.querySelectorAll('.el-input__inner')[1] ||
                    document.querySelectorAll('input')[1];

                if (locationInput) {
                    event.preventDefault();
                    setTimeout(() => {
                        focusNoScroll(locationInput);
                        if (typeof locationInput.select === 'function') locationInput.select();
                    }, 50);
                    console.log("[F2] Location field focused successfully.");
                } else {
                    console.warn("[F2] Location input element NOT found.");
                }
            }
        }, true);
    })();

    /* [블록 6] JAN CODE 입고 처리 창: 실시간 합계 패널 + 맨 아래/맨 위 이동 (F4) */
    (function totalPanelBlock() {
        const num = (v) => parseFloat(String(v || '').replace(/[^0-9.\-]/g, '')) || 0;
        const fmt = (n) => Math.round(n).toLocaleString('ja-JP');

        function calc(modal) {
            let kinds = 0, qtySum = 0, amount = 0;
            modal.querySelectorAll('#scan-tbody tr, table tbody tr').forEach(tr => {
                const qtyEl = tr.querySelector('input.quantity');
                const priceEl = tr.querySelector('input.purchase_price');
                if (!qtyEl || !priceEl) return;
                const qty = num(qtyEl.value);
                const price = num(priceEl.value);
                if (qty <= 0) return;
                kinds++;
                qtySum += qty;
                amount += qty * price;
            });
            return { kinds, qtySum, amount };
        }

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

        // 다른 블록에서도 쓰도록 공개
        window.__tmJanScrollBoxes = scrollBoxes;

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

        panel.querySelector('#tm-jt-bottom').addEventListener('click', () => { const m = findStoreModal(); if (m) goBottom(m); });
        panel.querySelector('#tm-jt-top').addEventListener('click', () => { const m = findStoreModal(); if (m) goTop(m); });

        window.addEventListener('keydown', function(e) {
            if (e.key !== 'F4' || e.altKey) return;
            const m = findStoreModal();
            if (!m) return;
            e.preventDefault();
            if (isAtBottom()) goTop(m); else goBottom(m);
        }, true);

        setInterval(() => {
            const m = findStoreModal();
            if (!m) { panel.style.display = 'none'; return; }
            panel.style.display = 'block';
            ensureScrollable(m);
            const r = calc(m);
            panel.querySelector('#tm-jt-kinds').textContent = r.kinds;
            panel.querySelector('#tm-jt-qty').textContent = fmt(r.qtySum);
            panel.querySelector('#tm-jt-amount').textContent = fmt(r.amount);
        }, 400);
    })();

    /* [블록 7] v1.2.0 — 커서가 들어간 숫자 칸 위에서 휠을 굴려도 창이 스크롤되게 하기
     * 사이트가 그 칸의 휠을 막아서(값이 바뀌는 것 방지) 창도 같이 안 움직였음.
     * 값은 계속 안 바뀌고, 창만 스크립트가 대신 스크롤합니다. */
    (function numberInputWheelBlock() {
        window.addEventListener('wheel', function(e) {
            const t = e.target;
            if (!(t instanceof HTMLInputElement) || t.type !== 'number') return;
            if (document.activeElement !== t) return; // 사이트가 막는 건 커서가 들어간 칸뿐
            const modal = t.closest('.modal');
            const boxes = modal && window.__tmJanScrollBoxes ? window.__tmJanScrollBoxes(modal) : [];
            const box = boxes.includes(modal) ? modal : (boxes[0] || document.scrollingElement);
            const dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
            box.scrollTop += dy;
        }, { capture: true, passive: true });
    })();

})();
