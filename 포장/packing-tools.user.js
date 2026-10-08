// ==UserScript==
// @name         [포장] 포장출고 통합 도구 (회원사메모 + 에토와르매칭 + LH/OH중복알림 + 오션배너 + 무검품출하알림)
// @namespace    https://github.com/asics67-lab/tampermonkey-scripts
// @version      1.5.0
// @description  포장/출고(shipping/packing) 화면 통합본. 원본: 회원사 특이사항(메모) 공유 시스템 v4.7 + 에토와르 주소 매칭 v21.0 + LH/OH Tracking 중복 알림 v1.4.0 + 포장 오션 강조 배너 v1.1 + 무검품출하 Tracking 알림 v1.0
// @author       물류팀
// @match        https://www.platform.co.jp/admin/shipping/packing*
// @match        https://platform.co.jp/admin/shipping/packing*
// @match        https://www.platform.co.jp/admin/users*
// @match        https://platform.co.jp/admin/users*
// @match        https://www.platform.co.jp/admin/shipping/packingfinished*
// @match        https://platform.co.jp/admin/shipping/packingfinished*
// @match        https://www.platform.co.jp/admin/shipping/finished*
// @match        https://platform.co.jp/admin/shipping/finished*
// @match        *://*.aispel.com/admin/shipping/packing*
// @match        https://platform.aispel.com/admin/shipping/packing*
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js
// @grant        GM_xmlhttpRequest
// @updateURL    https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/포장/packing-tools.user.js
// @downloadURL  https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/포장/packing-tools.user.js
// ==/UserScript==
// [www 없는 주소 대응] platform.co.jp(www 없이) 로 접속해도 동작하도록 @match 추가, 사이트 내부 요청 주소를 현재 접속 주소 기준(location.origin)으로 변경

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
 *
 *  v1.4.1 긴급 수정 (보고: "적용 후 화면이 비활성화되어 새로고침도 안 되고 아무것도 안 움직인다")
 *  - [블록 4] v1.4.0의 모달 감시가 자기 자신이 만든 변경(배너 추가/삭제)에 다시 반응하는
 *    무한 반복에 빠져 브라우저가 멈췄습니다. 모달의 열림/닫힘 상태 변화만 감시하도록 고쳤습니다.
 *
 *  v1.5.0 추가 기능 (요청: "무검품출하 출고요청에 들어간 Tracking이면 팝업")
 *  - [블록 5] 포장 진행 창이 열리면, 그 출고건의 Tracking이 "무검품 출하"가 선택된
 *    출고요청(현재 출고건 포함)에 들어가 있는지 종합관리 검색 + 포장 데이터로 확인합니다.
 *    · 무검품출하 출고요청 1건 → 주황 팝업/배너 + 해당 Tracking 행에 "⚠ 無検品出荷" 표시.
 *      [該当Trackingの項目をまとめてチェック] 로 그 Tracking 상품을 한 번에 체크 가능.
 *    · 같은 Tracking에 무검품출하 출고요청 2건 이상 → 빨간 "梱包進行不可" 팝업.
 *      포장완료 버튼·중량칸 Enter가 막히고, 관리자 확인 후 [管理者確認済み・進行] 으로만 통과.
 *    · 기준 건수는 블록 5 안의 BLOCK_MIN_COUNT 한 곳에서 바꿀 수 있습니다.
 *  - 같은 확인 로직이 피킹리스트(관리/05-피킹리스트)에도 들어 있습니다.
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
                    url: location.origin + '/admin/users',
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

                        const finalUrl = location.origin + '/admin/users?action=search&search_word=' + searchKeyword + '&autooppen=' + foundUserId;

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
            url: location.origin + "/admin/store/trackingno?pagesize=500",
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

        let targetUrl = location.origin + "/admin/store/trackingno?pagesize=500&user_id=" + encodeURIComponent(currentTargetClientCode) + "&supplier_id=25";

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

    const MGT_SEARCH_URL = location.origin + '/admin/mgt/index';
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
    // [v1.4.1 긴급 수정] v1.4.0은 모달 "안쪽 전체(subtree+childList)"를 감시하면서,
    // 감시 콜백 안에서 배너를 지웠다 다시 넣었습니다(= 모달 안쪽을 또 변경). 그러면
    // 그 변경이 다시 감시에 걸려 콜백이 또 실행되는 무한 반복이 일어나, OCEAN 건의
    // 포장 모달을 여는 순간 브라우저가 멈추고 새로고침도 안 되는 문제가 있었습니다.
    // 이제 모달 "자신"의 class/style 속성만 감시하고, 모달이 닫힘→열림으로 바뀌는
    // 순간에만 배너를 한 번 넣습니다(이미 있으면 다시 넣지 않음). 모달 내용이 조금
    // 늦게 채워지는 경우를 대비해 열린 뒤 잠시 동안 몇 번 더 확인합니다.
    const packingModalEl = document.getElementById('packingModal');
    if (packingModalEl) {
        const OCEAN_BANNER_HTML = `
            <div class="ocean-banner">
                <span class="ocean-text-blink">⚠️ [OCEAN 件] ⚠️</span><br>
                この注文は <span style="text-decoration: underline;">OCEAN </span> 海上輸送の対象です.
            </div>
        `;

        const isModalVisible = () =>
            packingModalEl.classList.contains('show') || packingModalEl.style.display === 'block';

        const clearOceanBanner = () => {
            $('#packingModal .ocean-banner').remove();
            $('#packingModal .modal-header.ocean-modal-header').removeClass('ocean-modal-header');
            $('#packingModalTitle .ocean-title-tag').remove();
        };

        const ensureOceanBanner = () => {
            if (!isModalVisible() || !isOceanRow) return;
            const modalBody = $('#packingModal .modal-body');
            const modalHeader = $('#packingModal .modal-header');
            if (modalBody.length && modalBody.children('.ocean-banner').length === 0) {
                modalBody.prepend(OCEAN_BANNER_HTML);
            }
            if (modalHeader.length && !modalHeader.hasClass('ocean-modal-header')) {
                modalHeader.addClass('ocean-modal-header');
            }
            const title = $('#packingModalTitle');
            if (title.length && !title.text().includes('[OCEAN 대상]')) {
                title.append(' <b class="ocean-title-tag" style="color:red;">[OCEAN 대상]</b>');
            }
        };

        let wasVisible = isModalVisible();
        let recheckTimers = [];

        const modalObserver = new MutationObserver(() => {
            const visible = isModalVisible();
            if (visible === wasVisible) return; // 열림/닫힘 상태가 바뀔 때만 반응
            wasVisible = visible;

            recheckTimers.forEach(clearTimeout);
            recheckTimers = [];

            if (visible) {
                [0, 150, 400, 800, 1500].forEach(ms => {
                    recheckTimers.push(setTimeout(ensureOceanBanner, ms));
                });
            } else {
                clearOceanBanner();
            }
        });
        // 모달 자신의 class/style 속성만 감시 (안쪽 내용 변경은 감시하지 않음 → 무한 반복 방지)
        modalObserver.observe(packingModalEl, {
            attributes: true,
            attributeFilter: ['class', 'style']
        });
    }

})();

