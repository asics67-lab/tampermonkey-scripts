// ==UserScript==
// @name         [관리] 종합관리 통합 도구 (오류메시지 히스토리 + 상세검색 UI개선 + 엔터키검색 + 회원선택 엔터)
// @namespace    https://github.com/asics67-lab/tampermonkey-scripts
// @version      1.0.2
// @description  종합관리(mgt/index) 및 출고 오류(shipping/error) 화면 통합본. 원본: 오류 메시지 로컬 자동 백업 및 히스토리 추적 시스템 v10.5 + 상세검색 UI 개선 스크립트 v20.0 + 상세검색 엔터키 활성화 v1.0
// @author       물류팀
// @match        https://www.platform.co.jp/admin/mgt/index*
// @match        https://www.platform.co.jp/admin/shipping/error*
// @icon         https://www.platform.co.jp/ui/custom/images/favicon.ico
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        unsafeWindow
// @updateURL    https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/관리/02-종합관리/mgt-tools.user.js
// @downloadURL  https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/관리/02-종합관리/mgt-tools.user.js
// ==/UserScript==

/*
 * ============================================================
 *  통합 안내
 *  - 종합관리(mgt/index) 화면 및 출고오류(shipping/error) 화면에서 함께 쓰는 3개 원본 스크립트를 하나로 합쳤습니다.
 *    1) 오류 메시지 로컬 자동 백업 및 히스토리 추적 시스템 v10.5 (mgt/index + shipping/error)
 *    2) 종합관리 상세검색 UI 개선 스크립트 v20.0 (mgt/index)
 *    3) 종합관리 - 상세검색 엔터키 활성화 v1.0 (mgt/index)
 *    4) 회원 선택 드롭다운 - 엔터로 업체 선택 (mgt/index) [v1.0.2 추가]
 *  - 2번과 3번은 같은 검색폼(#search-form)을 다루지만, 2번은 폼을 재배치(요소를 이동)만 할 뿐
 *    input 요소 자체를 새로 만들지 않으므로 3번이 걸어둔 엔터키 이벤트가 유지됩니다.
 *  - 다만 두 스크립트가 같은 폼을 동시에 건드리는 만큼, 실제 배포 전 검색창에서 엔터키가
 *    정상적으로 검색을 트리거하는지 반드시 한번 확인해 주세요.
 * ============================================================
 */

/* ------------------------------------------------------------
 * [블록 1] 오류 메시지 로컬 자동 백업 및 히스토리 추적 시스템 v10.5
 * ------------------------------------------------------------ */
