// ==UserScript==
// @name         [관리] 포장출고 통합 도구 (회원사메모 + 에토와르매칭 + LH/OH중복알림 + 피킹리스트 + 오션배너)
// @namespace    https://github.com/asics67-lab/tampermonkey-scripts
// @version      1.2.0
// @description  포장/출고(shipping/packing) 화면 통합본. 원본: 회원사 특이사항(메모) 공유 시스템 v4.7 + 에토와르 주소 매칭 v21.0 + LH/OH Tracking 중복 알림 v1.4.0 + AISPEL 피킹리스트 v75.2(LH/OH 트래킹번호 미표시 수정) + 포장 오션 강조 배너 v1.1
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
 *  - 포장/출고(shipping/packing) 화면에서 함께 쓰는 5개 원본 스크립트를 하나로 합쳤습니다.
 *    1) 회원사 특이사항(메모) 공유 시스템 v4.7 (packing + users)
 *    2) 출고 관리 - 에토와르(エトワール) 주소 매칭 수정 버전 v21.0
 *    3) Platform 출고관리 - LH/OH Tracking 중복 알림 v1.4.0
 *    4) AISPEL 피킹리스트 (V75.0)
 *    5) 포장 - 오션 강조 배너 v1.1
 *  - 5개 모두 '.packing-btn' 클릭 이벤트나 모달을 함께 다루는 만큼, 겹치는 영역이 많습니다.
 *    각 스크립트가 서로 다른 DOM 요소/모달을 대상으로 하고 있어 로직 자체를 병합하지 않고
 *    독립된 IIFE 블록으로만 나열했습니다.
 *  - 스크립트가 많아 실행 순서에 따라 화면에 표시되는 타이밍이 미세하게 달라질 수 있습니다.
 *    실제 배포 전 포장 화면에서 5개 기능이 서로 부딪히지 않고 모두 정상 동작하는지
 *    반드시 실제 환경에서 확인해 주세요.
 *  - jQuery가 사이트에 이미 로드되어 있다면 @require로 인해 버전이 달라질 수 있으니,
 *    화면에 이상이 보이면 이 부분부터 의심해 주세요.
 *
 *  v1.1.0 수정 사항
 *  - [블록 4] AISPEL 피킹리스트를 v75.0 -> v75.2로 교체
 *    배송대행(LH/OH) 건의 Tracking 번호가 피킹리스트 인쇄물에 표시되지 않던 문제 수정.
 *    트래킹번호 후보 필드를 확장하고, 트래킹번호+JAN코드 기준으로 합산/병합하도록 변경,
 *    인쇄 시 로케이션 칸 아래에 트래킹 번호를 함께 표시하도록 함.
 *
 *  v1.2.0 수정 사항
 *  - [블록 4] 피킹리스트 수량 합산 기준에 상품명을 추가했습니다.
 *    기존에는 "트래킹번호+JAN코드"만 같으면 무조건 합쳤는데, JAN코드를 잘못(중복) 입력해
 *    실제로는 다른 상품인데 같은 JAN코드로 찍힌 경우까지 한 줄로 합쳐지는 문제가 있었습니다.
 *    이제는 "트래킹번호+JAN코드+상품명"이 모두 같아야 합쳐지고, 상품명이 다르면 목록에
 *    별도 줄로 표시됩니다. (KUJI 세트상품 합산 로직도 동일하게 수정)
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
 * [블록 4] AISPEL 피킹리스트 (V75.2 상단 버튼 보장 및 트래킹 병합)
 * v75.0 -> v75.2 변경점: 배송대행(LH/OH) 건의 Tracking 번호가 인쇄물에 표시되지 않던
 * 문제를 수정 (tracking_no 외 invoice_id/tracking/invoice_no/delivery_tracking_no 등
 * 후보 필드까지 확인하도록 확장하고, 트래킹번호+JAN코드 기준으로 합산/병합하도록 변경).
 * 버튼이 화면 구조에 따라 사라지던 문제도 주입 위치 후보를 늘려 보완함.
 * ------------------------------------------------------------ */
