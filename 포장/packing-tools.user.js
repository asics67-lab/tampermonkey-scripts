// ==UserScript==
// @name         [포장] 포장출고 통합 도구 (회원사메모 + 에토와르매칭 + LH/OH중복알림 + 오션배너)
// @namespace    https://github.com/asics67-lab/tampermonkey-scripts
// @version      1.4.0
// @description  포장/출고(shipping/packing) 화면 통합본. 원본: 회원사 특이사항(메모) 공유 시스템 v4.7 + 에토와르 주소 매칭 v21.0 + LH/OH Tracking 중복 알림 v1.4.0 + 포장 오션 강조 배너 v1.1
// @author       물류팀
// @match        https://www.platform.co.jp/admin/shipping/packing*
// @match        https://www.platform.co.jp/admin/users*
// @match        https://www.platform.co.jp/admin/shipping/packingfinished*
// @match        https://www.platform.co.jp/admin/shipping/finished*
// @match        *://*.aispel.com/admin/shipping/packing*
// @match        https://platform.aispel.com/admin/shipping/packing*
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js
// @grant        GM_xmlhttpRequest
// @updateURL    https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/포장/packing-tools.user.js
// @downloadURL  https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/포장/packing-tools.user.js
// ==/UserScript==

/*
 * ============================================================
 *  통합 안내
 *  - 포장/출고(shipping/packing) 화면에서 함께 쓰는 4개 원본 스크립트를 하나로 합쳤습니다.
 *    1) 회원사 특이사항(메모) 공유 시스템 v4.7 (packing + users)
 *    2) 출고 관리 - 에토와르(エトワール) 주소 매칭 수정 버전 v21.0
 *    3) Platform 출고관리 - LH/OH Tracking 중복 알림 v1.4.0
 *    4) 포장 - 오션 강조 배너 v1.1
 *  - 4개 모두 '.packing-btn' 클릭 이벤트나 모달을 함께 다루는 만큼, 겹치는 영역이 많습니다.
 *    각 스크립트가 서로 다른 DOM 요소/모달을 대상으로 하고 있어 로직 자체를 병합하지 않고
 *    독립된 IIFE 블록으로만 나열했습니다.
 *  - 실제 배포 전 포장 화면에서 4개 기능이 서로 부딪히지 않고 모두 정상 동작하는지
 *    반드시 실제 환경에서 확인해 주세요.
 *  - jQuery가 사이트에 이미 로드되어 있다면 @require로 인해 버전이 달라질 수 있으니,
 *    화면에 이상이 보이면 이 부분부터 의심해 주세요.
 *
 *  v1.3.0 변경 사항
 *  - [블록 4] AISPEL 피킹리스트를 이 파일에서 분리했습니다. PICKING LIST 인쇄는 실제로
 *    관리팀이 쓰는 기능이라, 담당자 기준 폴더 구조에 맞게
 *    관리/05-피킹리스트/picking-list-tools.user.js 로 옮겼습니다. (이전 v1.1.0, v1.2.0의
 *    피킹리스트 관련 수정 이력은 그 파일로 함께 이동했습니다)
 *  - 위 이동으로 이 파일의 블록 번호가 하나씩 당겨졌습니다: 기존 [블록 5] 오션 강조 배너가
 *    이제 [블록 4]입니다.
 *
 *  v1.4.0 버그 수정 (포장 담당자 보고: "OCEAN 마크가 안 뜬다")
 *  - [블록 4] 두 가지 취약점을 고쳤습니다.
 *    1) OCEAN 여부 판단을 "행의 특정 열 번호(2번째 칸)"만 읽던 방식에서, 행 전체
 *       텍스트에 "OCEAN"이 포함되는지 확인하는 방식으로 변경 — 사이트 표 구조가
 *       바뀌어 열 순서가 달라져도 안전하게 동작합니다.
 *    2) 배너를 띄우는 시점을 jQuery의 ajaxComplete 이벤트(사이트가 $.ajax로 통신할
 *       때만 감지됨)에 의존하던 것에서, 모달이 실제로 화면에 보이는 상태로 바뀌는
 *       순간을 직접 감시(MutationObserver)하는 방식으로 변경 — 사이트의 통신 방식이
 *       무엇이든(fetch 등) 상관없이 항상 동작합니다.
 * ============================================================
 */

/* ------------------------------------------------------------
 * [블록 1] 회원사 특이사항(메모) 공유 시스템 v4.7
 * ------------------------------------------------------------ */
