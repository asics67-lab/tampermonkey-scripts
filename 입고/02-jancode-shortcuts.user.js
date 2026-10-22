// ==UserScript==
// @name         [입고] JAN코드 화면 단축키 통합 (JAN이동 + Enter이동 + F1/F2/F3 + 합계패널 + JAN 6자리강조)
// @namespace    https://github.com/asics67-lab/tampermonkey-scripts
// @version      1.7.0
// @description  jancode 페이지 통합본. 원본: A-1-9(JAN 검색이동) + A-1-6(Enter 행이동) + A-1-7(F3) + A-1-8(F1) + A-1-10(F2). v1.5.0: 입고 창에 세트상품 "1セット個数(1세트 낱개수)" 등록 칸 추가 → 구글시트 '세트낱개수' 탭에 저장, 피킹리스트·포장화면에 세트수로 표시됨
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
 *
 * [v1.5.0 변경 사항] "세트상품이 1세트 더 나가거나 빠진다" (겉면 8종류인데 실제 16개 든 상품)
 * - 출고목록 수량은 낱개(16)인데, 겉면 "8종류"를 보고 16÷8=2세트로 착각해서 2세트를 출고하는 문제.
 * - 블록 9(신규): JAN 입고 창 각 줄 맨 오른쪽에 [1セット個数] 칸을 추가했습니다.
 *   버튼을 눌러 "1세트 안에 실제로 들어 있는 낱개 수"를 입력하면 구글시트(아타리쿠지_세트기준 파일의
 *   '세트낱개수' 탭)에 저장되고, 피킹리스트·포장화면에서 "16個 = 1セット" 처럼 세트 수로 표시됩니다.
 * - 이미 등록된 상품은 칸에 "16個/セット" 이 보이고, 입고 수량이 세트 배수가 아니면 빨간 경고가 뜹니다.
 * - 0 을 입력하면 등록을 지웁니다. 버튼은 입력칸이 아니라서 Enter 이동(블록 2)·합계(블록 6)에 영향 없음.
 * - 저장용 웹 앱 주소는 입고 PC마다 처음 한 번만 물어보고 그 PC에 기억합니다(공개 GitHub에 안 올라감).
 *   주소를 바꾸려면 표 머리글 "セット個数" 옆 ⚙ 를 누르세요.
 *
 * [v1.6.0 변경 사항] "같은 상품이라도 도매처·고객 발주에 따라 세트 단위로 들어오는 경우가 있다"
 * - 기본은 낱개 입고. 세트 단위로 들어온 경우에만 등록된 상품 줄의 [セット入庫] 를 눌러 켭니다.
 * - 켜면 "발주번호 + 잔코드" 로 시트에 기록(잔코드 칸에 S발주번호-잔코드 형식, 낱개수 칸에 1세트 낱개수).
 *   피킹리스트·포장·태블릿은 출고 상품의 로케이션으로 그 발주를 찾아 "数量=セット数"(보라)로 표시합니다.
 * - 세트 입고로 켜진 줄은 "세트 배수 아님" 경고 대신 "= ○セット (○個)" 를 표시합니다.
 *
 * [v1.7.0 변경 사항] "몇 개입 입력과 세트 단위 입고 체크는 따로"
 * - [セット入庫] 체크는 모든 상품 줄에 표시(기본 낱개 → 세트 단위로 들어온 발주만 체크). 몇 개입을 몰라도 체크 가능
 * - [＋ 몇개입] 은 겉면만으로 개수를 알기 어려운 상품만 선택해서 입력 (잔코드 단위, 한 번 입력하면 계속 적용)
 * - 몇 개입 없이 세트 입고만 체크한 기록은 시트 낱개수 칸에 2가 들어가지만 의미 없는 값(표시용 아님)
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

    /* ------------------------------------------------------------
     * [블록 9] v1.5.0 — 세트상품 1세트 낱개수 등록 (입고 창 맨 오른쪽 칸)
     *  저장: Apps Script 웹 앱 → 구글시트 '세트낱개수' 탭
     *  읽기: 같은 시트를 CSV로 (피킹리스트·포장화면도 같은 방식으로 읽음)
     * ------------------------------------------------------------ */
    (function setPcsBlock() {
        const SETPCS_SHEET_ID = '1dEuXsgKJsdsM4FFHEgnuSE3droNVPQawF5z8hQgO59Q'; // 아타리쿠지_세트기준 파일
        const SETPCS_TAB = '세트낱개수';
        const SETPCS_CSV_URL = 'https://docs.google.com/spreadsheets/d/' + SETPCS_SHEET_ID +
            '/gviz/tq?tqx=out:csv&headers=1&sheet=' + encodeURIComponent(SETPCS_TAB);
        const URL_KEY = 'tmSetPcsWebAppUrl';
        const BY_KEY = 'tmSetPcsStaff';
        const setPcsKey = (j) => String(j || '').replace(/\s+/g, '').toUpperCase();
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));

        function parseCsv(text) {
            const rows = []; let row = [], cur = '', q = false;
            for (let i = 0; i < text.length; i++) {
                const c = text[i];
                if (q) {
                    if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
                    else if (c === '"') q = false;
                    else cur += c;
                } else if (c === '"') q = true;
                else if (c === ',') { row.push(cur); cur = ''; }
                else if (c === '\n' || c === '\r') {
                    if (c === '\r' && text[i + 1] === '\n') i++;
                    row.push(cur); rows.push(row); row = []; cur = '';
                } else cur += c;
            }
            if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
            return rows;
        }

        async function loadSetPcsMap() {
            try {
                const ctrl = new AbortController();
                const t = setTimeout(() => ctrl.abort(), 8000);
                const res = await fetch(SETPCS_CSV_URL + '&_=' + Date.now(), { cache: 'no-store', signal: ctrl.signal })
                    .finally(() => clearTimeout(t));
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const text = await res.text();
                if (/^\s*</.test(text)) throw new Error('시트 공유 설정 확인 필요');
                const rows = parseCsv(text);
                // 탭이 없으면 구글이 첫 번째 탭(쿠지 세트기준)을 대신 돌려줌 → 머리글로 확인
                if (!rows.length || !/낱개/.test(rows[0].join(','))) return { map: {}, error: '', missing: true };
                const map = {};
                rows.slice(1).forEach(r => {
                    const jan = setPcsKey(r[0]).replace(/\.0+$/, '');
                    const pcs = parseInt(String(r[1] || '').replace(/[^\d]/g, ''), 10);
                    if (jan && pcs > 1) map[jan] = { pcs: pcs, name: String(r[2] || '') };
                });
                return { map: map, error: '', missing: false };
            } catch (e) {
                console.warn('[세트낱개수] 시트 읽기 실패', e);
                return { map: {}, error: String(e.message || e), missing: false };
            }
        }

        let cache = { map: {}, at: 0, error: '', missing: false };
        let loading = null;
        const pending = {}; // jan → { pcs, state: 'saving' | 'error' | 'unverified', msg }

        function refresh(force) {
            if (loading) return loading;
            if (!force && cache.at && Date.now() - cache.at < 60000) return Promise.resolve(cache);
            loading = loadSetPcsMap().then(r => {
                // 읽기 실패 시 직전 값은 유지
                cache = r.error ? Object.assign({}, cache, { error: r.error, at: Date.now() }) : Object.assign(r, { at: Date.now() });
                loading = null;
                render();
                return cache;
            });
            return loading;
        }

        /* ---------- 스타일 ---------- */
        const st = document.createElement('style');
        st.textContent = `
            #scan-tbody td.tm-setpcs-td, th.tm-setpcs-th { min-width: 96px; text-align: center; vertical-align: middle; }
            th.tm-setpcs-th { background: #e3f2fd; color: #0d47a1; font-size: 12px; white-space: nowrap; }
            th.tm-setpcs-th .tm-setpcs-gear { cursor: pointer; margin-left: 4px; opacity: .6; }
            .tm-setpcs-btn { border: 1.5px dashed #90a4ae; background: #fff; color: #78909c; border-radius: 6px;
                padding: 3px 8px; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
            .tm-setpcs-btn.hint { border-color: #fb8c00; color: #e65100; background: #fff8e1; }
            .tm-setpcs-btn.set { border: 2px solid #1565c0; background: #1565c0; color: #fff; font-size: 13px; }
            .tm-setpcs-btn.busy { border-color: #fbc02d; background: #fff9c4; color: #5d4037; }
            .tm-setpcs-btn.err { border-color: #c62828; background: #ffebee; color: #c62828; }
            .tm-setunit-btn { display: block; margin: 0 auto 4px; border: 1.5px solid #b0bec5; background: #fff; color: #607d8b;
                border-radius: 6px; padding: 2px 8px; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
            .tm-setunit-btn.on { border-color: #6a1b9a; background: #6a1b9a; color: #fff; }
            .tm-setunit-btn.busy { border-color: #fbc02d; background: #fff9c4; color: #5d4037; }
            .tm-setunit-btn.err { border-color: #c62828; background: #ffebee; color: #c62828; }
            #scan-tbody tr.tm-setin-row td { background: #f3e5f5 !important; }
            .tm-setpcs-note { font-size: 11px; font-weight: 800; margin-top: 2px; line-height: 1.2; }
            .tm-setpcs-note.ok { color: #2e7d32; }
            .tm-setpcs-note.bad { color: #fff; background: #c62828; border-radius: 3px; padding: 1px 3px; }
            #tm-setpcs-toast { position: fixed; left: 50%; top: 18px; transform: translateX(-50%); z-index: 30000;
                padding: 10px 20px; border-radius: 8px; color: #fff; font-weight: 700; font-size: 15px;
                box-shadow: 0 4px 16px rgba(0,0,0,.3); pointer-events: none; transition: opacity .2s; }
        `;
        document.head.appendChild(st);

        let toastTimer = null;
        function toast(msg, color) {
            let t = document.getElementById('tm-setpcs-toast');
            if (!t) { t = document.createElement('div'); t.id = 'tm-setpcs-toast'; document.body.appendChild(t); }
            t.style.background = color || '#1565c0';
            t.textContent = msg;
            t.style.opacity = '1';
            clearTimeout(toastTimer);
            toastTimer = setTimeout(() => { t.style.opacity = '0'; }, 2500);
        }

        /* ---------- 줄 정보 읽기 ---------- */
        const rowJan = (tr) => setPcsKey(tr.getAttribute('data-jancode'));
        const rowQty = (tr) => { const q = tr.querySelector('input.quantity'); return q ? (parseInt(q.value, 10) || 0) : 0; };
        // [v1.6.0] 줄의 발주번호: "発注番号 / JANコード" 칸의 첫 줄 (없으면 위쪽 発注書番号 입력칸)
        function rowPo(tr) {
            const jan = rowJan(tr);
            for (const td of Array.from(tr.cells)) {
                if (td.classList.contains('tm-setpcs-td') || td.querySelector('input, select, button')) continue;
                const lines = (td.innerText || '').split(/\n+/).map(x => x.replace(/\s+/g, '').toUpperCase()).filter(Boolean);
                if (lines.length >= 2 && lines.slice(1).join('').indexOf(jan) >= 0 && /^[0-9A-Z]{4,20}$/.test(lines[0]) && lines[0] !== jan) return lines[0];
            }
            const top = document.getElementById('scan_purchase_no');
            const v = top ? String(top.value || '').replace(/\s+/g, '').toUpperCase() : '';
            return /^[0-9A-Z]{4,20}$/.test(v) ? v : '';
        }
        const markKey = (po, jan) => 'S' + po + '-' + jan;   // 시트 잔코드 칸에 쓰는 세트 입고 표시
        function rowName(tr) {
            // 입력칸·우리 칸을 뺀 칸 중에서 숫자만이 아닌 가장 긴 글자 = 상품명(기록용)
            let best = '';
            Array.from(tr.cells).forEach(td => {
                if (td.classList.contains('tm-setpcs-td') || td.querySelector('input, select, button')) return;
                const t = (td.innerText || '').replace(/\s+/g, ' ').trim();
                if (t.length > best.length && !/^[\d\s\-.,]+$/.test(t)) best = t;
            });
            return best.slice(0, 120);
        }
        // 이름에 세트 느낌이 나면 버튼을 주황색으로 (등록을 잊지 않도록)
        const looksLikeSet = (name) => /SET|セット|세트|BOX|ボックス|박스|全\s*\d+\s*種|\d+\s*種|\d+\s*종|入り|개입|PCS/i.test(name);

        function ensureHeader(table) {
            const htr = table.querySelector('thead tr');
            if (!htr || htr.querySelector('th.tm-setpcs-th')) return;
            const th = document.createElement('th');
            th.className = 'tm-setpcs-th';
            th.innerHTML = 'セット入庫<br>個数<span class="tm-setpcs-gear" title="저장 주소 다시 입력">⚙</span>';
            htr.appendChild(th);
        }

        function render() {
            const modal = findStoreModal();
            const tbody = document.getElementById('scan-tbody');
            if (!modal || !tbody || !modal.contains(tbody)) return;
            const table = tbody.closest('table');
            if (table) ensureHeader(table);

            tbody.querySelectorAll('tr').forEach(tr => {
                const jan = rowJan(tr);
                if (!jan) return;
                let td = tr.querySelector('td.tm-setpcs-td');
                if (!td) {
                    td = document.createElement('td');
                    td.className = 'tm-setpcs-td';
                    td.innerHTML = '<button type="button" class="tm-setunit-btn" tabindex="-1" style="display:none"></button><button type="button" class="tm-setpcs-btn" tabindex="-1"></button><div class="tm-setpcs-note"></div>';
                    tr.appendChild(td);
                }
                const btn = td.querySelector('.tm-setpcs-btn');
                const note = td.querySelector('.tm-setpcs-note');
                const ubtn = td.querySelector('.tm-setunit-btn');
                const po = rowPo(tr);
                const mk = po ? markKey(po, jan) : '';
                const mp = mk ? pending[mk] : null;
                const isSetIn = mk ? (mp && mp.state === 'saving' ? mp.pcs > 1 : !!cache.map[mk]) : false;
                const p = pending[jan];
                const entry = cache.map[jan];
                const pcs = p && p.state === 'saving' ? p.pcs : (entry ? entry.pcs : 0);
                const half = /-H$/i.test(jan);

                let cls = 'tm-setpcs-btn', label = '＋ 몇개입', noteCls = 'tm-setpcs-note', noteTxt = '';
                if (p && p.state === 'saving') { cls += ' busy'; label = '저장중… ' + (p.pcs > 1 ? p.pcs + '個' : '삭제'); }
                else if (p && p.state === 'error') { cls += ' err'; label = '⚠ 저장실패 (다시)'; noteTxt = p.msg || ''; noteCls += ' bad'; }
                else if (p && p.state === 'unverified') { cls += ' busy'; label = '⏳ ' + (p.pcs > 1 ? p.pcs + '個' : '삭제') + ' 확인중'; noteTxt = '잠시 후 자동 확인'; }
                else if (pcs > 1) {
                    cls += ' set'; label = pcs + '個/セット ✎';
                    const qty = rowQty(tr);
                    if (isSetIn) {
                        noteCls += ' ok'; noteTxt = qty > 0 ? '= ' + qty + 'セット (' + (qty * pcs) + '個)' : '';
                    } else if (qty > 0 && !half) {
                        if (qty % pcs === 0) { noteCls += ' ok'; noteTxt = '= ' + (qty / pcs) + 'セット'; }
                        else { noteCls += ' bad'; noteTxt = '⚠ 세트 배수 아님 (' + Math.floor(qty / pcs) + 'セット+' + (qty % pcs) + '個)'; }
                    } else if (qty > 0 && half) {
                        noteCls += ' ok'; noteTxt = '= ' + (qty * pcs) + '個 (ハーフ)';
                    }
                } else {
                    // [v1.7.0] 몇 개입 없이 세트 입고만 체크한 줄
                    if (isSetIn) { const qty = rowQty(tr); noteCls += ' ok'; noteTxt = qty > 0 ? '= ' + qty + 'セット' : ''; }
                    if (looksLikeSet(rowName(tr))) cls += ' hint';
                }

                // [v1.7.0] 세트 입고 체크: 모든 줄 (기본 = 낱개, -H 제외)
                const showU = !half;
                const ucls = 'tm-setunit-btn' + (isSetIn ? ' on' : '') + (mp && mp.state !== 'saving' && mp.state ? ' err' : '') + (mp && mp.state === 'saving' ? ' busy' : '');
                const ulabel = mp && mp.state === 'saving' ? '저장중…' : (mp && mp.state === 'error' ? '⚠ 다시' : (isSetIn ? '✔ セット入庫' : '□ セット入庫'));
                if (ubtn.style.display !== (showU ? '' : 'none')) ubtn.style.display = showU ? '' : 'none';
                if (ubtn.className !== ucls) ubtn.className = ucls;
                if (ubtn.textContent !== ulabel) ubtn.textContent = ulabel;
                if (tr.classList.contains('tm-setin-row') !== isSetIn) tr.classList.toggle('tm-setin-row', isSetIn);

                if (btn.className !== cls) btn.className = cls;
                if (btn.textContent !== label) btn.textContent = label;
                if (note.className !== noteCls) note.className = noteCls;
                if (note.textContent !== noteTxt) note.textContent = noteTxt;
            });
        }

        /* ---------- 저장 ---------- */
        function getUrl(forceAsk) {
            let url = '';
            try { url = localStorage.getItem(URL_KEY) || ''; } catch (_) {}
            if (url && !forceAsk) return url;
            const v = prompt('[세트 낱개수 저장 주소]\n구글 Apps Script "웹 앱 URL"을 붙여넣어 주세요.\n(https://script.google.com/macros/s/…/exec)\n이 PC에서 처음 한 번만 입력합니다.', url);
            if (v === null) return '';
            const u = v.trim();
            if (!/^https:\/\/script\.google\.com\/(a\/macros\/[\w.-]+|macros)\/s\/[\w-]+\/exec$/.test(u)) { alert('주소 형식이 맞지 않습니다. …/exec 로 끝나는 웹 앱 URL을 붙여넣어 주세요.'); return ''; }
            try { localStorage.setItem(URL_KEY, u); } catch (_) {}
            return u;
        }
        function getBy() {
            let by = null;
            try { by = localStorage.getItem(BY_KEY); } catch (_) {}
            if (by === null) {
                by = (prompt('입고 담당자 이름 (누가 등록했는지 시트에 기록됩니다. 비워도 됨)', '') || '').trim() || '-';
                try { localStorage.setItem(BY_KEY, by); } catch (_) {}
            }
            return by;
        }

        async function save(jan, pcs, name) {
            const url = getUrl(false);
            if (!url) return;
            const by = getBy();
            pending[jan] = { pcs: pcs, state: 'saving' };
            render();
            const payload = JSON.stringify({ jan: jan, pcs: pcs, name: name, by: by });

            // 1) 보통은 응답(JSON)을 바로 읽을 수 있음
            try {
                const res = await fetch(url, { method: 'POST', body: payload });
                const j = await res.json();
                if (j && j.ok) {
                    if (pcs > 1) cache.map[jan] = { pcs: pcs, name: name }; else delete cache.map[jan];
                    delete pending[jan];
                    render();
                    if (/^S[0-9A-Z]+-/.test(jan)) toast(pcs > 1 ? '✅ ' + jan.slice(-6) + ' : 세트 단위 입고로 기록' : '↩ ' + jan.slice(-6) + ' : 낱개 입고로 되돌림', pcs > 1 ? '#6a1b9a' : '#546e7a');
                    else toast(pcs > 1 ? '✅ ' + jan.slice(-6) + ' : 1セット ' + pcs + '個 등록' : '🗑 ' + jan.slice(-6) + ' 등록 삭제', pcs > 1 ? '#2e7d32' : '#546e7a');
                    return;
                }
                pending[jan] = { pcs: pcs, state: 'error', msg: (j && j.error) || '저장 실패' };
                render();
                toast('⚠ 저장 실패: ' + ((j && j.error) || ''), '#c62828');
                return;
            } catch (e) {
                // 2) 응답을 못 읽는 환경이면: 보내기만 하고 시트를 다시 읽어서 확인
                console.warn('[세트낱개수] 응답 읽기 실패 → 시트로 확인', e);
                try { await fetch(url, { method: 'POST', mode: 'no-cors', body: payload }); } catch (e2) {
                    pending[jan] = { pcs: pcs, state: 'error', msg: '전송 실패(인터넷/주소 확인)' };
                    render(); toast('⚠ 전송 실패: 주소 또는 인터넷 확인', '#c62828');
                    return;
                }
            }
            pending[jan] = { pcs: pcs, state: 'unverified' };
            render();
            for (let i = 0; i < 5; i++) {
                await sleep(i === 0 ? 800 : 2000);
                await refresh(true);
                const got = cache.map[jan] ? cache.map[jan].pcs : 0;
                if ((pcs > 1 && got === pcs) || (pcs <= 1 && !got)) {
                    delete pending[jan];
                    render();
                    toast('✅ ' + jan.slice(-6) + (pcs > 1 ? ' : 1セット ' + pcs + '個 등록' : ' 등록 삭제'), '#2e7d32');
                    return;
                }
            }
            pending[jan] = { pcs: pcs, state: 'error', msg: '시트에서 확인 안 됨' };
            render();
            toast('⚠ 시트에서 확인되지 않았습니다. 다시 눌러 주세요.', '#c62828');
        }

        /* ---------- 버튼 클릭 ---------- */
        document.addEventListener('click', function(e) {
            const gear = e.target.closest && e.target.closest('th.tm-setpcs-th .tm-setpcs-gear');
            if (gear) { e.preventDefault(); getUrl(true); return; }
            // [v1.6.0] 세트 입고 토글
            const ub = e.target.closest && e.target.closest('.tm-setunit-btn');
            if (ub) {
                e.preventDefault(); e.stopPropagation();
                const utr = ub.closest('tr');
                const ujan = utr ? rowJan(utr) : '';
                const pcs = ujan && cache.map[ujan] ? cache.map[ujan].pcs : 0;
                if (!ujan) return;
                const po = rowPo(utr);
                if (!po) { alert('이 줄의 발주번호를 찾지 못했습니다. 위쪽 発注書番号 칸을 확인해 주세요.'); return; }
                const mk = markKey(po, ujan);
                if (pending[mk] && pending[mk].state === 'saving') return;
                const on = !!cache.map[mk];
                const qty = rowQty(utr);
                if (!on && !confirm('[세트 단위 입고]\n발주번호 ' + po + ' / ' + ujan + '\n\n이번 입고 수량 ' + qty + ' 은(는) "세트 수" 입니까?' +
                    (pcs > 1 ? '\n(1세트 ' + pcs + '개입 → 실제 ' + (qty * pcs) + '개)' : '\n(몇 개입은 필요하면 아래 [＋ 몇개입]으로 따로 입력)') +
                    '\n\n확인 = 세트 단위로 기록')) return;
                const locEl = document.getElementById('scan_location');
                const loc = locEl ? String(locEl.value || '').trim() : '';
                // 세트 입고 표시 줄의 낱개수 칸은 의미 없음(몇 개입 모르면 2 저장 — 시트가 1 이하를 삭제로 보기 때문)
                save(mk, on ? 0 : (pcs > 1 ? pcs : 2), '세트입고 ' + (loc ? loc + ' / ' : '') + rowName(utr));
                return;
            }
            const btn = e.target.closest && e.target.closest('.tm-setpcs-btn');
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            const tr = btn.closest('tr');
            const jan = tr ? rowJan(tr) : '';
            if (!jan) return;
            if (pending[jan] && pending[jan].state === 'saving') return;
            const name = rowName(tr);
            const cur = cache.map[jan] ? cache.map[jan].pcs : '';
            const v = prompt(
                '[1세트 낱개수 등록]  잔코드: ' + jan + '\n' + (name ? '상품: ' + name.slice(0, 60) + '\n' : '') +
                '\n1세트 안에 "실제로 들어 있는 낱개 수"를 입력하세요.' +
                '\n(겉면의 "○種類" 숫자가 아니라 실제 개수 — 출고목록 수량과 같은 단위)' +
                '\n예) 겉면 8種類, 실제 16개 → 16' +
                (/-H$/i.test(jan) ? '\n※ -H(ハーフ) 상품: 1세트(1개 단위) 안의 낱개 수' : '') +
                '\n\n0 입력 = 등록 삭제', cur);
            if (v === null) return;
            const n = parseInt(String(v).replace(/[^\d]/g, ''), 10);
            if (isNaN(n)) { alert('숫자만 입력해 주세요.'); return; }
            if (n === 1) { alert('1개는 세트가 아니라서 등록하지 않습니다. (지우려면 0)'); return; }
            if (n > 300 && !confirm(n + '개가 맞습니까?')) return;
            if (n === 0 && !cur) return;
            if (n === cur) return;
            save(jan, n, name);
        }, true);

        /* ---------- 실행 ---------- */
        let wasOpen = false;
        setInterval(() => {
            const open = !!findStoreModal();
            if (open && !wasOpen) refresh(true);  // 입고 창을 열 때마다 최신 등록 내용 읽기
            wasOpen = open;
            if (open) render();
        }, 600);
    })();

})();
