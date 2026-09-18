// ==UserScript==
// @name         [포장] 포장 스캔 워크플로우 도구 (QR고속스캔 + 포장모달JAN합산V7.9 + 로케이션일괄체크 + 총수량합계)
// @namespace    https://github.com/asics67-lab/tampermonkey-scripts
// @version      1.4.1
// @description  포장(shipping/packing) 화면의 바코드 스캔 입출고 작업 흐름 통합본. 원본: QR 출고관리(고속 스캔 최적화) v16.0 + [통합] 플랫폼 포장 및 입고 업무 마스터 툴 v7.9 + [포장] 로케이션 일괄 체크(Ctrl+클릭) v6.1 + [포장] 총 수량 합계 v2.7
// @author       물류팀
// @match        https://www.platform.co.jp/*
// @match        https://platform.aispel.com/admin/*
// @grant        GM_addStyle
// @run-at       document-start
// @allFrames    true
// @updateURL    https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/포장/scan-tools.user.js
// @downloadURL  https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/포장/scan-tools.user.js
// ==/UserScript==

/*
 * ============================================================
 *  통합 안내
 *  - 포장 화면에서 "바코드 스캔으로 시작해서 끝나는" 작업 흐름 4개를 하나로 합쳤습니다.
 *    1) QR 출고관리 (고속 스캔 최적화) v16.0
 *       → 검색창에 바코드 스캔 시 즉시 제출하고, 해당 포장 진행 모달을 자동으로 엽니다.
 *    2) [통합] 플랫폼 포장 및 입고 업무 마스터 툴 v7.9
 *       → 포장 모달 안에서 JAN코드 스캔 처리, 같은 로케이션+JAN코드+상품이미지가 모두
 *         같은 항목만 합산 병합(이미지가 다르면 별개 상품으로 취급해 안 합침),
 *         로케이션 셀 병합(rowspan), 오스캔 시 화면 전체에 큰 X 표시 + 경고음.
 *    3) [포장] 로케이션 일괄 체크(컨트롤 + 클릭) v6.1
 *       → 위 2번이 만들어 둔 "병합된(rowspan) 로케이션 셀" 구조를 그대로 활용해서,
 *         Ctrl+클릭 한 번으로 같은 로케이션 묶음 전체를 체크합니다. 2번 없이는 정상
 *         동작하지 않는 종속 관계입니다.
 *    4) [포장] 총 수량 합계 (버튼 위치 이동) v2.7
 *       → 포장 모달 안의 항목들을 트래킹번호/로케이션 기준으로 요약해 팝업으로 보여줍니다.
 *  - 4번 스크립트의 원본 @match는 모든 웹사이트에 다 적용되는 와일드카드 패턴으로 되어 있었는데,
 *    이 스크립트가 찾는 요소(#packingModal 등)는 이 사이트에만 있으므로 불필요하게
 *    넓은 범위였습니다. 다른 3개와 동일하게 platform.co.jp / aispel.com으로 좁혔습니다.
 *  - [별도 보관] "QR 긴급 진단기(실시간 로그 출력)" v1.2는 키 입력마다 콘솔에 로그를
 *    찍는 디버깅 전용 도구라 이 통합 파일에는 넣지 않았습니다. 평소에 계속 켜둘 성격이
 *    아니라서, 필요할 때만 별도로 설치해서 쓰시고 문제 해결 후에는 꺼두시길 권장합니다.
 *  - 실제 배포 전 포장 화면에서 바코드 스캔 → 모달 자동 오픈 → JAN 스캔 합산 →
 *    로케이션 Ctrl+클릭 일괄체크 → 총 수량 합계 팝업까지 전체 흐름이 정상 동작하는지
 *    반드시 확인해 주세요.
 *
 *  v1.1.0 수정 사항
 *  - [블록 2] 포장 모달 JAN 합산 로직의 버그 수정: 같은 로케이션+JAN코드+상품이미지인데
 *    트래킹번호가 서로 다른 두 항목이 병합되면서, 삭제되는 쪽 행의 트래킹번호가 화면에서
 *    통째로 사라지던 문제. 병합 기준에 트래킹번호를 추가해, 트래킹번호까지 완전히 같은
 *    경우에만 합쳐지도록 수정. (포장 담당자 보고: "가끔씩 트래킹 번호가 안 보인다")
 *
 *  v1.2.0 추가 기능 (포장 담당자 요청)
 *  - [블록 2] 모달 상단에 "남은 항목: N / 전체" 실시간 카운터 표시 (전체 스캔 완료 시 초록색으로 전환)
 *  - [블록 2] 스캔 횟수가 원래 주문 수량을 넘으면 배지가 빨간색 "⚠ 과다스캔"으로 바뀌고 경고음
 *  - [블록 2] 같은 트래킹번호를 가진 행끼리 왼쪽 색 테두리로 상자 단위를 한눈에 구분
 *    (LS/OS처럼 트래킹이 없는 건은 색 없음 — 로케이션 합산 표시 그대로 유지)
 *
 *  v1.3.0 버그 수정 (포장 담당자 보고: "화면이 자꾸 깜빡이고 다른 출고건 화면으로 계속 바뀐다")
 *  - [블록 1] stealthSubmit()에 중복 제출 방지 가드 추가. 이전 스캔이 아직 처리 중(페이지
 *    이동/모달 오픈 대기)인데 스캔이 또 들어오면, 겹쳐서 검색이 제출되어 페이지가 짧은 시간에
 *    여러 번 새로고침되며 깜빡이던 문제를 막습니다. 처리 중일 때 들어온 스캔은 무시합니다.
 *  - [블록 1] triggerPackingClick()이 검색 결과 중 무조건 첫 번째 행을 자동 클릭하던 문제
 *    수정. 이제 검색 결과가 정확히 1건일 때만 자동 클릭하고, 여러 건이 검색되면(스캔값이
 *    여러 주문과 부분 일치하는 경우) 자동 클릭을 하지 않습니다 — 의도와 다른 출고건의
 *    포장화면이 열리던 원인이었습니다.
 *
 *  v1.3.1 버그 수정
 *  - [블록 4] 콘솔 에러 "Cannot read properties of null (reading 'appendChild')" 수정.
 *    파일 전체에 걸린 @run-at document-start 설정 때문에, document.body가 아직 생기기도
 *    전에 [총 수량 합계] 팝업을 만드는 코드가 실행되어 나던 에러였습니다(원래 이 스크립트는
 *    이 설정 없이 페이지가 다 그려진 뒤 실행되던 것이었는데, 합치면서 충돌함). 이 블록의
 *    UI 생성 전체를 document.body가 준비된 뒤에만 실행하도록 수정. 이 에러 때문에 이
 *    블록의 "포장완료 버튼 위 총 수량 합계" 기능 자체가 전혀 동작하지 않고 있었습니다.
 *
 *  v1.3.2 버그 수정 (진짜 근본 원인 — 실제 페이지 소스 확인 후 발견)
 *  - [블록 1] 사이트의 "포장 진행" 버튼은 클릭 시 서버에 AJAX로 데이터를 요청하고,
 *    그 응답이 와야 비로소 모달이 열리는 구조입니다. 그런데 자동 클릭 로직이 이 응답을
 *    기다리는 중인지 확인하지 않고 200ms마다 같은 버튼을 계속 또 클릭했습니다. 서버
 *    응답이 200ms 안에 오지 않는 경우(네트워크 지연 등) 같은 요청이 여러 번 겹쳐서
 *    나가고, 응답이 도착할 때마다 모달 내용이 다시 그려지면서 화면이 깜빡이고 계속
 *    바뀌는 것처럼 보이는 진짜 원인이었습니다. ("가끔씩" 발생한 것도 응답 지연이
 *    있을 때만 증상이 심해졌기 때문으로 설명됨). 이제 버튼은 스캔 1건당 딱 한 번만
 *    클릭하고, 이후에는 재클릭 없이 모달이 열릴 때까지(최대 약 5초) 기다리기만 합니다.
 *
 *  v1.4.1 수정 사항
 *  - 포장 진행 자동 오픈: 첫 클릭 후 모달 오픈을 확인하고, 열리지 않으면 안전하게 재시도합니다.
 *  - 검색 결과가 여러 건이어도 스캔값과 정확히 일치하는 행이 1건이면 해당 행을 자동 오픈합니다.
 *  - 스캔값을 sessionStorage에 보관하여 페이지 갱신 뒤에도 대상 행을 찾습니다.
 *  - 포장 테이블만 MutationObserver로 감시하여 불필요한 전체 페이지 갱신을 줄입니다.
 *  - refreshTableStyle()를 debounce하고 자체 DOM 변경에 의한 연쇄 refresh를 차단합니다.
 * ============================================================
 */