(function() {
    'use strict';

    const ITEMS_PER_PAGE = 18;

    function injectCustomButton() {
        if (document.getElementById('custom-picking-btn')) return;

        let targetArea = document.getElementById('btnDownloadPickingList');

        if (!targetArea) {
            targetArea = document.querySelector('.card-header .btn-group') ||
                         document.querySelector('.card-body .mb-3') ||
                         document.querySelector('button[type="submit"]')?.parentNode ||
                         document.querySelector('.table-responsive')?.parentNode;
        }

        if (targetArea) {
            const customBtn = document.createElement('button');
            customBtn.id = 'custom-picking-btn';
            customBtn.type = 'button';
            customBtn.innerHTML = '🔥 통합 초광속 수집';
            customBtn.className = 'btn btn-danger btn-sm waves-effect';
            customBtn.style.cssText = "background-color: #ff3e1d !important; color: white !important; margin-left: 10px; margin-right: 10px; border: none; padding: 6px 18px; font-weight: bold; border-radius: 4px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); z-index: 9999;";

            customBtn.onclick = function() {
                const allCheckedBoxes = Array.from(document.querySelectorAll('input.sub_checkbox:checked'));
                if (allCheckedBoxes.length === 0) return alert('항목을 선택해 주세요!');

                let normalBoxes = [];
                let issueBoxes = [];

                allCheckedBoxes.forEach(box => {
                    const tr = box.closest('tr');
                    const userLink = tr ? tr.querySelector('td:nth-child(6) a') : null;
                    const isIssue = userLink && (userLink.classList.contains('text-warning') || userLink.classList.contains('text-danger'));

                    if (isIssue) {
                        issueBoxes.push(box);
                    } else {
                        normalBoxes.push(box);
                    }
                });

                if (issueBoxes.length > 0) {
                    showCustomModal({
                        issueCount: issueBoxes.length,
                        totalCount: allCheckedBoxes.length,
                        normalCount: normalBoxes.length,
                        onExclude: () => {
                            if (normalBoxes.length === 0) return alert('출력할 수 있는 정상 항목이 없습니다.');
                            executeHarvest(normalBoxes);
                        },
                        onAll: () => {
                            executeHarvest(allCheckedBoxes);
                        }
                    });
                } else {
                    executeHarvest(allCheckedBoxes);
                }
            };

            if (targetArea.id === 'btnDownloadPickingList') {
                targetArea.parentNode.insertBefore(customBtn, targetArea.nextSibling);
            } else {
                targetArea.appendChild(customBtn);
            }
        }
    }

    function showCustomModal(options) {
        const existing = document.getElementById('aispel-custom-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'aispel-custom-modal';
        modal.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); display:flex; justify-content:center; align-items:center; z-index:999999; font-family:'Malgun Gothic';";
        modal.innerHTML = `
            <div style="background:white; width:450px; border-radius:12px; box-shadow:0 8px 30px rgba(0,0,0,0.3); padding:24px; text-align:center;">
                <div style="font-size:44px; margin-bottom:12px;">⚠️</div>
                <h3 style="margin:0 0 10px 0; font-size:18px; font-weight:bold; color:#333;">주의 회원사 감지 안내</h3>
                <p style="margin:0 0 24px 0; font-size:14px; color:#555; line-height:1.5; text-align:left; background:#f8f9fa; padding:15px; border-radius:8px; border-left:4px solid #ff3e1d;">
                    선택하신 주문 중 <span style="color:#ff3e1d; font-weight:bold;">주의 회원사 데이터가 ${options.issueCount}건</span> 포함되어 있습니다.<br>출력 방식을 선택해 주세요.
                </p>
                <div style="display:flex; justify-content:center; gap:10px;">
                    <button id="modal-btn-exclude" style="flex:1; padding:10px 0; background:#ff3e1d; border:none; color:white; font-weight:bold; border-radius:6px; cursor:pointer; font-size:13px;">제외 출력 (${options.normalCount}건)</button>
                    <button id="modal-btn-all" style="flex:1; padding:10px 0; background:#3b82f6; border:none; color:white; font-weight:bold; border-radius:6px; cursor:pointer; font-size:13px;">전체 출력 (${options.totalCount}건)</button>
                    <button id="modal-btn-cancel" style="width:80px; padding:10px 0; background:#6b7280; border:none; color:white; font-weight:bold; border-radius:6px; cursor:pointer; font-size:13px;">취소</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        document.getElementById('modal-btn-exclude').onclick = function() { modal.remove(); options.onExclude(); };
        document.getElementById('modal-btn-all').onclick = function() { modal.remove(); options.onAll(); };
        document.getElementById('modal-btn-cancel').onclick = function() { modal.remove(); };
    }

    function executeHarvest(targetBoxes) {
        const originBtn = document.getElementById('btnDownloadPickingList');
        const originalWindowOpen = window.open;
        window.open = function(url) {
            if (url && (url.includes('picking_pdf') || url.includes('picking_print'))) return { close: function() {} };
            return originalWindowOpen.apply(this, arguments);
        };

        document.querySelectorAll('input.sub_checkbox').forEach(b => b.checked = false);
        targetBoxes.forEach(b => b.checked = true);
        if (originBtn) originBtn.click();

        setTimeout(() => {
            window.open = originalWindowOpen;
            startApiHarvest(targetBoxes);
        }, 500);
    }

    function extractLocationWithQty(it) {
        let totalQty = parseInt(it.quantity || it.display_quantity || it.qty || "1");

        let subList = it.locations || it.location_details || it.stock_locations || it.locations_info;
        if (Array.isArray(subList) && subList.length > 0) {
            return subList.map(s => {
                let lName = s.location || s.location_name || s.name || "미지정";
                let lQty = s.qty || s.quantity || s.count || 1;
                return `${lName} : ${lQty}개`;
            }).join('<br>');
        }

        let rawLoc = String(it.location_str || it.location || it.location_name || "").trim();

        if (/:\s*\d+개/.test(rawLoc)) {
            return rawLoc.replace(/\|/g, '<br>').replace(/\s*\/\s*/g, '<br>');
        }

        let locParts = rawLoc.split(/[\n|\/]+/).map(s => s.trim()).filter(Boolean);

        if (locParts.length > 1) {
            let qtyArr = it.location_qty || it.qtys || it.quantities;
            if (Array.isArray(qtyArr) && qtyArr.length === locParts.length) {
                return locParts.map((loc, idx) => `${loc} : ${qtyArr[idx]}개`).join('<br>');
            }

            let remainQty = totalQty;
            let resultLines = [];
            for (let i = 0; i < locParts.length; i++) {
                if (i === locParts.length - 1) {
                    resultLines.push(`${locParts[i]} : ${remainQty}개`);
                } else {
                    let allocated = Math.max(1, Math.floor(totalQty / locParts.length));
                    resultLines.push(`${locParts[i]} : ${allocated}개`);
                    remainQty -= allocated;
                }
            }
            return resultLines.join('<br>');
        }

        if (locParts.length === 1 && locParts[0] !== "") {
            return `${locParts[0]} : ${totalQty}개`;
        }

        return "미지정";
    }

    async function startApiHarvest(checkedBoxes) {
        showOverlay(`🚀 데이터를 수집하여 이중 정렬 가공 중...`);
        const collectedGroups = [];
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

        for (let i = 0; i < checkedBoxes.length; i++) {
            const box = checkedBoxes[i];
            const tr = box.closest('tr');
            const shippingMethodText = tr ? tr.querySelector('td:nth-child(3)')?.innerText.toUpperCase() || "" : "";
            const isOcean = shippingMethodText.includes("OCEAN");

            const task = {
                id: box.getAttribute('data-id'),
                outNum: tr ? tr.querySelector('td:nth-child(4)')?.innerText.trim() || 'N/A' : 'N/A',
                orderDate: tr ? tr.querySelector('td:nth-child(5)')?.innerText.trim() || '-' : '-',
                receiver: box.getAttribute('data-name') || '-',
                type: box.getAttribute('data-type') || (tr && tr.innerText.includes('배송대행') ? 'delivery' : 'shop'),
                isOcean: isOcean,
                originalIndex: i
            };

            try {
                const formData = new FormData();
                formData.append('id', task.id);
                formData.append('type', task.type);
                if (csrfToken) formData.append('_token', csrfToken);

                const response = await fetch('/admin/shipping/ajax_get_packing', {
                    method: 'POST',
                    body: formData,
                    headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-TOKEN': csrfToken }
                });

                const rawResponse = await response.text();
                let jsonData = JSON.parse(rawResponse);
                if (typeof jsonData === 'string') jsonData = JSON.parse(jsonData);

                let items = [];
                const findArray = (obj) => {
                    if (!obj || typeof obj !== 'object') return;
                    for (let key in obj) {
                        if (Array.isArray(obj[key]) && obj[key].length > 0) { if (obj[key].length > items.length) items = obj[key]; }
                        else if (typeof obj[key] === 'object') { findArray(obj[key]); }
                    }
                };
                findArray(jsonData);

                if (items.length > 0) {
                    let processedItems = items.map(it => {
                        let trackNo = String(it.tracking_no || it.invoice_id || it.tracking || it.invoice_no || it.delivery_tracking_no || "").trim();

                        return {
                            imgHtml: `<img src="${it.image_url_thumb || it.image_url || ''}" style="max-width:55px; max-height:45px;">`,
                            productName: (it.title || it.item_name || it.product_name || "").trim(),
                            janCode: (it.jancode || it.jan_code || it.item_id || "-").trim(),
                            qty: parseInt(it.quantity || it.display_quantity || it.qty || "1"),
                            location: extractLocationWithQty(it),
                            tracking: trackNo
                        };
                    });

                    const combinedMap = new Map();
                    processedItems.forEach(item => {
                        // [수정] 잔코드만으로 합치면 같은 잔코드를 잘못 입력한 서로 다른 상품이
                        // 하나로 섞여버릴 수 있어, 상품명까지 같이 확인해서 합산 기준으로 삼음.
                        const key = `${item.tracking}_${item.janCode}_${item.productName.trim()}`;
                        if (combinedMap.has(key)) {
                            const existing = combinedMap.get(key);
                            existing.qty += item.qty;
                            if (existing.location !== item.location && !existing.location.includes(item.location)) {
                                existing.location += `<br>${item.location}`;
                            }
                        } else {
                            combinedMap.set(key, { ...item });
                        }
                    });
                    processedItems = Array.from(combinedMap.values());

                    if (!task.type.includes('delivery')) {
                        let kujiMap = new Map();
                        let filteredItems = [];

                        processedItems.forEach(item => {
                            const isKuji = item.productName.toUpperCase().includes("KUJI");
                            if (isKuji) {
                                // [수정] 여기도 잔코드만으로 합치던 것을 잔코드+상품명 기준으로 변경.
                                const kujiKey = `${item.janCode}_${item.productName.trim()}`;
                                if (kujiMap.has(kujiKey)) {
                                    kujiMap.get(kujiKey).qty += item.qty;
                                } else {
                                    kujiMap.set(kujiKey, item);
                                    filteredItems.push(item);
                                }
                            } else {
                                filteredItems.push(item);
                            }
                        });
                        processedItems = filteredItems;
                    }

                    processedItems.sort((a, b) => {
                        if (a.tracking !== b.tracking) return a.tracking.localeCompare(b.tracking);
                        if (a.location !== b.location) return a.location.localeCompare(b.location);

                        const aIsMain = a.productName.toUpperCase().includes("KUJI") && /S\d+/i.test(a.janCode);
                        const bIsMain = b.productName.toUpperCase().includes("KUJI") && /S\d+/i.test(b.janCode);

                        if (aIsMain && !bIsMain) return -1;
                        if (!aIsMain && bIsMain) return 1;
                        return 0;
                    });

                    let reqSet = new Set();
                    const packingData = jsonData.packing || {};
                    if (parseInt(packingData.no_inspection) === 1) reqSet.add("무검품 출하");
                    if (parseInt(packingData.add_material) === 1) reqSet.add("완충재 추가");

                    ['put_sticker_str', 'remove_price_str', 'take_picture_str', 'seperate_str'].forEach(key => {
                        const val = jsonData[key];
                        if (val && typeof val === 'string') {
                            val.split(/No\d+\s*[:：]\s*/i).forEach(p => {
                                let clean = p.replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim();
                                if(clean.length > 1) reqSet.add(clean);
                            });
                        }
                    });

                    let reqMsg = (jsonData.requirement || packingData.requirement || "").trim();
                    let cleanMsg = reqMsg.replace(/^\[?추가\s?요청\]?\s*/i, "");

                    for (let p = 0; p * ITEMS_PER_PAGE < processedItems.length; p++) {
                        collectedGroups.push({
                            outNum: task.outNum, receiver: task.receiver, orderDate: task.orderDate,
                            requests: Array.from(reqSet),
                            requirementMsg: cleanMsg,
                            isOcean: task.isOcean,
                            items: processedItems.slice(p * ITEMS_PER_PAGE, (p + 1) * ITEMS_PER_PAGE),
                            pageNum: p + 1, totalPage: Math.ceil(processedItems.length / ITEMS_PER_PAGE),
                            originalIndex: task.originalIndex
                        });
                    }
                }
            } catch (e) { console.error(e); }
        }

        if (collectedGroups.length > 0) {
            collectedGroups.sort((a, b) => {
                if (a.originalIndex !== b.originalIndex) {
                    return b.originalIndex - a.originalIndex;
                }
                return a.pageNum - b.pageNum;
            });

            openPrintWindow(collectedGroups);
        }
        document.getElementById('harvest-overlay')?.remove();
    }

    function showOverlay(msg) {
        let overlay = document.getElementById('harvest-overlay');
        if (!overlay) {
            overlay = document.createElement('div'); overlay.id = 'harvest-overlay';
            overlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); color:white; display:flex; justify-content:center; align-items:center; z-index:999999; font-weight:bold; font-size:22px; text-align:center; white-space:pre-line;";
            document.body.appendChild(overlay);
        }
        overlay.innerText = msg;
    }

    function openPrintWindow(groups) {
        const printWin = window.open('', '_blank');
        if(!printWin) return;
        const safeData = JSON.stringify(groups).replace(/[\u007F-\uFFFF]/g, chr => "\\u" + ("0000" + chr.charCodeAt(0).toString(16)).substr(-4));

        const style = `<style>
            @page { size: A4; margin: 0; }
            body { background: #555; margin: 0; padding: 0; }
            .sheet { background: white; width: 210mm; min-height: 296mm; padding: 10mm; margin: 20mm auto; box-sizing: border-box; font-family: 'Malgun Gothic'; position: relative; box-shadow: 0 0 10px rgba(0,0,0,0.5); page-break-after: always; overflow: hidden; }
            @media print { body { background: none; } .no-print { display: none !important; } .sheet { margin: 0 !important; box-shadow: none !important; min-height: 296mm !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
            .watermark-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0; opacity: 0.1; display: none; }
            .is-ocean .watermark-overlay { display: block; background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='150' height='100'><text x='50%' y='50%' font-size='20' font-weight='900' fill='%23007bff' transform='rotate(-30, 75, 50)' text-anchor='middle'>OCEAN</text></svg>"); background-repeat: repeat; }
            .content-wrapper { position: relative; z-index: 1; }
            table { background-color: transparent !important; }
            tr { page-break-inside: avoid; }
        </style>`;

        printWin.document.write(`<html><head>${style}<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script></head><body>
            <div class="no-print" style="position:fixed; top:10px; right:10px; z-index:1000;"><button onclick="window.print()" style="padding:4px 10px; background:#ff3e1d; color:white; border-radius:4px; font-weight:bold; border:none; cursor:pointer;">🖨️ 인쇄</button></div>
            <div id="content-area"></div>
            <script>
                const groups = ${safeData};
                let html = "";

                groups.forEach((g, idx) => {
                    let rows = "";
                    let currentMainNo = 0;
                    let currentSubNo = 0;

                    let existingMainJancodes = new Set();
                    g.items.forEach(it => {
                        const isKuji = it.productName.toUpperCase().includes("KUJI");
                        const isSetMain = isKuji && /S\\d+/i.test(it.janCode);
                        if (isSetMain) {
                            const baseCode = it.janCode.split(/S/i)[0].replace(/[- ]+$/, "").trim();
                            existingMainJancodes.add(baseCode);
                        }
                    });

                    g.items.forEach((it, i) => {
                        let rowspan = 1;
                        let skip = false;

                        if (i > 0 && it.tracking && g.items[i-1].tracking === it.tracking) {
                            skip = true;
                        } else if (it.tracking) {
                            for (let j = i + 1; j < g.items.length; j++) {
                                if (g.items[j].tracking === it.tracking) rowspan++;
                                else break;
                            }
                        }

                        const isKuji = it.productName.toUpperCase().includes("KUJI");
                        const baseJanCode = it.janCode.split(/[- ]/)[0].trim();

                        const isSetMain = isKuji && /S\\d+/i.test(it.janCode);
                        const isRealSubItem = isKuji && !isSetMain && existingMainJancodes.has(baseJanCode);

                        let rowStyle = 'style="height:45px;"';
                        let nameTdStyle = 'style="border:1.5px solid #000; padding:2px 6px; font-size:13px; font-weight:bold; text-align:center; word-break:break-all; line-height:1.2;"';
                        let janTdStyle = 'style="border:1.5px solid #000; text-align:center; font-size:16px; font-weight:bold; letter-spacing:-1px; word-break:break-all; padding:0 4px;"';

                        let qtyTdHtml = '<td style="border:1.5px solid #000; text-align:center; font-size:26px; color:red; font-weight:900;">' + it.qty + '</td>';

                        let displayNo = "";
                        if (isRealSubItem) {
                            currentSubNo++;
                            displayNo = currentMainNo + "-" + currentSubNo;
                        } else {
                            currentMainNo++;
                            currentSubNo = 0;
                            displayNo = currentMainNo;
                        }

                        if (isKuji) {
                            if (isSetMain) {
                                rowStyle = 'style="height:45px; background-color: #fff9c4 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;"';

                                const match = it.janCode.match(/S(\\d+)/i);
                                if (match && match[1]) {
                                    const divisor = parseInt(match[1]);
                                    if (divisor > 0) {
                                        const setVal = Math.floor(it.qty / divisor);
                                        qtyTdHtml = '<td style="border:1.5px solid #000; text-align:center; vertical-align:middle; padding:2px 0;"><div style="font-size:26px; color:red; font-weight:900; line-height:1;">' + it.qty + '</div><div style="font-size:11px; color:#ff3e1d; font-weight:bold; margin-top:1px;">(' + setVal + 'set)</div></td>';
                                    }
                                }
                            } else if (isRealSubItem) {
                                nameTdStyle = 'style="border:1.5px solid #000; padding:2px 6px; font-size:13px; font-weight:500; color:#555; text-align:center; word-break:break-all; line-height:1.2;"';
                                janTdStyle = 'style="border:1.5px solid #000; text-align:center; font-size:15px; font-weight:500; color:#555; letter-spacing:-1px; word-break:break-all; padding:0 4px;"';
                                it.productName = '<div style="display:flex; align-items:center; width:100%;"><span style="font-weight:bold; color:#ff3e1d; margin-right:5px; padding-left:5px;">└</span><span style="flex:1; text-align:center; padding-right:15px;">' + it.productName + '</span></div>';
                            }
                        }

                        let locContent = '<div style="font-weight:900; font-size:14px; line-height:1.3; text-align:center;">' + it.location + '</div>';
                        if (it.tracking) {
                            locContent += '<div style="font-size:12px; color:#3b82f6; font-weight:bold; margin-top:3px; text-align:center;">' + it.tracking + '</div>';
                        }

                        rows += '<tr ' + rowStyle + '>' +
                            '<td style="border:1.5px solid #000; text-align:center; font-weight:bold; font-size:12px;">' + displayNo + '</td>' +
                            '<td style="border:1.5px solid #000; text-align:center;">' + it.imgHtml + '</td>' +
                            '<td ' + nameTdStyle + '>' + it.productName + '</td>' +
                            '<td ' + janTdStyle + '>' + it.janCode + '</td>' +
                            qtyTdHtml +
                            (!skip ? '<td rowspan="' + rowspan + '" style="border:1.5px solid #000; text-align:center; background:#fff; padding:4px; max-width:140px; vertical-align:middle;">' + locContent + '</td>' : '') +
                            '<td style="border:1.5px solid #000; text-align:center; font-size:20px; color:#bbb;">□</td>' +
                            '</tr>';
                    });

                    const reqString = g.requests.length > 0 ? '🚩 ' + g.requests.join(' / ') : '';
                    const oceanLabel = g.isOcean ? '<div style="color:#007bff; font-weight:900; font-size:22px; margin-left:20px; border:3px solid #007bff; padding:2px 10px; border-radius:5px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">해운(OCEAN)</div>' : '';
                    const watermarkHtml = g.isOcean ? '<div class="watermark-overlay"></div>' : '';

                    html += '<div class="sheet ' + (g.isOcean ? 'is-ocean' : '') + '">' +
                                watermarkHtml +
                                '<div class="content-wrapper">' +
                                    '<div style="display:flex; justify-content:space-between; align-items:flex-start;">' +
                                        '<div style="flex:1;">' +
                                            '<div style="display:flex; align-items:center;">' +
                                                '<h1 style="font-size:32px; margin:0; font-weight:900; letter-spacing:2px;">PICKING LIST</h1>' +
                                                oceanLabel +
                                            '</div>' +
                                            '<div style="font-size:14px; margin-top:5px; font-weight:bold; color:#333;">' +
                                                '<span style="margin-right:15px;">TO: '+g.receiver+'</span><span>DATE: '+g.orderDate+'</span>' +
                                            '</div>' +
                                            (g.pageNum === 1 && g.requirementMsg ? '<div style="margin-top:10px; font-size:14px; font-weight:bold; color:#d32f2f; white-space:pre-wrap; line-height:1.4; border-left:3px solid #d32f2f; padding-left:10px;">' + g.requirementMsg + '</div>' : '') +
                                        '</div>' +
                                        '<div style="text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:5px; min-width:200px;">' +
                                            '<div style="font-size:16px; font-weight:bold; color:#ff3e1d;">[ '+g.pageNum+' / '+g.totalPage+' ]</div>' +
                                            '<div style="display:flex; align-items:stretch; gap:10px;">' +
                                                '<div style="border:1px solid #000; width:125px; height:45px; display:flex; flex-direction:column;">' +
                                                    '<div style="font-size:9px; font-weight:bold; text-align:center; border-bottom:1px solid #000; background:#f4f4f4;">피킹 담당자</div><div style="flex:1;"></div>' +
                                                '</div>' +
                                                '<div id="qr-'+idx+'"></div>' +
                                            '</div>' +
                                        '</div>' +
                                    '</div>' +
                                    '<div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2.5px solid #000; padding-bottom:5px; margin-bottom:10px; margin-top:5px;">' +
                                        '<div style="color:#ff0000; font-weight:900; font-size:12px; max-width:70%;">' + (g.pageNum===1?reqString:"") + '</div>' +
                                        '<div style="font-size:22px; font-weight:900; color:#000;">'+g.outNum+'</div>' +
                                    '</div>' +
                                    '<table style="width:100%; border-collapse:collapse; table-layout:fixed; border:2px solid #000;">' +
                                        '<thead style="background:#e8e8e8; font-size:13px; font-weight:bold;">' +
                                            '<tr style="height:35px;">' +
                                                '<th width="35" style="border:1.5px solid #000;">No</th><th width="65" style="border:1.5px solid #000;">이미지</th><th width="auto" style="border:1.5px solid #000;">상품명</th><th width="180" style="border:1.5px solid #000;">JANCODE</th><th width="50" style="border:1.5px solid #000;">수량</th><th width="140" style="border:1.5px solid #000;">로케이션 / 트래킹</th><th width="35" style="border:1.5px solid #000;">V</th>' +
                                            '</tr>' +
                                        '</thead>' +
                                        '<tbody>'+rows+'</tbody>' +
                                    '</table>' +
                                '</div>' +
                            '</div>';
                });
                document.getElementById('content-area').innerHTML = html;
                groups.forEach((g, i) => { if(g.pageNum === 1) new QRCode(document.getElementById("qr-" + i), {text: g.outNum, width: 80, height: 80}); });
            </script>
        </body></html>`);
        printWin.document.close();
    }

    setInterval(injectCustomButton, 500);
})();

/* ------------------------------------------------------------
 * [블록 5] 포장 - 오션 강조 배너 v1.1
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
        const shippingMethodText = row.find('td').eq(1).text();
        isOceanRow = shippingMethodText.includes('OCEAN');
    });

    $(document).on('ajaxComplete', function(event, xhr, settings) {
        if (settings.url.includes('ajax_get_packing')) {
            setTimeout(function() {
                const modalBody = $('#packingModal .modal-body');
                const modalHeader = $('#packingModal .modal-header');

                $('.ocean-banner').remove();
                modalHeader.removeClass('ocean-modal-header');

                if (isOceanRow) {
                    const bannerHtml = `
                        <div class="ocean-banner">
                            <span class="ocean-text-blink">⚠️ [OCEAN 件] ⚠️</span><br>
                            この注文は <span style="text-decoration: underline;">OCEAN </span> 海上輸送の対象です.
                        </div>
                    `;
                    modalBody.prepend(bannerHtml);

                    modalHeader.addClass('ocean-modal-header');

                    $('#packingModalTitle').append(' <b style="color:red;">[OCEAN 대상]</b>');
                }
            }, 150);
        }
    });

})();
