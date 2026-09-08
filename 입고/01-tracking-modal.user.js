// ==UserScript==
// @name         [입고] 트래킹넘버 모달 통합 (마스터패치본 + 회원명고정 + 하이픈표시 + JAN강조)
// @namespace    https://github.com/asics67-lab/tampermonkey-scripts
// @version      1.1.0
// @description  입고 처리 모달(trackingno) 및 라벨 인쇄(locationlabel) 화면 통합본. 원본: A-1-13(베이스) + A-1-2(회원명 고정) + A-1-3(하이픈 표시) + A-1-12 중 입고 JAN강조 발췌
// @author       물류팀
// @match        https://platform.aispel.com/admin/store/trackingno*
// @match        https://www.platform.co.jp/admin/store/trackingno*
// @match        *://platform.aispel.com/admin/print/locationlabel/*
// @match        *://www.platform.co.jp/admin/print/locationlabel/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js
// @updateURL    https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/입고/01-tracking-modal.user.js
// @downloadURL  https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/입고/01-tracking-modal.user.js
// @grant        none
// @run-at       document-start
// ==/UserScript==

/*
 * ============================================================
 *  통합 안내
 *  - 이 파일은 아래 4개 원본 스크립트를 하나로 합친 것입니다.
 *    1) A-1-13 "입고 관리 통합 도구 - 마스터 최종 패치본" v72.61 (베이스)
 *    2) A-1-2  "[입고] 회원번호 고정 (특수문자 제거형)" v12.0
 *    3) A-1-3  "입고처리 - 하이픈 구분" v2.0
 *    4) A-1-12 "[통합] 플랫폼 포장 및 입고 업무 마스터 툴" v7.2 중 입고 JAN강조 부분만 발췌
 *  - 제외됨: A-1-4(라벨 QR 자동복구형 — A-1-13과 충돌하여 폐기),
 *            A-1-5(회원명 고정 — A-1-2와 중복, match 오탈자 있어 폐기)
 *  - 각 블록은 원본 로직을 그대로 유지했으며, 서로 다른 DOM/이벤트를 다루므로
 *    기능적으로 독립 실행됩니다. 실제 배포 전 화면에서 반드시 재검증하세요.
 *
 *  v1.0.1 수정 사항 (2026-09-03, 이후 v1.1.0에서 원인 재파악 후 재수정됨)
 *  - executeScanSubmit()에서 targetLoc 우선순위를 record.location 우선으로
 *    바꿨었으나, 이는 원인 오진이었음(아래 v1.1.0 참고). v1.1.0에서 근본
 *    원인을 반영한 방식으로 재작성됨.
 *
 *  v1.1.0 수정 사항 (2026-09-04) — 실제 원인 파악 및 근본 수정
 *  - [근본 원인] 입고(ajax_save_trackingno) 시 서버는 사이즈 구분 없이 순서
 *    대로 로케이션을 자동 배정함(record.location). 화면의 대형/60사이즈/
 *    서류/MSD 버튼으로 고른 로케이션(selectedLocList)은 지금까지 라벨/화면
 *    표시에만 쓰였을 뿐, 서버로 전송되어 실제 위치를 바꾸는 로직 자체가
 *    아예 없었음. 그래서 화면(위치추적 페이지 등)의 실제 로케이션과 라벨이
 *    항상 서버 기본 배정값(=변경 전 로케이션)을 따라갈 수밖에 없었음.
 *  - [해결] 개발자도구로 확인한 실제 로케이션 변경 API
 *    (POST /admin/store/change-trackingno-location,
 *     payload: location_trackingno_id, location)를 새로 추가한
 *    updateTrackingLocation() 함수로 감싸서, 스캔 저장 직후
 *    selectedLocList에 값이 있는 항목에 한해 자동으로 호출하도록 함.
 *    성공 시 그 값을, 실패 시 기존 record.location을 라벨/화면에 사용.
 *    이제 실제 DB 로케이션과 라벨 인쇄가 항상 일치함.
 * ============================================================
 */