/* ------------------------------------------------------------
 * [블록 1] QR 출고관리 (고속 스캔 최적화) v16.0
 * ------------------------------------------------------------ */
(function() {
    'use strict';

    let asciiBuffer = "";
    let finalString = "";
    let scanTimer = null;

    /**
     * 포장 진행 창(Modal)의 실제 가시성 상태 확인
     */
    function isModalOpen() {
        const modal = document.getElementById('packingModal');
        if (!modal) return false;
        const hasShowClass = modal.classList.contains('show');
        const isDisplayBlock = window.getComputedStyle(modal).display === 'block';
        const isBodyLocked = document.body.classList.contains('modal-open');
        return (hasShowClass && isDisplayBlock) || isBodyLocked;
    }

    /**
     * 1. 포장 진행 버튼 클릭 로직 (반응 속도 개선)
     */
    function triggerPackingClick() {
        if (sessionStorage.getItem('qr_scanning_active') !== 'true') return;

        if (isModalOpen()) {
            sessionStorage.removeItem('qr_scanning_active');
            sessionStorage.removeItem('qr_scanned_value');
            window.clickRetryCount = 0;
            window.packingClickDispatched = false;
            window.packingClickInFlight = false;
            return;
        }

        const scannedValue = (sessionStorage.getItem('qr_scanned_value') || '').trim();
        const normalize = (v) => String(v ?? '').replace(/\s+/g, '').trim();
        const targetValue = normalize(scannedValue);
        const rows = Array.from(document.querySelectorAll('#packingListTbody tr'));

        const retry = () => {
            window.clickRetryCount = (window.clickRetryCount || 0) + 1;
            if (window.clickRetryCount <= 25) {
                setTimeout(triggerPackingClick, 200);
            } else {
                console.log('[Speed-Scan] 포장 화면 자동 오픈을 5초 동안 확인하지 못했습니다.');
                window.clickRetryCount = 0;
                window.packingClickDispatched = false;
                window.packingClickInFlight = false;
                sessionStorage.removeItem('qr_scanning_active');
                sessionStorage.removeItem('qr_scanned_value');
            }
        };

        if (rows.length === 0) {
            retry();
            return;
        }

        const exactRows = targetValue ? rows.filter(row => {
            const values = [
                row.getAttribute('data-jancode'),
                row.getAttribute('data-order-no'),
                row.getAttribute('data-order-no2'),
                row.getAttribute('data-id'),
                row.getAttribute('data-code'),
                row.innerText
            ].map(normalize).filter(Boolean);
            return values.some(v => v === targetValue);
        }) : [];

        let targetRow = null;

        if (exactRows.length === 1) {
            targetRow = exactRows[0];
        } else if (rows.length === 1) {
            targetRow = rows[0];
        } else {
            // 검색 결과가 아직 완전히 안정되지 않았을 수 있으므로 재확인합니다.
            retry();
            return;
        }

        const packingBtn = targetRow.querySelector('button.packing-btn');
        if (!packingBtn) {
            retry();
            return;
        }

        // 같은 AJAX 요청을 200ms마다 중복 발사하지 않습니다.
        // 다만 첫 클릭이 실제로 처리되지 않은 경우 800ms 후 재시도할 수 있습니다.
        if (window.packingClickInFlight) return;

        window.packingClickInFlight = true;
        window.packingClickDispatched = true;

        try {
            if (window.jQuery) {
                window.jQuery(packingBtn).trigger('click');
            } else {
                packingBtn.click();
            }
        } catch (e) {
            console.warn('[Speed-Scan] 포장 버튼 클릭 오류:', e);
        }

        window.clickRetryCount = 0;

        setTimeout(() => {
            window.packingClickInFlight = false;
            if (sessionStorage.getItem('qr_scanning_active') === 'true') {
                triggerPackingClick();
            }
        }, 800);
    }

    /**
     * 2. 백그라운드 스텔스 검색 로직
     */
    function stealthSubmit() {
        if (isModalOpen()) return;

        // [버그 수정] 이전 스캔이 아직 처리 중(페이지 이동/모달 오픈 대기)이면
        // 새 검색을 또 제출하지 않습니다. 겹쳐서 제출되면 페이지가 짧은 시간에
        // 여러 번 새로고침되면서 화면이 깜빡이고, 의도와 다른 주문 화면이
        // 열리는 원인이 됩니다.
        if (sessionStorage.getItem('qr_scanning_active') === 'true') {
            console.log('[Speed-Scan] 이전 스캔 처리 중이라 이번 스캔은 건너뜁니다:', finalString.trim());
            finalString = "";
            return;
        }

        const cleanedString = finalString.trim();
        if (cleanedString.length === 0) return;

        const input = document.querySelector('input[name="keyword"]');
        const form = document.querySelector('#search-form');
        const targetSelect = document.querySelector('select[name="target"]');

        if (input && form) {
            console.log('%c[Speed-Scan] 제출 데이터:', 'color: #3498db; font-weight: bold;', cleanedString);
            if (targetSelect) targetSelect.value = "2";
            input.value = cleanedString;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));

            sessionStorage.setItem('qr_scanning_active', 'true');
            sessionStorage.setItem('qr_scanned_value', cleanedString);
            window.clickRetryCount = 0;
            window.packingClickDispatched = false;
            window.packingClickInFlight = false;
            form.submit();
            finalString = "";
        }
    }

    /**
     * 3. 리스트 실시간 감시
     */
    const observer = new MutationObserver(() => triggerPackingClick());

    window.addEventListener('DOMContentLoaded', () => {
        const targetList = document.getElementById('packingListTbody');
        if (targetList) observer.observe(targetList, { childList: true });
        triggerPackingClick();
    });

    /**
     * 4. 스캐너 입력 데이터 조립 (로그 기반 속도 조절)
     */
    window.addEventListener('keydown', function(e) {
        if (isModalOpen()) return;

        // Alt-Code 처리 (로그상의 Shift 조합 대응)
        if (!isNaN(e.key) && e.altKey) {
            asciiBuffer += e.key;
            return;
        }

        if (e.key === 'Alt' && asciiBuffer.length >= 2) {
            const char = String.fromCharCode(parseInt(asciiBuffer, 10));
            if (char) finalString += char;
            asciiBuffer = "";
            return;
        }

        // 로그에 찍힌 Enter/Tab 감지 시 즉시 실행 (가장 빠름)
        if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            clearTimeout(scanTimer);
            stealthSubmit();
            return;
        }

        // 일반 문자 누적
        if (e.key.length === 1) {
            finalString += e.key;
        }

        // 스캔 간격이 매우 짧으므로(3ms), 50ms만 기다려도 입력 종료로 판단 가능
        clearTimeout(scanTimer);
        scanTimer = setTimeout(() => {
            if (finalString.length > 5) stealthSubmit();
        }, 50); // 기존 250ms -> 50ms로 대폭 단축

    }, true);

})();
/* ------------------------------------------------------------
 * [블록 2] [통합] 플랫폼 포장 및 입고 업무 마스터 툴 v7.9
 * (동일JAN합산 버그수정 & 이미지구분 & 6자리강조)
 * ------------------------------------------------------------ */