(function() {
    'use strict';

    function formatErrorMsg(rawMsg) {
        if (!rawMsg) return '';
        let cleaned = rawMsg.trim();
        if (cleaned === '오류 입고됨' || cleaned === '오류입고됨') {
            return '<span class="text-muted" style="font-size: 0.82rem; font-style: italic;">• 시스템 상태 전환: 오류 입고 처리됨</span>';
        }
        let formatted = cleaned
            .replace(/\t/g, ' ')
            .replace(/(Tracking no\.|Tracking No)/g, '\n포장 tracking:')
            .replace(/(\d{10,})/g, ' **$1** ')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .join('<br>• ');

        return '• ' + formatted;
    }

    function cleanTextForMatching(str) {
        if (!str) return '';
        var spaceRegex = new RegExp('[\\s\\t\\n\\r\\u00a0\\u200b\\u200c\\u200d\\ufeff]', 'g');
        return String(str).replace(spaceRegex, '').trim();
    }

    if (window.location.href.includes('/admin/shipping/error')) {
        function autoBackupErrorMessages() {
            let backupDB = JSON.parse(GM_getValue('error_msg_backup_db', '{}'));
            let isUpdated = false;

            $('#packingListTbody tr').each(function() {
                const $row = $(this);
                const $errorLink = $row.find('a.show-errormsg');

                if ($errorLink.length > 0) {
                    const deliveryNo = cleanTextForMatching($errorLink.text());
                    const currentMsg = $errorLink.attr('data-errormsg') || $errorLink.data('errormsg');

                    if (deliveryNo && currentMsg) {
                        if (!backupDB[deliveryNo]) {
                            backupDB[deliveryNo] = [];
                        }

                        const alreadyExists = backupDB[deliveryNo].some(item => item.msg === currentMsg);

                        if (!alreadyExists) {
                            const now = new Date();
                            const timestamp = now.getFullYear() + '-' +
                                            String(now.getMonth() + 1).padStart(2, '0') + '-' +
                                            String(now.getDate()).padStart(2, '0') + ' ' +
                                            String(now.getHours()).padStart(2, '0') + ':' +
                                            String(now.getMinutes()).padStart(2, '0');

                            backupDB[deliveryNo].push({
                                time: timestamp,
                                msg: currentMsg
                            });
                            isUpdated = true;
                            console.log(`[탬퍼몽키 백업 성공] ${deliveryNo} : 새로운 오류 내용이 로컬에 저장되었습니다.`);
                        }
                    }
                }
            });

            if (isUpdated) {
                GM_setValue('error_msg_backup_db', JSON.stringify(backupDB));
            }
        }

        $(document).ready(autoBackupErrorMessages);
        $(document).on('ajaxComplete', function() { setTimeout(autoBackupErrorMessages, 500); });
    }

    if (window.location.href.includes('/admin/mgt/index')) {

        function fetchAndRenderErrorHistory(deliveryNo, currentLiveMsg, $targetModal) {
            const cleanNo = cleanTextForMatching(deliveryNo);
            const $historyArea = $targetModal.find('#custom-error-history-logs');

            $.ajax({
                type: 'POST',
                url: 'https://www.platform.co.jp/admin/mgt/ajax_get_order_log',
                data: { orderno: cleanNo },
                dataType: 'json'
            }).done(function(json) {
                let systemLogs = (json.status === 'success' && json.logs) ? json.logs.filter(log => log.type && (log.type.includes('오류') || log.type.includes('보류'))) : [];
                systemLogs.reverse();

                let finalAdminName = '시스템';
                let finalLogTime = '';
                if (systemLogs.length > 0) {
                    const latestLog = systemLogs[systemLogs.length - 1];
                    finalAdminName = latestLog.admin_name || '시스템';
                    finalLogTime = latestLog.created_at ? latestLog.created_at.substring(0, 16) : '';
                }

                let backupDB = JSON.parse(GM_getValue('error_msg_backup_db', '{}'));
                let localHistory = backupDB[cleanNo] || [];

                if (currentLiveMsg && !localHistory.some(h => h.msg === currentLiveMsg)) {
                    localHistory.push({
                        time: finalLogTime || '실시간 수집',
                        msg: currentLiveMsg
                    });
                }

                const totalRounds = Math.max(localHistory.length, systemLogs.length, 1);

                if (totalRounds > 0) {
                    let historyHtml = `<div class="mt-1">
                                        <ul style="list-style: none; padding-left: 0; margin-bottom: 0; max-height: 280px; overflow-y: auto;">`;

                    for (let index = 0; index < totalRounds; index++) {
                        const round = index + 1;
                        const sysLog = systemLogs[index] || {};
                        const localLog = localHistory[index] || {};

                        let logTime = localLog.time;
                        if (!logTime || logTime === '실시간 수집') {
                            logTime = sysLog.created_at ? sysLog.created_at.substring(0, 16) : (finalLogTime || '시간 미확인');
                        }

                        let logAdmin = sysLog.admin_name || (localLog.time === '실시간 수집' ? finalAdminName : '시스템');

                        let realContent = localLog.msg || sysLog.type || '오류 입고 처리됨';
                        const logContent = formatErrorMsg(realContent);

                        historyHtml += `
                            <li style="padding: 8px 10px; margin-bottom: 6px; background: #fafafa; border: 1px solid #e2e8f0; border-left: 4px solid #FF2E2E; border-radius: 4px; font-size: 0.82rem;">
                                <div class="d-flex justify-content-between text-muted mb-1" style="font-size: 0.78rem; font-weight: 500;">
                                    <span style="color: #FF2E2E; font-weight: bold;">📍 [${round}회차 오류 내역]</span>
                                    <span>담당자: <strong>${logAdmin}</strong> | 일시: ${logTime}</span>
                                </div>
                                <div style="color: #444050; padding-left: 2px; line-height: 1.5; font-weight: 400; margin-top: 4px; white-space: pre-line; word-break: break-all;">${logContent}</div>
                            </li>
                        `;
                    }

                    historyHtml += `</ul></div>`;
                    $historyArea.html(historyHtml);

                    $targetModal.find('#custom-error-admin-info').html(`
                        <span class="badge bg-label-danger ms-2 fw-bold" style="font-size: 11px; padding: 3px 6px; vertical-align: middle;">
                            ⚠️ 최종 처리: ${finalAdminName} (${finalLogTime})
                        </span>
                    `);
                }
            }).fail(function() {
                $historyArea.html('<div class="text-danger small mt-2">※ 시스템 로그 통신 장애가 발생했습니다. (로컬 백업 호출 실패)</div>');
            });
        }

        $(document).on('click', '.show-delivery-detail-btn', function() {
            const $row = $(this).closest('tr');
            const statusText = $row.find('td').eq(14).text().trim();
            const deliveryNo = $(this).text().trim();

            $('#custom-error-msg-box').remove();

            const searchUrl = `https://www.platform.co.jp/admin/shipping/error?target=2&keyword=${encodeURIComponent(deliveryNo)}`;

            $.ajax({
                url: searchUrl,
                type: 'GET',
                dataType: 'html',
                success: function(htmlData) {
                    let rawErrorMsg = "";
                    let isFound = false;
                    const cleanDeliveryNo = cleanTextForMatching(deliveryNo);

                    try {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(htmlData, 'text/html');
                        const errElements = doc.querySelectorAll('[data-errormsg]');

                        for (let i = 0; i < errElements.length; i++) {
                            const el = errElements[i];
                            const pureElText = cleanTextForMatching(el.textContent);
                            const pureTdText = el.closest('td') ? cleanTextForMatching(el.closest('td').textContent) : '';
                            const pureRowText = el.closest('tr') ? cleanTextForMatching(el.closest('tr').textContent) : '';

                            if (pureElText.includes(cleanDeliveryNo) || pureTdText.includes(cleanDeliveryNo) || pureRowText.includes(cleanDeliveryNo)) {
                                rawErrorMsg = el.getAttribute('data-errormsg');
                                isFound = true;
                                break;
                            }
                        }
                    } catch (err) { console.error(err); }

                    let currentLiveMsgForHistory = isFound ? rawErrorMsg : "";

                    if (!isFound && !statusText.includes('오류 입고됨')) {
                        rawErrorMsg = "현재 정상 입고 혹은 출고 보류 상태입니다. (과거 백업된 내용은 아래 히스토리 참조)";
                    }

                    let checkExist = setInterval(function() {
                        const $modal = $('#deliveryDetailModal');
                        const $targetHeading = $modal.find('h6:contains("상품 목록")');

                        if ($modal.is(':visible') && $targetHeading.length > 0) {
                            clearInterval(checkExist);

                            $('#custom-error-msg-box').remove();

                            const errorHtml = `
                                <div id="custom-error-msg-box" class="alert alert-danger mt-3 mb-3 p-3" role="alert" style="border-left: 5px solid #FF2E2E; background-color: #FFF5F5; border-radius: 6px; text-align: left; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                                    <div class="d-flex align-items-center mb-2 justify-content-between">
                                        <div class="d-flex align-items-center">
                                            <i class="ti ti-alert-triangle me-2 fs-4" style="color: #FF2E2E;"></i>
                                            <strong style="color: #FF2E2E; font-size: 0.95rem; font-weight: bold;">⚠️ 시스템 확인 입고 오류 내역 (${deliveryNo})</strong>
                                            <span id="custom-error-admin-info"></span>
                                        </div>
                                    </div>
                                    <div id="custom-error-history-logs"></div>
                                </div>
                            `;

                            $targetHeading.before(errorHtml);

                            fetchAndRenderErrorHistory(deliveryNo, currentLiveMsgForHistory, $modal);
                        }
                    }, 100);

                    setTimeout(function() { clearInterval(checkExist); }, 5000);
                }
            });
        });
    }
})();

