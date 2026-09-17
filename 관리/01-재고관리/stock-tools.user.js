// ==UserScript==
// @name         [관리] 재고관리 통합 도구 (통관방식조회 + 다나오로시 + FL로케이션현황)
// @namespace    https://github.com/asics67-lab/tampermonkey-scripts
// @version      1.1.0
// @description  재고관리(settlement/stock) 및 로케이션 조회 화면 통합본. 원본: 재고관리 통관방식 조회 v3.1 + 구매대행 다나오로시 출력본 v24.1(엑셀 합산/구분선 버그 수정) + FL 로케이션 사용 현황 v11.5
// @author       물류팀
// @match        https://www.platform.co.jp/admin/settlement/stock*
// @match        https://www.platform.co.jp/admin/store/location-jan*
// @match        https://www.platform.co.jp/admin/store/location-tracking*
// @grant        GM_xmlhttpRequest
// @connect      www.platform.co.jp
// @updateURL    https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/관리/01-재고관리/stock-tools.user.js
// @downloadURL  https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/관리/01-재고관리/stock-tools.user.js
// ==/UserScript==

/*
 * ============================================================
 *  통합 안내
 *  - settlement/stock 화면(+ 로케이션 조회 화면)에서 함께 쓰는 3개 원본 스크립트를 하나로 합쳤습니다.
 *    1) 재고관리 통관방식 조회 (빠른 안정형) v3.1
 *    2) 구매대행 다나오로시 출력본 v24.1
 *    3) FL 로케이션 사용 현황 v11.5
 *  - 세 스크립트는 서로 다른 버튼/화면 영역(통관방식 열 vs 전체화면 뷰어 vs 우측 고정 카드)을
 *    다루기 때문에 기능이 겹치지 않아 로직 병합 없이 각자의 IIFE 블록을 그대로 유지했습니다.
 *  - 실제 배포 전 화면에서 3개 기능이 동시에 정상 동작하는지 한번 확인해 주세요.
 *
 *  v1.1.0 수정 사항
 *  - [블록 2] 다나오로시 엑셀 다운로드에서 발견된 버그 2건 수정
 *    1) 같은 로케이션+같은 JAN코드인데 고객별로 수량이 따로 나오던 문제
 *    2) 로케이션 구분용 노란색(주황) 선이 로케이션과 무관하게 그어지던 문제
 *    원인: 화면 표시(renderTableRows)는 getGroupedRows()로 먼저 병합한 데이터를 쓰는데,
 *    엑셀 생성(generateExcelBlob)은 병합 없이 정렬만 된 원본 데이터를 썼던 것이 원인이었음.
 *    엑셀 생성도 동일하게 getGroupedRows()를 거치도록 수정하여 화면과 결과가 일치하도록 함.
 * ============================================================
 */

/* ------------------------------------------------------------
 * [블록 1] 재고관리 통관방식 조회 (빠른 안정형) v3.1
 * ------------------------------------------------------------ */