(function() {
    'use strict';

    let isUpdating = false;
    let scanCount = 0;
    let isPackingComplete = false;
    let lastProcessedTime = 0;
    let refreshTimer = null;
    let refreshScheduled = false;
    let observerMuteUntil = 0;

    // [추가 기능] 같은 트래킹번호끼리 항상 같은 색을 쓰도록 매핑 저장
    const trackingColorMap = new Map();
    const TRACKING_COLOR_PALETTE = ['#42a5f5', '#66bb6a', '#ffa726', '#ab47bc', '#26c6da', '#ec407a', '#8d6e63', '#5c6bc0'];
    const getTrackingColor = (trackingVal) => {
        if (!trackingVal) return null; // LS/OS 등 트래킹이 없는 건은 색을 넣지 않음
        if (!trackingColorMap.has(trackingVal)) {
            trackingColorMap.set(trackingVal, TRACKING_COLOR_PALETTE[trackingColorMap.size % TRACKING_COLOR_PALETTE.length]);
        }
        return trackingColorMap.get(trackingVal);
    };

    // [추가 기능] 남은 미체크 항목 수를 모달 상단에 실시간으로 표시
    const updateRemainingCounter = (total, remaining) => {
        const modalBody = document.querySelector('#packingModal .modal-body');
        if (!modalBody) return;

        let banner = document.getElementById('packing-remaining-counter');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'packing-remaining-counter';
            banner.style.cssText = `
                position: sticky;
                top: 0;
                z-index: 500;
                padding: 6px 12px;
                font-weight: 700;
                font-size: 14px;
                text-align: center;
                border-bottom: 2px solid #fb8c00;
                box-sizing: border-box;
            `;
            modalBody.prepend(banner);
        }

        if (remaining === 0 && total > 0) {
            banner.style.setProperty('background-color', '#c8e6c9', 'important');
            banner.style.setProperty('border-bottom-color', '#43a047', 'important');
            banner.style.setProperty('color', '#1b5e20', 'important');
            banner.innerText = `✅ 전체 ${total}건 스캔 완료`;
        } else {
            banner.style.setProperty('background-color', '#fff3e0', 'important');
            banner.style.setProperty('border-bottom-color', '#fb8c00', 'important');
            banner.style.setProperty('color', '#e65100', 'important');
            banner.innerText = `📦 남은 항목: ${remaining} / ${total}`;
        }
    };


    /**
     * 오스캔 발생 시 화면 중앙에 대형 X 표시 팝업 출력
     */
    const showLargeErrorX = () => {
        let overlay = document.getElementById('error-x-overlay');

        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'error-x-overlay';
            overlay.style.cssText = `
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                background-color: rgba(255, 0, 0, 0.25) !important;
                display: flex !important;
                justify-content: center !important;
                align-items: center !important;
                z-index: 999999 !important;
                pointer-events: none !important;
                transition: opacity 0.2s ease-in-out !important;
                opacity: 0;
            `;

            const xMark = document.createElement('div');
            xMark.innerHTML = '✕';
            xMark.style.cssText = `
                font-size: 250px !important;
                font-weight: 900 !important;
                color: #d32f2f !important;
                text-shadow: 0 0 30px rgba(255, 255, 255, 0.9), 0 0 10px rgba(0, 0, 0, 0.5) !important;
                line-height: 1 !important;
                user-select: none !important;
                transform: scale(0.8);
                transition: transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important;
            `;

            overlay.appendChild(xMark);
            document.body.appendChild(overlay);
        }

        const xMark = overlay.firstElementChild;

        overlay.style.opacity = '1';
        if (xMark) xMark.style.transform = 'scale(1.1)';

        setTimeout(() => {
            overlay.style.opacity = '0';
            if (xMark) xMark.style.transform = 'scale(0.8)';
        }, 800);
    };

    /**
     * 오스캔/오류 발생 시 경고음 발생
     */
    const playWarningSound = () => {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;

            const ctx = new AudioContext();

            if (ctx.state === 'suspended') {
                ctx.resume();
            }

            const now = ctx.currentTime;

            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sawtooth';
            osc1.frequency.setValueAtTime(850, now);
            gain1.gain.setValueAtTime(0.4, now);
            gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.15);

            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sawtooth';
            osc2.frequency.setValueAtTime(850, now + 0.2);
            gain2.gain.setValueAtTime(0.4, now + 0.2);
            gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + 0.2);
            osc2.stop(now + 0.35);

        } catch (e) {
            console.error("경고음 재생 실패:", e);
        }
    };

    /**
     * JAN 코드 마지막 6자리 강조
     */
    const highlightJanText = (element) => {
        if (!element || element.dataset.janHighlighted === "true") return;

        const targetNode = element.querySelector('a') || element;
        const fullText = targetNode.innerText.trim();

        if (fullText.length >= 10 && /^\d+$/.test(fullText)) {
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

            element.dataset.janHighlighted = "true";
        }
    };

    /**
     * 입고 처리 화면 JAN 코드 강조
     */
    const processInboundJanCodes = () => {
        const mainRows = document.querySelectorAll('.content-wrapper table tbody tr');
        mainRows.forEach(row => {
            const janCell = row.cells[3];
            if (janCell) highlightJanText(janCell);
        });

        const modalRows = document.querySelectorAll('#scan-tbody tr');
        modalRows.forEach(row => {
            const janCell = row.cells[2];
            if (janCell) highlightJanText(janCell);
        });
    };

    /**
     * 포장 테이블 내 동일 로케이션 + 동일 JAN 코드 + 동일 이미지 항목 병합 및 수량 합산
     * (V7.9) 수정 사항:
     *  - 합산 후 화면 텍스트뿐 아니라 data-quantity 속성도 함께 갱신 (상단 종류수/합계와 어긋나던 버그 수정)
     *  - 수량을 읽을 때 스캔 배지(.scan-counter-badge) 텍스트가 섞여 숫자가 오염되는 문제 방지
     *  - 같은 JAN이라도 상품 이미지(data-large)가 다르면 별개 상품으로 취급, 합치지 않음
     */
    const mergeDuplicatePackingItems = () => {
        const tbody = document.getElementById('packingItemsTbody');
        if (!tbody) return;

        const rows = Array.from(tbody.querySelectorAll('tr'));
        if (rows.length <= 1) return;

        const map = new Map();
        const rowsToRemove = [];
        let didMerge = false;

        // data-quantity 속성을 최우선으로 신뢰. 없으면 배지(.scan-counter-badge)는
        // 제외하고 숫자만 파싱해서 오염을 방지.
        const getQtyNumber = (cell) => {
            if (!cell) return 0;
            const attr = cell.getAttribute('data-quantity');
            if (attr !== null && attr !== '') {
                const n = parseInt(attr, 10);
                if (!isNaN(n)) return n;
            }
            const clone = cell.cloneNode(true);
            const badge = clone.querySelector('.scan-counter-badge');
            if (badge) badge.remove();
            return parseInt(clone.innerText.replace(/[^0-9]/g, '') || '0', 10);
        };

        // 이미지가 다르면 같은 JAN이라도 별개 상품으로 취급
        // (서명된 썸네일 src 말고 고정값인 data-large 기준으로 비교)
        const getImageKey = (row) => {
            const img = row.cells[2]?.querySelector('img');
            if (!img) return '';
            return (img.getAttribute('data-large') || '').split('?')[0];
        };

        rows.forEach(row => {
            // JAN 코드 가져오기
            const janCode = (
                row.getAttribute('data-jancode') ||
                row.cells[5]?.innerText.trim() ||
                row.cells[4]?.innerText.trim() ||
                ''
            ).replace(/\s+/g, '');

            // Location에서 콜론(:) 앞쪽의 순수 Location명만 추출 (예: "I2-4-2 : 32개" -> "I2-4-2")
            const rawLocationText = row.cells[8]?.innerText.split('\n')[0] || '';
            const location = rawLocationText.split(':')[0].trim();

            if (!janCode) return;

            const imageKey = getImageKey(row);

            // [v1.1.0 버그 수정] 트래킹번호가 병합 기준에 없어서, 같은 로케이션+JAN+이미지인데
            // 트래킹번호가 다른 두 항목이 하나로 합쳐지면서 한쪽 행의 트래킹번호가 통째로
            // 사라지던 문제가 있었음. 트래킹번호도 병합 기준에 포함시켜, 트래킹번호까지
            // 완전히 같은 경우에만 합쳐지도록 수정.
            const trackingCell = row.querySelector('td[data-trackingno]');
            const trackingVal = trackingCell ? (trackingCell.getAttribute('data-trackingno') || '').trim() : '';

            // 비교용 키 생성 (순수 로케이션 + JAN 코드 + 이미지 + 트래킹번호)
            const key = `${location}_${janCode}_${imageKey}_${trackingVal}`;

            if (map.has(key)) {
                const targetRow = map.get(key);

                // 수량 셀 파싱 및 합산
                const targetQtyCell = targetRow.querySelector('.item-quantity') || targetRow.cells[6] || targetRow.cells[7];
                const currentQtyCell = row.querySelector('.item-quantity') || row.cells[6] || row.cells[7];

                if (targetQtyCell && currentQtyCell) {
                    const q1 = getQtyNumber(targetQtyCell);
                    const q2 = getQtyNumber(currentQtyCell);
                    const totalQty = q1 + q2;

                    // 배지(스캔 카운트)는 보존하고 숫자 텍스트만 교체
                    const badge = targetQtyCell.querySelector('.scan-counter-badge');
                    targetQtyCell.textContent = totalQty.toString();
                    if (badge) targetQtyCell.appendChild(badge);

                    // 사이트 자체 합계 로직이 참조하는 속성도 반드시 함께 갱신
                    targetQtyCell.setAttribute('data-quantity', totalQty);
                    if (window.$ && window.$.fn) {
                        $(targetQtyCell).data('quantity', totalQty);
                    }

                    // Location 셀 수량 텍스트 업데이트
                    if (targetRow.cells[8] && location) {
                        targetRow.cells[8].innerText = `${location} : ${totalQty}개`;
                    }

                    didMerge = true;
                }

                const targetCb = targetRow.querySelector('input.sub_checkbox');
                const currentCb = row.querySelector('input.sub_checkbox');
                if (targetCb && currentCb && currentCb.checked) {
                    targetCb.checked = true;
                }

                rowsToRemove.push(row);
            } else {
                map.set(key, row);
            }
        });

        rowsToRemove.forEach(row => row.remove());

        // 상단 "종류수/수량 합계" 표시를 최신 data-quantity 기준으로 다시 계산
        if (didMerge && typeof window.updateQuantityTotals === 'function') {
            window.updateQuantityTotals();
        }
    };

    /**
     * 모달 꺼짐 방지
     */
    const preventAutoReload = () => {
        if (window.$) {
            $(document).off('hide.bs.modal', '#packingModal');
            $('#packingModal').on('hide.bs.modal', function() {
                if (!isPackingComplete) return true;
                location.reload();
            });
        }
    };

    /**
     * 自動印刷
     */
    const setupAutoPrint = () => {
        const originalOpen = window.open;
        window.open = function(url, name, specs) {
            const printWin = originalOpen(url, name, specs);
            if (url && (url.includes('shippingbill') || url.includes('admin/print'))) {
                const checkLoad = setInterval(() => {
                    try {
                        if (printWin && printWin.document.readyState === 'complete') {
                            clearInterval(checkLoad);
                            printWin.focus();
                            printWin.print();
                        }
                    } catch (e) { clearInterval(checkLoad); }
                }, 300);
            }
            return printWin;
        };
    };

    /**
     * 지능형 커서 이동
     */
    const updateFocusStatus = () => {
        const tbody = document.getElementById('packingItemsTbody');
        const weightInput = document.getElementById('weight');
        const janInput = document.getElementById('search_jancode');
        if (!tbody || !weightInput || !janInput) return;

        const allCheckboxes = Array.from(tbody.querySelectorAll('input.sub_checkbox'));
        if (allCheckboxes.length === 0) return;

        const isAllChecked = allCheckboxes.every(cb => cb.checked);

        if (isAllChecked) {
            weightInput.style.setProperty('background-color', '#fff9c4', 'important');
            weightInput.style.setProperty('border', '2px solid #fbc02d', 'important');

            if (document.activeElement !== weightInput) {
                setTimeout(() => {
                    weightInput.focus();
                    weightInput.select();
                }, 50);
            }
        } else {
            weightInput.style.backgroundColor = '';
            weightInput.style.border = '';

            if (document.activeElement === weightInput || document.activeElement.tagName === 'BODY' || document.activeElement.type === 'checkbox') {
                setTimeout(() => {
                    janInput.focus();
                    janInput.select();
                }, 50);
            }
        }
    };

    /**
     * キーボード検知
     */
    const initKeyboardActions = () => {
        window.addEventListener('keydown', function(e) {
            const active = document.activeElement;
            const isJanInput = active.id === 'search_jancode';

            if (e.key === 'F2') {
                const janInput = document.getElementById('search_jancode');
                if (janInput) { e.preventDefault(); janInput.focus(); janInput.select(); }
            }

            if ((e.key === 'Enter' || e.key === 'Tab') && isJanInput) {
                const now = Date.now();
                if (now - lastProcessedTime < 300) { e.preventDefault(); return; }

                const val = active.value.trim();
                if (val !== "") {
                    e.preventDefault();
                    e.stopPropagation();
                    lastProcessedTime = now;
                    showLastScannedInfo(val);
                }
            }

            if (e.key === 'Enter' && active.id === 'weight' && active.value) {
                const btn = document.getElementById('btnSavePacking');
                if (btn && !btn.disabled) { isPackingComplete = true; btn.click(); }
            }
        }, true);
    };

    /**
     * [スキャン処理] 上部移動 + チェックボックス自動チェック + オスキャン時大型X表示及び警告音
     */
    const showLastScannedInfo = (jancode) => {
        const tbody = document.getElementById('packingItemsTbody');
        if (!tbody) return;

        const rows = Array.from(tbody.querySelectorAll('tr'));
        let targetRow = null;

        for (let row of rows) {
            const rowJan = row.getAttribute('data-jancode') || row.cells[5]?.innerText.trim();
            if (rowJan && String(rowJan) === String(jancode)) {
                targetRow = row;
                break;
            }
        }

        // 1. 一致するJANコードがない場合：警告音＋画面中央大型X表示＋入力欄赤強調
        if (!targetRow) {
            playWarningSound();
            showLargeErrorX();

            const janInput = document.getElementById('search_jancode');
            if (janInput) {
                janInput.style.setProperty('background-color', '#ffcdd2', 'important');
                janInput.style.setProperty('border', '2px solid #e53935', 'important');

                setTimeout(() => {
                    janInput.style.backgroundColor = '';
                    janInput.style.border = '';
                }, 500);

                janInput.value = '';
                janInput.focus();
            }
            return;
        }

        // 2. 一致する商品がある場合
        tbody.prepend(targetRow);

        const checkbox = targetRow.querySelector('input.sub_checkbox');
        if (checkbox && !checkbox.checked) {
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const janCell = targetRow.cells[5];

        document.querySelectorAll('.latest-scanned-row').forEach(r => r.classList.remove('latest-scanned-row'));
        document.querySelectorAll('.jan-highlight').forEach(el => {
            el.style.cssText = ""; el.classList.remove('jan-highlight');
        });

        targetRow.classList.add('latest-scanned-row');

        scanCount++;
        const highlightColor = (scanCount % 2 === 0) ? '#2196f3' : '#1e88e5';

        if (janCell) {
            janCell.classList.add('jan-highlight');
            janCell.style.setProperty('background-color', highlightColor, 'important');
            janCell.style.setProperty('color', 'white', 'important');

            const janLink = janCell.querySelector('a') || janCell;
            const fullText = janLink.innerText.trim();

            if (fullText.length >= 6) {
                const head = fullText.slice(0, -6);
                const tail = fullText.slice(-6);
                janLink.innerHTML = `${head}<span style="color: #ffff00 !important; text-decoration: underline !important; font-weight: 900 !important; font-size: 1.25em;">${tail}</span>`;
            }
        }

        const qtyCell = targetRow.cells[6] || targetRow.cells[7];
        if (qtyCell) {
            let badge = qtyCell.querySelector('.scan-counter-badge');
            if (!badge) {
                badge = document.createElement('div');
                badge.className = 'scan-counter-badge';
                badge.style.cssText = `
                    margin-top: 4px;
                    font-size: 11px;
                    font-weight: bold;
                    color: #d32f2f;
                    background-color: #ffebee;
                    border: 1px solid #ef5350;
                    border-radius: 4px;
                    padding: 1px 4px;
                    display: inline-block;
                `;
                badge.setAttribute('data-count', '0');
                qtyCell.appendChild(badge);
            }

            let currentCount = parseInt(badge.getAttribute('data-count') || '0', 10) + 1;
            badge.setAttribute('data-count', currentCount);
            badge.innerText = `スキャン: ${currentCount}`;

            // [추가 기능] 과스캔 방지 - 스캔 횟수가 원래 주문 수량을 넘으면 경고
            const orderQty = (() => {
                const attr = qtyCell.getAttribute('data-quantity');
                if (attr !== null && attr !== '') {
                    const n = parseInt(attr, 10);
                    if (!isNaN(n)) return n;
                }
                const clone = qtyCell.cloneNode(true);
                const b = clone.querySelector('.scan-counter-badge');
                if (b) b.remove();
                return parseInt(clone.innerText.replace(/[^0-9]/g, '') || '0', 10);
            })();

            if (orderQty > 0 && currentCount > orderQty) {
                badge.style.setProperty('background-color', '#b71c1c', 'important');
                badge.style.setProperty('color', '#ffffff', 'important');
                badge.style.setProperty('border-color', '#b71c1c', 'important');
                badge.innerText = `⚠ 과다스캔 ${currentCount}/${orderQty}`;
                playWarningSound();
            } else {
                badge.style.removeProperty('background-color');
                badge.style.removeProperty('color');
                badge.style.removeProperty('border-color');
                badge.style.setProperty('background-color', '#ffebee', 'important');
                badge.style.setProperty('color', '#d32f2f', 'important');
            }
        }

        const janInput = document.getElementById('search_jancode');
        if (janInput) { janInput.value = ''; }

        scheduleRefreshTableStyle(50);
    };

    /**
     * 3가지 상태별 행 바탕색 및 로케이션 병합 처리
     */
    const refreshTableStyleNow = () => {
        if (isUpdating) return;

        const tbody = document.getElementById('packingItemsTbody');
        if (!tbody) return;

        isUpdating = true;
        observerMuteUntil = performance.now() + 200;

        try {
            mergeDuplicatePackingItems();

            const rows = Array.from(tbody.querySelectorAll('tr'));
            let checkedCount = 0;

            rows.forEach(row => {
                const checkbox = row.querySelector('input.sub_checkbox');
                const isLatest = row.classList.contains('latest-scanned-row');
                const hasBadge = !!row.querySelector('.scan-counter-badge');

                Array.from(row.cells).forEach(cell => {
                    cell.style.display = '';
                    cell.removeAttribute('rowspan');
                });

                if (isLatest) {
                    row.style.setProperty('background-color', '#c8e6c9', 'important');
                    row.style.opacity = '1';
                } else if (hasBadge || (checkbox && checkbox.checked)) {
                    row.style.setProperty('background-color', '#e3f2fd', 'important');
                    row.style.opacity = '1';
                } else {
                    row.style.backgroundColor = '';
                    row.style.opacity = '0.4';
                }

                if (checkbox && checkbox.checked) checkedCount++;

                const trackingCell = row.querySelector('td[data-trackingno]');
                const trackingVal = trackingCell
                    ? (trackingCell.getAttribute('data-trackingno') || '').trim()
                    : '';
                const trackingColor = getTrackingColor(trackingVal);

                if (trackingColor) {
                    row.style.setProperty('border-left', `6px solid ${trackingColor}`, 'important');
                } else {
                    row.style.removeProperty('border-left');
                }
            });

            updateRemainingCounter(rows.length, rows.length - checkedCount);

            for (let i = 0; i < rows.length; i++) {
                const currentCell = rows[i].cells[8];
                if (!currentCell) continue;

                const currentLoc = currentCell.innerText.split('\n')[0].split(':')[0].trim();
                if (currentLoc === "" || currentLoc === "Location") continue;

                let rowspan = 1;

                for (let j = i + 1; j < rows.length; j++) {
                    const nextCell = rows[j].cells[8];

                    if (
                        nextCell &&
                        nextCell.innerText.split('\n')[0].split(':')[0].trim() === currentLoc
                    ) {
                        rowspan++;
                        nextCell.style.display = 'none';
                    } else {
                        break;
                    }
                }

                if (rowspan > 1) {
                    currentCell.setAttribute('rowspan', rowspan);
                    currentCell.style.verticalAlign = 'middle';
                }

                i += rowspan - 1;
            }

            updateFocusStatus();
        } finally {
            isUpdating = false;
            observerMuteUntil = performance.now() + 200;
        }
    };

    const scheduleRefreshTableStyle = (delay = 0) => {
        if (refreshScheduled) return;

        refreshScheduled = true;
        clearTimeout(refreshTimer);

        refreshTimer = setTimeout(() => {
            refreshScheduled = false;
            refreshTableStyleNow();
        }, delay);
    };

    const refreshTableStyle = () => scheduleRefreshTableStyle(0);

    const init = () => {
        setupAutoPrint();
        initKeyboardActions();
        preventAutoReload();

        processInboundJanCodes();

        // 초기 합산
        scheduleRefreshTableStyle(300);

        // document.body 전체 감시 대신 포장 항목 테이블만 감시합니다.
        // 스크립트가 자체적으로 만든 rowspan/style 변경은 observerMuteUntil 동안 무시합니다.
        const setupPackingTableObserver = () => {
            const target = document.getElementById('packingItemsTbody');

            if (!target) {
                setTimeout(setupPackingTableObserver, 300);
                return;
            }

            const packingObserver = new MutationObserver((mutations) => {
                if (performance.now() < observerMuteUntil || isUpdating) return;

                const needsRefresh = mutations.some(m =>
                    m.type === 'childList' ||
                    (m.type === 'attributes' && m.attributeName === 'checked')
                );

                if (needsRefresh) {
                    scheduleRefreshTableStyle(40);
                }
            });

            packingObserver.observe(target, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['checked']
            });
        };

        setupPackingTableObserver();

        const saveBtn = document.getElementById('btnSavePacking');
        if (saveBtn) saveBtn.addEventListener('click', () => { isPackingComplete = true; });
    };

    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
    else { init(); }
})();
/* ------------------------------------------------------------
 * [블록 3] [포장] 로케이션 일괄 체크(컨트롤 + 클릭) v6.1
 * ⚠️ 블록 2가 만든 로케이션 rowspan 병합 구조에 의존합니다.
 * ------------------------------------------------------------ */
