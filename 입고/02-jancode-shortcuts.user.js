// ==UserScript==
// @name         [입고] JAN코드 화면 단축키 통합 (JAN이동 + Enter이동 + F1/F2/F3 + 합계패널 + JAN 6자리강조)
// @namespace    https://github.com/asics67-lab/tampermonkey-scripts
// @version      1.4.0
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
 *
 * [v1.2.1 변경 사항] 입고 창 스크롤이 다시 안 내려간다는 보고
 * - 블록 7을 넓혔습니다. 전에는 "커서가 들어간 숫자 칸 위"에서만 대신 스크롤했는데,
 *   이제는 입고 창 안 어디에서 휠을 굴리든 사이트가 휠을 막아 버린 경우
 *   (창이 안 움직이는 경우)에는 스크립트가 대신 창을 스크롤합니다.
 *   사이트가 막지 않은 경우는 원래대로 브라우저가 스크롤하므로 두 번 움직이지 않습니다.
 * - 입고 창이 화면보다 길면 창에 스크롤바를 강제로 켜는 처리를 휠을 굴릴 때도 바로 적용.
 *
 * [v1.3.0 변경 사항] 입고 창 스크롤이 또 안 내려간다는 보고 (3번째)
 * - 원인: 지금까지는 "사이트가 휠을 막았는지"를 확인한 뒤에만 대신 스크롤했는데,
 *   사이트가 바뀔 때마다 막는 방식이 달라져서 확인에 걸리지 않는 경우가 생겼습니다.
 *   또 입고 창의 높이가 내용 길이만큼 늘어나 버리면(화면 밖으로 넘침) 창 자체에
 *   스크롤할 공간이 없어 스크롤바를 켜도 움직이지 않았습니다.
 * - 수정: 입고 창 안에서는 이제 "확인하지 않고 항상" 스크립트가 직접 스크롤합니다.
 *   1) 입고 창을 화면 높이에 고정 + 세로 스크롤바 강제 (내용이 넘치면 항상 스크롤 가능)
 *   2) 휠을 굴리면 브라우저 기본 동작은 끄고, 커서 아래에서 실제로 스크롤 가능한 칸
 *      (드롭다운 목록 등)부터 찾아서 그 칸을, 없으면 입고 창 전체를 스크롤
 *   3) 숫자 칸 위에서 휠을 굴려도 수량 값은 바뀌지 않음 (기본 동작을 끄므로)
 *   4) [맨 아래 (F4)] / [맨 위] 버튼도 같은 방식으로 동작
 *
 * [v1.3.1 변경 사항] 입고 창 스크롤이 또 안 내려간다는 보고 (4번째)
 * - 원인 1: 예전에 따로 만든 "03-jancode-scroll-fix" 스크립트가 같이 켜져 있으면
 *   [맨 아래]/[맨 위] 버튼 클릭과 F4를 먼저 가로채서 이 스크립트의 스크롤을 막았음
 *   → 03번은 v1.3.0에 이미 합쳐졌으므로 삭제해야 함.
 * - 원인 2: 입고 창(#storeModal)이 아니라 그 안쪽 칸이나 페이지 전체가 실제 스크롤 영역인 경우,
 *   창만 움직이려다 아무 일도 안 일어났음.
 * - 수정: 후보(커서 아래 칸 → 입고 창 → 창 안쪽 칸들 → 페이지 전체)를 차례로 움직여 보고
 *   "실제로 움직인 곳"이 나올 때까지 다음 후보로 넘어감. 버튼/F4/휠 모두 이 방식 사용.
 *   03번 스크립트가 켜져 있으면 화면 왼쪽 아래에 빨간 안내를 띄움.
 *
 * [v1.4.0 변경 사항] "입고화면에서 JAN 끝 6자리가 크게 안 보인다"
 * - 원래 이 강조는 예전 "[통합] 플랫폼 포장 및 입고 업무 마스터 툴(V7.8)"이 해 주던 기능인데,
 *   그 스크립트를 끄고 입고 스크립트를 01/02번으로 나누면서 JAN코드 화면(/admin/store/jancode)에서는
 *   강조가 빠져 있었습니다. (01번은 운송장번호 화면에서만 동작)
 * - 블록 8(신규): JAN코드 목록 표와 입고 창(#scan-tbody)의 JAN 칸에서 끝 6자리를
 *   노란 바탕 + 빨간 굵은 글씨 + 1.35배 크기로 표시합니다. (V7.8과 같은 모양)
 * - JAN 칸은 표 머리글("JAN")로 찾고, 못 찾으면 예전 위치(목록 4번째 칸 / 입고 창 3번째 칸)를 씁니다.
 * - 화면이 바뀌거나 검색·페이지 이동으로 줄이 새로 그려져도 자동으로 다시 강조합니다.
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

    /* [v1.3.0] 입고 창을 화면 높이에 고정하고 세로 스크롤을 강제로 켭니다.
     * (창이 내용 길이만큼 늘어나 화면 밖으로 넘치면 스크롤할 공간이 없어지기 때문) */
    function forceModalScroll(modal) {
        if (!modal) return;
        const cs = getComputedStyle(modal);
        if (cs.position === 'fixed' || cs.position === 'absolute') {
            modal.style.setProperty('top', '0', 'important');
            modal.style.setProperty('bottom', '0', 'important');
            modal.style.setProperty('height', '100vh', 'important');
            modal.style.setProperty('max-height', '100vh', 'important');
        }
        modal.style.setProperty('overflow-y', 'auto', 'important');
        // 창 안쪽 칸들이 높이를 막아 둔 경우(overflow: hidden) 풀어 줌
        modal.querySelectorAll('.modal-dialog, .modal-content, .modal-body').forEach(el => {
            if (getComputedStyle(el).overflowY === 'hidden') el.style.setProperty('overflow', 'visible', 'important');
        });
    }

    /* [v1.3.1] 실제로 움직이는 스크롤 영역을 찾아서 움직임.
     * 후보를 순서대로 시도해서 scrollTop이 실제로 바뀐 곳에서 멈춤. 움직였으면 true. */
    function moveScroll(modal, dy, startEl) {
        const list = [];
        const add = (el) => { if (el && !list.includes(el)) list.push(el); };
        for (let el = startEl; el && modal.contains(el) && el !== modal; el = el.parentElement) {
            const oy = getComputedStyle(el).overflowY;
            if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight + 2) add(el);
        }
        add(modal);
        modal.querySelectorAll('.modal-dialog, .modal-content, .modal-body').forEach(add);
        add(document.scrollingElement || document.documentElement);
        add(document.body);
        for (const el of list) {
            const before = el.scrollTop;
            el.scrollTop = before + dy;
            if (el.scrollTop !== before) return true;
        }
        return false;
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
        function ensureScrollable(modal) { forceModalScroll(modal); }
        function lastVisibleEl(modal) {
            const content = modal.querySelector('.modal-content') || modal;
            let el = content.lastElementChild;
            while (el && el.getBoundingClientRect().height === 0) el = el.previousElementSibling;
            return el || content;
        }
        function goBottom(modal) {
            ensureScrollable(modal);
            modal.scrollTop = modal.scrollHeight;
            scrollBoxes(modal).forEach(el => { el.scrollTop = el.scrollHeight; });
            const last = lastVisibleEl(modal);
            if (last) last.scrollIntoView({ block: 'end' });
            moveScroll(modal, 1e7, last);
            lastDir = 'bottom';
        }
        function goTop(modal) {
            modal.scrollTop = 0;
            scrollBoxes(modal).forEach(el => { el.scrollTop = 0; });
            const head = modal.querySelector('.modal-header, .modal-title') || modal.querySelector('.modal-content');
            if (head) head.scrollIntoView({ block: 'start' });
            moveScroll(modal, -1e7, head);
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

    /* [블록 7] v1.3.0 — 입고 창 안의 휠 스크롤을 스크립트가 항상 직접 처리
     * 사이트가 휠을 막든 안 막든 상관없이: 기본 동작을 끄고 → 커서 아래에서 실제로
     * 스크롤 가능한 칸(드롭다운 목록 등)을 찾아 그 칸을, 없으면 입고 창 전체를 움직입니다.
     * 기본 동작을 끄므로 숫자 칸 위에서 휠을 굴려도 수량이 바뀌지 않습니다. */
    (function modalWheelBlock() {
        const canScroll = (el, dy) => {
            if (!el || el.scrollHeight <= el.clientHeight + 2) return false;
            const oy = getComputedStyle(el).overflowY;
            if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') return false;
            // 이미 끝까지 내려간(올라간) 칸은 건너뛰고 바깥 칸을 움직임
            if (dy > 0) return el.scrollTop + el.clientHeight < el.scrollHeight - 1;
            if (dy < 0) return el.scrollTop > 0;
            return true;
        };
        let logged = false;
        window.addEventListener('wheel', function(e) {
            if (e.ctrlKey) return; // Ctrl+휠(화면 확대/축소)은 그대로 둠
            const t = e.target;
            if (!(t instanceof Element)) return;
            const modal = findStoreModal();
            if (!modal || !modal.contains(t)) return;

            forceModalScroll(modal);
            const dy = e.deltaMode === 1 ? e.deltaY * 40 : (e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY);
            if (!dy) return;

            let box = null;
            for (let el = t; el && el !== modal; el = el.parentElement) {
                if (canScroll(el, dy)) { box = el; break; }
            }

            e.preventDefault();
            let moved = false;
            if (box) { const b = box.scrollTop; box.scrollTop += dy; moved = box.scrollTop !== b; }
            if (!moved) moved = moveScroll(modal, dy, t);

            if (!logged) {
                logged = true;
                console.log('[입고 스크롤 v1.3.1] 스크립트가 직접 스크롤, 움직임:', moved,
                    'modal scrollHeight', modal.scrollHeight, 'clientHeight', modal.clientHeight);
            }
        }, { capture: true, passive: false });
    })();

    /* [v1.3.1] 예전 03번 스크롤 스크립트가 같이 켜져 있으면 경고 (버튼/F4를 가로채서 충돌함) */
    setTimeout(() => {
        const dup = Array.from(document.querySelectorAll('style')).some(st =>
            st.textContent.includes('.modal.show, .modal.in, .modal[style*="display: block"]'));
        if (!dup || document.getElementById('tm-jan-dup-warn')) return;
        const w = document.createElement('div');
        w.id = 'tm-jan-dup-warn';
        w.textContent = '⚠ 템퍼몽키에서 "[입고] JAN코드 화면 스크롤 수정" (03번) 스크립트를 삭제해 주세요. 스크롤 충돌 원인입니다.';
        w.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:20001;background:#dc2626;color:#fff;padding:8px 12px;border-radius:8px;font-size:13px;font-weight:700;max-width:420px;';
        document.body.appendChild(w);
    }, 1500);

    /* ------------------------------------------------------------
     * [블록 8] v1.4.0 — JAN코드 끝 6자리 강조 (목록 표 + 입고 창)
     * ------------------------------------------------------------ */
    (function janTailHighlightBlock() {
        const highlightJanText = (cell) => {
            if (!cell || cell.dataset.janHighlighted === 'true') return;
            const targetNode = cell.querySelector('a') || cell;
            const fullText = (targetNode.innerText || '').trim();
            if (fullText.length < 10 || !/^\d+$/.test(fullText)) return; // 숫자만 있는 JAN 칸만
            const head = fullText.slice(0, -6);
            const tail = fullText.slice(-6);
            targetNode.innerHTML = `${head}<span style="
                color: #d32f2f !important;
                background-color: #ffeb3b !important;
                font-weight: 900 !important;
                font-size: 1.35em !important;
                padding: 0 3px !important;
                border-radius: 3px !important;
                letter-spacing: 1px !important;
                display: inline-block !important;
                line-height: 1.1 !important;
            ">${tail}</span>`;
            cell.dataset.janHighlighted = 'true';
        };

        // 표 머리글에서 "JAN" 칸 위치 찾기 (없으면 기본 위치)
        const findJanIndex = (table, fallback) => {
            if (!table) return fallback;
            const ths = Array.from(table.querySelectorAll('thead tr:first-child th, thead tr:first-child td'));
            const idx = ths.findIndex(th => /JAN/i.test((th.innerText || '').replace(/\s+/g, '')));
            return idx >= 0 ? idx : fallback;
        };

        const run = () => {
            // 1) 입고 창(#scan-tbody)
            const scanBody = document.getElementById('scan-tbody');
            if (scanBody) {
                const idx = findJanIndex(scanBody.closest('table'), 2);
                scanBody.querySelectorAll('tr').forEach(tr => highlightJanText(tr.cells[idx]));
            }
            // 2) JAN코드 목록 표
            document.querySelectorAll('.content-wrapper table').forEach(table => {
                if (scanBody && table.contains(scanBody)) return;
                const tb = table.querySelector('tbody');
                if (!tb) return;
                const idx = findJanIndex(table, 3);
                tb.querySelectorAll('tr').forEach(tr => highlightJanText(tr.cells[idx]));
            });
        };

        let timer = null;
        const schedule = () => { clearTimeout(timer); timer = setTimeout(run, 80); };
        run();
        new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    })();

})();