/* ------------------------------------------------------------
 * [블록 2] 종합관리 상세검색 UI 개선 스크립트 v20.0
 * ------------------------------------------------------------ */
(function() {
    'use strict';

    const CACHE_ORDER_KEY = "PLATFORM_UI_DRAG_ORDER_V4";
    let isEditMode = false;
    let itemsMap = {};
    let tempSavedOrder = [];

    const style = document.createElement('style');
    style.innerHTML = `
        .important-search-box {
            background-color: #f8fafc !important;
            border: 2px solid #85c1e9 !important;
            border-radius: 8px;
            padding: 15px !important;
            margin-bottom: 15px !important;
            min-height: 80px;
        }

        .draggable-item {
            position: relative;
            padding-top: 15px !important;
            transition: transform 0.2s ease, opacity 0.2s ease, background-color 0.2s ease;
        }

        .edit-mode-active .draggable-item {
            cursor: pointer !important;
            border: 1px dashed #38bdf8 !important;
            background-color: #f0f9ff;
            border-radius: 6px;
        }
        .edit-mode-active .draggable-item:hover {
            background-color: #e0f2fe !important;
            border-color: #0284c7 !important;
        }
        .edit-mode-active .draggable-item::before {
            content: "⋮⋮";
            position: absolute;
            left: 5px;
            top: 2px;
            font-size: 0.7rem;
            color: #38bdf8;
            font-weight: bold;
        }
        .edit-mode-active .draggable-item.dragging {
            opacity: 0.4;
            transform: scale(0.95);
        }
        .edit-mode-active .draggable-item.drag-over-target {
            border: 2px solid #28a745 !important;
            background-color: #e8f5e9 !important;
        }

        .item-remove-btn {
            position: absolute;
            right: 15px;
            top: 0px;
            width: 16px;
            height: 16px;
            background: #e74c3c;
            color: white;
            border-radius: 50%;
            font-size: 10px;
            font-weight: bold;
            line-height: 15px;
            text-align: center;
            cursor: pointer;
            display: none;
            z-index: 10;
        }
        .edit-mode-active .important-search-box .draggable-item .item-remove-btn {
            display: block;
        }
        .item-remove-btn:hover {
            background: #c0392b;
        }

        .ui-setting-btn-group {
            display: inline-flex;
            gap: 8px;
            margin-bottom: 10px;
        }

        .btn-ui-setting {
            background-color: #4b5563 !important;
            color: white !important;
            font-weight: bold !important;
            border: none !important;
            border-radius: 6px;
            padding: 6px 14px;
            font-size: 0.85rem;
            cursor: pointer;
            transition: all 0.2s ease;
            user-select: none;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        .btn-ui-setting.active-mode {
            background-color: #28a745 !important;
        }

        .btn-ui-cancel {
            background-color: #e11d48 !important;
            color: white !important;
            font-weight: bold !important;
            border: none !important;
            border-radius: 6px;
            padding: 6px 14px;
            font-size: 0.85rem;
            cursor: pointer;
            transition: all 0.2s ease;
            user-select: none;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            display: none;
        }
        .btn-ui-cancel:hover {
            background-color: #be123c !important;
        }

        .important-search-box .form-label,
        .important-search-box .custom-btn-title {
            font-weight: bold !important;
            color: #2c3e50 !important;
            padding-left: 5px;
        }
        .less-important-toggle {
            cursor: pointer;
            padding: 8px 12px;
            background-color: #e2e8f0;
            border-radius: 6px;
            font-size: 0.85rem;
            font-weight: bold;
            color: #4a5568;
            display: inline-block;
            margin-bottom: 10px;
            user-select: none;
        }
        .less-important-toggle:hover {
            background-color: #cbd5e1;
        }
        .less-important-container {
            display: none;
            border: 1px dashed #cbd5e1;
            padding: 15px 15px 0 15px;
            border-radius: 8px;
            background-color: #fff;
        }

        .drop-target-area {
            min-height: 60px;
        }

        .search-section-title {
            font-size: 0.9rem;
            font-weight: bold;
            color: #4b5563;
            margin-top: 10px;
            margin-bottom: 15px;
            padding-bottom: 5px;
            border-bottom: 2px solid #f3f4f6;
            width: 100%;
        }

        .custom-btn-title {
            font-size: 0.9rem !important;
            display: block;
            margin-bottom: 8px !important;
        }

        .title-status { color: #d97706 !important; }
        .title-shipping { color: #2563eb !important; }
        .title-category { color: #059669 !important; }
        .title-section { color: #7c3aed !important; }
        .title-country { color: #dc2626 !important; }

        .status-button-group {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 5px;
        }
        .status-btn-label {
            cursor: pointer;
            padding: 6px 14px;
            font-size: 0.8rem;
            font-weight: 500;
            border-radius: 20px;
            border: 1px solid #d1d5db;
            background-color: #f9fafb;
            color: #374151;
            transition: all 0.2s ease;
            margin-bottom: 0 !important;
        }
        .status-btn-label:hover {
            background-color: #f3f4f6;
            border-color: #9ca3af;
        }
        .status-radio-input {
            display: none;
        }
        .status-radio-input:checked + .status-btn-label {
            background-color: #e0f2fe !important;
            border-color: #38bdf8 !important;
            color: #0369a1 !important;
            font-weight: bold !important;
            box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
        }
    `;
    document.head.appendChild(style);

    function convertSelectToRadioButtons(selectContainer, groupName, labelText, titleClass) {
        if (!selectContainer) return null;
        const selectEl = selectContainer.querySelector('select');
        if (!selectEl) return selectContainer;
        const options = selectEl.querySelectorAll('option');
        const currentValue = selectEl.value;

        const newContainer = document.createElement('div');
        newContainer.className = 'col-lg-4 mb-2 draggable-item';

        const label = document.createElement('label');
        label.className = `custom-btn-title ${titleClass}`;
        label.innerText = `• ${labelText}`;
        newContainer.appendChild(label);

        const btnGroup = document.createElement('div');
        btnGroup.className = 'status-button-group';
        options.forEach((opt, idx) => {
            const val = opt.value; const text = opt.text;
            let buttonText = text;
            if (val === "" || text.includes('--') || text.includes('---')) buttonText = "전체";
            const radioId = `custom_${groupName}_radio_${idx}`;
            const radio = document.createElement('input');
            radio.type = 'radio'; radio.name = groupName; radio.id = radioId; radio.value = val; radio.className = 'status-radio-input';
            if (val === currentValue || opt.hasAttribute('selected')) radio.checked = true;
            const btnLabel = document.createElement('label');
            btnLabel.htmlFor = radioId; btnLabel.className = 'status-btn-label'; btnLabel.innerText = buttonText;
            btnGroup.appendChild(radio); btnGroup.appendChild(btnLabel);
        });
        newContainer.appendChild(btnGroup);
        return newContainer;
    }

    let executed = false;
    function initUI() {
        if (executed) return;
        const form = document.getElementById('search-form');
        if (!form || !form.querySelector('#search_user_id')) return;
        executed = true;

        const buttonRow = form.querySelector('.row.mt-2.mb-2') || form.querySelector('button[type="submit"]')?.closest('.row');

        const btnGroupWrap = document.createElement('div');
        btnGroupWrap.className = 'ui-setting-btn-group';

        const controlBtn = document.createElement('button');
        controlBtn.type = 'button';
        controlBtn.id = 'ui-toggle-setting-btn';
        controlBtn.className = 'btn-ui-setting';
        controlBtn.innerHTML = '⚙️ UI 순서 편집';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.id = 'ui-cancel-setting-btn';
        cancelBtn.className = 'btn-ui-cancel';
        cancelBtn.innerHTML = '❌ 취소';

        btnGroupWrap.appendChild(controlBtn);
        btnGroupWrap.appendChild(cancelBtn);
        form.parentNode.insertBefore(btnGroupWrap, form);

        const searchCardBody = document.querySelector('#card_search_title')?.closest('.card')?.querySelector('.card-body.collapse');
        if (searchCardBody) { searchCardBody.classList.add('show'); searchCardBody.style.display = 'block'; }

        itemsMap = {
            "userId": form.querySelector('#search_user_id')?.closest('.col-lg-3'),
            "deliveryNo": form.querySelector('#delivery_no')?.closest('.col-lg-3'),
            "delivTrackingNo": form.querySelector('#delivery_tracking_no')?.closest('.col-lg-3'),
            "trackingNo": form.querySelector('#tracking_no')?.closest('.col-lg-3'),
            "targetSelect": form.querySelector('select[name="target"]')?.closest('.col-lg-3'),
            "keywordInput": form.querySelector('input[name="keyword"]')?.closest('.col-lg-3'),
            "orderNo": form.querySelector('#order_no')?.closest('.col-lg-3'),
            "purchaseNo": form.querySelector('#purchase_order_no')?.closest('.col-lg-3'),
            "team": form.querySelector('#team')?.closest('.col-lg-3'),
            "dateType": form.querySelector('#date_type')?.closest('.col-lg-3'),

            "btnStatus": convertSelectToRadioButtons(form.querySelector('#status')?.closest('.col-lg-3'), 'status', '진행상태', 'title-status'),
            "btnShipping": convertSelectToRadioButtons(form.querySelector('#shipping_fee_id')?.closest('.col-lg-3'), 'shipping_fee_id', '배송 방법', 'title-shipping'),
            "btnCategory": convertSelectToRadioButtons(form.querySelector('#category')?.closest('.col-lg-3'), 'category', '종류', 'title-category'),
            "btnSSection": convertSelectToRadioButtons(form.querySelector('#s_section')?.closest('.col-lg-3'), 's_section', '상품 구분', 'title-section'),
            "btnCountry": convertSelectToRadioButtons(form.querySelector('#country')?.closest('.col-lg-3'), 'country', '국가', 'title-country')
        };

        const dateRange = form.querySelector('input[name="order_start"]')?.closest('.col-lg-6');

        const targetOption = form.querySelector('select[name="target"]');
        if (targetOption && !targetOption.value) {
            targetOption.value = "2";
            if (window.jQuery) window.jQuery(targetOption).trigger('change');
        }

        Object.keys(itemsMap).forEach(key => {
            const el = itemsMap[key];
            if (el) {
                if (!key.startsWith('btn')) {
                    el.classList.remove('mb-3', 'col-lg-3');
                    el.classList.add('mb-2', 'col-lg-4', 'draggable-item');
                }
                el.setAttribute('draggable', 'false');
                el.setAttribute('data-ui-id', key);

                const xBtn = document.createElement('div');
                xBtn.className = 'item-remove-btn';
                xBtn.innerHTML = '×';
                el.appendChild(xBtn);
            }
        });
        if(dateRange) { dateRange.classList.remove('col-lg-6'); dateRange.classList.add('col-lg-6', 'mb-2'); }

        form.innerHTML = '';
        form.innerHTML = `<input type="hidden" name="pagesize" id="pagesize" value="20"><input type="hidden" name="action" id="action" value="search">`;

        const importantRow = document.createElement('div');
        importantRow.className = 'row important-search-box';
        importantRow.id = "custom-drag-container";

        function renderLayoutByOrderArray(orderArray) {
            importantRow.innerHTML = '';

            orderArray.forEach(key => {
                if (itemsMap[key]) importantRow.appendChild(itemsMap[key]);
            });

            const bottomContainer = document.getElementById('bottom-drag-container');
            if (bottomContainer) {
                bottomContainer.innerHTML = '';
                Object.keys(itemsMap).forEach(key => {
                    if (!orderArray.includes(key) && key !== "dateType" && !key.startsWith('btn') && itemsMap[key]) {
                        bottomContainer.appendChild(itemsMap[key]);
                    }
                });
            }

            const dateBoxContainer = document.getElementById('ui-date-type-container');
            if (dateBoxContainer) {
                dateBoxContainer.innerHTML = '';
                if (!orderArray.includes("dateType") && itemsMap["dateType"]) dateBoxContainer.appendChild(itemsMap["dateType"]);
            }

            const fastFilterGroup = document.getElementById('ui-fast-filter-group');
            if (fastFilterGroup) {
                fastFilterGroup.innerHTML = '';
                if (!orderArray.includes("btnStatus") && itemsMap["btnStatus"]) fastFilterGroup.appendChild(itemsMap["btnStatus"]);
                if (!orderArray.includes("btnShipping") && itemsMap["btnShipping"]) fastFilterGroup.appendChild(itemsMap["btnShipping"]);
                if (!orderArray.includes("btnCategory") && itemsMap["btnCategory"]) fastFilterGroup.appendChild(itemsMap["btnCategory"]);
                if (!orderArray.includes("btnSSection") && itemsMap["btnSSection"]) fastFilterGroup.appendChild(itemsMap["btnSSection"]);
                if (!orderArray.includes("btnCountry") && itemsMap["btnCountry"]) fastFilterGroup.appendChild(itemsMap["btnCountry"]);
            }
        }

        form.appendChild(importantRow);

        const toggleBtn = document.createElement('div');
        toggleBtn.className = 'less-important-toggle';
        toggleBtn.id = 'ui-less-important-toggle-btn';
        toggleBtn.innerHTML = '📂 나머지 검색 조건 보기 (일반 항목)';
        form.appendChild(toggleBtn);

        const lessImportantContainer = document.createElement('div');
        lessImportantContainer.className = 'less-important-container';
        lessImportantContainer.id = 'ui-less-important-box-container';
        const lessImportantRow = document.createElement('div');
        lessImportantRow.className = 'row';

        const dateSectionTitle = document.createElement('div');
        dateSectionTitle.className = 'search-section-title';
        dateSectionTitle.innerHTML = '📅 기간 및 날짜 설정';
        lessImportantRow.appendChild(dateSectionTitle);

        const dateTypeContainer = document.createElement('div');
        dateTypeContainer.id = 'ui-date-type-container';
        dateTypeContainer.className = 'd-contents';
        lessImportantRow.appendChild(dateTypeContainer);
        if (dateRange) lessImportantRow.appendChild(dateRange);

        const btnSectionTitle = document.createElement('div');
        btnSectionTitle.className = 'search-section-title';
        btnSectionTitle.innerHTML = '⚡ 빠른 버튼 선택 필터';
        lessImportantRow.appendChild(btnSectionTitle);

        const fastFilterGroup = document.createElement('div');
        fastFilterGroup.id = 'ui-fast-filter-group';
        fastFilterGroup.className = 'row p-0 m-0';
        lessImportantRow.appendChild(fastFilterGroup);

        const bottomDropZone = document.createElement('div');
        bottomDropZone.className = 'row drop-target-area';
        bottomDropZone.id = "bottom-drag-container";
        lessImportantRow.appendChild(bottomDropZone);

        lessImportantContainer.appendChild(lessImportantRow);
        form.appendChild(lessImportantContainer);

        let savedOrder = GM_getValue(CACHE_ORDER_KEY, ["deliveryNo", "delivTrackingNo", "trackingNo", "targetSelect", "keywordInput", "userId"]);
        renderLayoutByOrderArray(savedOrder);

        if (buttonRow) form.appendChild(buttonRow);

        function getCurrentOrderList() {
            return Array.from(importantRow.querySelectorAll('.draggable-item'))
                        .map(el => el.getAttribute('data-ui-id'));
        }

        function saveConfig() {
            GM_setValue(CACHE_ORDER_KEY, getCurrentOrderList());
        }

        controlBtn.addEventListener('click', function(e) {
            e.preventDefault();
            isEditMode = !isEditMode;

            const targetContainer = document.getElementById('ui-less-important-box-container');
            const targetToggleBtn = document.getElementById('ui-less-important-toggle-btn');

            if (isEditMode) {
                tempSavedOrder = getCurrentOrderList();
                form.classList.add('edit-mode-active');
                this.className = 'btn-ui-setting active-mode';
                this.innerHTML = '💾 편집 완료 및 저장';
                cancelBtn.style.display = 'inline-block';
                form.querySelectorAll('.draggable-item').forEach(el => el.setAttribute('draggable', 'true'));

                if (targetContainer && targetToggleBtn) {
                    targetContainer.style.display = 'block';
                    targetToggleBtn.innerHTML = '📂 나머지 검색 조건 접기 (일반 항목)';
                }
            } else {
                form.classList.remove('edit-mode-active');
                this.className = 'btn-ui-setting';
                this.innerHTML = '⚙️ UI 순서 편집';
                cancelBtn.style.display = 'none';
                form.querySelectorAll('.draggable-item').forEach(el => el.setAttribute('draggable', 'false'));
                saveConfig();
            }
        });

        cancelBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (!isEditMode) return;
            isEditMode = false;
            form.classList.remove('edit-mode-active');
            controlBtn.className = 'btn-ui-setting';
            controlBtn.innerHTML = '⚙️ UI 순서 편집';
            this.style.display = 'none';
            form.querySelectorAll('.draggable-item').forEach(el => el.setAttribute('draggable', 'false'));
            renderLayoutByOrderArray(tempSavedOrder);
        });

        toggleBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (isEditMode) return;
            const targetContainer = document.getElementById('ui-less-important-box-container');
            if (!targetContainer) return;

            if (targetContainer.style.display === 'block' || window.getComputedStyle(targetContainer).display === 'block') {
                targetContainer.style.display = 'none';
                this.innerHTML = '📂 나머지 검색 조건 보기 (일반 항목)';
            } else {
                targetContainer.style.display = 'block';
                this.innerHTML = '📂 나머지 검색 조건 접기 (일반 항목)';
            }
        });

        form.addEventListener('click', function(e) {
            if (!isEditMode) return;
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.classList.contains('status-btn-label')) {
                return;
            }

            const item = e.target.closest('.draggable-item');
            if (!item) return;

            e.preventDefault();

            const topContainer = document.getElementById('custom-drag-container');
            const bottomContainer = document.getElementById('bottom-drag-container');
            const isInsideTop = topContainer.contains(item);

            if (isInsideTop || e.target.classList.contains('item-remove-btn')) {
                const uiId = item.getAttribute('data-ui-id');

                if (uiId === 'dateType') {
                    document.getElementById('ui-date-type-container').appendChild(item);
                } else if (uiId.startsWith('btn')) {
                    document.getElementById('ui-fast-filter-group').appendChild(item);
                } else {
                    bottomContainer.appendChild(item);
                }
            } else {
                topContainer.appendChild(item);
            }

            saveConfig();
        });

        const resetBtn = form.querySelector('#reset-search-form');
        if (resetBtn) {
            resetBtn.addEventListener('click', function(e) {
                e.preventDefault();
                let latestSavedOrder = GM_getValue(CACHE_ORDER_KEY, ["deliveryNo", "delivTrackingNo", "trackingNo", "targetSelect", "keywordInput", "userId"]);
                renderLayoutByOrderArray(latestSavedOrder);

                if (isEditMode) {
                    form.querySelectorAll('.draggable-item').forEach(el => el.setAttribute('draggable', 'true'));
                }

                form.querySelectorAll('input[type="text"]').forEach(input => { input.value = ''; });
                form.querySelectorAll('select').forEach(select => {
                    select.selectedIndex = 0;
                    if (window.jQuery) window.jQuery(select).trigger('change');
                });

                setTimeout(() => {
                    const allRadios = form.querySelectorAll('.status-radio-input');
                    allRadios.forEach(r => {
                        if (r.name === 'country') { r.checked = (r.value === "KR"); } else { r.checked = (r.value === ""); }
                    });
                }, 10);
            });
        }

        let dragSrcElement = null;

        form.addEventListener('dragstart', function(e) {
            if (!isEditMode) { e.preventDefault(); return; }
            const item = e.target.closest('.draggable-item');
            if (item) {
                dragSrcElement = item;
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            }
        });

        form.addEventListener('dragover', function(e) {
            if (!isEditMode || !dragSrcElement) return;
            e.preventDefault();

            const targetItem = e.target.closest('.draggable-item');
            if (targetItem && targetItem !== dragSrcElement) {
                targetItem.classList.add('drag-over-target');
            }
        });

        form.addEventListener('dragleave', function(e) {
            const targetItem = e.target.closest('.draggable-item');
            if (targetItem) {
                targetItem.classList.remove('drag-over-target');
            }
        });

        form.addEventListener('drop', function(e) {
            if (!isEditMode || !dragSrcElement) return;
            e.preventDefault();
            e.stopPropagation();

            const targetItem = e.target.closest('.draggable-item');
            if (targetItem && targetItem !== dragSrcElement) {
                targetItem.classList.remove('drag-over-target');

                const srcParent = dragSrcElement.parentNode;
                const targetParent = targetItem.parentNode;

                const srcNext = dragSrcElement.nextSibling;
                const targetNext = targetItem.nextSibling;

                if (srcNext === targetItem) {
                    srcParent.insertBefore(targetItem, dragSrcElement);
                } else if (targetNext === dragSrcElement) {
                    targetParent.insertBefore(dragSrcElement, targetItem);
                } else {
                    srcParent.insertBefore(targetItem, srcNext);
                    targetParent.insertBefore(dragSrcElement, targetNext);
                }

                saveConfig();
            }
        });

        form.addEventListener('dragend', function(e) {
            const item = e.target.closest('.draggable-item');
            if (item) {
                item.classList.remove('dragging');
            }
            form.querySelectorAll('.draggable-item').forEach(el => el.classList.remove('drag-over-target'));
        });

        window.dispatchEvent(new Event('resize'));
    }

    const observer = new MutationObserver(() => {
        if (document.getElementById('search-form') && document.querySelector('#search_user_id')) {
            initUI(); observer.disconnect();
        }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('load', initUI);
})();

