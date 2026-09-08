// ==UserScript==
// @name         [입고] JAN코드 화면 단축키 통합 (JAN이동 + Enter이동 + F1/F2/F3)
// @namespace    https://github.com/YOUR_ID/tampermonkey-scripts
// @version      1.0.0
// @description  jancode 페이지 통합본. 원본: A-1-9(JAN 검색이동) + A-1-6(Enter 행이동) + A-1-7(F3) + A-1-8(F1) + A-1-10(F2)
// @author       물류팀
// @match        https://www.platform.co.jp/admin/store/jancode*
// @match        *://platform.co.jp/admin/store/jancode*
// @updateURL    https://raw.githubusercontent.com/YOUR_ID/tampermonkey-scripts/main/입고/02-jancode-shortcuts.user.js
// @downloadURL  https://raw.githubusercontent.com/YOUR_ID/tampermonkey-scripts/main/입고/02-jancode-shortcuts.user.js
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

})();