(function () {
    'use strict';

    const CONCURRENCY = 3;
    const cache = new Map();

    function getStockTable() {
        const tables = document.querySelectorAll('table');
        for (const table of tables) {
            const ths = table.querySelectorAll('thead th');
            for (const th of ths) {
                if (th.textContent.trim() === 'JAN CODE') {
                    return table;
                }
            }
        }
        return null;
    }

    function init() {
        const table = getStockTable();
        if (!table) return;

        const headers = table.querySelectorAll('thead th');
        let janIndex = -1;

        headers.forEach((th, index) => {
            if (th.textContent.trim() === 'JAN CODE') {
                janIndex = index;
            }
        });

        if (janIndex === -1) return;

        if (!table.querySelector('.custom-clearance-header')) {
            const janHeader = headers[janIndex];
            const th = document.createElement('th');
            th.className = 'text-nowrap custom-clearance-header';
            th.textContent = '통관 방식';
            janHeader.parentNode.insertBefore(th, janHeader.nextSibling);
        }

        const rows = table.querySelectorAll('tbody tr');

        rows.forEach(row => {
            if (row.querySelector('.clearance-status-td')) {
                return;
            }

            const cells = row.querySelectorAll('td');
            if (cells.length <= janIndex) {
                return;
            }

            const janCell = cells[janIndex];
            const td = document.createElement('td');
            td.className = 'clearance-status-td';
            td.innerHTML = '<small class="text-muted">-</small>';
            janCell.parentNode.insertBefore(td, janCell.nextSibling);
        });

        const excelBtn = document.getElementById('download-excel-btn');
        if (!excelBtn) {
            console.log('[통관조회] Excel 버튼을 찾지 못함');
            return;
        }

        if (document.getElementById('fetch-clearance-btn')) {
            return;
        }

        const button = document.createElement('button');
        button.id = 'fetch-clearance-btn';
        button.type = 'button';
        button.className = 'btn btn-primary btn-sm waves-effect flex-fill flex-sm-grow-0 ms-2';
        button.innerHTML = '<i class="ti ti-scan me-1"></i>통관 방식 조회';

        excelBtn.parentNode.appendChild(button);
        button.addEventListener('click', startFetching);

        console.log('[통관조회] 버튼 생성 완료');
    }

    function fetchSingleClearance(janCode, retry = false) {
        if (cache.has(janCode)) {
            return Promise.resolve(cache.get(janCode));
        }

        let searchKeyword = janCode.split(/[- ]+/)[0];

        if (!searchKeyword) {
            cache.set(janCode, '무효');
            return Promise.resolve('무효');
        }

        const searchUrl = 'https://www.platform.co.jp/admin/store/jancode' +
            '?target=2&keyword=' + encodeURIComponent(searchKeyword);

        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: searchUrl,
                timeout: 20000,

                onload: function(response) {
                    let foundStatus = '';

                    try {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(response.responseText, 'text/html');
                        const rows = doc.querySelectorAll('table tbody tr');

                        for (const row of rows) {
                            const rowTds = row.querySelectorAll('td');
                            if (rowTds.length < 7) {
                                continue;
                            }

                            const rowJanFull = row.querySelector('td:nth-child(4)')?.textContent.trim();

                            if (rowJanFull === janCode) {
                                rowTds.forEach(td => {
                                    const text = td.textContent.trim();
                                    if (text.includes('통관')) {
                                        foundStatus = text;
                                    }
                                });
                                if (foundStatus) {
                                    break;
                                }
                            }
                        }
                    } catch (e) {
                        console.error('[통관조회 오류]', janCode, e);
                        foundStatus = '오류';
                    }

                    if (foundStatus === '미정' || foundStatus === '') {
                        if (!retry) {
                            setTimeout(() => {
                                fetchSingleClearance(janCode, true).then(resolve);
                            }, 500);
                            return;
                        }
                        foundStatus = '미정';
                    }

                    if (foundStatus === '') {
                        foundStatus = '미정';
                    }

                    cache.set(janCode, foundStatus);
                    resolve(foundStatus);
                },

                onerror: function() {
                    if (!retry) {
                        setTimeout(() => {
                            fetchSingleClearance(janCode, true).then(resolve);
                        }, 500);
                        return;
                    }
                    cache.set(janCode, '실패');
                    resolve('실패');
                },

                ontimeout: function() {
                    if (!retry) {
                        setTimeout(() => {
                            fetchSingleClearance(janCode, true).then(resolve);
                        }, 500);
                        return;
                    }
                    cache.set(janCode, '시간초과');
                    resolve('시간초과');
                }
            });
        });
    }

    function renderStatus(td, status) {
        if (!td) return;

        if (status.includes('사업자')) {
            td.innerHTML = '<span class="badge bg-label-success">' + status + '</span>';
        } else if (status.includes('개인')) {
            td.innerHTML = '<span class="badge bg-label-primary">' + status + '</span>';
        } else if (status === '미정') {
            td.innerHTML = '<small class="text-muted">미정</small>';
        } else {
            td.innerHTML = '<small class="text-danger">' + status + '</small>';
        }
    }

    async function runQueue(items, workerCount, worker) {
        let index = 0;

        async function workerLoop() {
            while (true) {
                const current = index++;
                if (current >= items.length) {
                    return;
                }
                await worker(items[current]);
            }
        }

        const workers = [];
        for (let i = 0; i < Math.min(workerCount, items.length); i++) {
            workers.push(workerLoop());
        }
        await Promise.all(workers);
    }

    async function startFetching() {
        const button = document.getElementById('fetch-clearance-btn');
        const table = getStockTable();
        if (!table) return;

        if (button) {
            button.disabled = true;
            button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>조회 준비 중...';
        }

        const rows = table.querySelectorAll('tbody tr');
        const janMap = new Map();

        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 5) {
                return;
            }

            const janCode = cells[4].textContent.trim();
            const resultCell = row.querySelector('.clearance-status-td');

            if (!janCode || !resultCell) {
                return;
            }

            resultCell.innerHTML = '<span class="spinner-border spinner-border-sm text-primary" style="width:10px;height:10px;"></span>';

            if (!janMap.has(janCode)) {
                janMap.set(janCode, []);
            }
            janMap.get(janCode).push(resultCell);
        });

        const janCodes = Array.from(janMap.keys());
        const total = janCodes.length;
        let completed = 0;

        if (button) {
            button.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>조회 중... 0 / ${total}`;
        }

        await runQueue(janCodes, CONCURRENCY, async function(janCode) {
            const status = await fetchSingleClearance(janCode);
            const cells = janMap.get(janCode) || [];

            cells.forEach(td => {
                renderStatus(td, status);
            });

            completed++;

            if (button) {
                button.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>조회 중... ${completed} / ${total}`;
            }
        });

        if (button) {
            button.disabled = false;
            button.innerHTML = '<i class="ti ti-check me-1"></i>조회 완료';
        }
    }

    function boot() {
        init();

        const observer = new MutationObserver(function() {
            if (!document.getElementById('fetch-clearance-btn')) {
                init();
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        setTimeout(init, 500);
        setTimeout(init, 1500);
        setTimeout(init, 3000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();

/* ------------------------------------------------------------
 * [블록 2] 구매대행 다나오로시 출력본 v24.1
 * ------------------------------------------------------------ */
(function() {
    'use strict';

    const rowsData = [];
    const zones = new Set();
    const selectedZones = new Set();

    const styleHTML = `
        <style id="simplified-inventory-style">
            #simplified-container { padding: 30px 20px; font-family: 'Public Sans', sans-serif; background: #fff; color: #333; max-width: 100%; margin: 0 auto; position: relative; z-index: 99999; }
            .tool-header { border-bottom: 3px solid #007bff; padding-bottom: 15px; margin-bottom: 25px; }
            .header-main { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
            .tool-title { margin: 0; font-size: 24px; font-weight: bold; color: #1e293b; }
            .tool-btn-group { display: flex; gap: 12px; }

            .zone-filter-group { display: flex; gap: 8px; border-top: 1px dashed #cbd5e1; padding-top: 12px; flex-wrap: wrap; }
            .filter-btn { padding: 6px 14px; font-size: 13px; border-radius: 20px; cursor: pointer; border: 1px solid #cbd5e1; background: #fff; font-weight: bold; color: #64748b; user-select: none; }
            .filter-btn.active { background: #007bff; color: #fff; border-color: #007bff; }
            .filter-btn.btn-all-zone { border-color: #007bff; color: #007bff; }
            .filter-btn.btn-all-zone.active { background: #007bff; color: #fff; }

            .action-btn { padding: 10px 18px; font-size: 14px; border-radius: 6px; cursor: pointer; font-weight: bold; border: none; }
            .btn-print { background: #007bff; color: #fff; }
            .btn-excel { background: #28a745; color: #fff; }
            .btn-zone-excel { background: #ff9f43; color: #fff; }
            .btn-restore { background: #475569; color: #fff; }

            .inventory-table { width: 100%; border-collapse: collapse; margin-top: 10px; border: 2px solid #64748b; table-layout: fixed; }
            .inventory-table th, .inventory-table td { border: 1px solid #cbd5e1; padding: 8px 6px; font-size: 13px; text-align: center !important; color: #1e293b; word-break: break-all; }
            .inventory-table th { background-color: #f1f5f9; font-weight: bold; border-bottom: 2px solid #64748b; }

            .sublocation-boundary-tr td { border-top: 4px double #ff9800 !important; }

            .tracking-main { color: #64748b; font-size: 10pt; }
            .tracking-highlight { font-size: 11pt !important; font-weight: bold !important; color: #d63031; text-decoration: underline; display: inline-block; }

            @media print {
                body { background: #fff !important; color: #000 !important; padding: 0 !important; margin: 0 !important; }
                #layout-main-content, aside, nav, .tool-btn-group, .zone-filter-group, #fixed-launcher-floating-btn { display: none !important; }
                #simplified-container { width: 100% !important; padding: 0 !important; margin: 0 !important; }
                .inventory-table { width: 100%; }
                .inventory-table th, .inventory-table td { border: 1px solid #475569 !important; text-align: center !important; }
                .page-break-tr { page-break-before: always !important; break-before: page !important; }
                .sublocation-boundary-tr td { border-top: 4px double #e65100 !important; }
                .inventory-table th { background-color: #e2e8f0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .tracking-highlight { font-size: 11pt !important; font-weight: bold !important; color: #000 !important; }
                @page { size: A4 portrait; margin: 12mm 8mm; }
            }
        </style>
    `;

    function fetchPageHtml(url) {
        return new Promise((resolve, reject) => {
            $.ajax({
                url: url, type: 'GET',
                success: function(data) { resolve(data); },
                error: function(err) { reject(err); }
            });
        });
    }

    async function collectAllPagesData() {
        rowsData.length = 0;
        zones.clear();

        let currentPage = 1;
        let totalPages = 1;
        let hasNextPage = true;

        const baseUrl = window.location.origin + window.location.pathname;
        const urlParams = new URLSearchParams(window.location.search);
        urlParams.set('pagesize', '1000');

        const totalItemsText = $('.text-start small').text() || "";
        const match = totalItemsText.match(/합계：([0-9,]+)건/);
        if (match) {
            const totalCount = parseInt(match[1].replace(/,/g, '')) || 0;
            totalPages = Math.ceil(totalCount / 1000) || 1;
        }

        while (hasNextPage) {
            updateMaskText(`📋 데이터를 전수조사 중입니다... (${currentPage} / ${totalPages} 페이지 수집 중)`);
            urlParams.set('page', currentPage);

            const targetUrl = `${baseUrl}?${urlParams.toString()}`;

            try {
                const htmlData = await fetchPageHtml(targetUrl);
                const $html = $(htmlData);
                const $rows = $html.find('.table-responsive table:last tbody tr');

                if ($rows.length === 0) {
                    hasNextPage = false;
                    break;
                }

                let validRowInserted = false;
                $rows.each(function() {
                    const $row = $(this);
                    if ($row.find('td').length < 10) return;

                    const clientName = $row.find('td:nth-child(2)').text().trim() || '-';
                    const category = $row.find('td:nth-child(3)').text().trim();
                    const type = $row.find('td:nth-child(4)').text().trim();
                    const janCode = $row.find('td:nth-child(5)').text().trim();
                    const productName = $row.find('td:nth-child(6)').text().trim();
                    const quantity = parseInt($row.find('td:nth-child(7)').text().trim()) || 0;
                    const location = $row.find('td:nth-child(11)').text().trim();

                    if (location) {
                        let zone = location.charAt(0).toUpperCase();

                        if (!/[A-Z]/.test(zone)) {
                            zone = '기타';
                        }
                        zones.add(zone);

                        const locParts = location.split('-');
                        const subLocation = locParts.length >= 2 ? `${locParts[0]}-${locParts[1]}` : location;

                        rowsData.push({ clientName, category, type, janCode, productName, quantity, location, subLocation, zone });
                        validRowInserted = true;
                    }
                });

                const $nextButton = $html.find('.pagination .page-item:last-child:not(.disabled)');
                if (validRowInserted && $nextButton.length > 0 && $nextButton.find('a').length > 0) {
                    currentPage++;
                } else {
                    hasNextPage = false;
                }

            } catch (error) {
                console.error(`${currentPage} 페이지 수집 중 오류`, error);
                hasNextPage = false;
            }
        }

        rowsData.sort((a, b) => {
            if (a.zone === '기타' && b.zone !== '기타') return 1;
            if (a.zone !== '기타' && b.zone === '기타') return -1;
            const locCompare = a.location.localeCompare(b.location, undefined, { numeric: true, sensitivity: 'base' });
            if (locCompare !== 0) return locCompare;
            return a.janCode.localeCompare(b.janCode, undefined, { numeric: true });
        });

        zones.forEach(z => selectedZones.add(z));
    }

    function updateMaskText(text) {
        $('#custom-sync-mask-text').text(text);
    }

    function formatJanCodeWeb(janCode, productName) {
        if (!janCode) return '';
        const isKuji = productName.toUpperCase().includes('KUJI');
        const hasHyphen = janCode.includes('-');

        if (isKuji && hasHyphen) {
            const parts = janCode.split('-');
            const frontPart = parts[0];
            const backPart = parts.slice(1).join('-');
            if (frontPart.length > 4) {
                const main = frontPart.substring(0, frontPart.length - 4);
                const highlight = frontPart.substring(frontPart.length - 4);
                return `<span class="tracking-main">${main}</span><span class="tracking-highlight">${highlight}</span><span class="tracking-main">-${backPart}</span>`;
            }
        }
        if (janCode.length > 4) {
            const front = janCode.substring(0, janCode.length - 4);
            const back = janCode.substring(janCode.length - 4);
            return `<span class="tracking-main">${front}</span><span class="tracking-highlight">${back}</span>`;
        }
        return janCode;
    }

    function formatJanCodeExcel(janCode, productName) {
        if (!janCode) return '';
        const isKuji = productName.toUpperCase().includes('KUJI');
        const hasHyphen = janCode.includes('-');

        if (isKuji && hasHyphen) {
            const parts = janCode.split('-');
            const frontPart = parts[0];
            const backPart = parts.slice(1).join('-');
            if (frontPart.length > 4) {
                const main = frontPart.substring(0, frontPart.length - 4);
                const highlight = frontPart.substring(frontPart.length - 4);
                return `${main}<b style="font-size:11pt; color:#d63031;">${highlight}</b>-${backPart}`;
            }
        }
        if (janCode.length > 4) {
            const front = janCode.substring(0, janCode.length - 4);
            const back = janCode.substring(janCode.length - 4);
            return `${front}<b style="font-size:11pt; color:#d63031;">${back}</b>`;
        }
        return janCode.toString();
    }

    function getGroupedRows(rawRows) {
        const grouped = [];
        rawRows.forEach(row => {
            const match = grouped.find(g => g.location === row.location && g.janCode === row.janCode);
            if (match) {
                match.quantity += row.quantity;
            } else {
                grouped.push({ ...row });
            }
        });
        return grouped;
    }

    function renderTableRows() {
        let baseRows = rowsData.filter(row => selectedZones.has(row.zone));
        let filteredRows = getGroupedRows(baseRows);

        let tableRowsHTML = '';
        let lastZone = '';

        let i = 0;
        while (i < filteredRows.length) {
            let locSpan = 0;
            while (i + locSpan < filteredRows.length && filteredRows[i].location === filteredRows[i + locSpan].location) {
                locSpan++;
            }

            let l = 0;
            while (l < locSpan) {
                let janSpan = 0;
                let totalQty = 0;

                while (l + janSpan < locSpan && filteredRows[i + l].janCode === filteredRows[i + l + janSpan].janCode) {
                    totalQty += filteredRows[i + l + janSpan].quantity;
                    janSpan++;
                }

                for (let k = 0; k < janSpan; k++) {
                    const row = filteredRows[i + l + k];
                    let rowClasses = [];

                    if (lastZone !== '' && lastZone !== row.zone) {
                        rowClasses.push('page-break-tr');
                    }
                    lastZone = row.zone;

                    if (l === 0 && k === 0 && i > 0 && filteredRows[i - 1].subLocation !== row.subLocation) {
                        rowClasses.push('sublocation-boundary-tr');
                    }

                    let formattedJan = formatJanCodeWeb(row.janCode, row.productName);

                    tableRowsHTML += `<tr class="${rowClasses.join(' ')}" data-zone="${row.zone}">`;
                    tableRowsHTML += `<td style="width:23%; vertical-align:middle;">${row.clientName}</td>`;
                    tableRowsHTML += `<td style="width:32%; vertical-align:middle;">${row.productName || '-'}</td>`;

                    if (l === 0 && k === 0) {
                        tableRowsHTML += `<td style="width:13%; font-weight:bold; color:#0f172a; vertical-align:middle;" rowspan="${locSpan}">${row.location}</td>`;
                    }

                    if (k === 0) {
                        tableRowsHTML += `<td style="width:18%; vertical-align:middle;" rowspan="${janSpan}">${formattedJan}</td>`;
                        tableRowsHTML += `<td class="text-center" style="width:6%; vertical-align:middle; font-weight:bold;" rowspan="${janSpan}">${totalQty}</td>`;
                        tableRowsHTML += `<td style="width:8%;" rowspan="${janSpan}"></td>`;
                    }

                    tableRowsHTML += `</tr>`;
                }
                l += janSpan;
            }
            i += locSpan;
        }

        return tableRowsHTML;
    }

    function generateExcelBlob(isAllDownload = false) {
        let excelRowsHTML = '';

        // [v1.1.0 수정] 화면(renderTableRows)과 동일하게 getGroupedRows()로 먼저 병합한 뒤 출력합니다.
        // 기존에는 정렬만 한 원본 데이터를 그대로 써서, 같은 로케이션+JAN코드라도 고객별로
        // 나뉘어 있으면 합산되지 않고, 로케이션 구분선도 잘못된 위치에 그어지는 문제가 있었습니다.
        let baseFilteredRows = rowsData.filter(row => isAllDownload ? true : selectedZones.has(row.zone));
        let filteredExcelRows = getGroupedRows(baseFilteredRows);

        let i = 0;
        while (i < filteredExcelRows.length) {
            let locSpan = 0;
            while (i + locSpan < filteredExcelRows.length && filteredExcelRows[i].location === filteredExcelRows[i + locSpan].location) {
                locSpan++;
            }

            let l = 0;
            while (l < locSpan) {
                let janSpan = 0;
                let totalQty = 0;

                while (l + janSpan < locSpan && filteredExcelRows[i + l].janCode === filteredExcelRows[i + l + janSpan].janCode) {
                    totalQty += filteredExcelRows[i + l + janSpan].quantity;
                    janSpan++;
                }

                for (let k = 0; k < janSpan; k++) {
                    const row = filteredExcelRows[i + l + k];
                    let borderStyle = 'border:1px solid #000000; text-align:center; vertical-align:middle;';
                    if (l === 0 && k === 0 && i > 0 && filteredExcelRows[i - 1].subLocation !== row.subLocation) {
                        borderStyle = 'border:1px solid #000000; border-top:3px double #ff9800; text-align:center; vertical-align:middle;';
                    }

                    let excelJanStr = formatJanCodeExcel(row.janCode, row.productName);

                    excelRowsHTML += `<tr>`;
                    excelRowsHTML += `<td style="${borderStyle}">${row.clientName}</td>`;
                    excelRowsHTML += `<td style="${borderStyle}">${row.productName || '-'}</td>`;

                    if (l === 0 && k === 0) {
                        excelRowsHTML += `<td style="font-weight:bold; ${borderStyle}" rowspan="${locSpan}">${row.location}</td>`;
                    }

                    if (k === 0) {
                        excelRowsHTML += `<td style="${borderStyle} mso-number-format:'\\@';" x:str rowspan="${janSpan}">${excelJanStr}</td>`;
                        excelRowsHTML += `<td style="font-weight:bold; ${borderStyle}" rowspan="${janSpan}">${totalQty}</td>`;
                        excelRowsHTML += `<td style="${borderStyle}" rowspan="${janSpan}"></td>`;
                    }
                    excelRowsHTML += `</tr>`;
                }
                l += janSpan;
            }
            i += locSpan;
        }

        const excelTemplate = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta charset="UTF-8">
                <style>table { border-collapse:collapse; } th { border:1px solid #000000; background-color:#e2e8f0; font-weight:bold; text-align:center; }</style>
            </head>
            <body>
                <table>
                    <thead><tr><th>회원사명</th><th>상품명</th><th>로케이션</th><th>JAN CODE</th><th>수량</th><th>비고</th></tr></thead>
                    <tbody>${excelRowsHTML}</tbody>
                </table>
            </body>
            </html>
        `;
        return new Blob([excelTemplate], { type: 'application/vnd.ms-excel' });
    }

    function triggerExcelDownload(blob, filename) {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }

    async function runSimplifiedMode() {
        const $mask = $('<div id="custom-sync-mask" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(255,255,255,0.9); z-index:999999; display:flex; flex-direction:column; justify-content:center; align-items:center; font-family:sans-serif;"><div style="border:4px solid #f3f3f3; border-top:4px solid #007bff; border-radius:50%; width:40px; height:40px; animation:spin 1s linear infinite; margin-bottom:10px;"></div><div id="custom-sync-mask-text" style="font-weight:bold; color:#007bff;">📋 전체 페이지 수집 상태 분석 중...</div><style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style></div>');
        $('body').prepend($mask);

        await collectAllPagesData();

        $('#custom-sync-mask').remove();
        $('#layout-main-content').hide();
        $('#fixed-launcher-floating-btn').hide();

        $('#simplified-container').remove();
        $('head').find('#simplified-inventory-style').remove();
        $('head').append(styleHTML);

        let sortedZoneArray = Array.from(zones).sort((a, b) => {
            if (a === '기타') return 1;
            if (b === '기타') return -1;
            return a.localeCompare(b);
        });

        let zoneButtonsHTML = `<button type="button" class="filter-btn btn-all-zone active" data-zone="ALL">전체</button>`;
        sortedZoneArray.forEach(z => {
            zoneButtonsHTML += `<button type="button" class="filter-btn active" data-zone="${z}">${z === '기타' ? '기타 구역' : z + ' 구역'}</button>`;
        });

        const containerHTML = `
            <div id="simplified-container">
                <div class="tool-header">
                    <div class="header-main">
                        <h2 class="tool-title">📋 구매대행 다나오로시(전체 재고조사) 리스트</h2>
                        <div class="tool-btn-group">
                            <button type="button" class="action-btn btn-zone-excel" id="simple-download-zone-excel">📥 선택 구역 Excel 다운로드</button>
                            <button type="button" class="action-btn btn-excel" id="simple-download-excel">📥 전체 Excel 다운로드</button>
                            <button type="button" class="action-btn btn-print" id="simple-trigger-print">🖨️ A4 용지 인쇄</button>
                            <button type="button" class="action-btn btn-restore" id="simple-trigger-restore">↩️ 원본 화면 복원</button>
                        </div>
                    </div>
                    <div class="zone-filter-group">
                        <span style="font-size:13px; font-weight:bold; color:#475569; align-self:center; margin-right:5px;">구역 필터 (다중 선택):</span>
                        ${zoneButtonsHTML}
                    </div>
                </div>
                <table class="inventory-table">
                    <thead>
                        <tr>
                            <th style="width: 23%;">회원사명</th>
                            <th style="width: 32%;">상품명</th>
                            <th style="width: 13%;">로케이션</th>
                            <th style="width: 18%;">JAN CODE</th>
                            <th style="width: 6%;">수량</th>
                            <th style="width: 8%;">비고</th>
                        </tr>
                    </thead>
                    <tbody id="inventory-table-body">
                        ${renderTableRows()}
                    </tbody>
                </table>
            </div>
        `;

        $('body').prepend(containerHTML);
        window.scrollTo(0, 0);

        $('.filter-btn').on('click', function() {
            const clickedZone = $(this).data('zone');

            if (clickedZone === 'ALL') {
                if ($(this).hasClass('active')) {
                    $('.filter-btn').removeClass('active');
                    selectedZones.clear();
                } else {
                    $('.filter-btn').addClass('active');
                    zones.forEach(z => selectedZones.add(z));
                }
            } else {
                if ($(this).hasClass('active')) {
                    $(this).removeClass('active');
                    selectedZones.delete(clickedZone);
                    $('.btn-all-zone').removeClass('active');
                } else {
                    $(this).addClass('active');
                    selectedZones.add(clickedZone);
                    if (selectedZones.size === zones.size) {
                        $('.btn-all-zone').addClass('active');
                    }
                }
            }

            $('#inventory-table-body').html(renderTableRows());
        });

        $('#simple-trigger-print').on('click', function() { window.print(); });

        $('#simple-trigger-restore').on('click', function() {
            $('#simplified-container').remove();
            $('#simplified-inventory-style').remove();
            $('#layout-main-content').show();
            $('#fixed-launcher-floating-btn').show();
            window.scrollTo(0, 0);
        });

        $('#simple-download-excel').on('click', function() {
            const today = new Date().toISOString().slice(0, 10);
            const blob = generateExcelBlob(true);
            triggerExcelDownload(blob, `다나오로시_전체재고통합_${today}.xls`);
        });

        $('#simple-download-zone-excel').on('click', function() {
            if (selectedZones.size === 0) {
                alert('선택된 구역이 없습니다. 구역 필터에서 다운로드할 구역을 선택해 주세요.');
                return;
            }
            const today = new Date().toISOString().slice(0, 10);
            const zoneArray = Array.from(selectedZones).sort();
            const blob = generateExcelBlob(false);
            triggerExcelDownload(blob, `다나오로시_선택구역재고_${zoneArray.join('+')}구역_${today}.xls`);
        });
    }

    function createFloatingButton() {
        if ($('#fixed-launcher-floating-btn').length > 0) return;

        const btnHTML = `
            <button type="button" id="fixed-launcher-floating-btn" style="
                position: fixed; top: 15px; right: 20px; background-color: #ffeaa7; color: #d63031; border: 2px solid #ff7675;
                padding: 12px 24px; font-size: 14px; font-weight: bold; border-radius: 6px; cursor: pointer;
                box-shadow: 0 4px 15px rgba(0,0,0,0.25); z-index: 1000000; transition: all 0.2s;
            ">
                📋 구매대행 다나오로시 실행
            </button>
        `;

        $('body').prepend(btnHTML);

        $('#fixed-launcher-floating-btn').hover(
            function() { $(this).css({'background-color': '#fdcb6e', 'color': '#fff'}); },
            function() { $(this).css({'background-color': '#ffeaa7', 'color': '#d63031'}); }
        );

        $('#fixed-launcher-floating-btn').on('click', function(e) {
            e.preventDefault();
            runSimplifiedMode();
        });
    }

    createFloatingButton();
})();

/* ------------------------------------------------------------
 * [블록 3] FL 로케이션 사용 현황 v11.5
 * ------------------------------------------------------------ */
(function() {
    'use strict';

    function generateSectionFloorStructure(zone, sectionNum) {
        return {
            1: Array.from({length: 6}, (_, i) => `${zone}${sectionNum}-1-${i + 1}`),
            2: Array.from({length: 6}, (_, i) => `${zone}${sectionNum}-2-${i + 1}`),
            3: Array.from({length: 4}, (_, i) => `${zone}${sectionNum}-3-${i + 1}`),
            4: Array.from({length: 3}, (_, i) => `${zone}${sectionNum}-4-${i + 1}`)
        };
    }

    const targetZones = ['F', 'G', 'H', 'I', 'J', 'K'];
    const zoneMasters = {};
    let allZonesMasterCount = 0;

    targetZones.forEach(zone => {
        zoneMasters[zone] = {};
        let maxSection = (zone === 'F') ? 3 : 6;

        for (let s = 1; s <= maxSection; s++) {
            zoneMasters[zone][s] = generateSectionFloorStructure(zone, s);
            allZonesMasterCount += 19;
        }
    });

    let globalProductList = [];

    async function fetchAndAnalyzeAllPages() {
        updateUIStatus("수집 중...");
        globalProductList = [];

        const currentUrl = new URL(window.location.href);

        let maxPage = 1;
        document.querySelectorAll('.pagination a, .page-item a, .pagination .page-link').forEach(el => {
            let pNum = parseInt(el.textContent.trim());
            if (!isNaN(pNum) && pNum > maxPage) { maxPage = pNum; }
            let hrefAttr = el.getAttribute('href');
            if (hrefAttr) {
                let pageMatch = hrefAttr.match(/page=(\d+)/);
                if (pageMatch) {
                    let pUrlNum = parseInt(pageMatch[1]);
                    if (pUrlNum > maxPage) maxPage = pUrlNum;
                }
            }
        });

        let usedLocations = new Set();

        for (let p = 1; p <= maxPage; p++) {
            updateUIStatus("수집 (" + p + "/" + maxPage + ")");
            try {
                let fetchUrl = new URL(currentUrl.href);
                fetchUrl.searchParams.set('page', p);

                let response = await fetch(fetchUrl.href);
                if (!response.ok) continue;

                let htmlText = await response.text();
                let parser = new DOMParser();
                let doc = parser.parseFromString(htmlText, 'text/html');

                doc.querySelectorAll('table tbody tr').forEach(tr => {
                    let tds = tr.querySelectorAll('td');
                    let location = "", orderNo = "", price = "", qty = "", janCode = "";

                    if (tds.length >= 11) {
                        location = tds[10].textContent.replace(/\s+/g, '').toUpperCase();
                        orderNo = tds[9].textContent.trim();
                        price = tds[8].textContent.trim();
                        qty = tds[6].textContent.trim();
                        janCode = tds[4].textContent.trim();
                    } else if (tds.length >= 9) {
                        location = tds[2].textContent.replace(/\s+/g, '').toUpperCase();
                        orderNo = tds[1].textContent.trim();
                        price = tds[8].textContent.trim();
                        qty = tds[6].textContent.trim();
                        janCode = tds[3].textContent.trim();
                    }

                    if (location) {
                        let zoneLetter = location.charAt(0);
                        let sectionMatch = location.match(/^[A-Z](\d+)/);
                        let sectionNum = sectionMatch ? parseInt(sectionMatch[1]) : 0;

                        if (targetZones.includes(zoneLetter)) {
                            if (zoneLetter === 'F' && (sectionNum === 4 || sectionNum === 5 || sectionNum === 6)) {
                                return;
                            }

                            usedLocations.add(location);
                            globalProductList.push({ orderNo, location, janCode, qty, price });
                        }
                    }
                });
            } catch (e) {
                console.error(p + "페이지 수집 실패:", e);
            }
        }

        let totalUsedSum = 0;

        targetZones.forEach(zone => {
            let zoneUsedCount = 0;
            let zoneTotalCount = 0;
            let maxSection = (zone === 'F') ? 3 : 6;

            for (let s = 1; s <= maxSection; s++) {
                let floorsData = zoneMasters[zone][s];
                let sectionUsedCount = 0;
                let htmlDetailContent = '';

                for (let f = 1; f <= 4; f++) {
                    let floorLocations = floorsData[f];

                    if (f === 1 || f === 2) {
                        let line1Html = '';
                        let line2Html = '';

                        floorLocations.forEach((loc, index) => {
                            let isUsed = usedLocations.has(loc.replace(/\s+/g, '').toUpperCase());
                            let chipHtml = isUsed ? `<span class="chip-used">${loc}</span>` : `<span class="chip-empty">${loc}</span>`;
                            if (isUsed) sectionUsedCount++;

                            if (index < 3) { line1Html += chipHtml; } else { line2Html += chipHtml; }
                        });

                        htmlDetailContent += `
                            <div class="floor-row align-start">
                                <div class="floor-title row-span-2">` + f + `층</div>
                                <div class="floor-chips-block">
                                    <div class="floor-chips-line">` + line1Html + `</div>
                                    <div class="floor-chips-line">` + line2Html + `</div>
                                </div>
                            </div>
                        `;
                    } else {
                        let floorChipsHtml = '';
                        floorLocations.forEach(loc => {
                            let isUsed = usedLocations.has(loc.replace(/\s+/g, '').toUpperCase());
                            floorChipsHtml += isUsed ? `<span class="chip-used">${loc}</span>` : `<span class="chip-empty">${loc}</span>`;
                            if (isUsed) sectionUsedCount++;
                        });

                        htmlDetailContent += `
                            <div class="floor-row">
                                <div class="floor-title">` + f + `층</div>
                                <div class="floor-chips-line">` + floorChipsHtml + `</div>
                            </div>
                        `;
                    }
                }

                zoneUsedCount += sectionUsedCount;
                zoneTotalCount += 19;

                let secPct = ((sectionUsedCount / 19) * 100).toFixed(1);

                let pctSecEl = document.getElementById("pct-sec-" + zone.toLowerCase() + s);
                let countSecEl = document.getElementById("count-sec-" + zone.toLowerCase() + s);
                let listSecEl = document.getElementById("list-sec-" + zone.toLowerCase() + s);

                if (pctSecEl) pctSecEl.innerText = secPct + "%";
                if (countSecEl) countSecEl.innerText = "(" + sectionUsedCount + "/19)";
                if (listSecEl) listSecEl.innerHTML = htmlDetailContent;
            }

            totalUsedSum += zoneUsedCount;
            let zonePct = ((zoneUsedCount / zoneTotalCount) * 100).toFixed(1);

            let pctZoneEl = document.getElementById("pct-zone-" + zone.toLowerCase());
            let countZoneEl = document.getElementById("count-zone-" + zone.toLowerCase());
            if (pctZoneEl) pctZoneEl.innerText = zonePct + "%";
            if (countZoneEl) countZoneEl.innerText = "(" + zoneUsedCount + " / " + zoneTotalCount + ")";
        });

        let allPct = ((totalUsedSum / allZonesMasterCount) * 100).toFixed(1);

        let resultString = `📦 사용중 합계: ${allPct}% (${totalUsedSum}/${allZonesMasterCount})`;
        let titleSummaryEl = document.getElementById('title-summary-text');
        let emptyLocAllEl = document.getElementById('empty-loc-all');

        if (titleSummaryEl) titleSummaryEl.innerText = resultString;
        if (emptyLocAllEl) emptyLocAllEl.innerText = `${allPct}% (${totalUsedSum}/${allZonesMasterCount})`;

        updateUIStatus("완료");
    }

    function exportToExcel() {
        if (globalProductList.length === 0) {
            alert("다운로드할 데이터가 없거나 수집 중입니다. 완료 후 다시 시도해 주세요.");
            return;
        }

        globalProductList.sort((a, b) => a.location.localeCompare(b.location, undefined, {numeric: true, sensitivity: 'base'}));

        let excelTemplate = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
                <style>
                    th { background-color: #7367f0; color: #ffffff; font-weight: bold; height: 30px; text-align: center; }
                    td { mso-number-format:"\\@"; text-align: center; height: 25px; }
                </style>
            </head>
            <body>
                <table border="1">
                    <thead>
                        <tr><th>발주서번호</th><th>로케이션</th><th>JAN CODE</th><th>수량</th><th>금액</th></tr>
                    </thead>
                    <tbody>
        `;

        globalProductList.forEach(item => {
            excelTemplate += `<tr><td>${item.orderNo}</td><td>${item.location}</td><td>${item.janCode}</td><td>${item.qty}</td><td>${item.price}</td></tr>`;
        });

        excelTemplate += `</tbody></table></body></html>`;

        const blob = new Blob([excelTemplate], { type: 'application/vnd.ms-excel;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");

        link.href = url;
        link.setAttribute("download", `재고_로케이션_리스트_${dateStr}.xls`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function updateUIStatus(msg) {
        let statusEl = document.getElementById('loc-status-text');
        if (statusEl) statusEl.innerText = msg;
    }

    function createUI() {
        if (document.getElementById('location-counter-card')) return;

        let style = document.createElement('style');
        style.innerHTML = `
            #location-counter-card {
                position: fixed;
                top: 80px;
                right: 20px;
                z-index: 100000;
                background: #ffffff;
                border: 1px solid #7367f0;
                border-radius: 8px;
                box-shadow: 0 4px 16px rgba(115, 103, 240, 0.25);
                padding: 12px;
                width: 350px;
                max-height: 85vh;
                display: flex;
                flex-direction: column;
                font-family: 'Public Sans', sans-serif;
                font-size: 13px;
                transition: width 0.2s, max-height 0.2s;
            }
            #location-counter-card.minimized {
                width: auto !important;
                max-height: 42px !important;
                padding: 8px 12px !important;
                overflow: hidden;
            }
            #location-counter-card.minimized #loc-area-wrapper,
            #location-counter-card.minimized .loc-total-row {
                display: none !important;
            }
            #location-counter-card h5 {
                margin: 0;
                font-size: 13px;
                color: #7367f0;
                font-weight: bold;
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-shrink: 0;
                cursor: move;
                user-select: none;
            }
            #location-counter-card:not(.minimized) h5 {
                border-bottom: 2px solid #7367f0;
                padding-bottom: 6px;
                margin-bottom: 12px;
            }
            #title-clickable-area { display: flex; align-items: center; cursor: pointer; flex-grow: 1; }
            #title-summary-text { margin-right: 5px; white-space: nowrap; }
            #loc-area-wrapper { overflow-y: auto; flex-grow: 1; padding-right: 5px; }
            .zone-container { border: 1px solid #eaf2f8; border-radius: 6px; margin-bottom: 6px; overflow: hidden; }
            .loc-row-clickable {
                display: flex; justify-content: space-between; align-items: center;
                padding: 8px 10px; background: #f8f9fa; cursor: pointer; transition: background 0.2s; user-select: none;
            }
            .loc-row-clickable:hover { background: #f0f0ff; }
            .loc-label { font-weight: bold; color: #2e4053; }
            .loc-pct { font-weight: bold; color: #7367f0; margin-right: 5px; }
            .loc-count { font-size: 11px; color: #7f8c8d; }

            .section-wrapper { display: none; background: #ffffff; border-top: 1px solid #f1f1f1; padding: 4px 8px; }
            .section-row-clickable {
                display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; margin: 3px 0;
                background: #fdfefe; border: 1px solid #f2f4f4; border-radius: 4px; cursor: pointer; user-select: none;
            }
            .section-row-clickable:hover { background: #ebf5fb; }
            .sec-label { font-size: 12px; color: #34495e; font-weight: 600; }
            .sec-pct { font-size: 12px; font-weight: bold; color: #2980b9; margin-right: 4px; }

            .loc-detail-list { display: none; background: #fcfcfc; border: 1px dashed #d6dbdf; border-radius: 4px; padding: 8px; margin-bottom: 8px; max-height: 280px; overflow-y: auto; }
            .floor-row { display: flex; align-items: center; border-bottom: 1px solid #f2f4f4; padding: 6px 0; }
            .floor-row.align-start { align-items: flex-start; }
            .floor-row:last-child { border-bottom: none; }

            .floor-title { width: 35px; font-size: 11px; font-weight: bold; color: #7f8c8d; border-right: 2px solid #bdc3c7; margin-right: 12px; flex-shrink: 0; }
            .floor-title.row-span-2 { align-self: center; }

            .floor-chips-block { display: flex; flex-direction: column; gap: 5px; flex-grow: 1; }
            .floor-chips-line { display: flex; gap: 4px; }

            .loc-detail-list span { font-size: 10px; padding: 2px 5px; border-radius: 3px; display: inline-block; font-weight: 600; width: 54px; text-align: center; }
            .loc-detail-list span.chip-empty { background: #eaecee; color: #34495e; }
            .loc-detail-list span.chip-used { background: #ea5455; color: #ffffff; }

            .loc-total-row { border-top: 1px solid #7367f0; padding-top: 10px; margin-top: 8px; display: flex; justify-content: space-between; font-weight: bold; flex-shrink: 0; }
            .header-btn-group { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
            #sync-btn, #excel-btn { background: none; border: none; cursor: pointer; color: #7367f0; font-size: 14px; padding: 2px; transition: transform 0.1s; }
            #sync-btn:hover, #excel-btn:hover { transform: scale(1.15); }
            #loc-status-text { font-size: 10px; color: #aaa; font-weight: normal; margin-left: 5px; }
        `;
        document.head.appendChild(style);

        let card = document.createElement('div');
        card.id = 'location-counter-card';
        card.classList.add('minimized');

        let zoneContainersHtml = '';
        targetZones.forEach(zone => {
            let sectionRowsHtml = '';
            let maxSection = (zone === 'F') ? 3 : 6;

            for (let s = 1; s <= maxSection; s++) {
                sectionRowsHtml += `
                    <div class="section-block">
                        <div class="section-row-clickable" data-secid="` + zone.toLowerCase() + s + `">
                            <span class="sec-label">└ ` + zone + s + ` 섹션 현황</span>
                            <div>
                                <span class="sec-pct" id="pct-sec-` + zone.toLowerCase() + s + `">-</span>
                                <span class="loc-count" id="count-sec-` + zone.toLowerCase() + s + `">-</span>
                            </div>
                        </div>
                        <div class="loc-detail-list" id="list-sec-` + zone.toLowerCase() + s + `">
                            <div style="color: #aaa; padding: 5px;">로드 대기 중...</div>
                        </div>
                    </div>
                `;
            }

            zoneContainersHtml += `
                <div class="zone-container">
                    <div class="loc-row-clickable" data-zone="${zone.toLowerCase()}">
                        <span class="loc-label">🔹 ${zone}구역 전체</span>
                        <div>
                            <span class="loc-pct" id="pct-zone-${zone.toLowerCase()}">-</span>
                            <span class="loc-count" id="count-zone-${zone.toLowerCase()}">-</span>
                        </div>
                    </div>
                    <div class="section-wrapper" id="wrapper-zone-${zone.toLowerCase()}">
                        ${sectionRowsHtml}
                    </div>
                </div>
            `;
        });

        card.innerHTML = `
            <h5 id="drag-header">
                <div id="title-clickable-area">
                    <span id="title-summary-text">📦 사용중 합계: 로딩 대기...</span>
                    <span id="loc-status-text">(대기)</span>
                </div>
                <div class="header-btn-group">
                    <button id="excel-btn" title="F~K 리스트 엑셀 다운로드">📥</button>
                    <button id="sync-btn" title="전체 페이지 다시 스캔">🔄</button>
                </div>
            </h5>
            <div id="loc-area-wrapper">${zoneContainersHtml}</div>
            <div class="loc-total-row">
                <span style="color: #2e4053;">전체 사용중 합계 (F ~ K):</span>
                <span style="color: #ea5455; font-size: 14px;" id="empty-loc-all">-</span>
            </div>
        `;

        document.body.appendChild(card);

        document.getElementById('title-clickable-area').addEventListener('click', function() {
            card.classList.toggle('minimized');
        });

        document.querySelectorAll('.loc-row-clickable').forEach(row => {
            row.addEventListener('click', function() {
                let zone = this.getAttribute('data-zone');
                let wrapperEl = document.getElementById("wrapper-zone-" + zone);
                if (wrapperEl) wrapperEl.style.display = (wrapperEl.style.display === 'block') ? 'none' : 'block';
            });
        });

        document.querySelectorAll('.section-row-clickable').forEach(row => {
            row.addEventListener('click', function() {
                let secId = this.getAttribute('data-secid');
                let listEl = document.getElementById("list-sec-" + secId);
                if (listEl) listEl.style.display = (listEl.style.display === 'block') ? 'none' : 'block';
            });
        });

        document.getElementById('sync-btn').addEventListener('click', fetchAndAnalyzeAllPages);
        document.getElementById('excel-btn').addEventListener('click', exportToExcel);

        makeElementDraggable(card, document.getElementById('drag-header'));
    }

    function makeElementDraggable(targetEl, headerEl) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        headerEl.onmousedown = dragMouseDown;
        function dragMouseDown(e) {
            if (e.target.closest('.header-btn-group') || e.target.closest('#title-clickable-area')) {
                if(e.target.id === 'sync-btn' || e.target.id === 'excel-btn') return;
            }
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }
        function elementDrag(e) {
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            targetEl.style.top = (targetEl.offsetTop - pos2) + "px";
            targetEl.style.left = (targetEl.offsetLeft - pos1) + "px";
            targetEl.style.right = "auto";
        }
        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }

    function initSecureScript() {
        if (document.body && document.querySelector('table tbody')) {
            createUI();
            fetchAndAnalyzeAllPages();
        } else {
            setTimeout(initSecureScript, 200);
        }
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initSecureScript();
    } else {
        window.addEventListener('DOMContentLoaded', initSecureScript);
    }

})();