/* ------------------------------------------------------------
 * [블록 3] 종합 관리 - 상세검색 엔터키 활성화 v2.0
 * ------------------------------------------------------------
 * [v1.0.1 수정] 기존 v1.0은 페이지 로드 시점에 있던 입력칸에만 jQuery keypress를
 * 걸었는데, (1) 블록 2가 검색폼을 통째로 다시 그리고, (2) Tampermonkey 격리 환경에서
 * window.jQuery / window.submitSearch가 안 보일 수 있고, (3) "검색" 글자가 들어간
 * 버튼(나머지 검색 조건 보기 등)을 전부 클릭하는 문제가 있었습니다.
 * 그동안은 포장 스크립트(scan-tools)가 Enter를 가로채 대신 제출해 줘서 가려져 있다가,
 * scan-tools v1.5.7에서 종합관리 화면을 건드리지 않게 되면서 드러났습니다.
 * → 문서 전체에서 Enter를 감지(이벤트 위임)하고, 실제 "검색" 버튼 하나만 누릅니다.
 * ------------------------------------------------------------ */
(function() {
    'use strict';

    const pageWin = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

    function findSearchButton(form) {
        // 1순위: 폼 안의 submit 버튼 / 2순위: 글자가 정확히 "검색"인 버튼
        const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
        if (submitBtn) return submitBtn;
        const candidates = Array.from(document.querySelectorAll('button, a.btn, input[type="button"]'));
        return candidates.find(b => ((b.innerText || b.value || '').replace(/\s+/g, '').replace(/[^가-힣A-Za-z]/g, '')) === '검색') || null;
    }

    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter' || e.isComposing) return; // 한글 조합 중 Enter는 무시

        const target = e.target;
        if (!target || target.tagName !== 'INPUT') return;
        const type = (target.type || 'text').toLowerCase();
        if (!['text', 'search', 'number', 'tel'].includes(type)) return;

        // [v1.0.2] 회원 선택 드롭다운 검색창의 Enter는 블록 4가 처리 (검색 실행 X)
        if (target.closest('.select2-search, .select2-dropdown, .select2-drop, .chosen-search')) return;

        const form = target.closest('#search-form');
        if (!form) return;

        e.preventDefault();
        e.stopPropagation();

        // 사람이 직접 누르는 것과 똑같이 "검색" 버튼을 누르는 것을 우선합니다.
        const btn = findSearchButton(form);
        if (btn) {
            btn.click();
        } else if (typeof pageWin.submitSearch === 'function') {
            pageWin.submitSearch();
        } else if (typeof form.requestSubmit === 'function') {
            form.requestSubmit();
        } else {
            form.submit();
        }
    }, true);

    console.log('[Tampermonkey] 상세검색 엔터키 활성화 v2.0 적용');
})();

