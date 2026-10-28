// ==UserScript==
// @name         [物流] ロケーション移動（一括編集・印刷）
// @namespace    https://github.com/asics67-lab/tampermonkey-scripts
// @version      8.8
// @description  入荷トラッキング画面：ロケーション一括移動・ラベル印刷。v8.8 追跡番号検索の修正（全ページ読込・ハイフン対応・サーバー検索）
// @author       物流チーム
// @match        https://www.platform.co.jp/admin/store/trackingno*
// @match        https://platform.co.jp/admin/store/trackingno*
// @match        https://platform.aispel.com/admin/store/trackingno*
// @updateURL    https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/%ED%83%9C%EB%B8%94%EB%A6%BF/location-move.user.js
// @downloadURL  https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/%ED%83%9C%EB%B8%94%EB%A6%BF/location-move.user.js
// @grant        none
// @noframes
// ==/UserScript==

/* =====================================================================
 *  [2] 로케이션 이동 v8.7  — /admin/store/trackingno
 * ===================================================================== */

(function() {
    'use strict';
    if (!/^\/admin\/store\/trackingno/.test(location.pathname)) return; // 입고 트래킹 페이지에서만 실행

    let selectedOrder = []; // 체크된 순서와 지정 로케이션을 저장할 실시간 바인딩 배열
    let lastFocusedInput = null; // 마지막으로 포커스된 입력창 저장
    let shippingDatabase = []; // 세션 우회로 수집된 출고(LH) 매핑 DB
    let searchedItemsCache = []; // 검색된 임시 항목들을 저장할 캐시 (멀티 박스 누락 방지용)
    let realtimeEmptyLocations = []; // 서버 상에서 실제로 비어있는 로케이션 캐시 배열
    let isLocationSyncing = false; // 동기화 중복 실행 방지 플래그
    let lastRenderedLocsKey = ''; // 퀵선택 깜빡임 방지용 최종 렌더링 상태 캐시 키

    // 전체 페이지 데이터 즉시 검색용 캐시 저장소
    let allPagesCache = [];
    let isAllPagesCaching = false;

    // 오늘 날짜 구하기 (YYYY-MM-DD)
    function getTodayDate() {
        const now = new Date();
        return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    }

    // 문자열 공백 및 특수문자 제거 비교용
    function cleanStr(str) {
        return String(str || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().trim();
    }

    // =========================================================================
    // [데이터 수집 엔진 1] 포장 명세서 데이터 백그라운드 스크래핑 (LH 번호 확보용)
    // =========================================================================
    function initShippingSync() {
        console.log("[Tampermonkey] 出荷マッチングDB同期エンジン起動...");

        const iframe = document.createElement('iframe');
        iframe.src = window.location.origin + '/admin/shipping/packing?pagesize=1000';
        iframe.style.display = 'none';
        iframe.id = 'tampermonkey-shipping-frame';

        iframe.onload = function() {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                const rows = iframeDoc.querySelectorAll('#packingListTbody tr');

                let tempDb = [];
                rows.forEach(row => {
                    const chk = row.querySelector('.sub_checkbox');
                    if (chk) {
                        let trackingNo = String(chk.getAttribute('data-trackingno') || '').trim();
                        const trackingLink = row.querySelector('.show_tracking_page');
                        if (!trackingNo && trackingLink) {
                            trackingNo = trackingLink.innerText.trim();
                        }

                        let deliveryNo = "";
                        const cells = row.querySelectorAll('td');
                        for (let cell of cells) {
                            const text = cell.innerText || "";
                            const matchLH = text.match(/(LH|LS|OH)\d+/i);
                            if (matchLH) {
                                deliveryNo = matchLH[0].toUpperCase();
                                break;
                            }
                        }

                        let userId = "";
                        const userLink = row.querySelector('.show-tooltip');
                        if (userLink) {
                            const userText = userLink.innerText.trim();
                            const match = userText.match(/\d+/);
                            if (match) userId = match[0];
                        }

                        if (trackingNo && deliveryNo) {
                            tempDb.push({
                                tracking_no: trackingNo,
                                delivery_no: deliveryNo,
                                user_id: userId
                            });
                        }
                    }
                });

                shippingDatabase = tempDb;
                console.log("[Tampermonkey] マッチングDB構築成功！ データ数:", shippingDatabase.length);

                const oldFrame = document.getElementById('tampermonkey-shipping-frame');
                if (oldFrame && oldFrame !== iframe) oldFrame.remove();
            } catch (e) {
                console.error("[Tampermonkey] iframeがセキュリティポリシーでブロック、バックアップfetchに切替", e);
                fetchFallback();
            }
        };

        const checkExist = document.getElementById('tampermonkey-shipping-frame');
        if (checkExist) checkExist.remove();
        document.body.appendChild(iframe);
    }

    function fetchFallback() {
        const targetUrl = window.location.origin + '/admin/shipping/packing?pagesize=1000';
        fetch(targetUrl)
            .then(response => response.text())
            .then(html => {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const rows = doc.querySelectorAll('#packingListTbody tr');
                let tempDb = [];
                rows.forEach(row => {
                    const chk = row.querySelector('.sub_checkbox');
                    if (chk) {
                        let trackingNo = String(chk.getAttribute('data-trackingno') || '').trim();
                        const trackingLink = row.querySelector('.show_tracking_page');
                        if (!trackingNo && trackingLink) trackingNo = trackingLink.innerText.trim();

                        let deliveryNo = "";
                        const cells = row.querySelectorAll('td');
                        for (let cell of cells) {
                            const text = cell.innerText || "";
                            const matchLH = text.match(/(LH|LS|OH)\d+/i);
                            if (matchLH) {
                                deliveryNo = matchLH[0].toUpperCase();
                                break;
                            }
                        }
                        let userId = "";
                        const userLink = doc.querySelector('.show-tooltip');
                        if (userLink) {
                            const match = userLink.innerText.trim().match(/\d+/);
                            if (match) userId = match[0];
                        }
                        if (trackingNo && deliveryNo) {
                            tempDb.push({ tracking_no: trackingNo, delivery_no: deliveryNo, user_id: userId });
                        }
                    }
                });
                shippingDatabase = tempDb;
            }).catch(err => console.log("Fallback 読み込み失敗", err));
    }

    // =========================================================================
    // [DATA 수집 엔진 2] 실시간 빈 로케이션 트래킹 데이터 백그라운드 동기화 (정밀 매칭 엔진)
    // =========================================================================
    async function initLocationTrackingSync(forceRender = false) {
        if (isLocationSyncing) return;
        isLocationSyncing = true;
        console.log("[Tampermonkey] 空きロケーションのリアルタイム同期エンジン起動...");

        const targetUrl = window.location.origin + '/admin/store/location-tracking?pagesize=1000';
        try {
            const response = await fetch(targetUrl);
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const rows = doc.querySelectorAll('tbody tr');

            // 세션 만료, 로그인 리다이렉트, 데이터 없음 등으로 빈 페이지가 오면 기존 캐시 보호 및 업데이트 생략
            if (!rows || rows.length === 0) {
                console.log("[Tampermonkey] 空きロケーション同期失敗：テーブル行(tr)がないかセッション切れです。既存データを保持します。");
                isLocationSyncing = false;
                return;
            }

            let emptyLocs = [];
            let locIdx = 1;
            let trackIdx = 2;
            let boxCountIdx = 3;
            let inUseIdx = 4;

            const headers = doc.querySelectorAll('thead th');
            if (headers.length > 0) {
                headers.forEach((th, idx) => {
                    const text = th.innerText.toUpperCase().replace(/\s+/g, '');
                    if (text.includes('LOCATION') || text.includes('로케이션') || text.includes('위치') || text.includes('ロケーション') || text.includes('库위') || text.includes('庫위')) {
                        locIdx = idx;
                    }
                    if (text.includes('TRACKING') || text.includes('운송장') || text.includes('송장')) {
                        trackIdx = idx;
                    }
                    if (text.includes('BOX') || text.includes('박스') || text.includes('箱') || text.includes('수량') || text.includes('數量')) {
                        boxCountIdx = idx;
                    }
                    if (text.includes('USE') || text.includes('사용') || text.includes('使')) {
                        inUseIdx = idx;
                    }
                });
            }

            rows.forEach(row => {
                if (row.cells.length > Math.max(locIdx, trackIdx, boxCountIdx, inUseIdx)) {
                    const locCell = row.cells[locIdx];
                    const trackCell = row.cells[trackIdx];
                    const inUseCell = row.cells[inUseIdx];

                    if (locCell) {
                        const locName = locCell.innerText.trim().toUpperCase();
                        const trackingNo = trackCell ? trackCell.innerText.trim() : "";

                        // FontAwesome 원형 마커나 임의의 서술 아이콘 탑재 여부 감지
                        const hasCircleIcon = inUseCell ? (inUseCell.querySelector('.fa-circle, .fa-regular, i') !== null) : false;

                        // [피드백 적용]: 박스 수량을 완전히 무시하고 오직 운송장 번호 유무("-" 또는 "0"이나 공백)와 사용 마커 유무만으로 빈방을 정확히 감지
                        if (locName && (trackingNo === "" || trackingNo === "-" || trackingNo === "0") && !hasCircleIcon) {
                            emptyLocs.push(locName);
                        }
                    }
                }
            });

            realtimeEmptyLocations = emptyLocs;
            console.log("[Tampermonkey] 空きロケーション同期成功！ 空き数:", realtimeEmptyLocations.length);

            // [피드백 반영]: 사용자가 모달 편집창을 열어 작업을 진행하는 도중에는 백그라운드 자동 동기화가 돌아도 UI를 지워 깜빡임을 유발하지 않도록 연동 유예
            const modalOverlay = document.getElementById('custom-modal-overlay');
            if (forceRender || !modalOverlay || modalOverlay.style.display !== 'flex') {
                renderDynamicLocationPicker();
            } else {
                console.log("[Tampermonkey] モーダル編集中のため、データのみ更新しUIは固定します。");
            }
        } catch (err) {
            console.error("[Tampermonkey] ロケーション同期失敗:", err);
        } finally {
            isLocationSyncing = false;
        }
    }

    // =========================================================================
    // [데이터 수집 엔진 3] 모달 진입 시 전체 페이지 데이터 고속 크롤링 캐싱 필터
    // =========================================================================
    // [v1.0.1] 행(tr) 1개에서 검색용 데이터 추출 (전체 페이지 캐시 / 서버 검색 공용)
    function parseTrackingRow(row) {
        const tLink = row.querySelector('.show_tracking_page');
        const locCell = row.cells ? row.cells[3] : null;
        const cb = row.querySelector('.sub_checkbox');
        if (!tLink || !locCell || !cb) return null;
        // DOMParser 문서는 화면에 그려지지 않아 innerText 대신 textContent 사용 (줄바꿈·공백 제거)
        const tNo = String(tLink.textContent || '').replace(/\s+/g, '').trim();
        const loc = String(locCell.textContent || '').replace(/\s+/g, ' ').trim();
        const locId = cb.value;
        const details = getLabelPrintData(locId, tNo, loc);
        return {
            id: locId, no: tNo, loc: loc,
            customerNo: details.customerNo, stockDate: details.stockDate, memo: details.memo,
            userNo: details.userNo, deliveryNoRaw: details.deliveryNoRaw
        };
    }

    // [v1.0.1] 시스템 검색창(검색 폼)을 이용해 서버에서 직접 트래킹 조회
    async function serverSearchTracking(q) {
        try {
            const forms = Array.from(document.querySelectorAll('form')).filter(f => (f.method || 'get').toLowerCase() === 'get');
            const form = document.getElementById('search-form') || forms.find(f => f.querySelector('input[type="text"], input[type="search"], input:not([type])'));
            if (!form) return [];
            const inputs = Array.from(form.querySelectorAll('input[type="text"], input[type="search"], input:not([type])'))
                .filter(i => i.name && !/date|from|to_|_to$|start|end/i.test(i.name));
            const target = inputs.find(i => /track|invoice|송장|keyword|search|s_no|no$/i.test(i.name)) || inputs[0];
            if (!target) return [];
            const params = new URLSearchParams(new FormData(form));
            // 날짜 등 다른 조건 때문에 안 나오는 것을 막기 위해 다른 텍스트 조건은 비움
            inputs.forEach(i => params.set(i.name, ''));
            params.set(target.name, q);
            params.set('pagesize', '1000');
            const action = form.getAttribute('action') || (location.origin + location.pathname);
            const url = new URL(action, location.origin);
            url.search = params.toString();
            const res = await fetch(url.toString(), { credentials: 'include', cache: 'no-store' });
            const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
            const items = Array.from(doc.querySelectorAll('tbody tr')).map(parseTrackingRow).filter(Boolean);
            console.log('[Tampermonkey] サーバー検索', target.name, '=', q, '→', items.length, '件');
            return items;
        } catch (e) { console.error('[Tampermonkey] サーバー検索失敗', e); return []; }
    }

    // [v1.0.1] 고정 20페이지 → 마지막 페이지까지 전부 읽기 (빈 페이지 또는 새 데이터가 없으면 종료)
    let allPagesCachedAt = 0;
    async function startPreFetchingAllPages(force = false) {
        if (isAllPagesCaching) return;
        // 캐시가 3분 이상 지났으면 자동으로 다시 읽음 (그 사이 입고된 화물도 검색되도록)
        if (!force && allPagesCache.length > 0 && Date.now() - allPagesCachedAt < 180000) return;
        isAllPagesCaching = true;

        const statusSpan = document.getElementById('remote-search-status');
        const setStatus = (html) => { if (statusSpan) { statusSpan.style.display = 'inline-block'; statusSpan.innerHTML = html; } };
        setStatus('<i class="ti ti-loader rotate"></i> 全ページのデータを読み込み中...');

        const baseUrl = window.location.origin + window.location.pathname;
        const seen = new Map();
        const PAGE_SIZE = 1000;   // 서버가 지원하지 않으면 무시되고 기본 개수로 읽힘
        const PARALLEL = 5;       // 동시에 읽는 페이지 수
        const MAX_PAGES = 300;    // 안전장치

        const fetchPage = async (p) => {
            try {
                const res = await fetch(`${baseUrl}?pagesize=${PAGE_SIZE}&page=${p}`, { credentials: 'include', cache: 'no-store' });
                const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
                return Array.from(doc.querySelectorAll('tbody tr')).map(parseTrackingRow).filter(Boolean);
            } catch (err) { console.log(`${p}ページ取得失敗`, err); return null; }
        };

        try {
            let page = 1, finished = false;
            while (!finished && page <= MAX_PAGES) {
                const nums = Array.from({ length: PARALLEL }, (_, i) => page + i);
                const results = await Promise.all(nums.map(fetchPage));
                for (const items of results) {
                    if (items === null) continue;               // 통신 실패 페이지는 건너뜀
                    let added = 0;
                    items.forEach(it => { if (!seen.has(it.id)) { seen.set(it.id, it); added++; } });
                    // 빈 페이지 또는 이미 읽은 데이터만 다시 나오면(=마지막 페이지 넘어감) 종료
                    if (items.length === 0 || added === 0) { finished = true; break; }
                }
                page += PARALLEL;
                setStatus(`<i class="ti ti-loader rotate"></i> 読み込み中... (${seen.size}件)`);
            }
            allPagesCache = Array.from(seen.values());
            allPagesCachedAt = Date.now();
            console.log("[Tampermonkey] 全ページキャッシュ成功！ データ数:", allPagesCache.length, "/ 読んだページ:", page - 1);
            setStatus(`✅ 全件検索の準備完了 (${allPagesCache.length}件)`);
            setTimeout(() => { if (statusSpan) statusSpan.style.display = 'none'; }, 2500);
            // 로딩 중에 입력해 둔 검색어가 있으면 전체 데이터로 다시 검색
            const ms = document.getElementById('modal-search-input');
            if (ms && ms.value.trim().length >= 2) ms.dispatchEvent(new Event('input'));
        } catch (e) {
            console.error("全ページキャッシュエラー:", e);
            if (statusSpan) statusSpan.style.display = 'none';
        } finally {
            isAllPagesCaching = false;
        }
    }

    // 2. UI 생성 (스타일 및 버튼)
    const setupUI = () => {
        const cardBody = document.querySelector('.card-body');
        const actionContainer = document.querySelector('.justify-content-sm-end') || document.querySelector('.d-flex.gap-2');

        if (!cardBody || !actionContainer) return null;

        if (!document.getElementById('custom-tracking-filter')) {
            const filterDiv = document.createElement('div');
            filterDiv.style.cssText = 'margin-bottom: 15px; display: flex; align-items: center; background: #f0f7ff; padding: 10px; border-radius: 8px; border: 1px solid #85c1e9;';
            filterDiv.innerHTML = `
                <label style="margin-right: 10px; font-weight: bold; color: #2c3e50;">下4桁フィルター(Tab):</label>
                <input id="custom-tracking-filter" type="text" placeholder="追跡番号 下4桁..." class="form-control form-control-sm" style="width: 180px;">
            `;
            cardBody.prepend(filterDiv);
        }

        const batchBtn = document.createElement('button');
        batchBtn.type = 'button';
        batchBtn.className = 'btn btn-info btn-sm waves-effect flex-fill flex-sm-grow-0 ms-2';
        batchBtn.id = 'custom-batch-edit-btn';
        batchBtn.innerHTML = '<i class="ti ti-layers-intersect me-2"></i>一括編集・印刷';
        actionContainer.appendChild(batchBtn);

        const style = document.createElement('style');
        style.innerHTML = `
            #custom-modal-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.7); z-index: 99999;
                display: none; justify-content: center; align-items: center;
            }
            #custom-modal-content {
                background: white; padding: 25px; border-radius: 12px;
                width: 95%; max-width: 1100px; max-height: 90vh;
                overflow-y: auto; box-shadow: 0 15px 35px rgba(0,0,0,0.5);
                position: relative;
            }
            .modal-table { width: 100%; border-collapse: collapse; margin-top: 15px; border-radius: 8px; overflow: hidden; }
            .modal-table th, .modal-table td { border: 1px solid #dee2e6; padding: 12px 8px; text-align: center; vertical-align: middle; }
            .modal-table th { background: #f1f3f5; font-weight: 700; font-size: 13px; color: #495057; border-bottom: 2px solid #dee2e6; }
            .modal-table tbody tr:hover { background-color: #f8f9fa; }
            .loc-input { width: 100%; border: 1.5px solid #dee2e6; padding: 6px 10px; border-radius: 6px; font-weight: bold; transition: all 0.2s; }
            .loc-input:focus { border-color: #4ea5ff; box-shadow: 0 0 0 3px rgba(78, 165, 255, 0.2); outline: none; background: #fff; }
            .modal-overlay { margin-top: 25px; border-top: 1px solid #eee; padding-top: 15px; text-align: right; }
            .btn-remove-item { color: #adb5bd; cursor: pointer; font-size: 1.2rem; transition: color 0.2s; }
            .btn-remove-item:hover { color: #fa5252; }

            .location-picker-container {
                background: #f8fbff; border: 2px solid #e1f0ff; border-radius: 12px; padding: 15px; margin-bottom: 20px;
                position: relative;
            }
            .picker-header { display: flex; align-items: center; margin-bottom: 12px; font-weight: bold; color: #0066cc; }
            .picker-section { margin-bottom: 10px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
            .picker-label { background: #e7f5ff; color: #228be6; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: bold; min-width: 70px; text-align: center; border: 1px solid #a5d8ff; }
            .loc-btn {
                background: white; border: 1.5px solid #dee2e6; padding: 6px 14px; border-radius: 8px;
                font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            }
            .loc-btn:hover { background: #eef7ff; border-color: #339af0; color: #1c7ed6; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .loc-btn.used { display: none; }

            #modal-search-box {
                margin-bottom: 15px; padding: 15px; background: #fff9db; border: 1px solid #ffe066; border-radius: 10px;
            }
            #modal-search-results {
                margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px; max-height: 120px; overflow-y: auto;
            }
            .search-res-item {
                background: white; border: 1.5px solid #fab005; color: #f08c00; padding: 5px 16px; border-radius: 20px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            }
            .search-res-item:hover { background: #fab005; color: white; transform: translateY(-1px); box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1); }
            .search-res-item .res-loc { font-size: 13px; color: #1c7ed6; margin-left: 8px; font-weight: 800; border-left: 1px solid #fab005; padding-left: 8px; }
            .search-res-item:hover .res-loc { color: white; border-left-color: white; }

            .rotate { animation: spin 1s linear infinite; display: inline-block; }
            @keyframes spin { 100% { transform: rotate(360deg); } }

            .change-indicator { display: flex; align-items: center; justify-content: center; gap: 5px; font-size: 11px; }
            .old-loc { text-decoration: line-through; color: #adb5bd; }
            .new-loc { color: #28a745; font-weight: bold; }

            /* 구역별 탭 버튼 스타일 */
            .picker-tab-btn {
                background: #f1f3f5;
                border: 1px solid #dee2e6;
                padding: 4px 12px;
                border-radius: 6px;
                font-size: 12px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.2s;
                color: #495057;
            }
            .picker-tab-btn:hover {
                background: #e9ecef;
            }
            .picker-tab-btn.active {
                background: #228be6;
                border-color: #228be6;
                color: #fff;
            }

            /* v11.0 기반 세부 정렬 팝업 레이아웃 스타일 */
            .pop-content {
                display: none;
                position: absolute;
                left: 0;
                top: 55px;
                background: white;
                border: 4px solid #3498db;
                padding: 20px;
                z-index: 99999;
                width: 520px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.25);
                border-radius: 12px;
                flex-direction: column;
            }
        `;
        document.head.appendChild(style);

        return {
            filterInput: document.getElementById('custom-tracking-filter'),
            batchBtn: batchBtn
        };
    };

    // 로케이션 상태 및 포커스 여부에 따른 입력칸 동적 스타일 지정 헬퍼 함수
    function applyInputStyle(input) {
        const original = input.getAttribute('data-original') || '';
        const current = input.value.trim();
        const isModified = cleanStr(current) !== cleanStr(original);
        const isActive = (input === lastFocusedInput);

        // 아웃라인 및 기본 스타일 초기화
        input.style.outline = '';

        if (isModified) {
            // 현재 로케이션에서 다른 로케이션으로 변경되었을 때 나타내는 뚜렷한 피드백 색상 (연한 민트그린 배경)
            input.style.backgroundColor = '#e6fffa'; // 연한 민트그린 배경
            input.style.borderColor = '#38b2ac';     // 민트 테두리
            input.style.color = '#005f54';           // 짙은 청록 글자색
        } else {
            // 변경되지 않은 기본 상태
            input.style.backgroundColor = '#ffffff'; // 기본 흰색 배경
            input.style.borderColor = '#dee2e6';     // 기본 회색 테두리
            input.style.color = '#495057';           // 기본 어두운 글자색
        }

        // 활성화 포커스 테두리는 상태 위에 파란색으로 유려하게 중첩 적용
        if (isActive) {
            input.style.outline = '2.5px solid #228be6';
            input.style.backgroundColor = '#f1f3f5';  // 포커싱 전용 백그라운드 색상 적용
        }
    }

    // 로케이션 퀵선택 내 타겟 입력창 포커스 감지 및 테두리 활성 하이라이트 동기화 엔진
    function updateActiveInputHighlight() {
        const inputs = Array.from(document.querySelectorAll('.loc-input'));
        if (inputs.length === 0) {
            lastFocusedInput = null;
            return;
        }

        // 선택 지정된 활성 타겟이 없거나 유실된 경우, 비어있는 입력창 우선 타겟팅
        if (!lastFocusedInput || !document.body.contains(lastFocusedInput)) {
            const emptyInput = inputs.find(input => input.value.trim() === '');
            lastFocusedInput = emptyInput || inputs[0];
        }

        // 전체 입력창 스타일 일괄 동기화 적용
        inputs.forEach(input => {
            applyInputStyle(input);
        });
    }

    // 입력값과 퀵선택 버튼 상태를 실시간 동기화하여 깜빡임을 완벽히 차단하는 서브 엔진
    const syncButtonStatesWithInputs = () => {
        const currentInputs = Array.from(document.querySelectorAll('.loc-input')).map(i => i && i.value ? i.value.trim().toUpperCase() : '');

        // 1. 모든 개별 로케이션 최종 버튼(final-btn) 표시 상태 제어 - 무인침범 방지용 셀렉터 보정 및 안전 방어코드 추가
        const finalBtns = document.querySelectorAll('#dynamic-loc-picker-section .final-btn');
        finalBtns.forEach(btn => {
            const locAttr = btn.getAttribute('data-loc');
            if (!locAttr) return; // 안전가드: 속성이 없거나 null일 경우 즉시 스킵
            const loc = locAttr.toUpperCase();
            if (currentInputs.includes(loc)) {
                btn.style.display = 'none';
            } else {
                btn.style.display = 'inline-block';
            }
        });

        // 2. 각 세부 구역 sz-toggle 버튼들의 카운트 실시간 업데이트
        const szToggles = document.querySelectorAll('.sz-toggle');
        szToggles.forEach(toggle => {
            const sz = toggle.getAttribute('data-sz');
            const popContent = toggle.nextElementSibling;
            if (popContent) {
                const totalBtns = popContent.querySelectorAll('.final-btn');
                const visibleBtns = Array.from(totalBtns).filter(btn => btn.style.display !== 'none');
                const countSpan = toggle.querySelector('.sz-count');
                if (countSpan) {
                    countSpan.textContent = visibleBtns.length;
                }
            }
        });
    };

    // 로케이션 리스트를 세부 구역(C1, C3, C4 등)별로 줄을 나누어 HTML 생성 (v11.0 기반)
    const getSubZoneLayeredHtml = (subZoneObj, color) => {
        let html = '';
        const sortedSubZones = Object.keys(subZoneObj).sort((a, b) => {
            return a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'});
        });

        sortedSubZones.forEach(sz => {
            html += `
                <div style="width: 100%; margin-bottom: 15px; border-bottom: 2px solid #f0f4f8; padding-bottom: 10px; text-align: left;">
                    <div style="font-size: 14px; font-weight: bold; color: ${color}; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                        <span>📍 ${sz} エリア情報</span>
                        <span class="bulk-register-btn" data-locs="${subZoneObj[sz].join(',')}" style="font-size:13px; color:#228be6; cursor:pointer; font-weight:bold; text-decoration:underline;">[一括登録]</span>
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        ${subZoneObj[sz].map(l => `
                            <button class="final-btn" data-loc="${l}" style="padding: 10px 18px; font-size: 18px; border: 2px solid ${color}; background: #fff; color: ${color}; cursor: pointer; border-radius: 8px; font-weight: bold; box-shadow: 1px 1px 3px rgba(0,0,0,0.1);">
                                ${l}
                            </button>
                        `).join('')}
                    </div>
                </div>
            `;
        });
        return html;
    };

    // [중첩 템플릿 최적화]: $ ReferenceError 깜빡임 현상을 완벽하게 배제하기 위해 문자열 직렬 전개 구조로 전격 개편
    const renderDynamicLocationPicker = () => {
        const pickerSection = document.getElementById('dynamic-loc-picker-section');
        if (!pickerSection) return;

        // 렌더링 예정인 가용 빈 로케이션의 최종 정렬 문자열 생성 (전체 목록 기준, 불필요한 sort 뮤테이션 방지를 위해 복사 후 정렬)
        const emptyLocsKey = [...realtimeEmptyLocations].sort().join(',');

        // 렌더링 내용에 변화가 없으면 innerHTML을 초기화하지 않고 리턴하여 깜빡임 현상을 원천 방지
        if (realtimeEmptyLocations.length > 0 && emptyLocsKey === lastRenderedLocsKey) {
            syncButtonStatesWithInputs();
            return;
        }

        // 만약 현재 빈 로케이션 개수가 0개인데, 기존에 렌더링된 버튼들이 이미 존재한다면 지우지 않고 상태 유지 (깜빡임/사라짐 방지 핵심 버그 패치)
        if (realtimeEmptyLocations.length === 0) {
            if (pickerSection.querySelector('.final-btn, .sz-toggle')) {
                console.log("[Tampermonkey] 空きロケーションデータが空のため、既存UIを保持します。");
                return;
            }
            pickerSection.innerHTML = '<span class="text-muted small" style="padding: 10px;">空きロケーション情報を取得中です...</span>';
            return;
        }

        lastRenderedLocsKey = emptyLocsKey;
        pickerSection.innerHTML = '';

        let data = { A: {}, B: {}, C: {}, ETC: {} };

        realtimeEmptyLocations.forEach(loc => {
            const zone = /^[A-Z]/i.test(loc) ? loc.charAt(0).toUpperCase() : 'ETC';
            const subZone = loc.split('-')[0]; // C1, C2 등 앞자리 세부 구역
            const layer = loc.split('-')[1] || '0'; // 층수 정보

            const targetZone = (zone === 'A' || zone === 'B' || zone === 'C') ? zone : 'ETC';

            // 일반 구역 데이터 수집
            if (!data[targetZone][subZone]) data[targetZone][subZone] = [];
            data[targetZone][subZone].push(loc);
        });

        let html = '';

        // 일반 구역 (A구역, B구역, C구역, 기타구역 전개)
        ['A', 'B', 'C', 'ETC'].forEach(z => {
            const subZones = data[z];
            if (!subZones || Object.keys(subZones).length === 0) return;

            html += '<div style="margin-bottom:15px; border-bottom:1px dashed #ccc; padding-bottom:10px; display:flex; align-items:center; flex-wrap:wrap; gap:10px; text-align: left;">';
            html += '<span style="font-weight:bold; color:#444; font-size:18px; margin-right:15px; background:#f5f5f5; padding:5px 10px; border-radius:6px;">' + z + 'エリア</span>';
            html += '<div style="display:inline-flex; flex-wrap:wrap; gap:8px; vertical-align:middle;">';

            const sortedSubZones = Object.keys(subZones).sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'})).filter(Boolean);
            sortedSubZones.forEach(sz => {
                html += '<div style="position:relative;">';
                html += '<button class="sz-toggle" data-sz="' + sz + '" style="padding:8px 16px; background:#fff; border:1px solid #ddd; border-radius:8px; font-size:18px; cursor:pointer; font-weight:bold;">' + sz + ' (<span class="sz-count">' + subZones[sz].length + '</span>)</button>';
                html += '<div class="pop-content" style="display:none; position:absolute; left:0; top:50px; background:white; border:4px solid #3498db; padding:20px; z-index:99999; width:500px; box-shadow:0 10px 25px rgba(0,0,0,0.25); border-radius:12px; flex-direction: column;">';

                const layers = { "1": [], "2": [], "3": [], "4": [] };
                let otherLayers = [];
                subZones[sz].forEach(l => {
                    const f = l.split('-')[1];
                    if(layers[f]) {
                        layers[f].push(l);
                    } else {
                        otherLayers.push(l);
                    }
                });

                // 층수 정렬 후 출력
                Object.keys(layers).forEach(f => {
                    if(layers[f].length > 0) {
                        html += '<div style="margin-bottom:10px; text-align: left;">';
                        html += '<div style="font-size:13px; color:#666; font-weight:bold; margin-bottom:5px; display:flex; align-items:center; gap:8px;">';
                        html += '<span>' + f + '段</span>';
                        html += '<span class="bulk-register-btn" data-locs="' + layers[f].join(',') + '" style="font-size:13px; color:#228be6; cursor:pointer; font-weight:bold; text-decoration:underline;">[一括登録]</span>';
                        html += '</div>';
                        html += '<div style="display:flex; flex-wrap:wrap; gap:6px;">';
                        layers[f].forEach(l => {
                            html += '<button class="final-btn" data-loc="' + l + '" style="padding:8px 15px; font-size:17px; border:1px solid #3498db; background:#fff; color:#3498db; cursor:pointer; border-radius:6px; font-weight:bold;">' + l + '</button>';
                        });
                        html += '</div></div>';
                    }
                });

                if (otherLayers.length > 0) {
                    html += '<div style="margin-bottom:10px; text-align: left;">';
                    html += '<div style="font-size:13px; color:#666; font-weight:bold; margin-bottom:5px; display:flex; align-items:center; gap:8px;">';
                    html += '<span>その他</span>';
                    html += '<span class="bulk-register-btn" data-locs="' + otherLayers.join(',') + '" style="font-size:13px; color:#228be6; cursor:pointer; font-weight:bold; text-decoration:underline;">[一括登録]</span>';
                    html += '</div>';
                    html += '<div style="display:flex; flex-wrap:wrap; gap:6px;">';
                    otherLayers.forEach(l => {
                        html += '<button class="final-btn" data-loc="' + l + '" style="padding:8px 15px; font-size:17px; border:1px solid #3498db; background:#fff; color:#3498db; cursor:pointer; border-radius:6px; font-weight:bold;">' + l + '</button>';
                    });
                    html += '</div></div>';
                }

                html += '</div></div>';
            });

            html += '</div></div>';
        });

        pickerSection.innerHTML = html;
        syncButtonStatesWithInputs(); // 뼈대 생성 직후 마찰 입력된 로케이션 숨김 동기화
    };

    // [유실 복원 모듈 1]: 실시간 UI 갱신 핸들러 명시적 정의
    const updateLocationPickerStatus = () => {
        renderDynamicLocationPicker();
    };

    // [유실 복원 모듈 2]: 로컬 데이터 및 라벨 데이터 추출용 고도화 헬퍼 함수 완벽 재수립
    function getLabelPrintData(locId, trackingNo, location) {
        let row = null;
        document.querySelectorAll('.sub_checkbox').forEach(cb => {
            if (cb.value === locId) {
                row = cb.closest('tr');
            }
        });

        let customerNo = '1204';
        let stockDate = new Date().toISOString().split('T')[0];
        let memo = '';
        let userNo = '1219';
        let matchedLHList = [];

        if (row) {
            const memberText = (row.cells && row.cells[2]) ? row.cells[2].innerText.trim() : '';
            const match = memberText.match(/^(\d+)/);
            if (match) {
                customerNo = match[1];
                userNo = match[1];
            }

            const dateText = (row.cells && row.cells[8]) ? row.cells[8].innerHTML.split('<br>')[0].trim() : '';
            if (dateText) {
                stockDate = dateText;
            }

            memo = (row.cells && row.cells[9]) ? row.cells[9].innerText.trim() : '';

            if (row.cells) {
                Array.from(row.cells).forEach(cell => {
                    const matchLH = cell.innerText.trim().match(/(LH|LS|OH)\d+/i);
                    if (matchLH) {
                        matchedLHList.push(matchLH[0].toUpperCase());
                    }
                });
            }
        } else {
            const existing = selectedOrder.find(item => item.id === locId);
            if (existing) {
                customerNo = existing.customerNo || customerNo;
                stockDate = existing.stockDate || stockDate;
                memo = existing.memo || memo;
                userNo = existing.userNo || userNo;
                if (existing.deliveryNoRaw) {
                    matchedLHList.push(existing.deliveryNoRaw);
                }
            }
        }

        // [디버깅 최종 완료]: undefined 이던 targetNo 변수를 trackingNo 매개변수로 완벽히 일치 연동
        let fallbackMatches = shippingDatabase.filter(d => cleanStr(d.tracking_no) === cleanStr(trackingNo));
        if (fallbackMatches.length > 0) {
            fallbackMatches.forEach(item => {
                matchedLHList.push(item.delivery_no);
                if (item.user_id) {
                    userNo = item.user_id;
                }
            });
        }
        matchedLHList = [...new Set(matchedLHList)];

        const boxIndex = getBoxIndexInfo(trackingNo, locId);

        return {
            location: location || 'N/A',
            customerNo: customerNo,
            stockDate: stockDate,
            memo: memo,
            trackingNo: trackingNo,
            boxIndex: boxIndex,
            userNo: userNo,
            deliveryNoRaw: matchedLHList.join(',')
        };
    }

    // [유실 복원 모듈 3]: 동일 트래킹 번호 내에서 고유 박스 순서 계산 고도화 함수 수립
    function getBoxIndexInfo(trackingNo, currentLocId) {
        const rows = Array.from(document.querySelectorAll('tbody tr')).filter(r => {
            const tLink = r.querySelector('.show_tracking_page');
            return tLink && tLink.innerText.trim() === trackingNo;
        });

        if (rows.length <= 1) {
            return '1/1';
        }

        rows.sort((a, b) => {
            const cbA = a.querySelector('.sub_checkbox');
            const cbB = b.querySelector('.sub_checkbox');
            const idA = cbA ? parseInt(cbA.value) : 0;
            const idB = cbB ? parseInt(cbB.value) : 0;
            return idA - idB;
        });

        const total = rows.length;
        const index = rows.findIndex(r => {
            const cb = r.querySelector('.sub_checkbox');
            return cb && cb.value === currentLocId;
        }) + 1;
        return `${index}/${total}`;
    }

    // 프리미엄 세로 규격(55mm x 45mm) 적용형 - 라벨 세로 길이를 축소 및 바코드 1.3배 확대, 수직 여백 최소화 레이아웃
    // 트래킹 번호 크기를 1.5배 키우고, 로케이션 상하 여백 단축, ID 및 날짜 크기 1.5배 강조 처리 적용
    // [버그 완벽 제거]: 템플릿 리터럴 문법 이스케이프 문자 백슬래시(\)를 일괄 제거하여 정상 컴파일 연동 완료
    function generateCustomLabelHTML(labels) {
        let labelsHTML = '';
        let qrScripts = '';

        labels.forEach((label, i) => {
            const lh = String(label.deliveryNoRaw || "").trim();
            const isOcean = /OH/i.test(lh);

            labelsHTML += `
                <div class="page">
                    <div class="container">
                        <div class="header-sec">
            `;

            if (lh && lh !== "undefined" && lh !== "null" && lh.length > 2) {
                const dNoArray = lh.split(',').map(s => s.trim()).filter(Boolean);
                const uniqueLH = [...new Set(dNoArray)];

                let displayLH = uniqueLH[0];
                if (uniqueLH.length > 1) {
                    displayLH = uniqueLH[0] + " 他 " + (uniqueLH.length - 1) + "件";
                }

                labelsHTML += `
                            <div class="lh-info-group">
                                <span class="lh-no">${displayLH}</span>
                                ${isOcean ? '<span class="ocean-tag">(OCEAN)</span>' : ''}
                            </div>
                            <div id="qr_lh_${i}" class="qr-small"></div>
                `;
            } else {
                labelsHTML += `<span class="custom-err-msg">[未出荷/通常入荷]</span>`;
            }

            labelsHTML += `
                        </div>
                        <div class="loc-sec">${label.location || 'N/A'}</div>
                        <div class="bottom-sec">
                            <div class="bottom-left">
                                <div class="track-info">
                                    <div class="track-no-group">
            `;

            const track = String(label.trackingNo || "");
            if (track.length > 4) {
                labelsHTML += `<span class="track-main">${track.slice(0, -4)}</span><span class="track-bold">${track.slice(-4)}</span>`;
            } else {
                labelsHTML += `<span class="track-bold">${track}</span>`;
            }

            labelsHTML += `
                                    </div>
                                    <span class="box-num">(${label.boxIndex})</span>
                                </div>
                                <div class="footer-info" style="margin-top: 1mm;">
                                    <span style="font-size: 18px; font-weight: 900; color: #000; display: block; line-height: 1;">ID: ${label.userNo}</span>
                                </div>
                            </div>
                            <div class="bottom-right">
                                <div id="qr_tr_${i}" class="qr-big"></div>
                                <div class="date-info" style="font-size: 11px; font-weight: 500; color: #666; margin-top: 1px; white-space: nowrap;">(${label.stockDate || getTodayDate()})</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            let lhVal = lh;
            if (lhVal && lhVal.indexOf(',') !== -1) {
                lhVal = lhVal.split(',')[0].trim();
            }

            // 1) 상단 출고번호(LH 등) QR코드 매핑: 구분선 침범 방지를 위해 정밀한 12mm(45px) 사이즈로 바운딩 박스 최적화
            if (lhVal && lhVal !== "undefined" && lhVal !== "null" && lhVal.length > 2) {
                qrScripts += `
                    try {
                        new QRCode(document.getElementById("qr_lh_${i}"), {
                            text: "${lhVal}",
                            width: 45,
                            height: 45,
                            correctLevel: 1
                        });
                    } catch(e) { console.error("LH QR Generation Error:", e); }
                `;
            }

            // 2) 하단 트래킹번호 QR코드 매핑: 원래 지정된 규격으로 우측 컬럼 상단에 완벽 매핑
            if (label.trackingNo) {
                qrScripts += `
                    try {
                        new QRCode(document.getElementById("qr_tr_${i}"), {
                            text: "${label.trackingNo}",
                            width: 45,
                            height: 45,
                            correctLevel: 1
                        });
                    } catch(e) { console.error("Tracking QR Generation Error:", e); }
                `;
            }
        });

        return `
            <!DOCTYPE html>
            <html lang="ja">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>ラベル印刷</title>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
                <style>
                    body { margin: 0; padding: 0; font-family: "Malgun Gothic", sans-serif; background: #fff; }
                    .page { page-break-after: always; width: 100%; display: flex; flex-direction: column; align-items: center; padding: 1mm 0; }
                    .container { width: 55mm; height: 45mm; border: 1.5px solid #000; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; position: relative; overflow: hidden; background-color: #fff; }

                    /* 상단 QR코드가 테두리선을 절대 침범하지 못하도록 헤더 높이를 14mm로 고정 설계 */
                    .header-sec { height: 14mm; display: flex; align-items: center; justify-content: space-between; padding: 0 2mm; border-bottom: 1.5px solid #000; box-sizing: border-box; }
                    .lh-info-group { display: flex; flex-direction: column; justify-content: center; text-align: left; max-width: 38mm; }
                    .lh-no { font-size: 18px; font-weight: 900; letter-spacing: -0.3px; line-height: 1.1; word-break: break-all; color: #000; }
                    .ocean-tag { font-size: 8px; font-weight: 900; color: #1f2937; margin-top: 1px; font-family: "Arial Black", sans-serif; }

                    /* 14mm 상단 영역 내부에서 정밀 조율된 12mm QR 컨테이너 배정 */
                    .qr-small { width: 12mm; height: 12mm; display: flex; align-items: center; justify-content: center; background: #fff; }
                    .qr-small canvas, .qr-small img { max-width: 100%; max-height: 100%; }

                    .loc-sec { height: 8mm; background: #f1f3f5; border-bottom: 1.5px solid #000; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 900; box-sizing: border-box; text-align: center; word-break: break-all; }

                    /* 하단 영역 예산을 23mm로 할당하고 2열 정렬 방식으로 레이아웃 부담 대폭 분산 */
                    .bottom-sec { height: 23mm; display: flex; justify-content: space-between; padding: 1mm 2mm; box-sizing: border-box; }
                    .bottom-left { display: flex; flex-direction: column; justify-content: space-between; height: 100%; max-width: 36mm; text-align: left; }
                    .track-info { display: flex; flex-direction: column; align-items: flex-start; text-align: left; }
                    .track-no-group { display: flex; align-items: baseline; justify-content: flex-start; }
                    .track-main { font-size: 14px; font-weight: bold; color: #333; }
                    .track-bold { font-size: 23px; font-weight: 900; text-decoration: underline; margin: 0 3px; }
                    .box-num { font-size: 16px; color: blue; font-weight: bold; margin-top: 1px; }

                    /* 우측에 대형 QR코드와 날짜 정보를 2층 수직 정렬하여 여백 마찰 완전히 해소 */
                    .bottom-right { display: flex; flex-direction: column; justify-content: space-between; align-items: center; width: 14mm; height: 100%; }
                    .qr-big { width: 12mm; height: 12mm; display: flex; align-items: center; justify-content: center; background: #fff; }
                    .qr-big canvas, .qr-big img { max-width: 100%; max-height: 100%; }
                    .custom-err-msg { font-size: 9px; font-weight: bold; color: red; text-align: center; width: 100%; }
                    @media print { .no-print { display: none; } .page { padding: 0; } }
                </style>
            </head>
            <body>
                <div class="no-print" style="text-align:center;margin:10px;"><button onclick="window.print()" style="padding:10px 30px; font-weight:bold; cursor:pointer;">印刷する</button></div>
                ${labelsHTML}
                <script>
                    window.onload = function() {
                        ${qrScripts}
                        setTimeout(function() { window.print(); }, 400);
                    };
                </script>
            </body>
            </html>
        `;
    }

    const createModal = () => {
        const existing = document.getElementById('custom-modal-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'custom-modal-overlay';
        overlay.innerHTML = `
            <div id="custom-modal-content">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h4 style="margin: 0; font-weight: 800; color: #343a40;">📦 一括編集リスト</h4>
                    <span style="font-size: 12px; color: #868e96;">Esc: 閉じる / Tab: 検索欄へ移動</span>
                </div>

                <div id="modal-search-box" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; padding: 15px; background: #fff9db; border: 1px solid #ffe066; border-radius: 10px; margin-bottom: 15px;">
                    <!-- Left: Search Box -->
                    <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                        <label style="font-weight: 800; font-size: 13px; white-space: nowrap; color: #856404;">🔍 項目検索:</label>
                        <input id="modal-search-input" type="text" placeholder="追跡番号またはロケーションを入力..." class="form-control form-control-sm" style="width: 250px; border-radius: 8px;">
                        <button id="btn-search-remote" class="btn btn-warning btn-sm" style="font-weight: 700; border-radius: 8px;">強制同期検索</button>
                        <span id="remote-search-status" style="font-size: 11px; color: #228be6; font-weight: 700; display: none; margin-left: 8px;">
                             <i class="ti ti-loader rotate"></i> 全ページのデータを読み込み中...
                        </span>
                    </div>
                    <!-- Right: Add Location (Synced from HTML layout) -->
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <label style="font-weight: 800; font-size: 13px; white-space: nowrap; color: #0066cc;">📍 ロケーション追加:</label>
                        <div class="input-group input-group-sm" style="width: 220px;">
                            <input id="modal-add-location-input" type="text" class="form-control form-control-sm" placeholder="新しいロケーションを入力..." style="border-radius: 8px 0 0 8px; font-weight: bold;">
                            <button id="btn-modal-add-location" class="btn btn-sm btn-outline-primary" type="button" style="border-radius: 0 8px 8px 0; font-weight: 700;">追加</button>
                        </div>
                        <span id="modal-add-location-status" style="font-size: 11px; font-weight: 700; display: none; margin-left: 4px;"></span>
                    </div>
                </div>
                <!-- Search Results Container outside search flex layout -->
                <div id="modal-search-results" style="margin-top: -10px; margin-bottom: 15px; display: flex; flex-wrap: wrap; gap: 8px; max-height: 120px; overflow-y: auto;"></div>

                <div class="location-picker-container" style="position: relative;">
                    <div class="picker-header" style="margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <i class="ti ti-package-export" style="font-size: 1.2rem; color: #228be6;"></i>
                            <span style="font-weight: bold; color: #343a40;">空きロケーション クイック選択</span>
                        </div>
                        <!-- 리스트를 초기화하지 않고 가용 빈 위치 버튼 목록만 순수 최신화하는 실시간 업데이트 버튼 추가 -->
                        <button id="btn-refresh-empty-locs" class="btn btn-outline-primary btn-sm" style="font-weight: 700; border-radius: 8px; padding: 4px 12px; font-size: 12px; display: flex; align-items: center; gap: 4px;" type="button">
                            <i class="ti ti-refresh"></i> 最新に更新
                        </button>
                    </div>
                    <!-- 선택된 구역/선반의 상세 슬롯들을 v11.0과 match되는 층수별 세부그룹으로 렌더링 -->
                    <div id="dynamic-loc-picker-section" style="display: flex; flex-direction: column; gap: 10px; max-height: 320px; overflow-y: auto; padding: 15px; border: 1.5px solid #e1f0ff; border-radius: 10px; background: #fff; position: relative;">
                        <span class="text-muted small">ロケーション状態を照会中です...</span>
                    </div>
                </div>

                <table class="modal-table">
                    <thead>
                        <tr>
                            <th style="width: 65px;">順番</th>
                            <th>追跡番号</th>
                            <th>現在のロケーション</th>
                            <th style="width: 300px;">変更後のロケーション</th>
                            <th style="width: 60px;">削除</th>
                        </tr>
                    </thead>
                    <tbody id="modal-list-body"></tbody>
                </table>
                <div class="modal-footer">
                    <button id="modal-close-btn" class="btn btn-outline-secondary btn-sm me-2" type="button">閉じる(再読み込み)</button>
                    <button id="modal-clear-list-btn" class="btn btn-outline-danger btn-sm me-2" type="button">🗑️ リストを全てクリア</button>
                    <button id="modal-save-btn" class="btn btn-primary btn-sm" type="button" style="padding-left: 20px; padding-right: 20px; font-weight: 700;">💾 変更を保存して一括印刷</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const modalSearch = overlay.querySelector('#modal-search-input');
        const remoteBtn = overlay.querySelector('#btn-search-remote');
        const statusSpan = overlay.querySelector('#remote-search-status');
        const pickerSection = overlay.querySelector('#dynamic-loc-picker-section');
        const refreshEmptyBtn = overlay.querySelector('#btn-refresh-empty-locs');

        // [비동기 로케이션 생성 이벤트 리스너]
        const addLocInput = overlay.querySelector('#modal-add-location-input');
        const addLocBtn = overlay.querySelector('#btn-modal-add-location');
        const addLocStatus = overlay.querySelector('#modal-add-location-status');

        const handleAddLocation = async () => {
            const newLocVal = addLocInput.value.trim().toUpperCase();
            if (!newLocVal) {
                alert("追加するロケーション名を入力してください。");
                addLocInput.focus();
                return;
            }

            addLocBtn.disabled = true;
            addLocStatus.style.display = 'inline-block';
            addLocStatus.style.color = '#e67e22';
            addLocStatus.innerHTML = '<i class="ti ti-loader rotate"></i> 登録中...';

            try {
                const csrfMeta = document.querySelector('meta[name="csrf-token"]');
                const csrfToken = csrfMeta ? csrfMeta.content : '';
                const baseUrl = window.location.origin;

                const response = await fetch(`${baseUrl}/admin/store/location-tracking`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'X-CSRF-TOKEN': csrfToken
                    },
                    body: new URLSearchParams({
                        'location': newLocVal
                    })
                });

                if (response.ok) {
                    addLocStatus.style.color = '#28a745';
                    addLocStatus.innerHTML = '✅ 追加完了！';
                    addLocInput.value = '';

                    // 로케이션 추가 완료 직후 실시간 로케이션 동적 갱신 구동
                    await initLocationTrackingSync(true);

                    setTimeout(() => {
                        addLocStatus.style.display = 'none';
                    }, 2000);
                } else {
                    addLocStatus.style.color = '#dc3545';
                    addLocStatus.innerHTML = '❌ 登録失敗';
                }
            } catch (err) {
                console.error(err);
                addLocStatus.style.color = '#dc3545';
                addLocStatus.innerHTML = '❌ エラー発生';
            } finally {
                addLocBtn.disabled = false;
            }
        };

        addLocBtn.onclick = handleAddLocation;
        addLocInput.onkeydown = function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleAddLocation();
            }
        };

        // 세부 전열 팝업 레이어 열기/닫기 및 로케이션 주입 이벤트 위임 통합 처리 (이벤트 꼬임 완전 차단)
        pickerSection.addEventListener('click', function(e) {
            const closeAllPopups = () => pickerSection.querySelectorAll('.pop-content').forEach(p => p.style.display = 'none');

            // 토글 버튼 클릭 처리 (일반 구역 토글 버튼 - 3층 전용 제거에 맞춘 타겟 필터 조정)
            const toggleBtn = e.target.closest('.sz-toggle');
            if (toggleBtn) {
                e.preventDefault();
                e.stopPropagation();
                const pop = toggleBtn.nextElementSibling;
                const isVisible = pop.style.display === 'flex';
                closeAllPopups();
                pop.style.display = isVisible ? 'none' : 'flex';
                return;
            }

            // [신규 기능]: 일괄등록 버튼 클릭 처리
            const bulkBtn = e.target.closest('.bulk-register-btn');
            if (bulkBtn) {
                e.preventDefault();
                e.stopPropagation();

                const locsAttr = bulkBtn.getAttribute('data-locs');
                if (!locsAttr) return;

                // 가용한 빈 로케이션 배열 생성 및 자연 정렬
                const availableLocs = locsAttr.split(',').map(l => l.trim()).filter(Boolean).sort((a, b) => {
                    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
                });

                if (availableLocs.length === 0) return;

                // 현재 리스트에 생성된 로케이션 입력칸 배열 추출
                const inputs = Array.from(document.querySelectorAll('.loc-input'));
                if (inputs.length === 0) return;

                // 수정되지 않은(비어있거나 원래 값과 동일한) 대기 상태의 입력칸 우선 탐색
                const targetInputs = inputs.filter(input => {
                    const original = input.getAttribute('data-original') || '';
                    const current = input.value.trim();
                    return current === '' || cleanStr(current) === cleanStr(original);
                });

                // 대기 상태의 입력창이 존재하지 않는다면 전체 목록을 상단부터 덮어씌움
                const inputsToFill = targetInputs.length > 0 ? targetInputs : inputs;

                let filledCount = 0;
                // 리스트 개수와 가용 방 개수 중 작은 값만큼 루프를 돌며 순차 매핑
                for (let i = 0; i < inputsToFill.length; i++) {
                    if (i < availableLocs.length) {
                        const input = inputsToFill[i];
                        input.value = availableLocs[i];
                        input.dispatchEvent(new Event('input', { bubbles: true })); // 실시간 하이라이트 및 민트색 틴팅 스타일 주입
                        filledCount++;
                    } else {
                        break;
                    }
                }

                if (filledCount > 0) {
                    // 성공 피드백 및 로케이션 상태 동기화 진행
                    updateActiveInputHighlight();
                    closeAllPopups();
                    renderDynamicLocationPicker();
                } else {
                    alert("割り当て可能な空きロケーションがありません。");
                }
                return;
            }

            // 개별 로케이션 최종 버튼 클릭 처리
            const finalBtn = e.target.closest('.final-btn');
            if (finalBtn) {
                e.preventDefault();
                e.stopPropagation();
                const locVal = finalBtn.getAttribute('data-loc');

                // 클릭 전 타겟 입력창 상태 한번 더 보정
                updateActiveInputHighlight();

                if (lastFocusedInput) {
                    lastFocusedInput.value = locVal;
                    lastFocusedInput.dispatchEvent(new Event('input', { bubbles: true })); // 입력 동기화 트리거

                    // 다음 행 또는 다음 비어있는 행 입력창으로 타겟 자동 변경
                    const inputs = Array.from(document.querySelectorAll('.loc-input'));
                    const currentIndex = inputs.indexOf(lastFocusedInput);
                    if (currentIndex > -1 && currentIndex < inputs.length - 1) {
                        lastFocusedInput = inputs[currentIndex + 1];
                    } else {
                        lastFocusedInput = null; // 마지막 행이면 초기화하여 다음 로직에서 빈 곳 찾도록 위임
                    }

                    updateActiveInputHighlight();
                    closeAllPopups();
                    renderDynamicLocationPicker(); // 사용된 항목 배제 갱신
                }
                return;
            }
        });

        // Global 바탕화면 클릭 시 오픈되어 있는 전열 팝업 일제히 닫기
        document.addEventListener('click', function(e) {
            if (!e.target.closest('#dynamic-loc-picker-section')) {
                pickerSection.querySelectorAll('.pop-content').forEach(p => p.style.display = 'none');
            }
        });

        // [v1.0.1] 검색 개선
        //  - 하이픈·공백이 섞인 표시(例: 4518-7263-4975)도 숫자만 비교해서 찾음
        //  - 전체 캐시 + 현재 화면을 항상 같이 검색 (캐시에 없던 새 입고도 화면에 있으면 찾음)
        //  - 그래도 없으면(8자리 이상 입력 시) 시스템 검색창으로 서버에 직접 조회
        let serverSearchTimer = null;
        const matchItem = (no, loc, q, qClean) => {
            const n = cleanStr(no);
            return (qClean && n.endsWith(qClean)) || String(loc || '').toLowerCase().includes(q);
        };
        modalSearch.oninput = function() {
            const query = this.value.trim().toLowerCase();
            const qClean = cleanStr(query);
            const modalResults = document.getElementById('modal-search-results');
            if (modalResults) modalResults.innerHTML = '';
            clearTimeout(serverSearchTimer);
            if (query.length < 2) return;

            const found = new Map();
            allPagesCache.forEach(item => { if (matchItem(item.no, item.loc, query, qClean)) found.set(item.id, item); });
            document.querySelectorAll('tbody tr').forEach(row => {
                const it = parseTrackingRow(row);
                if (it && !found.has(it.id) && matchItem(it.no, it.loc, query, qClean)) found.set(it.id, it);
            });
            searchedItemsCache = Array.from(found.values());
            renderSearchResultsGrouped();

            if (searchedItemsCache.length === 0 && qClean.length >= 8) {
                if (modalResults) modalResults.innerHTML = '<span style="font-size:12px;color:#228be6;font-weight:700"><i class="ti ti-loader rotate"></i> サーバーで検索中...</span>';
                const q0 = this.value;
                serverSearchTimer = setTimeout(async () => {
                    const items = await serverSearchTracking(q0.trim());
                    if (modalSearch.value !== q0) return; // 그 사이 검색어가 바뀌었으면 무시
                    searchedItemsCache = items.filter(it => matchItem(it.no, it.loc, query, qClean));
                    // 캐시에도 넣어서 다음 검색부터는 바로 나오게 함
                    searchedItemsCache.forEach(it => { if (!allPagesCache.find(x => x.id === it.id)) allPagesCache.push(it); });
                    renderSearchResultsGrouped();
                    if (!searchedItemsCache.length && modalResults) {
                        modalResults.innerHTML = '<span style="font-size:12px;color:#dc3545;font-weight:700">❌ 該当なし（入荷トラッキングに登録されていない可能性があります）</span>';
                    }
                }, 400);
            }
        };

        // 강제 새로고침용 수동 연동 트리거
        remoteBtn.onclick = function() {
            startPreFetchingAllPages(true);
        };

        // [신규 로직]: 가용 빈 로케이션 실시간 최신화 수동 연동 바인딩 (selectedOrder를 절대 초기화하지 않음)
        if (refreshEmptyBtn) {
            refreshEmptyBtn.onclick = async function(e) {
                e.preventDefault();
                e.stopPropagation();

                const originalText = this.innerHTML;
                this.innerHTML = '<i class="ti ti-loader rotate"></i> 更新中...';
                this.disabled = true;

                // 수동 리로드 클릭 시에는 캐시 키를 지워서 강제 렌더링 수행
                lastRenderedLocsKey = '';

                // 모달 편집 리스트 테이블에 이미 검색 및 입력되어 있는 행(selectedOrder 및 inputs)은 고스란히 보존하면서
                // 백그라운드로 가용 빈 로케이션 데이터 슬롯만 서버 통신을 통해 신선하게 리로드합니다.
                await initLocationTrackingSync(true); // forceRender = true로 설정하여 즉시 렌더링 반영

                this.innerHTML = originalText;
                this.disabled = false;
            };
        }

        return {
            overlay,
            body: overlay.querySelector('#modal-list-body'),
            close: overlay.querySelector('#modal-close-btn'),
            clear: overlay.querySelector('#modal-clear-list-btn'),
            save: overlay.querySelector('#modal-save-btn')
        };
    };

    const ui = setupUI();
    if (!ui) return;

    const modal = createModal();

    if (ui.filterInput) {
        ui.filterInput.addEventListener('input', function() {
            const val = this.value.trim().toLowerCase();
            document.querySelectorAll('tbody tr').forEach(row => {
                const tLink = row.querySelector('.show_tracking_page');
                if (tLink) {
                    const tNo = cleanStr(tLink.innerText);
                    // [v1.0.1] 하이픈·공백을 빼고 끝자리 비교
                    row.style.display = (val === "" || tNo.endsWith(cleanStr(val))) ? "" : "none";
                }
            });
        });
    }

    window.addEventListener('keydown', function(e) {
        if (e.key === 'Tab') {
            if (modal.overlay.style.display === 'flex') {
                e.preventDefault();
                const mSearch = document.getElementById('modal-search-input');
                if (mSearch) {
                    mSearch.focus();
                    mSearch.select();
                }
            } else if (document.activeElement !== ui.filterInput) {
                e.preventDefault();
                ui.filterInput.focus();
                ui.filterInput.value = "";
            }
        }
        if (e.key === 'Escape' && modal.overlay.style.display === 'flex') {
            location.reload();
        }
    });

    function renderModalList() {
        modal.body.innerHTML = '';

        // [중복 그룹화 감지 알고리즘]
        // selectedOrder 내의 트래킹 번호(item.no)의 빈도수를 측정합니다.
        const trackingCounts = {};
        selectedOrder.forEach(item => {
            const num = item.no;
            trackingCounts[num] = (trackingCounts[num] || 0) + 1;
        });

        // 2회 이상 등장하는 중복 트래킹 번호들에 대해 고유 구별 색상을 동적으로 매핑합니다.
        const duplicateColors = {};
        const palette = [
            '#e52d27', // 빨간색 (Red)
            '#2b8a3e', // 초록색 (Green)
            '#d9480f', // 주황색 (Orange)
            '#862e9c', // 보라색 (Purple)
            '#0c8599', // 청록색 (Teal)
            '#1c7ed6', // 파란색 (Blue)
            '#d6336c', // 분홍색 (Pink)
            '#5f3dc4', // 남색 (Indigo)
            '#b10dc9'  // 자줏빛 (Magenta)
        ];
        let colorIdx = 0;
        Object.keys(trackingCounts).forEach(num => {
            if (trackingCounts[num] > 1) {
                duplicateColors[num] = palette[colorIdx % palette.length];
                colorIdx++;
            }
        });

        selectedOrder.forEach((item, index) => {
            const isDup = trackingCounts[item.no] > 1;
            const dupColor = isDup ? duplicateColors[item.no] : '#495057';
            const tr = document.createElement('tr');

            // 중복 항목 그룹인 경우 해당 그룹의 연한 파스텔 배경색(투명도 8%)을 둘러 직관적인 라인 그룹화 처리
            if (isDup) {
                tr.style.backgroundColor = dupColor + '14'; // 8% 불투명도 적용
                tr.style.borderLeft = `4px solid ${dupColor}`; // 좌측에 그룹 컬러 바 부착
            }

            tr.innerHTML = `
                <td><span class="badge" style="background-color: #e7f5ff; color: #228be6; border: 1px solid #a5d8ff;">${index + 1}</span></td>
                <td>
                    <strong style="color: ${dupColor}; font-size: 13.5px; font-weight: 800; display: inline-flex; align-items: center; gap: 5px;">
                        ${item.no}
                        ${isDup ? `<span style="font-size: 10px; font-weight: 800; background-color: ${dupColor}; color: white; padding: 1px 5px; border-radius: 4px;">重複</span>` : ''}
                    </strong>
                </td>
                <td class="loc-display-cell"><span style="color: #adb5bd; font-size: 11px;">${item.loc}</span></td>
                <td>
                    <input type="text" class="loc-input"
                           data-id="${item.id}"
                           data-no="${item.no}"
                           data-original="${item.loc}"
                           value="${item.newLoc !== undefined ? item.newLoc : item.loc}">
                </td>
                <td><i class="ti ti-trash btn-remove-item" data-id="${item.id}" title="項目を削除"></i></td>
            `;
            modal.body.appendChild(tr);
        });

        modal.body.querySelectorAll('.loc-input').forEach(input => {
            // 초기 렌더링 스타일 즉시 매핑
            applyInputStyle(input);

            input.onfocus = function() {
                lastFocusedInput = this;
                updateActiveInputHighlight();
            };
            input.oninput = function() {
                const id = this.getAttribute('data-id');
                const val = this.value.trim();
                const targetItem = selectedOrder.find(x => x.id === id);
                if (targetItem) {
                    targetItem.newLoc = val; // 실시간 변경 상태를 내부 메모리에 저장 및 연동
                }
                updateLocationPickerStatus();
                applyInputStyle(this); // 입력값 변경 감지 시 즉시 스타일 업데이트
            };
        });

        modal.body.querySelectorAll('.btn-remove-item').forEach(btn => {
            btn.onclick = function() {
                const idToRemove = this.getAttribute('data-id');
                selectedOrder = selectedOrder.filter(item => item.id !== idToRemove);
                const mainCheckbox = document.querySelector(`.sub_checkbox[value="${idToRemove}"]`);
                if (mainCheckbox) mainCheckbox.checked = false;
                renderModalList();
                updateLocationPickerStatus();
                // [수정 완료]: 리스트 개별 삭제로 0개가 되더라도 모달창이 자동으로 닫히지 않고 그대로 열려 있도록 유도
            };
        });

        // 리스트 변경 시 타겟 입력창 하이라이트 상태 업데이트
        updateActiveInputHighlight();
        updateLocationPickerStatus();
    }

    ui.batchBtn.onclick = function() {
        // 모달창을 새로 열 때는 무조건 가용 로케이션을 깨끗이 한 번 렌더링하도록 유도
        lastRenderedLocsKey = '';

        // 모달창을 열기 직전 실시간 로케이션 가용 목록 비동기 동기화 구동
        initLocationTrackingSync(true); // 창 열기 전 강제 렌더링 반영
        // 백그라운드 고속 전수 데이터 캐싱 동기화 구동 (전체 페이지 즉시 검색 지원)
        startPreFetchingAllPages();

        // [안전장치]: 모달창을 열기 직전 메인 화면에서 수동 체크된 항목들을 selectedOrder에 클릭 순서 유지하며 보존 병합 동기화
        document.querySelectorAll('.sub_checkbox:checked').forEach(cb => {
            const locId = cb.value;
            if (!selectedOrder.find(item => item.id === locId)) {
                const row = cb.closest('tr');
                if (row) {
                    const tLink = row.querySelector('.show_tracking_page');
                    const trackingNo = tLink ? tLink.innerText.trim() : '';
                    const cLoc = (row.cells && row.cells[3]) ? row.cells[3].innerText.trim() : '';
                    const details = getLabelPrintData(locId, trackingNo, cLoc);
                    selectedOrder.push({
                        id: locId,
                        no: trackingNo,
                        loc: cLoc,
                        newLoc: cLoc, // 메모리 지정 값 초기화
                        customerNo: details.customerNo,
                        stockDate: details.stockDate,
                        memo: details.memo,
                        userNo: details.userNo,
                        deliveryNoRaw: details.deliveryNoRaw
                    });
                }
            }
        });

        renderModalList();
        modal.overlay.style.display = 'flex';
        const mSearch = document.getElementById('modal-search-input');
        if (mSearch) {
            setTimeout(() => mSearch.focus(), 200);
        }
    };

    // 메인 테이블 단일 행 전용 출력 핸들러
    function printSingleCustomLabel(locId, trackingNo) {
        const matchingRows = Array.from(document.querySelectorAll('tbody tr')).filter(r => {
            const tLink = r.querySelector('.show_tracking_page');
            return tLink && tLink.innerText.trim() === trackingNo;
        });

        let labelsToPrint = [];

        if (matchingRows.length > 0) {
            matchingRows.forEach(row => {
                const cb = row.querySelector('.sub_checkbox');
                if (cb) {
                    const rowLocId = cb.value;
                    const location = row.cells[3].innerText.trim();
                    const details = getLabelPrintData(rowLocId, trackingNo, location);

                    labelsToPrint.push({
                        location: location,
                        customerNo: details.customerNo,
                        stockDate: details.stockDate,
                        memo: details.memo,
                        trackingNo: trackingNo,
                        boxIndex: details.boxIndex,
                        userNo: details.userNo,
                        deliveryNoRaw: details.deliveryNoRaw
                    });
                }
            });
        } else {
            const details = getLabelPrintData(locId, trackingNo, '');
            labelsToPrint.push({
                location: 'N/A',
                customerNo: details.customerNo,
                stockDate: details.stockDate,
                memo: details.memo,
                trackingNo: trackingNo,
                boxIndex: details.boxIndex,
                userNo: details.userNo,
                deliveryNoRaw: details.deliveryNoRaw
            });
        }

        const html = generateCustomLabelHTML(labelsToPrint);
        const win = window.open('about:blank', `_blank_print_${trackingNo}`, 'width=800,height=600');
        if (win) {
            win.document.open();
            win.document.write(html);
            win.document.close();
        } else {
            alert("ポップアップを許可してください。");
        }
    }

    // 3. 메인 테이블의 "라벨 발행" 버튼 및 출력(Print) 이벤트 가로채기
    document.addEventListener('click', function(e) {
        const printLink = e.target.closest('a[href*="/admin/print/locationlabel/"]');
        const customLabelBtn = e.target.closest('.custom-label-cell button, .custom-label-cell a');

        if (printLink || customLabelBtn) {
            e.preventDefault();
            e.stopPropagation();

            let trackingNo = '';
            const row = e.target.closest('tr');
            if (!row) return;

            const tLink = row.querySelector('.show_tracking_page');
            if (tLink) trackingNo = tLink.innerText.trim();

            const cb = row.querySelector('.sub_checkbox');
            if (!cb) return;
            const locId = cb.value;

            printSingleCustomLabel(locId, trackingNo);
        }
    }, true);

    // 검색된 트래킹 번호의 모든 멀티 화물 아이템을 일괄 추가하는 스마트 엔진
    function addAllItemsByTrackingNo(trackingNo) {
        let addedCount = 0;

        // 1. 현재 로컬 화면 DOM 스캔 및 추가
        const allMainRows = document.querySelectorAll('tbody tr');
        allMainRows.forEach(row => {
            const tLink = row.querySelector('.show_tracking_page');
            if (tLink && tLink.innerText.trim() === trackingNo) {
                const cb = row.querySelector('.sub_checkbox');
                if (cb) {
                    const locId = cb.value;
                    const cLoc = row.cells[3].innerText.trim();
                    const details = getLabelPrintData(locId, trackingNo, cLoc);
                    if (!selectedOrder.find(item => item.id === locId)) {
                        selectedOrder.push({
                            id: locId,
                            no: trackingNo,
                            loc: cLoc,
                            newLoc: cLoc, // 메모리 상에 변경된 로케이션 정보 유지
                            customerNo: details.customerNo,
                            stockDate: details.stockDate,
                            memo: details.memo,
                            userNo: details.userNo,
                            deliveryNoRaw: details.deliveryNoRaw
                        });
                        cb.checked = true;
                        addedCount++;
                    }
                }
            }
        });

        // 2. 검색 캐시(다른 페이지 탐색 기록 포함)에 매칭되는 모든 레코드 추가
        const matchedFromCache = searchedItemsCache.filter(item => cleanStr(item.no) === cleanStr(trackingNo));
        matchedFromCache.forEach(data => {
            if (!selectedOrder.find(item => item.id === data.id)) {
                selectedOrder.push({
                    id: data.id,
                    no: data.no,
                    loc: data.loc,
                    newLoc: data.loc, // 메모리 상에 변경된 로케이션 정보 유지
                    customerNo: data.customerNo,
                    stockDate: data.stockDate,
                    memo: data.memo,
                    userNo: data.userNo,
                    deliveryNoRaw: data.deliveryNoRaw
                });

                // 해당 아이템이 현재 화면 페이지에 위치한 경우 체크박스 활성화 동기화
                const mainCheckbox = document.querySelector(`.sub_checkbox[value="${data.id}"]`);
                if (mainCheckbox) mainCheckbox.checked = true;
                addedCount++;
            }
        });

        if (addedCount > 0) {
            renderModalList();
        }
    }

    // 그룹화된 다중 로케이션 정보를 포함한 검색 결과 동적 렌더링 함수
    function renderSearchResultsGrouped() {
        const modalResults = document.getElementById('modal-search-results');
        if (!modalResults) return;
        modalResults.innerHTML = '';
        if (searchedItemsCache.length === 0) return;

        // 트래킹 번호별 그룹화
        const groups = {};
        searchedItemsCache.forEach(item => {
            const cleanNo = cleanStr(item.no);
            if (!groups[cleanNo]) {
                groups[cleanNo] = {
                    no: item.no,
                    locations: new Set()
                };
            }
            if (item.loc) {
                groups[cleanNo].locations.add(item.loc);
            }
        });

        Object.values(groups).forEach(group => {
            const resItem = document.createElement('div');
            resItem.className = 'search-res-item';

            // 동일 트래킹 번호에 매칭된 모든 로케이션 목록을 대괄호 안에 콤마 구분으로 표기
            const locList = Array.from(group.locations).join(', ');
            resItem.innerHTML = `${group.no} <span class="res-loc">${locList || 'N/A'}</span>`;

            resItem.onclick = () => {
                addAllItemsByTrackingNo(group.no);
                const modalSearch = document.getElementById('modal-search-input');
                if (modalSearch) modalSearch.value = '';
                modalResults.innerHTML = '';
                if (modalSearch) modalSearch.focus();
            };
            modalResults.appendChild(resItem);
        });
    }

    // 5. 일괄 저장 및 출력 로직 (v7.6 연속 일괄 인쇄 무결점 패치)
    modal.save.onclick = async function() {
        const inputs = Array.from(modal.body.querySelectorAll('.loc-input'));
        const csrfToken = document.querySelector('meta[name="csrf-token"]').content;

        const changedInputs = inputs.filter(input => {
            const originalLoc = input.getAttribute('data-original');
            return input.value.trim() !== originalLoc;
        });

        if (changedInputs.length === 0) { alert('変更された項目がありません。'); return; }
        if (!confirm(`ロケーションが変更された${changedInputs.length}件のみ保存しますか？`)) return;

        modal.save.disabled = true;
        const originalBtnText = modal.save.innerHTML;
        modal.save.innerHTML = '<i class="ti ti-loader rotate"></i> 処理中...';

        const baseUrl = window.location.origin;
        const changedTrackingNos = [...new Set(changedInputs.map(input => input.getAttribute('data-no')))];

        // [안전장치 단계 1]: 로케이션 정보 백그라운드 일괄 저장
        for (let input of changedInputs) {
            const locationId = input.getAttribute('data-id');
            const newLoc = input.value.trim();
            const originalLoc = input.getAttribute('data-original');

            try {
                const response = await fetch(`${baseUrl}/admin/store/change-trackingno-location`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRF-TOKEN': csrfToken },
                    body: new URLSearchParams({
                        'location_trackingno_id': locationId,
                        'location': newLoc
                    })
                });

                const result = await response.json();
                if (result.status === 'success') {
                    const row = input.closest('tr');
                    const displayCell = row.querySelector('.loc-display-cell');
                    if (displayCell) {
                        displayCell.innerHTML = `
                            <div class="change-indicator">
                                <span class="old-loc">${originalLoc}</span>
                                <i class="ti ti-arrow-right" style="color: #4ea5ff;"></i>
                                <span class="new-loc">${newLoc}</span>
                            </div>
                        `;
                    }
                    input.setAttribute('data-original', newLoc);
                    applyInputStyle(input); // 저장 완료 상태 스타일로 동적 갱신

                    // [데이터 양방향 연동]: 성공적으로 저장이 완료되면 원본(original) 및 메모리 값을 최신화하여 상태 유지
                    const targetItem = selectedOrder.find(x => x.id === locationId);
                    if (targetItem) {
                        targetItem.loc = newLoc;
                        targetItem.newLoc = newLoc;
                    }
                }
            } catch (err) { console.error(err); }
        }

        // 데이터 반영 트랜잭션 완결 대기 (1.2초 보장)
        await new Promise(r => setTimeout(r, 1200));

        // [안전장치 단계 2]: 단일 window.open 호출로 브라우저 팝업 제한 우회 및 연속 통합 인쇄
        let allLabelsToPrint = [];

        for (let trackingNo of changedTrackingNos) {
            const matchingInputs = changedInputs.filter(input => input.getAttribute('data-no') === trackingNo);

            matchingInputs.forEach(input => {
                const locId = input.getAttribute('data-id');
                const newLoc = input.value.trim();
                const details = getLabelPrintData(locId, trackingNo, newLoc);

                allLabelsToPrint.push({
                    location: newLoc,
                    customerNo: details.customerNo,
                    stockDate: details.stockDate,
                    memo: details.memo,
                    trackingNo: trackingNo,
                    boxIndex: details.boxIndex,
                    userNo: details.userNo,
                    deliveryNoRaw: details.deliveryNoRaw
                });
            });
        }

        if (allLabelsToPrint.length > 0) {
            const html = generateCustomLabelHTML(allLabelsToPrint);
            const timestamp = new Date().getTime();
            const win = window.open('about:blank', `print_win_batch_${timestamp}`, 'width=800,height=600');
            if (win) {
                win.document.open();
                win.document.write(html);
                win.document.close();
            } else {
                alert("印刷用ポップアップがブロックされました。アドレスバー右側からポップアップを許可してください。");
            }
        }

        alert("選択した項目の処理が完了しました。リストで変更内容を確認できます。");

        modal.save.disabled = false;
        modal.save.innerHTML = originalBtnText;
        updateLocationPickerStatus();
    };

    // [이벤트 연동 완료]: 일괄 목록 비우기 버튼 활성화 매칭
    modal.clear.onclick = () => {
        if (confirm("一括編集リストの全項目をクリアしますか？")) {
            selectedOrder = [];
            // 메인 페이지 of 모든 체크박스 해제
            document.querySelectorAll('.sub_checkbox').forEach(cb => cb.checked = false);
            const cbAll = document.querySelector('.checkbox_all');
            if (cbAll) cbAll.checked = false;

            renderModalList();
        }
    };

    modal.close.onclick = () => {
        if (confirm("ページを再読み込みしてメイン画面のデータを更新しますか？")) {
            location.reload();
        } else {
            modal.overlay.style.display = 'none';
        }
    };

    // [안전장치 추가]: 메인 페이지 테이블에서 체크박스 수동 체크 시에도 동적으로 selectedOrder 클릭 순서 및 로케이션 유지
    document.addEventListener('change', function(e) {
        if (e.target && e.target.classList.contains('sub_checkbox')) {
            const cb = e.target;
            const row = cb.closest('tr');
            if (!row) return;

            const locId = cb.value;
            const tLink = row.querySelector('.show_tracking_page');
            const trackingNo = tLink ? tLink.innerText.trim() : '';
            const cLoc = (row.cells && row.cells[3]) ? row.cells[3].innerText.trim() : '';

            if (cb.checked) {
                if (!selectedOrder.find(item => item.id === locId)) {
                    const details = getLabelPrintData(locId, trackingNo, cLoc);
                    selectedOrder.push({
                        id: locId,
                        no: trackingNo,
                        loc: cLoc,
                        newLoc: cLoc,
                        customerNo: details.customerNo,
                        stockDate: details.stockDate,
                        memo: details.memo,
                        userNo: details.userNo,
                        deliveryNoRaw: details.deliveryNoRaw
                    });
                }
            } else {
                selectedOrder = selectedOrder.filter(item => item.id !== locId);
            }
        }
    });

    // 동기화 엔진 초기 자동 가동
    initShippingSync();
    initLocationTrackingSync();
    setInterval(initShippingSync, 120000);

})();