(function() {
    'use strict';

    function extractActualUserNumber(text) {
        if (!text) return [];
        const matches = text.match(/\b\d{3,5}\b/g) || text.match(/\d+/g);
        if (!matches) return [];

        return matches
            .map(n => n.trim())
            .filter(num => num !== '2026' && num !== '2025' && num !== '2027' && num.length >= 3);
    }

    function filterMemoContent(rawMemo) {
        if (!rawMemo) return '';
        const targetKeyword = '특이사항';
        const index = rawMemo.indexOf(targetKeyword);
        if (index !== -1) {
            let filtered = rawMemo.substring(index + targetKeyword.length);
            filtered = filtered.replace(/^[\s\]\:\-\=\[㎡\)]+/, '');
            return filtered.trim();
        }
        return '';
    }

    if (location.href.includes('/admin/shipping/packing')) {
        $(document).ready(function() {

            $(document).on('click', '.packing-btn', function() {

                const $parentRow = $(this).parent().parent();
                const fallbackText = $(this).closest('tr').text() || '';
                const combinedText = $parentRow.text() + " " + fallbackText;

                let numList = extractActualUserNumber(combinedText);

                if (numList.length === 0) {
                    $('.show-tooltip').each(function() {
                        const txt = $(this).text() || '';
                        const extracted = extractActualUserNumber(txt);
                        if (extracted.length > 0) {
                            numList = numList.concat(extracted);
                        }
                    });
                }

                const searchKeyword = numList.filter((v, i, a) => a.indexOf(v) === i)[0] || '';

                console.log('[필터링 시스템] 감지된 회원번호:', searchKeyword);

                $('#shared-independent-side-panel').remove();

                if (!searchKeyword || searchKeyword.length < 2) {
                    console.log('[검색 실패] 회원번호를 감지하지 못했습니다.');
                    return;
                }

                $.ajax({
                    url: 'https://www.platform.co.jp/admin/users',
                    type: 'GET',
                    data: {
                        action: 'search',
                        search_word: searchKeyword
                    },
                    dataType: 'text',
                    success: function(htmlText) {
                        let foundMemo = '';
                        let foundUserId = '';
                        let foundCompanyNameEn = '';

                        const tbodyStart = htmlText.indexOf('<tbody>');
                        const tbodyEnd = htmlText.indexOf('</tbody>');

                        if (tbodyStart !== -1 && tbodyEnd !== -1) {
                            const cleanTbodyHtml = htmlText.substring(tbodyStart, tbodyEnd + 8);
                            const $tbody = $(cleanTbodyHtml);

                            $tbody.find('.edit-btn').each(function() {
                                const $btn = $(this);
                                const $row = $btn.closest('tr');

                                const userIdText = $row.find('td').eq(0).text() || '';
                                const btnDataId = String($btn.data('id') || $btn.attr('data-id') || '');

                                if (userIdText.indexOf(searchKeyword) !== -1 || btnDataId === String(searchKeyword)) {
                                    foundMemo = $btn.attr('data-memo') || $btn.data('memo') || '';
                                    foundUserId = btnDataId;

                                    foundCompanyNameEn = $btn.data('name_en') || $btn.attr('data-name_en') || $row.find('td').eq(1).text() || '';
                                    foundCompanyNameEn = foundCompanyNameEn.replace(/[\d\-_]/g, '').trim();
                                    return false;
                                }
                            });
                        }

                        const displayCompanyName = foundCompanyNameEn ? foundCompanyNameEn : 'Unknown';

                        const processedMemo = filterMemoContent(foundMemo);
                        const hasMemo = processedMemo.length > 0;
                        const memoContent = hasMemo ? processedMemo : '등록된 회원사 고유 특이사항이 없습니다.';

                        const finalUrl = 'https://www.platform.co.jp/admin/users?action=search&search_word=' + searchKeyword + '&autooppen=' + foundUserId;

                        const $modalDialog = $('#packingModal .modal-dialog');

                        let sidePanelHtml = `
                            <div id="shared-independent-side-panel" style="
                                position: absolute;
                                left: 100%;
                                top: 0;
                                width: 320px;
                                padding-left: 15px;
                                z-index: 1060;
                                display: flex;
                                flex-direction: column;
                                pointer-events: auto !important;
                            ">
                                <div class="card" style="
                                    border: 1px solid ${hasMemo ? '#ea5455' : '#d8d6de'};
                                    box-shadow: 5px 4px 16px rgba(0,0,0,0.15);
                                    border-radius: 6px;
                                    display: flex;
                                    flex-direction: column;
                                    background: #ffffff;
                                    max-height: 85vh;
                                ">
                                    <div class="card-header d-flex align-items-center" style="
                                        background-color: ${hasMemo ? '#ea5455' : '#f8f9fa'};
                                        padding: 12px 16px;
                                        border-bottom: 1px solid ${hasMemo ? '#ea5455' : '#dee2e6'};
                                        border-top-left-radius: 5px;
                                        border-top-right-radius: 5px;
                                        flex-shrink: 0;
                                    ">
                                        <h6 class="m-0 d-flex align-items-center" style="font-size: 0.9rem; font-weight: 700; color: ${hasMemo ? '#ffffff' : '#495057'} !important; line-height: 1.3;">
                                            <i class="fa ${hasMemo ? 'fa-exclamation-triangle animate__animated animate__flash animate__infinite' : 'fa-info-circle'} me-2" style="font-size: 1.1rem; color: ${hasMemo ? '#ffffff' : '#6c757d'};"></i>
                                            ${displayCompanyName} 특이사항 [${searchKeyword}]
                                        </h6>
                                    </div>

                                    <div class="card-body" style="
                                        padding: 16px;
                                        background-color: ${hasMemo ? '#fffcfc' : '#ffffff'};
                                        overflow-y: auto;
                                        flex: 1;
                                    ">
                                        <div style="
                                            font-size: 0.88rem;
                                            line-height: 1.6;
                                            font-weight: ${hasMemo ? '600' : 'normal'};
                                            color: #1e1e1e;
                                            white-space: pre-wrap;
                                            word-break: break-all;
                                        ">${memoContent}</div>
                                    </div>

                                    <div class="card-footer" style="padding: 10px 16px; background: #f8f9fa; border-top: 1px solid #dee2e6; border-bottom-left-radius: 5px; border-bottom-right-radius: 5px; flex-shrink: 0;">
                                        <button type="button" id="go-to-user-btn" style="
                                            width: 100%;
                                            background-color: #4f5d75;
                                            color: #ffffff !important;
                                            font-size: 0.8rem;
                                            font-weight: bold;
                                            padding: 8px;
                                            border: none;
                                            border-radius: 4px;
                                            cursor: pointer;
                                            display: flex;
                                            align-items: center;
                                            justify-content: center;
                                        ">
                                            <i class="fa fa-external-link-alt me-2" style="font-size: 0.8rem;"></i>
                                            회원관리 바로가기 (새창)
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `;

                        $modalDialog.css({
                            'position': 'relative',
                            'pointer-events': 'none'
                        });
                        $modalDialog.find('.modal-content').css('pointer-events', 'auto');

                        const $sidePanel = $(sidePanelHtml);
                        $sidePanel.find('#go-to-user-btn').on('click', function(e) {
                            e.preventDefault();
                            e.stopPropagation();
                            window.open(finalUrl, '_blank');
                        });

                        $modalDialog.append($sidePanel);
                    }
                });
            });

            $('#packingModal').on('hide.bs.modal', function () {
                $('#shared-independent-side-panel').remove();
                $('#packingModal .modal-dialog').css('pointer-events', '');
            });
        });
    }

    if (location.href.includes('/admin/users')) {
        $(document).ready(function() {
            const urlParams = new URLSearchParams(window.location.search);
            const openId = urlParams.get('autooppen');

            if (openId) {
                setTimeout(function() {
                    $('.edit-btn').each(function() {
                        if (String($(this).data('id')) === String(openId)) {
                            $(this).trigger('click');
                            console.log(`[자동화 시스템] 회원 ID(${openId}) 편집창 로딩 완료`);
                            return false;
                        }
                    });
                }, 400);
            }
        });
    }
})();