/* ------------------------------------------------------------
 * [블록 4] 회원 선택 드롭다운 - 엔터로 업체 선택 (v1.0.2 추가)
 * ------------------------------------------------------------
 * 회원 선택 검색창에 업체명을 입력하고 Enter를 누르면
 * 파란색으로 강조된 업체(없으면 목록 첫 번째 업체)를 선택합니다.
 * 한글 입력 중(조합 중) Enter도 글자 확정을 기다렸다가 선택합니다.
 * ------------------------------------------------------------ */
(function() {
    'use strict';

    const SEARCH_INPUT = '.select2-search__field, .select2-search input, .select2-input, .chosen-search input, .chosen-search-input';
    const RESULTS_BOX = '.select2-container--open .select2-results, .select2-drop-active .select2-results, .select2-dropdown .select2-results, .chosen-with-drop .chosen-results';
    const NOT_SELECTABLE = '.select2-results__message, .loading-results, .select2-no-results, .select2-searching, .no-results, [aria-disabled="true"], .select2-disabled, .disabled-result';

    function findTarget(input) {
        const scope = input.closest('.select2-dropdown, .select2-drop, .chosen-drop, .chosen-container') || document;
        const box = scope.querySelector('.select2-results, .chosen-results') || document.querySelector(RESULTS_BOX);
        if (!box) return null;
        const hi = box.querySelector('.select2-results__option--highlighted, .select2-highlighted, .highlighted');
        if (hi && !hi.matches(NOT_SELECTABLE)) return hi;
        for (const o of box.querySelectorAll('.select2-results__option, .select2-result-selectable, .active-result')) {
            if (!o.matches(NOT_SELECTABLE) && !o.querySelector('.select2-results__options')) return o;
        }
        return null;
    }

    function choose(el) {
        const opt = { bubbles: true, cancelable: true, view: window, button: 0 };
        ['mouseenter', 'mouseover', 'mousemove', 'mousedown', 'mouseup', 'click'].forEach(t => el.dispatchEvent(new MouseEvent(t, opt)));
    }

    function trySelect(input, retries) {
        const el = findTarget(input);
        if (el) return choose(el);
        if (retries > 0) setTimeout(() => trySelect(input, retries - 1), 100);
    }

    document.addEventListener('keydown', function(e) {
        const isEnter = e.key === 'Enter' || e.keyCode === 13 || (e.keyCode === 229 && e.code === 'Enter');
        if (!isEnter) return;
        const input = e.target;
        if (!(input instanceof HTMLElement) || !input.matches(SEARCH_INPUT)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        setTimeout(() => trySelect(input, 10), (e.isComposing || e.keyCode === 229) ? 150 : 30);
    }, true);
})();