/* ------------------------------------------------------------
 * [블록 5] 무검품출하 Tracking 알림 v1.0 (packing-tools v1.5.0)
 *  - 포장 진행 창이 열리면, 그 출고건의 Tracking이 "무검품 출하"가 선택된
 *    출고요청에 들어가 있는지 확인합니다. (현재 출고건 포함)
 *    · 1건  → 안내 팝업 + 해당 Tracking 행에 "無検品" 표시
 *    · 2건 이상 → 진행 불가 팝업(빨강) + 포장완료 버튼/Enter 차단
 *      (관리자 확인 후 [管理者確認済み・進行] 으로만 통과)
 * ------------------------------------------------------------ */
(function () {
    'use strict';

    /* ==========================================================
     * [무검품출하 Tracking 확인 - 공용 로직]
     *  (포장/packing-tools.user.js 와 관리/05-피킹리스트/picking-list-tools.user.js 에
     *   똑같은 코드가 들어 있습니다. 한쪽을 고치면 다른 쪽도 같이 고쳐 주세요.)
     *  1) 종합관리에서 Tracking번호로 검색 → 그 Tracking이 들어간 LH/OH 출고요청 목록
     *     (종합관리 검색은 상품 중 하나라도 그 Tracking이면 나오고, 일부만 같아도 나오므로)
     *  2) 각 출고요청의 포장 데이터(ajax_get_packing)를 읽어서
     *     - 무검품 출하 선택 여부(no_inspection)
     *     - 실제로 그 Tracking 상품이 들어 있는지 를 확인합니다.
     *  ※ 읽기 전용 조회만 하며 사이트 데이터는 바꾸지 않습니다.
     * ========================================================== */
    const NoInsp = (() => {
        // ★ 무검품출하 출고요청이 같은 Tracking에 몇 건 이상이면 "진행 불가"로 볼지
        const BLOCK_MIN_COUNT = 2;
        const DELIVERY_NO_RE = /^(LH|OH)/i;
        const CANCEL_RE = /취소|キャンセル/;
        const CACHE_TTL_MS = 3 * 60 * 1000;
        const searchCache = new Map();   // trackingNo → {at, data}
        const orderCache = new Map();    // type|id → {at, data}

        const norm = (v) => String(v || '').replace(/[\s\-]/g, '').toUpperCase();
        const txt = (el) => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
        const csrf = () => (document.querySelector('meta[name="csrf-token"]') || {}).content || '';
        const fresh = (c) => c && Date.now() - c.at < CACHE_TTL_MS;

        async function searchByTracking(trackingNo) {
            const c = searchCache.get(trackingNo);
            if (fresh(c)) return c.data;
            const url = new URL(location.origin + '/admin/mgt/index');
            url.searchParams.set('action', 'search');
            url.searchParams.set('tracking_no', trackingNo);
            url.searchParams.set('pagesize', '500');
            const res = await fetch(url.toString(), { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
            if (!res.ok) throw new Error('総合管理 HTTP ' + res.status);
            const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
            const data = [];
            const seen = new Set();
            doc.querySelectorAll('table.table-bordered tbody tr').forEach((row) => {
                if (row.cells.length < 15) return;
                const link = row.cells[4] && row.cells[4].querySelector('.show-delivery-detail-btn');
                if (!link) return;
                const deliveryNo = txt(link).split(/\s+/)[0];
                if (!DELIVERY_NO_RE.test(deliveryNo) || seen.has(deliveryNo)) return;
                seen.add(deliveryNo);
                const badge = row.cells[14] && row.cells[14].querySelector('.badge');
                data.push({
                    id: String(link.dataset.orderid || ''),
                    type: String(link.dataset.type || 'delivery'),
                    deliveryNo: deliveryNo,
                    status: txt(badge || row.cells[14]) || '-',
                });
            });
            searchCache.set(trackingNo, { at: Date.now(), data: data });
            return data;
        }

        async function getOrder(id, type) {
            const key = type + '|' + id;
            const c = orderCache.get(key);
            if (fresh(c)) return c.data;
            const res = await fetch(location.origin + '/admin/shipping/ajax_get_packing', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': csrf(),
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                },
                body: 'type=' + encodeURIComponent(type) + '&id=' + encodeURIComponent(id),
            });
            if (!res.ok) throw new Error('梱包データ HTTP ' + res.status);
            let json = await res.json();
            if (typeof json === 'string') json = JSON.parse(json);
            const p = (json && json.packing) || {};
            const items = p.order_form_delivery_details || p.manual_order_form_jancode_details || [];
            const data = {
                noInspection: parseInt(p.no_inspection, 10) === 1,
                trackings: new Set(items.map((it) => norm(it.tracking_no)).filter(Boolean)),
            };
            orderCache.set(key, { at: Date.now(), data: data });
            return data;
        }

        async function mapLimit(list, limit, fn) {
            const out = new Array(list.length);
            let i = 0;
            const worker = async () => {
                while (i < list.length) {
                    const k = i++;
                    out[k] = await fn(list[k], k);
                }
            };
            await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
            return out;
        }

        /**
         * trackingNos: 현재 출고건의 Tracking 목록
         * current: { id, deliveryNo, noInspection } (현재 출고건. 없으면 null)
         * 결과: { list: [{ trackingNo, orders, noInspOrders, blocked }], error }
         *   - list 에는 무검품출하 출고요청이 1건 이상 걸린 Tracking만 들어갑니다.
         *   - orders: 그 Tracking이 들어간 출고요청 전체(취소 제외), noInspection/isCurrent 표시
         */
        async function check(trackingNos, current) {
            const uniq = Array.from(new Set((trackingNos || []).map((t) => String(t || '').trim()).filter(Boolean)));
            const curNo = current ? String(current.deliveryNo || '').trim() : '';
            const curId = current ? String(current.id || '') : '';
            const errors = [];
            const results = await mapLimit(uniq, 3, async (trackingNo) => {
                try {
                    const found = (await searchByTracking(trackingNo))
                        .filter((o) => !CANCEL_RE.test(o.status));
                    const orders = (await mapLimit(found, 4, async (o) => {
                        const isCurrent = (curId && o.id === curId) || (curNo && o.deliveryNo === curNo);
                        if (isCurrent) return Object.assign({}, o, { isCurrent: true, noInspection: !!current.noInspection });
                        try {
                            const d = await getOrder(o.id, o.type);
                            // 종합관리 검색은 일부만 같아도 나오므로, 실제로 같은 Tracking이 있는 건만 남김
                            if (!d.trackings.has(norm(trackingNo))) return null;
                            return Object.assign({}, o, { isCurrent: false, noInspection: d.noInspection });
                        } catch (e) {
                            errors.push(o.deliveryNo + ': ' + (e.message || e));
                            return null;
                        }
                    })).filter(Boolean);
                    if (current && curNo && !orders.some((o) => o.isCurrent)) {
                        orders.unshift({ id: curId, type: 'delivery', deliveryNo: curNo, status: '-', isCurrent: true, noInspection: !!current.noInspection });
                    }
                    orders.sort((a, b) => (b.isCurrent - a.isCurrent) || b.deliveryNo.localeCompare(a.deliveryNo));
                    const noInspOrders = orders.filter((o) => o.noInspection);
                    if (noInspOrders.length === 0) return null;
                    return { trackingNo: trackingNo, orders: orders, noInspOrders: noInspOrders, blocked: noInspOrders.length >= BLOCK_MIN_COUNT };
                } catch (e) {
                    errors.push(trackingNo + ': ' + (e.message || e));
                    return null;
                }
            });
            return { list: results.filter(Boolean), error: errors.join(' / ') };
        }

        return { check: check, norm: norm, BLOCK_MIN_COUNT: BLOCK_MIN_COUNT, DELIVERY_NO_RE: DELIVERY_NO_RE };
    })();

    const packingModalEl = document.getElementById('packingModal');
    if (!packingModalEl) return;

    const STATUS_JA = {
        '접수': '受付', '포장진행': '梱包進行', '포장완료': '梱包完了', '출고요청': '出荷依頼',
        '출고대기': '出荷待ち', '출고보류': '出荷保留', '출고완료': '出荷完了', '발송완료': '発送完了',
        '보류': '保留', '배송중': '配送中', '배송완료': '配送完了'
    };
    const jaStatus = (s) => STATUS_JA[String(s || '').replace(/\s+/g, '')] || s || '-';
    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // 현재 열린 포장창 상태
    let runToken = 0;
    let state = null; // { packingId, result, blocked, bypass }

    const style = document.createElement('style');
    style.textContent = `
        #ni-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 100002;
            display: flex; align-items: center; justify-content: center; }
        #ni-box { background: #fff; border-radius: 10px; width: min(720px, 94vw); max-height: 88vh;
            overflow: hidden; box-shadow: 0 12px 40px rgba(0,0,0,.3); font-family: "Public Sans", sans-serif; }
        #ni-box .ni-head { padding: 14px 18px; color: #fff; font-weight: 900; font-size: 1.15rem; }
        #ni-box.info .ni-head { background: #e65100; }
        #ni-box.block .ni-head { background: #c62828; }
        #ni-box .ni-body { padding: 14px 18px; overflow-y: auto; max-height: calc(88vh - 130px); font-size: .9rem; color: #222; }
        #ni-box .ni-msg { font-weight: 700; line-height: 1.5; margin-bottom: 10px; }
        #ni-box .ni-ko { font-size: .8rem; color: #666; font-weight: 400; }
        #ni-box .ni-t { border: 2px solid #ddd; border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; }
        #ni-box .ni-t.block { border-color: #c62828; background: #fff5f5; }
        #ni-box .ni-t.info { border-color: #e65100; background: #fff8f0; }
        #ni-box .ni-t-title { font-weight: 900; margin-bottom: 6px; }
        #ni-box .ni-chip { display: inline-block; border: 1.5px solid #888; border-radius: 4px; padding: 2px 7px;
            margin: 2px 4px 2px 0; background: #fff; font-size: .8rem; white-space: nowrap; }
        #ni-box .ni-chip.ni { border-color: #c62828; color: #c62828; font-weight: 900; }
        #ni-box .ni-chip.cur { background: #fff3cd; }
        #ni-box .ni-foot { padding: 12px 18px; border-top: 1px solid #eee; display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
        #ni-box .ni-foot button { border: none; border-radius: 5px; padding: 8px 14px; cursor: pointer; font-weight: 700; font-size: .85rem; }
        #ni-box .ni-ok { background: #696cff; color: #fff; }
        #ni-box .ni-check { background: #2e7d32; color: #fff; }
        #ni-box .ni-bypass { background: #8592a3; color: #fff; }
        .ni-banner { border: 3px solid #e65100; background: #fff3e0; color: #bf360c; font-weight: 900;
            padding: 10px 14px; margin: 0 0 10px; border-radius: 8px; font-size: 1.05rem; }
        .ni-banner.block { border-color: #c62828; background: #ffebee; color: #b71c1c; }
        .ni-banner.err { border-color: #e69500; background: #fff8e1; color: #8a5a00; font-size: .85rem; }
        .ni-row-badge { display: inline-block; margin-top: 3px; padding: 1px 6px; border-radius: 3px;
            background: #e65100 !important; color: #fff !important; font-size: 11px; font-weight: 900; }
        .ni-row-badge.block { background: #c62828 !important; }
    `;
    document.head.appendChild(style);

    const isVisible = () => packingModalEl.classList.contains('show') || packingModalEl.style.display === 'block';

    function closePopup() {
        const ov = document.getElementById('ni-overlay');
        if (ov) ov.remove();
    }

    function clearUI() {
        closePopup();
        packingModalEl.querySelectorAll('.ni-banner, .ni-row-badge').forEach((el) => el.remove());
    }

    function readCurrent() {
        const deliveryNo = ((document.getElementById('delivery_no') || {}).textContent || '').trim();
        const packingId = ((document.getElementById('packing_id') || {}).value || '').trim();
        const packingType = ((document.getElementById('packing_type') || {}).value || '').trim();
        const noInspection = ((document.getElementById('no_inspection') || {}).textContent || '').trim() !== '';
        const trackings = new Set();
        document.querySelectorAll('#packingItemsTbody .show_tracking_page, #packingItemsTbody td[data-trackingno]').forEach((el) => {
            const t = String(el.getAttribute('data-trackingno') || '').trim();
            if (t && t !== 'null' && t !== 'undefined') trackings.add(t);
        });
        return { deliveryNo, packingId, packingType, noInspection, trackings: Array.from(trackings) };
    }

    // 해당 Tracking 행들 (포장창 표 안)
    function rowsOfTracking(trackingNo) {
        const key = NoInsp.norm(trackingNo);
        return Array.from(document.querySelectorAll('#packingItemsTbody tr')).filter((tr) => {
            const el = tr.querySelector('.show_tracking_page, td[data-trackingno]');
            return el && NoInsp.norm(el.getAttribute('data-trackingno')) === key;
        });
    }

    function markRows(result) {
        packingModalEl.querySelectorAll('.ni-row-badge').forEach((el) => el.remove());
        result.list.forEach((t) => {
            // 같은 Tracking 행은 로케이션 칸이 합쳐져 있으므로, 링크가 있는 칸마다 한 번만 표시
            document.querySelectorAll('#packingItemsTbody .show_tracking_page').forEach((a) => {
                if (NoInsp.norm(a.getAttribute('data-trackingno')) !== NoInsp.norm(t.trackingNo)) return;
                const b = document.createElement('span');
                b.className = 'badge ni-row-badge' + (t.blocked ? ' block' : '');
                b.textContent = t.blocked ? '⛔ 無検品 ' + t.noInspOrders.length + '件・進行不可' : '⚠ 無検品出荷';
                a.insertAdjacentElement('afterend', b);
            });
        });
    }

    function showBanner(result, cur) {
        packingModalEl.querySelectorAll('.ni-banner').forEach((el) => el.remove());
        const body = packingModalEl.querySelector('.modal-body');
        if (!body) return;
        if (result.list.length > 0) {
            const blocked = result.list.some((t) => t.blocked);
            const div = document.createElement('div');
            div.className = 'ni-banner' + (blocked ? ' block' : '');
            div.innerHTML = blocked
                ? '⛔ 無検品出荷の依頼が同じTrackingに' + NoInsp.BLOCK_MIN_COUNT + '件以上あります → 梱包進行不可（管理者確認）'
                : (cur.noInspection
                    ? '⚠ 無検品出荷：検品なしでそのまま全量出荷'
                    : '⚠ このTrackingは無検品出荷の依頼に含まれています（別の出荷件）');
            div.innerHTML += ' <span style="font-size:.8rem;font-weight:700;">[' +
                result.list.map((t) => esc(t.trackingNo)).join(', ') + ']</span>';
            body.prepend(div);
        }
        if (result.error) {
            const e = document.createElement('div');
            e.className = 'ni-banner err';
            e.textContent = '⚠ 無検品出荷の確認に一部失敗しました（' + result.error + '）— 総合管理で確認してください';
            body.prepend(e);
        }
    }

    function checkRowsOf(trackingNos) {
        let n = 0;
        trackingNos.forEach((t) => rowsOfTracking(t).forEach((tr) => {
            const cb = tr.querySelector('input.sub_checkbox');
            if (cb && !cb.checked && !cb.disabled) { cb.click(); n++; }
        }));
        return n;
    }

    function showPopup(result, cur) {
        closePopup();
        const blocked = result.list.some((t) => t.blocked);
        const mgtUrl = (t) => location.origin + '/admin/mgt/index?action=search&tracking_no=' + encodeURIComponent(t);

        // 관련 출고건 구성이 똑같은 Tracking끼리는 한 칸으로 묶어서 표시 (무검품 출고건 1건에 Tracking 여러 개인 경우 등)
        const groups = [];
        result.list.forEach((t) => {
            const sig = (t.blocked ? 'B|' : 'I|') + t.orders.map((o) => o.deliveryNo + ':' + o.noInspection + ':' + o.status).join(',');
            const g = groups.find((x) => x.sig === sig);
            if (g) g.trackingNos.push(t.trackingNo);
            else groups.push(Object.assign({}, t, { sig: sig, trackingNos: [t.trackingNo] }));
        });

        const blocks = groups.map((t) => {
            const chips = t.orders.map((o) =>
                '<span class="ni-chip' + (o.noInspection ? ' ni' : '') + (o.isCurrent ? ' cur' : '') + '">' +
                esc(o.deliveryNo) + (o.isCurrent ? ' ← 現在' : '') +
                ' [' + esc(jaStatus(o.status)) + ']' + (o.noInspection ? ' 無検品' : '') + '</span>'
            ).join('');
            return '<div class="ni-t ' + (t.blocked ? 'block' : 'info') + '">' +
                '<div class="ni-t-title">Tracking No: ' + t.trackingNos.map(esc).join(', ') +
                ' — 無検品出荷の依頼 ' + t.noInspOrders.length + '件' +
                ' <a href="' + mgtUrl(t.trackingNo) + '" target="_blank" rel="noopener" style="font-weight:400;font-size:.8rem;margin-left:6px;">総合管理で確認</a></div>' +
                chips + '</div>';
        }).join('');

        let msg;
        if (blocked) {
            msg = '同じTrackingに無検品出荷の依頼が' + NoInsp.BLOCK_MIN_COUNT + '件以上あるため、梱包を進行できません。<br>管理者に確認してください。' +
                '<div class="ni-ko">같은 Tracking에 무검품출하 출고요청이 ' + NoInsp.BLOCK_MIN_COUNT + '건 이상 있어 포장을 진행할 수 없습니다. 관리자에게 확인해 주세요.</div>';
        } else if (cur.noInspection) {
            msg = 'この出荷件は「無検品出荷」です。検品せず、Trackingの荷物をそのまま全量出荷してください。' +
                '<div class="ni-ko">무검품출하 출고건입니다. 검품 없이 해당 Tracking 박스를 그대로 전량 출고합니다. 상품을 하나씩 찾거나 스캔할 필요가 없습니다.</div>';
        } else {
            msg = 'このTrackingは、別の「無検品出荷」の出荷依頼に含まれています。<br>このTrackingの商品は個別に探さず、管理者・出荷状態を確認してください。' +
                '<div class="ni-ko">이 Tracking은 다른 무검품출하 출고요청에 들어가 있습니다. 해당 Tracking 상품은 따로 찾지 말고 아래 출고건 상태를 확인해 주세요.</div>';
        }

        const ov = document.createElement('div');
        ov.id = 'ni-overlay';
        ov.innerHTML =
            '<div id="ni-box" class="' + (blocked ? 'block' : 'info') + '">' +
                '<div class="ni-head">' + (blocked ? '⛔ 無検品出荷 · 梱包進行不可' : '⚠ 無検品出荷 Tracking') + '</div>' +
                '<div class="ni-body"><div class="ni-msg">' + msg + '</div>' + blocks + '</div>' +
                '<div class="ni-foot">' +
                    (!blocked ? '<button type="button" class="ni-check">該当Trackingの項目をまとめてチェック</button>' : '') +
                    (blocked ? '<button type="button" class="ni-bypass">管理者確認済み・進行</button>' : '') +
                    '<button type="button" class="ni-ok">確認 (Enter)</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(ov);

        const okBtn = ov.querySelector('.ni-ok');
        okBtn.addEventListener('click', closePopup);
        okBtn.focus();

        const checkBtn = ov.querySelector('.ni-check');
        if (checkBtn) {
            checkBtn.addEventListener('click', () => {
                const n = checkRowsOf(result.list.map((t) => t.trackingNo));
                closePopup();
                console.log('[無検品] まとめてチェック:', n, '行');
            });
        }
        const bypassBtn = ov.querySelector('.ni-bypass');
        if (bypassBtn) {
            bypassBtn.addEventListener('click', () => {
                if (!confirm('管理者が確認済みですか？\nこの出荷件の梱包完了を許可します。\n\n관리자 확인 후에만 진행하세요.')) return;
                if (state) state.bypass = true;
                closePopup();
                packingModalEl.querySelectorAll('.ni-banner.block').forEach((el) => {
                    el.textContent = '⚠ 管理者確認済み（無検品出荷 ' + NoInsp.BLOCK_MIN_COUNT + '件以上）— 進行許可';
                });
            });
        }
    }

    // 팝업이 떠 있는 동안 Enter/Esc = 확인(닫기). 스캐너 Enter가 뒤로 새지 않게 막음
    window.addEventListener('keydown', (e) => {
        if (!document.getElementById('ni-overlay')) return;
        if (e.key === 'Enter' || e.key === 'Escape') {
            e.preventDefault();
            e.stopImmediatePropagation();
            closePopup();
        }
    }, true);

    const isBlockedNow = () => !!(state && state.blocked && !state.bypass && isVisible());

    // 포장완료 버튼 차단 (마우스 클릭 / 다른 스크립트의 btn.click())
    window.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest && e.target.closest('#btnSavePacking');
        if (!btn || !isBlockedNow()) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        showPopup(state.result, state.cur);
    }, true);

    // 중량칸 Enter → 사이트가 포장완료를 누르는 동작 차단
    window.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || !isBlockedNow()) return;
        const t = e.target;
        if (!t || !t.closest || !t.closest('#packingModal')) return;
        if (t.id !== 'weight') return;
        e.preventDefault();
        e.stopImmediatePropagation();
        showPopup(state.result, state.cur);
    }, true);

    async function runCheck() {
        const token = ++runToken;
        state = null;
        clearUI();

        // 포장창 내용이 채워질 때까지 잠시 대기
        let cur = readCurrent();
        for (let i = 0; i < 20 && (!cur.deliveryNo || cur.trackings.length === 0); i++) {
            await new Promise((r) => setTimeout(r, 150));
            if (token !== runToken || !isVisible()) return;
            cur = readCurrent();
        }
        if (!NoInsp.DELIVERY_NO_RE.test(cur.deliveryNo) || cur.trackings.length === 0) return;

        state = { packingId: cur.packingId, cur: cur, result: null, blocked: false, bypass: false };
        const body = packingModalEl.querySelector('.modal-body');
        if (body) {
            const w = document.createElement('div');
            w.className = 'ni-banner err ni-wait';
            w.style.cssText = 'border-width:1px; font-weight:400; padding:3px 10px;';
            w.textContent = '無検品出荷 Tracking 確認中…';
            body.prepend(w);
        }
        const result = await NoInsp.check(cur.trackings, { id: cur.packingId, deliveryNo: cur.deliveryNo, noInspection: cur.noInspection });
        if (token !== runToken || !isVisible()) return;

        state.result = result;
        state.blocked = result.list.some((t) => t.blocked);
        showBanner(result, cur);
        markRows(result);
        // 다른 스크립트가 표를 다시 그려도 표시가 남도록 몇 번 더 붙임
        [400, 1200].forEach((ms) => setTimeout(() => { if (token === runToken && isVisible()) markRows(result); }, ms));
        if (result.list.length > 0) showPopup(result, cur);
    }

    let wasVisible = isVisible();
    new MutationObserver(() => {
        const v = isVisible();
        if (v === wasVisible) return;
        wasVisible = v;
        if (v) {
            setTimeout(runCheck, 100);
        } else {
            runToken++;
            state = null;
            clearUI();
        }
    }).observe(packingModalEl, { attributes: true, attributeFilter: ['class', 'style'] });
})();