(function() {
    'use strict';

    /* ------------------------------------------------------------
     * [블록 1] A-1-13 마스터 로직
     * - LH(출고번호) 매칭 DB 동기화, 로케이션 실시간 동기화,
     *   커스텀 라벨(55mm x 45mm) 생성 + QR 자체 삽입 + 인쇄,
     *   운송장 하이픈 포맷(라벨 생성용, 화면표시용과는 별개)
     * ------------------------------------------------------------ */
    (function masterPatch() {
        let shippingDatabase = [];
        let realtimeEmptyLocations = [];
        let isLocationSyncing = false;
        let selectedLocList = [];
        let isStoreModalScanning = false;
        let isKeyDownCaptureBound = false;
        let allPagesCache = [];
        let isAllPagesCaching = false;
        let shippingSyncPromise = null;

        if (window.location.href.indexOf('/admin/print/locationlabel/') !== -1 || window.location.pathname.includes('locationlabel')) {
            window.print = function() {
                console.log("[Tampermonkey] 원본 라벨의 프린터 호출 가동을 차단했습니다.");
                return false;
            };
            window.stop();
            try { window.close(); } catch(e) {}
            document.addEventListener("DOMContentLoaded", function() {
                document.documentElement.innerHTML = '<body style="background:#fff; font-family:sans-serif;"><h3 style="text-align:center; margin-top:20%; color:#666;">커스텀 가로 라벨 변환 완료 (원본 제어 성공)</h3></body>';
                try { window.close(); } catch(e) {}
                const killTimer = setInterval(() => {
                    try { window.close(); if (window.closed) clearInterval(killTimer); } catch(e) {}
                }, 10);
                setTimeout(() => { clearInterval(killTimer); }, 400);
            });
            return;
        }

        async function isDeliveryFullyEntered(lhNo, trackingNo) {
            if (!lhNo) return false;
            try {
                if (!shippingDatabase || shippingDatabase.length === 0) return true;
                const cleanLH = cleanStr(lhNo);
                const matches = shippingDatabase.filter(item => cleanStr(item.delivery_no) === cleanLH);
                if (matches.length === 0) return true;
                const allTrackings = matches[0].all_trackings || [];
                if (allTrackings.length <= 1) return true;
                return true;
            } catch (e) {
                console.error("[Tampermonkey] isDeliveryFullyEntered 검증 세이프가드 통과:", e);
                return true;
            }
        }

        function initShippingSync() {
            console.log("[Tampermonkey] 세션 우회형 출고 매칭 DB 동기화 엔진 가동...");
            return new Promise(async (resolve, reject) => {
                try {
                    const [html1, html2] = await Promise.all([
                        fetch(window.location.origin + '/admin/shipping/packing?pagesize=1000&s_status=1&country=').then(r => r.text()).catch(() => ""),
                        fetch(window.location.origin + '/admin/shipping/packing?pagesize=1000&s_status=2&country=').then(r => r.text()).catch(() => "")
                    ]);
                    let tempDb = [];
                    const parser = new DOMParser();
                    [html1, html2].forEach(html => {
                        if (!html) return;
                        const doc = parser.parseFromString(html, 'text/html');
                        const rows = doc.querySelectorAll('#packingListTbody tr');
                        rows.forEach(row => {
                            const chk = row.querySelector('.sub_checkbox');
                            let trackingNos = [];
                            const packingId = chk ? chk.getAttribute('data-id') : "";
                            const packingType = chk ? chk.getAttribute('data-type') : "delivery";
                            if (chk) {
                                let trackingNoAttr = String(chk.getAttribute('data-trackingno') || '').trim();
                                if (trackingNoAttr) {
                                    trackingNoAttr.split(/[\s,]+/).forEach(t => { if (t.trim()) trackingNos.push(t.trim()); });
                                }
                            }
                            const trackingLinks = row.querySelectorAll('.show_tracking_page');
                            trackingLinks.forEach(link => {
                                const txt = link.innerText.trim();
                                if (txt && !trackingNos.includes(txt)) trackingNos.push(txt);
                            });
                            const uniqueTrackingsInRow = [...new Set(trackingNos)];
                            let deliveryNo = "";
                            const cells = row.querySelectorAll('td');
                            for (let cell of cells) {
                                const text = cell.innerText || "";
                                const matchLH = text.match(/(LH|LS|OH)\d+/i);
                                if (matchLH) { deliveryNo = matchLH[0].toUpperCase(); break; }
                            }
                            let userId = "";
                            const userLink = row.querySelector('.show-tooltip');
                            if (userLink) {
                                const userText = userLink.innerText.trim();
                                const match = userText.match(/\d+/);
                                if (match) userId = match[0];
                            }
                            if (deliveryNo && uniqueTrackingsInRow.length > 0) {
                                uniqueTrackingsInRow.forEach(tNo => {
                                    tempDb.push({ id: packingId, type: packingType, tracking_no: tNo, delivery_no: deliveryNo, user_id: userId, all_trackings: uniqueTrackingsInRow });
                                });
                            }
                        });
                    });
                    shippingDatabase = tempDb;
                    console.log("[Tampermonkey] 우회 매칭 DB 수립 성공! 활성화 데이터 수:", shippingDatabase.length);
                    resolve();
                } catch (e) {
                    console.error("[Tampermonkey] 출고 명세서 수집 중 에러:", e);
                    resolve();
                }
            });
        }

        function getTodayDate() {
            const now = new Date();
            return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
        }
        function cleanStr(str) { return String(str || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().trim(); }
        function getCsrfToken() {
            const meta = document.querySelector('meta[name="csrf-token"]');
            return meta ? meta.getAttribute('content') : '';
        }
        function formatTextWithHyphenForLabel(cleanText, companyId) {
            let id = parseInt(companyId);
            let clean = String(cleanText || '').replace(/[^A-Za-z0-9]/g, '');
            if (id >= 1 && id <= 3) {
                if (clean.length <= 4) return clean;
                if (clean.length <= 8) return clean.replace(/^([A-Za-z0-9]{4})([A-Za-z0-9]{1,4})/, '$1-$2');
                return clean.replace(/^([A-Za-z0-9]{4})([A-Za-z0-9]{4})([A-Za-z0-9]{1,12})/, '$1-$2-$3');
            } else if (id === 4 || id === 5) {
                if (clean.length <= 3) return clean;
                if (clean.length <= 6) return clean.replace(/^([A-Za-z0-9]{3})([A-Za-z0-9]{1,3})/, '$1-$2');
                return clean.replace(/^([A-Za-z0-9]{3})([A-Za-z0-9]{3})([A-Za-z0-9]{1,12})/, '$1-$2-$3');
            }
            return cleanText;
        }
        function hasShouhinda(trackingNo, record) {
            try {
                const cleanT = cleanStr(trackingNo);
                if (!cleanT) return false;
                const pageRows = Array.from(document.querySelectorAll('table tbody tr'));
                for (let row of pageRows) {
                    const tLink = row.querySelector('.show_tracking_page');
                    if (tLink && cleanStr(tLink.innerText) === cleanT) {
                        const memoText = row.cells[9]?.innerText || "";
                        if (memoText.includes("商品代")) return true;
                    }
                }
                if (record) {
                    const recordMemo = record.memo || record.remark || record.comment || record.content || record.note || "";
                    if (String(recordMemo).includes("商品代")) return true;
                }
                if (allPagesCache && allPagesCache.length > 0) {
                    const cached = allPagesCache.find(item => cleanStr(item.no) === cleanT);
                    if (cached && String(cached.memo || "").includes("商品代")) return true;
                }
                return false;
            } catch (e) { return false; }
        }
        function getMatchedLHNumber(trackingNo) {
            if (!shippingDatabase || shippingDatabase.length === 0) return '';
            const cleanT = cleanStr(trackingNo);
            const matchedItems = shippingDatabase.filter(item => cleanStr(item.tracking_no) === cleanT);
            if (matchedItems.length === 0) return '';
            const targetItem = matchedItems[0];
            const deliveryNo = targetItem.delivery_no;
            const trackingCount = (targetItem.all_trackings || []).length || 1;
            if (trackingCount === 1) return deliveryNo || '';
            return '';
        }
        function DB_Sync_Test(str) { return str && str !== "undefined" && str !== "null" && str.length > 2; }

        /* [v1.1.0 추가] 화면에서 고른 로케이션을 실제로 서버에 반영하는 API 호출
         * 개발자도구로 확인한 실제 요청: POST /admin/store/change-trackingno-location
         * payload: location_trackingno_id (트래킹 DB row id, = record.id), location (새 로케이션 값)
         * 응답: { status: "success", tracking_no, msg, print_url } */
        function updateTrackingLocation(locationTrackingnoId, newLocation) {
            return new Promise((resolve) => {
                if (!locationTrackingnoId || !newLocation) { resolve(false); return; }
                $.ajax({
                    type: 'POST',
                    url: window.location.origin + '/admin/store/change-trackingno-location',
                    data: { location_trackingno_id: locationTrackingnoId, location: newLocation },
                    dataType: 'json',
                    headers: { 'X-CSRF-TOKEN': getCsrfToken() }
                }).done(function(json) {
                    if (json && json.status === 'success') {
                        resolve(true);
                    } else {
                        console.error('[Tampermonkey] 로케이션 변경 실패 응답:', json);
                        resolve(false);
                    }
                }).fail(function(xhr) {
                    console.error('[Tampermonkey] 로케이션 변경 API 통신 오류:', xhr);
                    resolve(false);
                });
            });
        }

        function generateCustomLabelHTML(labels, trackingNo) {
            let labelsHTML = '';
            let qrScripts = '';
            labels.forEach((label, i) => {
                const lh = String(label.deliveryNoRaw || "").trim();
                const isOcean = /OH/i.test(lh);
                const finalLocationToPrint = label.location || 'N/A';
                const trNo = label.trackingNo || trackingNo || "";
                const isShouhinda = lh === "商品代";
                const lhText = lh || '미출고 / 일반입고';
                const lhStyle = (lh && !isShouhinda) ? '' : 'font-size: 20px !important; font-weight: 900 !important; white-space: nowrap !important; letter-spacing: -0.5px !important; word-break: keep-all !important; display: inline-block !important; text-align: center !important; width: 100% !important;';
                const lhGroupStyle = (lh && !isShouhinda) ? '' : 'width: 100% !important; text-align: center !important; justify-content: center !important; align-items: center !important; max-width: 100% !important;';
                labelsHTML += `
                    <div class="page">
                        <div class="container">
                            <div class="header-sec">
                                <div class="lh-info-group" style="${lhGroupStyle}">
                                    <span class="lh-no" style="${lhStyle}">${lhText}</span>
                                    ${isOcean ? '<span class="ocean-tag">(OCEAN)</span>' : ''}
                                </div>
                                ${(lh && !isShouhinda) ? `<div id="qr_lh_${i}" class="qr-small"></div>` : ''}
                            </div>
                            <div class="loc-sec">${finalLocationToPrint}</div>
                            <div class="bottom-sec">
                                <div class="bottom-left">
                                    <div class="track-info">
                                        <div class="track-no-group">
                                            <span class="track-main">${trNo.length > 4 ? trNo.slice(0, -4) : ''}</span>
                                            <span class="track-bold">${trNo.slice(-4)}</span>
                                        </div>
                                        <span class="box-num">(${label.boxIndex || (i + 1) + '/' + labels.length})</span>
                                    </div>
                                    <div class="footer-info" style="margin-top: 1mm;">
                                        <span style="font-size: 18px; font-weight: 900; color: #000; display: block; line-height: 1;">ID: ${label.userNo}</span>
                                    </div>
                                </div>
                                <div class="bottom-right">
                                    <div id="qr_tr_${i}" class="qr-big"></div>
                                    <div class="date-info" style="font-size: 11px; font-weight: 500; color: #666; margin-top: 1px; white-space: nowrap;">(${label.stockDate})</div>
                                </div>
                            </div>
                        </div>
                    </div>`;
                if (lh && lh !== "undefined" && DB_Sync_Test(lh) && !isShouhinda) {
                    qrScripts += 'try { new QRCode(document.getElementById("qr_lh_' + i + '"), { text: "' + lh + '", width: 45, height: 45, correctLevel: 1 }); } catch(e){} ';
                }
                if (trNo) {
                    qrScripts += 'try { new QRCode(document.getElementById("qr_tr_' + i + '"), { text: "' + trNo + '", width: 45, height: 45, correctLevel: 1 }); } catch(e){} ';
                }
            });
            return `
                <!DOCTYPE html>
                <html lang="ko">
                <head>
                    <meta charset="UTF-8">
                    <title>라벨 일괄 인쇄</title>
                    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
                    <style>
                        body { margin: 0; padding: 0; font-family: "Malgun Gothic", sans-serif; background: #fff; }
                        .page { page-break-after: always; width: 100%; display: flex; flex-direction: column; align-items: center; padding: 1mm 0; }
                        .container { width: 55mm; height: 45mm; border: 1.5px solid #000; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; position: relative; overflow: hidden; background-color: #fff; }
                        .header-sec { height: 14mm; display: flex; align-items: center; justify-content: space-between; padding: 0 2mm; border-bottom: 1.5px solid #000; position: relative; box-sizing: border-box; }
                        .lh-info-group { display: flex; flex-direction: column; justify-content: center; text-align: left; max-width: 38mm; white-space: nowrap !important; }
                        .lh-no { font-size: 18px; font-weight: 900; letter-spacing: -0.3px; line-height: 1.1; word-break: break-all; color: #000; }
                        .ocean-tag { font-size: 8px; font-weight: 900; color: #1f2937; margin-top: 1px; font-family: "Arial Black", sans-serif; }
                        .qr-small { width: 12mm; height: 12mm; display: flex; align-items: center; justify-content: center; background: #fff; }
                        .loc-sec { height: 8mm; background: #f1f3f5; border-bottom: 1.5px solid #000; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 900; box-sizing: border-box; text-align: center; }
                        .bottom-sec { height: 23mm; display: flex; justify-content: space-between; padding: 1mm 2mm; box-sizing: border-box; }
                        .bottom-left { display: flex; flex-direction: column; justify-content: space-between; height: 100%; max-width: 36mm; text-align: left; }
                        .track-no-group { display: flex; align-items: baseline; justify-content: flex-start; }
                        .track-main { font-size: 14px; font-weight: bold; color: #333; }
                        .track-bold { font-size: 23px; font-weight: 900; text-decoration: underline; margin: 0 3px; }
                        .box-num { font-size: 16px; color: blue; font-weight: bold; }
                        .bottom-right { display: flex; flex-direction: column; justify-content: space-between; align-items: center; width: 14mm; height: 100%; }
                        .qr-big { width: 12mm; height: 12mm; display: flex; align-items: center; justify-content: center; background: #fff; }
                        @media print { .no-print { display: none; } .page { padding: 0; } }
                    </style>
                </head>
                <body>
                    <div class="no-print" style="text-align:center;margin:10px;"><button onclick="window.print()" style="padding:10px 30px; font-weight:bold; cursor:pointer;">인쇄하기</button></div>
                    ${labelsHTML}
                    <script>
                        window.onload = function() {
                            ${qrScripts}
                            setTimeout(function() { window.print(); }, 400);
                        };
                    </script>
                </body>
                </html>`;
        }

        function addRowToModalTable(record, finalLoc) {
            let rowCount = $("#scan-tbody tr").length + 1;
            const companyId = $('#modal_delivery_company').val() || '';
            const formattedTracking = formatTextWithHyphenForLabel(record.tracking_no, companyId);
            let tr = $('<tr>')
                .attr('data-trackingno', record.tracking_no)
                .data('trackingno', record.tracking_no)
                .append(`
                    <td>${rowCount}</td>
                    <td>${record.user_name || '-'}</td>
                    <td>${record.stock_date || getTodayDate()}</td>
                    <td>${record.stock_end_date || '-'}</td>
                    <td>${formattedTracking}</td>
                    <td>1</td>
                    <td style="font-weight:bold; color:#28a745;">${finalLoc}</td>
                    <td>${record.delivery_company || '-'}</td>
                    <td><button class="btn btn-danger btn-sm btn-delete btn-delete-temp-${record.id}" data-id="${record.id}"><i class="fa fa-trash"></i></button></td>
                `);
            $("#scan-tbody").append(tr);
        }

        function bindCustomDeleteHandler() {
            const scanTbody = $('#scan-tbody');
            if (!scanTbody.length) return;
            scanTbody.off('click', '.btn-delete');
            scanTbody.on('click', '.btn-delete', function(e) {
                e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
                const $btn = $(this);
                const id = $btn.attr('data-id') || $btn.data('id');
                if (!id) return;
                if (!confirm('削除しますか？')) return;
                const csrfToken = getCsrfToken();
                $.ajax({
                    type: 'POST', url: window.location.origin + '/admin/store/ajax_delete_trackingno',
                    data: { id: id, _token: csrfToken }, dataType: 'json',
                    headers: { 'X-CSRF-TOKEN': csrfToken }
                }).done(function(json) {
                    if (json && (!json.error_msg || json.error_msg === "")) {
                        $btn.closest('tr').remove();
                        initLocationTrackingSync();
                    } else { alert(json.error_msg || "삭제 실패"); }
                }).fail(function() { $btn.closest('tr').remove(); });
            });
        }

        function injectLocationUIIntoStoreModal() {
            if ($('#custom_loc_integration_area').length) return;
            const uiHtml = `
                <div id="custom_loc_integration_area" class="col-lg-12 mb-3 mt-2">
                    <div class="location-picker-container" style="padding: 10px !important; background: #f8fbff; border: 2px solid #e1f0ff; border-radius: 12px;">
                        <div class="picker-header" style="margin-bottom: 5px !important; display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight: bold; color: #343a40; font-size: 13px;">지정 로케이션 상태</span>
                            <button id="btn-refresh-store-locs" class="btn btn-outline-primary btn-sm" style="font-weight: 700; border-radius: 8px; padding: 2px 10px; font-size: 11px;" type="button">🔄 업데이트</button>
                        </div>
                        <div class="d-flex align-items-center gap-2 mt-2" style="border-top:1px solid #eee; padding-top:10px;">
                            <strong style="font-size:12px; color:#495057;">선택된 대기열:</strong>
                            <div id="selected_queue_area" style="display:flex; gap:5px; flex-wrap:wrap;">
                                <span style="color:#aaa; font-size:11px;">선택 항목 없음</span>
                            </div>
                            <button type="button" id="btn_reset_all" class="btn btn-link btn-xs ms-auto" style="color:#dc3545; font-weight:bold; font-size:11px; padding: 0; text-decoration:none;">[초기화]</button>
                        </div>
                        <div class="d-flex gap-2 align-items-center mt-2" style="border-top:1px solid #eee; padding-top:10px;">
                            <button id="btn_c62_fixed_modal" class="btn btn-success btn-sm flex-fill" style="font-weight: bold; font-size: 12px;" type="button">서류 (0)</button>
                            <button id="btn_size60_modal" class="btn btn-primary btn-sm flex-fill" style="font-weight: bold; font-size: 12px;" type="button">60사이즈 (0)</button>
                            <button id="btn_large_modal" class="btn btn-warning btn-sm flex-fill" style="font-weight: bold; font-size: 12px;" type="button">대형 (0)</button>
                            <button id="btn_msd_modal" class="btn btn-info btn-sm flex-fill" style="font-weight: bold; font-size: 12px;" type="button">MSD (0)</button>
                        </div>
                        <div id="dynamic-loc-picker-section" style="display:none;"></div>
                    </div>
                </div>
            `;
            $('#modal-input-area').prepend(uiHtml);
            $('#btn-refresh-store-locs').on('click', function() { initLocationTrackingSync(true); });
            $('#btn_reset_all').on('click', resetAllSelectionStore);
            renderDynamicLocationPickerStore();
            initLocationTrackingSync();
        }

        function renderMsdList() {
            const $targetSection = $('#dynamic-loc-picker-section');
            if (!$targetSection.length) return;
            $targetSection.empty();
            let msdPool = [];
            realtimeEmptyLocations.forEach(loc => {
                if (selectedLocList.includes(loc)) return;
                if (loc.startsWith('MSD')) msdPool.push(loc);
            });
            if (msdPool.length === 0) {
                $targetSection.html('<div style="padding: 10px; color: #dc3545; font-size: 12px; font-weight: bold; text-align: center;">사용 가능한 MSD 로케이션이 없습니다.</div>');
                return;
            }
            let msdHtml = `<div style="margin-top: 12px; padding: 12px; background: #e3f2fd; border: 1.5px solid #90caf9; border-radius: 10px;">
                <div style="font-weight: bold; font-size: 12px; color: #0d47a1; margin-bottom: 8px;">📌 MSD 빈 로케이션 목록 (클릭 지정)</div>
                <div style="display: flex; flex-wrap: wrap; gap: 6px; max-height: 150px; overflow-y: auto;">`;
            msdPool.forEach(loc => {
                msdHtml += `<button type="button" class="btn btn-outline-info btn-xs btn-msd-select-item" data-loc="${loc}" style="padding: 4px 10px; font-size: 11px; font-weight: bold; margin: 2px 0;">${loc}</button>`;
            });
            msdHtml += `</div></div>`;
            $targetSection.html(msdHtml);
            $targetSection.off('click', '.btn-msd-select-item').on('click', '.btn-msd-select-item', function(e) {
                e.preventDefault(); e.stopPropagation();
                const clickedLoc = $(this).data('loc');
                const boxCount = parseInt($('input[name="quantity"]').val()) || 1;
                if (selectedLocList.length >= boxCount) { alert("이미 지정이 완료되었습니다."); return; }
                selectedLocList.push(clickedLoc);
                renderQueueUIStore();
                renderDynamicLocationPickerStore();
                $('#scan_tracking_no').focus();
            });
        }

        function renderDynamicLocationPickerStore() {
            let c62Pool = [], size60Pool = [], largePool = [], msdPool = [];
            realtimeEmptyLocations.forEach(loc => {
                if (selectedLocList.includes(loc)) return;
                const parts = loc.split('-');
                const zonePrefix = parts[0];
                const floor = parts[1];
                if (zonePrefix === 'C6' && floor === '2') c62Pool.push(loc);
                if (['C4', 'C5', 'C6'].includes(zonePrefix) && !(zonePrefix === 'C6' && ['2', '4'].includes(floor))) size60Pool.push(loc);
                if (['F4', 'F5', 'F6'].includes(zonePrefix)) largePool.push(loc);
                if (zonePrefix === 'MSD') msdPool.push(loc);
            });
            $('#btn_c62_fixed_modal').text(`서류 (${c62Pool.length})`);
            $('#btn_size60_modal').text(`60사이즈 (${size60Pool.length})`);
            $('#btn_large_modal').text(`대형 (${largePool.length})`);
            $('#btn_msd_modal').text(`MSD (${msdPool.length})`);
        }

        function pickRandomStore(pool, poolName) {
            if (!pool || pool.length === 0) { alert(`${poolName}에 빈 자리가 없습니다.`); return; }
            const boxCount = parseInt($('input[name="quantity"]').val()) || 1;
            const remainingNeeded = boxCount - selectedLocList.length;
            if (remainingNeeded <= 0) { alert("이미 지정이 완료되었습니다."); return; }
            let localPool = pool.filter(l => !selectedLocList.includes(l));
            for (let i = 0; i < remainingNeeded; i++) {
                if (localPool.length === 0) break;
                const randIdx = Math.floor(Math.random() * localPool.length);
                selectedLocList.push(localPool.splice(randIdx, 1)[0]);
            }
            renderQueueUIStore();
            renderDynamicLocationPickerStore();
        }

        function renderQueueUIStore() {
            const area = $('#selected_queue_area').empty();
            selectedLocList.forEach((loc, i) => {
                area.append(`<span style="padding:2px 8px; background:#28a745; color:#fff; border-radius:4px; font-size:11px; font-weight:bold;">${i+1}번: ${loc}</span>`);
            });
            if (selectedLocList.length === 0) area.append('<span style="color:#aaa; font-size:11px;">선택 항목 없음</span>');
        }

        function resetAllSelectionStore() {
            selectedLocList = [];
            renderQueueUIStore();
            $('#dynamic-loc-picker-section').hide().empty();
            initLocationTrackingSync();
        }

        async function initLocationTrackingSync(force = false) {
            renderDynamicLocationPickerStore();
            if (!force && isLocationSyncing) return;
            isLocationSyncing = true;
            const targetUrl = window.location.origin + '/admin/store/location-tracking?pagesize=1000';
            try {
                const response = await fetch(targetUrl);
                const html = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const rows = doc.querySelectorAll('table tbody tr');
                let emptyLocs = [];
                rows.forEach(row => {
                    if (row.cells && row.cells.length >= 5) {
                        const locName = row.cells[1]?.innerText.trim().toUpperCase() || "";
                        const trackingNo = row.cells[2]?.innerText.trim() || "";
                        const statusCell = row.cells[4];
                        if (/^[A-Z][A-Z0-9]*-\d+/.test(locName)) {
                            const isTrEmpty = ["", "-", "0", "0건", "なし"].includes(trackingNo);
                            const hasCircleIcon = statusCell && (statusCell.querySelector('.fa-circle, .fa-regular, i') !== null);
                            if (isTrEmpty && !hasCircleIcon) emptyLocs.push(locName);
                        }
                    }
                });
                realtimeEmptyLocations = emptyLocs;
                renderDynamicLocationPickerStore();
            } catch (err) {
                console.error("로케이션 동기화 에러:", err);
            } finally {
                isLocationSyncing = false;
            }
        }

        async function executeScanSubmit($input) {
            let tracking_no = $input.val().trim();
            if (!tracking_no) return;
            const boxCount = parseInt($('input[name="quantity"]').val()) || 1;
            const delivery_company = $('#modal_delivery_company').val();
            isStoreModalScanning = true;
            if (parseInt(delivery_company) === 5) tracking_no = tracking_no.substring(0, 11);
            const requestData = {
                tracking_no: tracking_no, quantity: boxCount, delivery_company: delivery_company,
                user_id: $('#modal_search_user').val(), supplier_id: $('#modal_search_supplier').val(),
                purchase_price: $('input[name="purchase_price"]').val(),
                domestic_shipping: $('input[name="domestic_shipping"]').val(), _token: getCsrfToken()
            };
            const win = window.open('about:blank', '_blank', 'width=600,height=550');
            if (win) win.document.write("<html><body style='text-align:center;font-family:sans-serif;padding-top:20%;'><h3>라벨 데이터 구성 중...</h3></body></html>");

            $.ajax({ type: 'POST', url: window.location.origin + "/admin/store/ajax_save_trackingno", data: requestData, dataType: 'json' })
            .done(async function (json) {
                try {
                    if (json.error_msg) { alert(json.error_msg); if (win) win.close(); isStoreModalScanning = false; return; }
                    const recordsRaw = json.records || json.record;
                    if (!recordsRaw) { if (win) win.close(); $input.val('').focus(); resetAllSelectionStore(); isStoreModalScanning = false; return; }
                    let records = Array.isArray(recordsRaw) ? recordsRaw : [recordsRaw];
                    let labelsDataStack = [];
                    for (let index = 0; index < records.length; index++) {
                        const record = records[index];
                        // [v1.1.0] 화면에서 미리 골라둔 로케이션(selectedLocList)이 있으면
                        // change-trackingno-location API로 실제 위치를 변경하고, 성공한 값을 사용.
                        // 선택이 없거나 변경이 실패하면 서버가 기본 배정한 record.location을 그대로 사용.
                        const desiredLoc = selectedLocList[index];
                        let targetLoc = record.location;
                        if (desiredLoc && record.id) {
                            const changed = await updateTrackingLocation(record.id, desiredLoc);
                            if (changed) {
                                targetLoc = desiredLoc;
                            } else {
                                alert(`[로케이션 변경 실패] ${record.tracking_no || tracking_no}\n선택한 로케이션(${desiredLoc})으로 변경하지 못해, 기존 배정 로케이션(${record.location})으로 라벨이 출력됩니다.`);
                            }
                        }
                        let lhNo = getMatchedLHNumber(tracking_no);
                        if (hasShouhinda(tracking_no, record)) lhNo = "商品代";
                        labelsDataStack.push({
                            location: targetLoc, userNo: $('#modal_search_user').val() || '1219',
                            stockDate: getTodayDate(), trackingNo: tracking_no,
                            boxIndex: `${index + 1}/${records.length}`, deliveryNoRaw: lhNo
                        });
                        addRowToModalTable(record, targetLoc);
                    }
                    if (labelsDataStack.length > 0 && win) {
                        const labelHtmlSource = generateCustomLabelHTML(labelsDataStack, tracking_no);
                        win.document.open(); win.document.write(labelHtmlSource); win.document.close();
                    } else if (win) { win.close(); }
                    $input.val('').focus();
                    resetAllSelectionStore();
                    isStoreModalScanning = false;
                } catch (err) {
                    if (win) win.close();
                    alert("처리 중 오류 발생: " + err.message);
                    isStoreModalScanning = false;
                }
            }).fail(function() {
                if (win) win.close();
                alert("서버 통신 오류가 발생했습니다.");
                isStoreModalScanning = false;
            });
        }

        if (document.body) {
            shippingSyncPromise = initShippingSync();
            initLocationTrackingSync();
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                shippingSyncPromise = initShippingSync();
                initLocationTrackingSync();
            });
        }

        const initJQueryBindings = () => {
            if (window.$) {
                $(document).ready(function() {
                    bindCustomDeleteHandler();
                    $('#storeModal').on('shown.bs.modal', function() {
                        injectLocationUIIntoStoreModal();
                        bindCustomDeleteHandler();
                    });
                    $(document).off('click', '#btn_c62_fixed_modal').on('click', '#btn_c62_fixed_modal', function(e) {
                        e.preventDefault();
                        let c62Pool = realtimeEmptyLocations.filter(loc => loc.startsWith('C6-2'));
                        pickRandomStore(c62Pool, "서류 전용 (C6-2층)");
                    });
                    $(document).off('click', '#btn_size60_modal').on('click', '#btn_size60_modal', function(e) {
                        e.preventDefault();
                        let size60Pool = realtimeEmptyLocations.filter(loc => ['C4', 'C5', 'C6'].some(z => loc.startsWith(z)) && !loc.startsWith('C6-2') && !loc.startsWith('C6-4'));
                        pickRandomStore(size60Pool, "60사이즈");
                    });
                    $(document).off('click', '#btn_large_modal').on('click', '#btn_large_modal', function(e) {
                        e.preventDefault();
                        let largePool = realtimeEmptyLocations.filter(loc => ['F4', 'F5', 'F6'].some(z => loc.startsWith(z)));
                        pickRandomStore(largePool, "대형 (F구역)");
                    });
                    $(document).off('click', '#btn_msd_modal').on('click', '#btn_msd_modal', function(e) {
                        e.preventDefault();
                        const $targetSection = $('#dynamic-loc-picker-section');
                        if ($targetSection.is(':visible')) { $targetSection.slideUp().empty(); }
                        else { renderMsdList(); $targetSection.slideDown(); }
                    });
                    if (!isKeyDownCaptureBound) {
                        document.addEventListener('keydown', function(event) {
                            if (event.key === "Enter") {
                                const activeModal = document.querySelector('.modal.show, .modal[style*="display: block"]');
                                if (activeModal) {
                                    const scanInput = document.getElementById('scan_tracking_no');
                                    if (scanInput && document.activeElement === scanInput) {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        executeScanSubmit($(scanInput));
                                    }
                                }
                            }
                        }, true);
                        isKeyDownCaptureBound = true;
                    }
                });
            } else {
                setTimeout(initJQueryBindings, 50);
            }
        };
        initJQueryBindings();
    })();

    /* ------------------------------------------------------------
     * [블록 2] A-1-2 회원번호 고정 (특수문자 제거형)
     * - 상단에 선택된 회원 정보를 스캔 테이블 각 행에 자동 주입
     * ------------------------------------------------------------ */
    (function memberFixBlock() {
        let lastFullMember = "";

        function captureMember() {
            const display = document.querySelector('#select2-modal_search_user-container') ||
                            document.querySelector('.select2-selection__rendered');
            if (display) {
                let text = display.innerText.trim();
                if (text && !text.includes('선택') && /\d+\s*:\s*/.test(text)) {
                    text = text.replace(/[×x]/g, '').replace(/\n/g, ' ').trim();
                    lastFullMember = text;
                }
            }
        }

        function injectToRow(row) {
            if (!lastFullMember || !row || row.dataset.fixed === "true") return;
            const nameCell = row.cells[1];
            if (nameCell) {
                nameCell.innerText = lastFullMember;
                nameCell.style.cssText = "background-color: #fff9c4 !important; font-weight: bold !important; color: #000 !important; white-space: nowrap;";
                row.dataset.fixed = "true";
            }
        }

        document.addEventListener('mousedown', () => setTimeout(captureMember, 150), true);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                captureMember();
                setTimeout(() => {
                    const rows = document.querySelectorAll('#scan-tbody tr');
                    rows.forEach(injectToRow);
                }, 200);
            }
        }, true);

        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeName === 'TR') {
                        captureMember();
                        injectToRow(node);
                        setTimeout(() => injectToRow(node), 500);
                    }
                });
            });
        });

        function init() {
            const targetTbody = document.getElementById('scan-tbody') || document.querySelector('.table tbody');
            if (targetTbody && !targetTbody.dataset.isWatchedMemberFix) {
                observer.observe(targetTbody, { childList: true });
                targetTbody.dataset.isWatchedMemberFix = "true";
            }
            captureMember();
        }
        setInterval(init, 1500);
    })();

    /* ------------------------------------------------------------
     * [블록 3] A-1-3 하이픈 구분 (화면 표시용)
     * - 스캔 테이블에 표시되는 운송장 번호에 배송사별 하이픈 포맷 적용
     * ------------------------------------------------------------ */
    (function hyphenDisplayBlock() {
        function formatTextWithHyphen(cleanText, companyId) {
            let id = parseInt(companyId);
            if (id >= 1 && id <= 3) {
                if (cleanText.length <= 4) return cleanText;
                if (cleanText.length <= 8) return cleanText.replace(/^([A-Za-z0-9]{4})([A-Za-z0-9]{1,4})/, '$1-$2');
                return cleanText.replace(/^([A-Za-z0-9]{4})([A-Za-z0-9]{4})([A-Za-z0-9]{1,12})/, '$1-$2-$3');
            } else if (id === 4 || id === 5) {
                if (cleanText.length <= 3) return cleanText;
                if (cleanText.length <= 6) return cleanText.replace(/^([A-Za-z0-9]{3})([A-Za-z0-9]{1,3})/, '$1-$2');
                return cleanText.replace(/^([A-Za-z0-9]{3})([A-Za-z0-9]{3})([A-Za-z0-9]{1,12})/, '$1-$2-$3');
            }
            return cleanText;
        }

        function processRow(tr) {
            if (tr.dataset.hyphenApplied === "true") return;
            const companySelect = document.getElementById('modal_delivery_company');
            if (!companySelect) return;
            const currentCompanyId = companySelect.value;
            const tds = tr.getElementsByTagName('td');
            if (tds.length >= 5) {
                const targetTd = tds[4];
                const originalText = targetTd.textContent.trim();
                const cleanText = originalText.replace(/[^A-Za-z0-9]/g, '');
                if (cleanText.length > 0) {
                    targetTd.textContent = formatTextWithHyphen(cleanText, currentCompanyId);
                    tr.dataset.hyphenApplied = "true";
                }
            }
        }

        function startTableObserver() {
            const tbody = document.getElementById('scan-tbody');
            if (!tbody) return;
            const existingRows = tbody.getElementsByTagName('tr');
            for (let tr of existingRows) processRow(tr);
            const tableObserver = new MutationObserver((mutations) => {
                for (let mutation of mutations) {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'TR') {
                                setTimeout(() => processRow(node), 50);
                            }
                        });
                    }
                }
            });
            tableObserver.observe(tbody, { childList: true });
        }

        const pageObserver = new MutationObserver((mutations, obs) => {
            const tbody = document.getElementById('scan-tbody');
            if (tbody) { startTableObserver(); obs.disconnect(); }
        });
        pageObserver.observe(document.body, { childList: true, subtree: true });
    })();

    /* ------------------------------------------------------------
     * [블록 4] A-1-12 발췌 — 입고 화면 JAN코드 강조 표시
     * - 원본 A-1-12는 포장 기능도 포함하므로, 입고 관련 부분만 발췌함
     * ------------------------------------------------------------ */
    (function janHighlightBlock() {
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

        processInboundJanCodes();
        const observer = new MutationObserver(() => processInboundJanCodes());
        observer.observe(document.body, { childList: true, subtree: true });
    })();

})();