/* ------------------------------------------------------------
 * [블록 2] 출고 관리 - 에토와르(エトワール) 주소 매칭 수정 버전 v21.0
 * ------------------------------------------------------------ */
(function() {
    'use strict';

    const KEYWORD = "エトワール";
    let currentTargetClientCode = "";

    const style = document.createElement('style');
    style.innerHTML = `
        .badge-etoile-js {
            display: inline-block !important;
            background-color: #28c76f !important;
            color: #ffffff !important;
            font-size: 11px !important;
            font-weight: bold !important;
            padding: 2px 6px !important;
            margin-left: 6px !important;
            border-radius: 3px !important;
            vertical-align: middle !important;
            cursor: pointer !important;
        }
        .badge-etoile-js:hover {
            background-color: #20a056 !important;
        }
        .etoile-list-popup {
            position: absolute;
            background: #ffffff;
            border: 1px solid #ced4da;
            border-radius: 6px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            padding: 14px;
            z-index: 110000;
            width: 320px;
            font-size: 12px;
            color: #333333;
            font-family: sans-serif;
        }
        .etoile-list-popup h6 {
            margin: 0 0 10px 0;
            font-size: 13px;
            font-weight: bold;
            color: #28c76f;
            border-bottom: 2px solid #28c76f;
            padding-bottom: 6px;
        }
        .etoile-list-popup ul {
            list-style: none;
            padding: 0;
            margin: 0;
            max-height: 220px;
            overflow-y: auto;
        }
        .etoile-list-popup li {
            padding: 6px 8px;
            border-bottom: 1px dashed #eee;
            font-weight: 500;
            display: flex;
            justify-content: space-between;
        }
        .etoile-list-popup li:hover {
            background-color: #f8f9fa;
        }
        .etoile-list-popup li.current-item {
            color: #17a2b8;
            background-color: #e2f7f9;
            font-weight: bold;
        }
        .etoile-loc-text {
            color: #ff6b6b;
            font-weight: bold;
            margin-left: 10px;
        }
        .etoile-close-btn {
            float: right;
            cursor: pointer;
            color: #aaa;
            font-size: 16px;
            font-weight: bold;
            line-height: 12px;
        }
        .etoile-close-btn:hover {
            color: #000;
        }
    `;
    document.head.appendChild(style);

    $(document).on('click', '.packing-btn', function() {
        let $tr = $(this).closest('tr');
        let $link = $tr.find('.show-tooltip');

        if ($link.length > 0) {
            let clientText = $link.text().trim();
            let match = clientText.match(/^(\d{4})/);
            if (match) {
                currentTargetClientCode = match[1];
            } else {
                currentTargetClientCode = clientText.split('-')[0].trim();
            }
        }
        startTrackingModalTable();
    });

    function startTrackingModalTable() {
        let checkCount = 0;
        let loadTimer = setInterval(function() {
            let $links = $('#packingItemsTbody .show_tracking_page');
            if ($links.length > 0) {
                clearInterval(loadTimer);
                runSimpleEtoileMatch($links);
            }
            checkCount++;
            if (checkCount > 40) clearInterval(loadTimer);
        }, 150);
    }

    function runSimpleEtoileMatch($links) {
        let trackingNumbers = [];
        $links.each(function() {
            let num = $(this).text().trim();
            if (num && !trackingNumbers.includes(num)) {
                trackingNumbers.push(num);
            }
        });

        if (trackingNumbers.length === 0) return;

        GM_xmlhttpRequest({
            method: "GET",
            url: "https://www.platform.co.jp/admin/store/trackingno?pagesize=500",
            onload: function(response) {
                if (response.status !== 200) return;

                let parser = new DOMParser();
                let doc = parser.parseFromString(response.responseText, "text/html");
                let rows = doc.querySelectorAll("table tbody tr");

                let matchedNumbers = new Set();

                rows.forEach(row => {
                    let trackingLink = row.querySelector(".show_tracking_page");
                    let rowTrackingNo = trackingLink ? (trackingLink.getAttribute('data-trackingno') || trackingLink.textContent).trim() : "";
                    let rowAllText = row.textContent || row.innerText;

                    if (rowTrackingNo && trackingNumbers.includes(rowTrackingNo) && rowAllText.includes(KEYWORD)) {
                        matchedNumbers.add(rowTrackingNo);
                    }
                });

                if (matchedNumbers.size > 0) {
                    $links.each(function() {
                        let currentNum = $(this).text().trim();
                        if (matchedNumbers.has(currentNum) && $(this).parent().find('.badge-etoile-js').length === 0) {
                            $(this).after('<span class="badge-etoile-js">' + KEYWORD + '</span>');
                        }
                    });
                }
            }
        });
    }

    $(document).on('click', '.badge-etoile-js', function(e) {
        e.preventDefault();
        e.stopPropagation();

        let $clickedBadge = $(this);
        let targetTrackingNo = $clickedBadge.prev('.show_tracking_page').text().trim();

        $('.etoile-list-popup').remove();

        if (!currentTargetClientCode) {
            alert("회원사 고유 번호가 유실되었습니다. 창을 닫고 다시 시도해 주세요.");
            return;
        }

        let targetUrl = "https://www.platform.co.jp/admin/store/trackingno?pagesize=500&user_id=" + encodeURIComponent(currentTargetClientCode) + "&supplier_id=25";

        GM_xmlhttpRequest({
            method: "GET",
            url: targetUrl,
            onload: function(response) {
                if (response.status !== 200) return;

                let parser = new DOMParser();
                let doc = parser.parseFromString(response.responseText, "text/html");
                let rows = doc.querySelectorAll("table tbody tr");

                let baseDate = "";
                let sameDayMap = [];

                rows.forEach(row => {
                    let trackingLink = row.querySelector(".show_tracking_page");
                    let rowTrackingNo = trackingLink ? (trackingLink.getAttribute('data-trackingno') || trackingLink.textContent).trim() : "";

                    if (rowTrackingNo === targetTrackingNo) {
                        let rowHtml = row.innerHTML;
                        let allDates = rowHtml.match(/(\d{4}-\d{2}-\d{2})/g);
                        if (allDates && allDates.length > 0) {
                            baseDate = allDates[0];
                        }
                    }
                });

                if (!baseDate) {
                    alert("기준 입고 날짜를 찾지 못했습니다.");
                    return;
                }

                rows.forEach(row => {
                    let trackingLink = row.querySelector(".show_tracking_page");
                    let rowTrackingNo = trackingLink ? (trackingLink.getAttribute('data-trackingno') || trackingLink.textContent).trim() : "";

                    let rowDate = "";
                    let allDates = row.innerHTML.match(/(\d{4}-\d{2}-\d{2})/g);
                    if (allDates && allDates.length > 0) {
                        rowDate = allDates[0];
                    }

                    if (rowDate === baseDate && rowTrackingNo) {
                        let locationText = "지정안됨";
                        for (let i = 0; i < row.cells.length; i++) {
                            let cellHtml = row.cells[i].innerHTML;
                            if (cellHtml.includes('B5-') || cellHtml.match(/[A-Z]\d+-\d+-\d+/)) {
                                locationText = row.cells[i].textContent.trim();
                                break;
                            }
                        }

                        if (!sameDayMap.some(item => item.no === rowTrackingNo)) {
                            sameDayMap.push({
                                no: rowTrackingNo,
                                loc: locationText
                            });
                        }
                    }
                });

                let offset = $clickedBadge.offset();
                let popupHtml = '<div class="etoile-list-popup" style="top: ' + (offset.top + 22) + 'px; left: ' + offset.left + 'px;">';
                popupHtml += '<span class="etoile-close-btn">&times;</span>';
                popupHtml += '<h6>📅 ' + baseDate + ' 에토와르 목록</h6>';
                popupHtml += '<ul>';

                if (sameDayMap.length > 0) {
                    sameDayMap.forEach(item => {
                        let isCurrent = (item.no === targetTrackingNo);
                        let liClass = isCurrent ? ' class="current-item"' : '';
                        let prefix = isCurrent ? '▶ ' : '📦 ';
                        let suffix = isCurrent ? ' (현재)' : '';

                        popupHtml += '<li' + liClass + '>';
                        popupHtml += '<span>' + prefix + item.no + suffix + '</span>';
                        popupHtml += '<span class="etoile-loc-text">📍 ' + item.loc + '</span>';
                        popupHtml += '</li>';
                    });
                } else {
                    popupHtml += '<li>동일 조건의 다른 건이 없습니다.</li>';
                }

                popupHtml += '</ul></div>';
                $('body').append(popupHtml);
            }
        });
    });

    $(document).on('click', '.etoile-close-btn', function() {
        $(this).closest('.etoile-list-popup').remove();
    });

    $(document).on('click', function(event) {
        if (!$(event.target).closest('.badge-etoile-js, .etoile-list-popup').length) {
            $('.etoile-list-popup').remove();
        }
    });
})();