(function() {
    'use strict';

    document.addEventListener('click', function(e) {
        // 1. 체크박스 클릭 + Ctrl 키 확인
        if (e.target.type === 'checkbox' && e.ctrlKey) {
            const clickedCheckbox = e.target;
            const isChecked = clickedCheckbox.checked;
            const currentRow = clickedCheckbox.closest('tr');
            const table = currentRow.closest('table');
            const rows = Array.from(table.querySelectorAll('tbody tr'));

            // 2. 로케이션 열 인덱스 자동 찾기
            const headers = Array.from(table.querySelectorAll('th, thead td'));
            let locIdx = headers.findIndex(h => h.innerText.includes('Location') || h.innerText.includes('Tracking'));
            if (locIdx === -1) locIdx = 8;

            // 3. 클릭한 행의 실제 '값' 찾기 (병합된 경우 위로 올라가며 값을 찾음)
            let targetLocation = "";
            let startRowIdx = rows.indexOf(currentRow);

            for (let i = startRowIdx; i >= 0; i--) {
                const cell = rows[i].querySelector(`td:nth-child(${locIdx + 1})`);
                // display가 none이 아니고 값이 있는 셀이 진짜 로케이션 셀임
                if (cell && cell.style.display !== 'none' && cell.innerText.trim() !== "") {
                    targetLocation = cell.innerText.trim();
                    break;
                }
            }

            if (!targetLocation) return;

            // 4. 전체 행을 돌며 동일 로케이션 묶음 모두 체크
            rows.forEach(row => {
                // 이 행의 로케이션 값 확인 (병합 구조 고려)
                let rowLoc = "";
                let rowIdx = rows.indexOf(row);
                for (let j = rowIdx; j >= 0; j--) {
                    const c = rows[j].querySelector(`td:nth-child(${locIdx + 1})`);
                    if (c && c.style.display !== 'none' && c.innerText.trim() !== "") {
                        rowLoc = c.innerText.trim();
                        break;
                    }
                }

                if (rowLoc === targetLocation) {
                    const cb = row.querySelector('input[type="checkbox"]');
                    if (cb) {
                        cb.checked = isChecked;
                        cb.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
            });

            console.log(`병합 구조 로케이션 [${targetLocation}] 일괄 처리 완료`);
        }
    }, true);

})();
/* ------------------------------------------------------------
 * [블록 4] [포장] 총 수량 합계 (버튼 위치 이동: 포장완료 위) v2.7
 * ------------------------------------------------------------ */
(function() {
    'use strict';

    // 1. 스타일 설정
    GM_addStyle(`
        #custom-summary-popup {
            display: none; position: fixed; top: 15%; left: 50%;
            transform: translateX(-50%); width: 380px; background: white;
            border-radius: 12px; box-shadow: 0 15px 40px rgba(0,0,0,0.3);
            z-index: 10001; font-family: 'Segoe UI', Tahoma, sans-serif;
            border: 1px solid #e0e0e0; outline: none; touch-action: none;
        }
        #custom-summary-popup-header {
            background: #1e88e5; color: white; padding: 12px 15px;
            font-weight: 600; border-radius: 12px 12px 0 0;
            display: flex; justify-content: space-between; align-items: center;
            cursor: move; user-select: none; font-size: 15px;
        }
        #custom-summary-popup-body { padding: 10px 0; max-height: 400px; overflow-y: auto; }
        #custom-summary-popup-footer {
            background: #fdfdfd; padding: 12px; border-top: 1px solid #eee;
            border-radius: 0 0 12px 12px; text-align: center;
        }
        .tracking-item {
            padding: 10px 15px; display: flex; align-items: center;
            border-bottom: 1px solid #f5f5f5; transition: background 0.2s;
        }
        .tracking-item:hover { background: #f9fbff; }
        .item-no { font-size: 12px; color: #999; width: 25px; font-weight: bold; flex-shrink: 0; }
        .item-info { display: flex; flex-direction: column; flex-grow: 1; min-width: 0; }
        .label-type { font-size: 10px; padding: 2px 5px; border-radius: 3px; color: white; margin-right: 6px; font-weight: bold; text-transform: uppercase; }
        .bg-track { background-color: #42a5f5; }
        .bg-loc { background-color: #78909c; }
        .id-text { font-weight: 600; color: #333; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .qty-subtotal { color: #1e88e5; font-weight: 700; font-size: 13px; margin-top: 2px; }
        .qty-grand-total { color: #d32f2f; font-weight: 800; font-size: 1.5em; margin-top: 3px; }
        .sync-checkbox { width: 18px; height: 18px; cursor: pointer; margin-left: 10px; accent-color: #1e88e5; flex-shrink: 0; }

        #calc-summary-btn {
            display: none; position: fixed;
            z-index: 10000; padding: 8px 15px; background: #28a745; color: white;
            border: none; border-radius: 30px; cursor: move; font-weight: 600;
            box-shadow: 0 4px 12px rgba(40,167,69,0.3); font-size: 13px;
        }
        #calc-summary-btn:hover { background: #218838; }
    `);

    // [버그 수정] @run-at document-start 때문에 document.body가 아직 없는 시점에
    // 이 코드가 실행되어 'Cannot read properties of null (reading appendChild)' 에러가
    // 나던 문제. UI 생성/모달 감시 전체를 document.body가 준비된 뒤에만 실행하도록
    // initSummaryTool() 함수로 감싸고, DOMContentLoaded 시점(또는 이미 준비됐으면 즉시)에
    // 호출하도록 수정.
    function initSummaryTool() {
    // 2. UI 생성
    const popup = document.createElement('div');
    popup.id = 'custom-summary-popup';
    popup.innerHTML = `
        <div id="custom-summary-popup-header">📊 수량 합계 리스트 <span id="close-popup" style="cursor:pointer; font-size:18px;">✕</span></div>
        <div id="custom-summary-popup-body"></div>
        <div id="custom-summary-popup-footer"></div>
    `;
    document.body.appendChild(popup);

    const btn = document.createElement('button');
    btn.id = 'calc-summary-btn';
    btn.innerText = '📊 총 수량 합산';
    document.body.appendChild(btn);

    const closeSummaryPopup = () => { popup.style.display = 'none'; };
    document.getElementById('close-popup').onclick = closeSummaryPopup;

    // 3. Esc 키 전파 차단
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && popup.style.display === 'block') {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            closeSummaryPopup();
        }
    }, true);

    // 4. 드래그 기능
    function makeDraggable(el, handle) {
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;
        handle.addEventListener('mousedown', (e) => {
            if (e.target.id === 'close-popup') return;
            isDragging = true;
            startX = e.clientX; startY = e.clientY;
            const rect = el.getBoundingClientRect();
            initialLeft = rect.left; initialTop = rect.top;
            el.style.transform = 'none'; el.style.left = initialLeft + 'px'; el.style.top = initialTop + 'px';
            const onMouseMove = (e) => {
                if (!isDragging) return;
                el.style.left = (initialLeft + e.clientX - startX) + 'px';
                el.style.top = (initialTop + e.clientY - startY) + 'px';
            };
            const onMouseUp = () => {
                isDragging = false;
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }
    makeDraggable(btn, btn);
    makeDraggable(popup, document.getElementById('custom-summary-popup-header'));

    // 5. 핵심: 버튼 위치를 포장완료 위로 이동
    function setInitialBtnPosition() {
        // '포장 완료' 버튼을 찾습니다. (클래스나 텍스트로 탐색)
        const finishBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('포장 완료')) ||
                          document.querySelector('.btn-primary.btn-sm') ||
                          document.querySelector('button[onclick*="packing"]');

        if (finishBtn) {
            const rect = finishBtn.getBoundingClientRect();
            // 포장완료 버튼 가로 중앙 정렬 및 위쪽 배치
            btn.style.left = (rect.left + (rect.width / 2) - (btn.offsetWidth / 2)) + 'px';
            btn.style.top = (rect.top - 45) + 'px'; // 버튼 45px 위에 배치
        }
    }

    // 6. 모달 감시 및 위치 업데이트
    const targetModal = document.getElementById('packingModal');
    if (targetModal) {
        const observer = new MutationObserver(() => {
            if (targetModal.classList.contains('show') || targetModal.style.display === 'block') {
                btn.style.display = 'block';
                // 버튼 너비가 잡힌 후 계산하기 위해 약간의 지연
                setTimeout(setInitialBtnPosition, 200);
            } else {
                btn.style.display = 'none';
                closeSummaryPopup();
            }
        });
        observer.observe(targetModal, { attributes: true, attributeFilter: ['class', 'style'] });
    }

    // 윈도우 사이즈 변경 시 버튼 위치 재조정
    window.addEventListener('resize', setInitialBtnPosition);

    // 7. 합산 로직 (기존 유지)
    btn.addEventListener('click', function() {
        const rows = document.querySelectorAll('#packingItemsTbody tr');
        const summaryMap = {};
        let grandTotal = 0;

        rows.forEach(row => {
            const qtyTd = row.querySelector('td[data-quantity]');
            const trackTd = row.querySelector('td[data-trackingno]');
            if (qtyTd) {
                const qty = parseInt(qtyTd.getAttribute('data-quantity')) || 0;
                let trackNo = trackTd ? trackTd.getAttribute('data-trackingno').trim() : "";
                let displayId = trackNo || (row.cells[8]?.innerText.split('/')[0].trim() || "번호 없음");
                let type = trackNo ? "TRACK" : "LOC";
                if (qty > 0) {
                    if (!summaryMap[displayId]) summaryMap[displayId] = { qty: 0, type: type };
                    summaryMap[displayId].qty += qty;
                    grandTotal += qty;
                }
            }
        });

        const body = document.getElementById('custom-summary-popup-body');
        const footer = document.getElementById('custom-summary-popup-footer');
        body.innerHTML = '';

        if (Object.keys(summaryMap).length === 0) {
            body.innerHTML = '<div style="padding:30px; text-align:center; color:#bbb; font-size:13px;">데이터가 없습니다.</div>';
        } else {
            Object.keys(summaryMap).forEach((id, index) => {
                const item = summaryMap[id];
                const badgeClass = item.type === "TRACK" ? "bg-track" : "bg-loc";
                const badgeText = item.type === "TRACK" ? "TRK" : "LOC";

                const div = document.createElement('div');
                div.className = 'tracking-item';
                div.innerHTML = `
                    <div class="item-no">${index + 1}</div>
                    <div class="item-info">
                        <div><span class="label-type ${badgeClass}">${badgeText}</span><span class="id-text">${id}</span></div>
                        <span class="qty-subtotal">${item.qty} 개</span>
                    </div>
                    <input type="checkbox" class="sync-checkbox" data-target-id="${id}">
                `;

                div.querySelector('.sync-checkbox').addEventListener('change', function() {
                    const isChecked = this.checked;
                    const targetId = this.getAttribute('data-target-id');
                    rows.forEach(row => {
                        const trackTd = row.querySelector('td[data-trackingno]');
                        const rowTrackNo = trackTd ? trackTd.getAttribute('data-trackingno').trim() : "";
                        const rowLocNo = row.cells[8]?.innerText.split('/')[0].trim() || "";
                        if (rowTrackNo === targetId || rowLocNo === targetId) {
                            const mainCheckbox = row.querySelector('input[type="checkbox"].sub_checkbox');
                            if (mainCheckbox) {
                                mainCheckbox.checked = isChecked;
                                mainCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        }
                    });
                });
                body.appendChild(div);
            });
            footer.innerHTML = `
                <div style="font-size:12px; color:#888; margin-bottom:2px;">TOTAL GRAND QUANTITY</div>
                <div class="qty-grand-total">${grandTotal} <span style="font-size:14px; font-weight:600;">PCS</span></div>
            `;
        }
        popup.style.display = 'block';
    });
    }

    if (document.body) {
        initSummaryTool();
    } else {
        document.addEventListener('DOMContentLoaded', initSummaryTool);
    }
})();