/* ------------------------------------------------------------
 * [블록 3] Platform 출고관리 - LH/OH Tracking 중복 알림 v1.4.0
 * ------------------------------------------------------------ */
(function () {
    'use strict';

    const MGT_SEARCH_URL = 'https://www.platform.co.jp/admin/mgt/index';
    const DELIVERY_NO_PATTERN = /^(LH|OH)/i;
    const CACHE_TTL_MS = 5 * 60 * 1000;

    const STATUS_MAP = {
        '접수': '受付',
        '포장진행': '梱包進行',
        '포장 진행': '梱包進行',
        '포장완료': '梱包完了',
        '출고대기': '出荷待ち',
        '출고완료': '出荷完了',
        '보류': '保留',
        '취소': 'キャンセル',
        '배송중': '配送中',
        '배송완료': '配送完了'
    };

    const mgtCache = new Map();
    let modalEl = null;

    function text(el) {
        return (el?.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function translateStatus(krStatus) {
        if (!krStatus || krStatus === '-') return '-';
        const trimmed = krStatus.trim();
        const jaStatus = STATUS_MAP[trimmed];

        return jaStatus || trimmed;
    }

    function extractTrackingNo(row) {
        const checkbox = row.querySelector('.sub_checkbox');
        const fromData = (checkbox?.dataset.trackingno || '').trim();
        if (fromData) return fromData;

        const link = row.querySelector('.show_tracking_page');
        if (link?.dataset.trackingno) return String(link.dataset.trackingno).trim();

        const trackingCell = row.cells[6];
        if (!trackingCell) return '';
        const cellLink = trackingCell.querySelector('.show_tracking_page');
        if (cellLink?.dataset.trackingno) return String(cellLink.dataset.trackingno).trim();
        return text(trackingCell).replace(/\s/g, '');
    }

    function extractDeliveryNo(row) {
        const cell = row.cells[3];
        if (!cell) return '';
        return text(cell);
    }

    function isTargetRow(row) {
        const checkbox = row.querySelector('.sub_checkbox');
        const isDelivery = checkbox?.dataset.type === 'delivery'
            || text(row.cells[2]).includes('배송 대행') || text(row.cells[2]).includes('配送代行');
        if (!isDelivery) return false;

        const deliveryNo = extractDeliveryNo(row);
        const trackingNo = extractTrackingNo(row);
        return DELIVERY_NO_PATTERN.test(deliveryNo) && !!trackingNo;
    }

    function parseMgtHtml(html, trackingNo) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const rows = doc.querySelectorAll('table.table-bordered tbody tr');
        const results = [];
        const seen = new Set();

        rows.forEach((row) => {
            if (row.cells.length < 15) return;

            const deliveryLink = row.cells[4]?.querySelector('.show-delivery-detail-btn');
            const deliveryNo = text(deliveryLink || row.cells[4]).split(/\s+/)[0];
            if (!DELIVERY_NO_PATTERN.test(deliveryNo)) return;

            const rowTrackingLink = row.cells[13]?.querySelector('.show_tracking_page');
            const rowTracking = (rowTrackingLink?.dataset.trackingno || text(row.cells[13])).replace(/\s/g, '');
            if (rowTracking !== trackingNo) return;

            const statusBadge = row.cells[14]?.querySelector('.badge');
            const status = text(statusBadge || row.cells[14]) || '-';
            const key = `${deliveryNo}|${status}`;
            if (seen.has(key)) return;
            seen.add(key);

            results.push({ deliveryNo, status });
        });

        return results;
    }

    async function fetchMgtByTracking(trackingNo) {
        const cached = mgtCache.get(trackingNo);
        if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
            return cached.data;
        }

        const url = new URL(MGT_SEARCH_URL);
        url.searchParams.set('action', 'search');
        url.searchParams.set('tracking_no', trackingNo);
        url.searchParams.set('pagesize', '500');

        const response = await fetch(url.toString(), {
            credentials: 'include',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
        });
        if (!response.ok) throw new Error(`総合管理データの取得に失敗しました (${response.status})`);

        const html = await response.text();
        const data = parseMgtHtml(html, trackingNo);
        mgtCache.set(trackingNo, { at: Date.now(), data });
        return data;
    }

    function ensureModal() {
        if (modalEl) return modalEl;

        const style = document.createElement('style');
        style.textContent = `
            #lh-oh-dup-overlay {
                position: fixed; inset: 0; background: rgba(0,0,0,.45);
                z-index: 100001; display: flex; align-items: center; justify-content: center;
            }
            #lh-oh-dup-modal {
                background: #fff; border-radius: 8px; width: min(720px, 92vw);
                max-height: 85vh; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,.25);
                font-family: "Public Sans", sans-serif;
            }
            #lh-oh-dup-modal .dup-header {
                padding: 14px 18px; border-bottom: 1px solid #e9ecef;
                display: flex; justify-content: space-between; align-items: center;
            }
            #lh-oh-dup-modal .dup-header h5 { margin: 0; font-size: 1rem; color: #dc3545; }
            #lh-oh-dup-modal .dup-body { padding: 16px 18px; overflow-y: auto; max-height: calc(85vh - 120px); }
            #lh-oh-dup-modal .dup-info {
                margin-bottom: 12px; font-size: .875rem; color: #444; line-height: 1.4;
            }
            #lh-oh-dup-modal table { width: 100%; border-collapse: collapse; font-size: .8125rem; }
            #lh-oh-dup-modal th, #lh-oh-dup-modal td {
                border: 1px solid #dee2e6; padding: 8px; text-align: center;
            }
            #lh-oh-dup-modal th { background: #f8f9fa; }
            #lh-oh-dup-modal .dup-current { background: #fff3cd; font-weight: 600; }
            #lh-oh-dup-modal .dup-footer {
                padding: 12px 18px; border-top: 1px solid #e9ecef; text-align: right; display: flex; gap: 8px; justify-content: flex-end;
            }
            #lh-oh-dup-modal .dup-footer button {
                border: none; border-radius: 4px; padding: 6px 14px; cursor: pointer; font-size: .8125rem;
            }
            #lh-oh-dup-modal .btn-confirm { background: #696cff; color: #fff; }
            #lh-oh-dup-modal .btn-cancel { background: #8592a3; color: #fff; }
        `;
        document.head.appendChild(style);

        modalEl = document.createElement('div');
        modalEl.id = 'lh-oh-dup-overlay';
        modalEl.style.display = 'none';
        modalEl.innerHTML = `
            <div id="lh-oh-dup-modal">
                <div class="dup-header">
                    <h5>⚠ Tracking番号 重複確認</h5>
                    <button type="button" id="lh-oh-dup-close-x" style="border:none;background:none;font-size:1.2rem;cursor:pointer;">×</button>
                </div>
                <div class="dup-body" id="lh-oh-dup-body"></div>
                <div class="dup-footer">
                    <button type="button" id="lh-oh-dup-cancel" class="btn-cancel">キャンセル</button>
                    <button type="button" id="lh-oh-dup-proceed" class="btn-confirm">梱包進行</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalEl);

        return modalEl;
    }

    function showDuplicatePopup(trackingNo, currentDeliveryNo, orders) {
        return new Promise((resolve) => {
            const modal = ensureModal();
            const body = modal.querySelector('#lh-oh-dup-body');
            const mgtUrl = `${MGT_SEARCH_URL}?action=search&tracking_no=${encodeURIComponent(trackingNo)}`;

            const rows = orders.map((order) => {
                const isCurrent = order.deliveryNo === currentDeliveryNo;
                const displayStatus = translateStatus(order.status);

                return `
                    <tr class="${isCurrent ? 'dup-current' : ''}">
                        <td>${order.deliveryNo}${isCurrent ? ' ← 現在' : ''}</td>
                        <td>${displayStatus}</td>
                    </tr>
                `;
            }).join('');

            body.innerHTML = `
                <div class="dup-info">
                    梱包進行中の <strong>${currentDeliveryNo}</strong> と<br>
                    同一のTracking番号を使用しているLH/OH出荷件があります。
                </div>
                <div style="margin-bottom:10px;font-size:.8125rem;">
                    Tracking No: <strong>${trackingNo}</strong>
                    <a href="${mgtUrl}" target="_blank" rel="noopener" style="margin-left:8px;">総合管理で確認</a>
                </div>
                <table>
                    <thead><tr><th>出荷番号</th><th>進行状態</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            `;

            const proceedBtn = modal.querySelector('#lh-oh-dup-proceed');
            const cancelBtn = modal.querySelector('#lh-oh-dup-cancel');
            const closeX = modal.querySelector('#lh-oh-dup-close-x');

            const cleanup = () => {
                modal.style.display = 'none';
                proceedBtn.removeEventListener('click', onProceed);
                cancelBtn.removeEventListener('click', onCancel);
                closeX.removeEventListener('click', onCancel);
            };

            const onProceed = () => { cleanup(); resolve(true); };
            const onCancel = () => { cleanup(); resolve(false); };

            proceedBtn.addEventListener('click', onProceed);
            cancelBtn.addEventListener('click', onCancel);
            closeX.addEventListener('click', onCancel);

            modal.style.display = 'flex';
        });
    }

    function init() {
        document.addEventListener('click', async (e) => {
            const btn = e.target.closest('.packing-btn');
            if (!btn) return;

            const row = btn.closest('tr');
            if (!row || !isTargetRow(row)) return;

            if (btn.dataset.bypassDupCheck === 'true') {
                delete btn.dataset.bypassDupCheck;
                return;
            }

            e.preventDefault();
            e.stopPropagation();

            const deliveryNo = extractDeliveryNo(row);
            const trackingNo = extractTrackingNo(row);

            try {
                const orders = await fetchMgtByTracking(trackingNo);

                if (orders.length >= 2) {
                    const shouldProceed = await showDuplicatePopup(trackingNo, deliveryNo, orders);
                    if (shouldProceed) {
                        btn.dataset.bypassDupCheck = 'true';
                        btn.click();
                    }
                } else {
                    btn.dataset.bypassDupCheck = 'true';
                    btn.click();
                }
            } catch (err) {
                console.error('[LH/OH Tracking Duplicate]', err);
                if (confirm('総合管理の照会中にエラーが発生しました。このまま梱包を進行しますか？')) {
                    btn.dataset.bypassDupCheck = 'true';
                    btn.click();
                }
            }
        }, true);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

/* ------------------------------------------------------------
 * [블록 4] 포장 - 오션 강조 배너 v1.1
 * ------------------------------------------------------------ */
(function() {
    'use strict';

    const style = document.createElement('style');
    style.innerHTML = `
        .ocean-banner {
            background-color: #FFF9C4 !important;
            border: 3px solid #E64A19 !important;
            color: #D84315 !important;
            padding: 15px;
            margin: 10px 0;
            text-align: center;
            font-weight: 900;
            font-size: 1.5rem;
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            display: block;
            width: 100%;
        }
        .ocean-modal-header {
            background-color: #BBDEFB !important;
        }
        .ocean-text-blink {
            animation: blink-animation 1s steps(5, start) infinite;
            -webkit-animation: blink-animation 1s steps(5, start) infinite;
        }
        @keyframes blink-animation {
            to { visibility: hidden; }
        }
    `;
    document.head.appendChild(style);

    let isOceanRow = false;

    $(document).on('click', '.packing-btn', function() {
        const row = $(this).closest('tr');
        // [수정] 특정 열 번호(2번째 칸)만 읽던 방식은 사이트 표 구조가 바뀌면 엉뚱한
        // 칸을 읽게 되어 취약했습니다. 행 전체 텍스트에서 "OCEAN" 포함 여부를
        // 확인하도록 바꿔, 열 순서가 바뀌어도 안전하게 동작하도록 했습니다.
        isOceanRow = row.text().toUpperCase().includes('OCEAN');
    });

    // [수정] jQuery의 ajaxComplete 이벤트는 사이트가 jQuery의 $.ajax로 통신할 때만
    // 감지됩니다. 사이트가 내부적으로 fetch 등 다른 방식으로 바뀌면 이 이벤트 자체가
    // 전혀 발생하지 않아 배너가 안 뜰 수 있었습니다. 대신 모달이 실제로 화면에 보이는
    // 상태(class="show")로 바뀌는 순간을 직접 감시하도록 바꿔, 통신 방식과 무관하게
    // 항상 동작하도록 했습니다.
    const packingModalEl = document.getElementById('packingModal');
    if (packingModalEl) {
        const refreshOceanBanner = () => {
            const isVisible = packingModalEl.classList.contains('show') ||
                window.getComputedStyle(packingModalEl).display === 'block';

            const modalBody = $('#packingModal .modal-body');
            const modalHeader = $('#packingModal .modal-header');

            $('.ocean-banner').remove();
            modalHeader.removeClass('ocean-modal-header');

            if (isVisible && isOceanRow) {
                const bannerHtml = `
                    <div class="ocean-banner">
                        <span class="ocean-text-blink">⚠️ [OCEAN 件] ⚠️</span><br>
                        この注文は <span style="text-decoration: underline;">OCEAN </span> 海上輸送の対象です.
                    </div>
                `;
                modalBody.prepend(bannerHtml);
                modalHeader.addClass('ocean-modal-header');

                if (!$('#packingModalTitle').text().includes('[OCEAN 대상]')) {
                    $('#packingModalTitle').append(' <b style="color:red;">[OCEAN 대상]</b>');
                }
            }
        };

        const modalObserver = new MutationObserver(() => refreshOceanBanner());
        modalObserver.observe(packingModalEl, {
            attributes: true,
            attributeFilter: ['class', 'style'],
            childList: true,
            subtree: true
        });
    }

})();
