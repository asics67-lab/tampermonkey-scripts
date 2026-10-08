// ==UserScript==
// @name         [관리] 피킹리스트 인쇄 도구 (AISPEL 피킹리스트 V75.2)
// @namespace    https://github.com/asics67-lab/tampermonkey-scripts
// @version      1.7.0
// @description  포장/출고(shipping/packing) 화면에서 PICKING LIST 버튼 옆에 초광속 수집 버튼을 추가해 관리팀이 피킹리스트를 인쇄하는 도구. 원본: AISPEL 피킹리스트 v75.2(LH/OH 트래킹번호 미표시 수정). v1.1.0: 메인 잔코드가 빠진 아타리쿠지도 기준등급 수량으로 세트수 표시. v1.2.0: 세트 기준을 구글시트에서 읽어옴. v1.3.0: 잔코드-H(Half) 등 옵션에 PCS가 적힌 세트상품의 옵션·실제 개수 표시. v1.4.0: 같은 Tracking번호를 쓰는 LH/OH 출고건 목록(진행상태 포함)을 피킹리스트에 표시. v1.5.0: 인쇄되는 피킹리스트 문구를 일본어로 변경. v1.6.0: 무검품출하 출고건·무검품출하 Tracking 표시. v1.6.1: 무검품출하 Tracking 표시는 다른 출고요청과 중복될 때만. v1.7.0: 속도 개선(출고건 동시 조회, 같은 Tracking 종합관리 검색 1번만 실행).
// @author       물류팀
// @match        https://www.platform.co.jp/admin/shipping/packing*
// @match        https://platform.co.jp/admin/shipping/packing*
// @match        https://www.platform.co.jp/admin/shipping/packingfinished*
// @match        https://platform.co.jp/admin/shipping/packingfinished*
// @match        https://www.platform.co.jp/admin/shipping/finished*
// @match        https://platform.co.jp/admin/shipping/finished*
// @match        *://*.aispel.com/admin/shipping/packing*
// @match        https://platform.aispel.com/admin/shipping/packing*
// @require      https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js
// @grant        none
// @updateURL    https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/관리/05-피킹리스트/picking-list-tools.user.js
// @downloadURL  https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/관리/05-피킹리스트/picking-list-tools.user.js
// ==/UserScript==
// [www 없는 주소 대응] platform.co.jp(www 없이) 로 접속해도 동작하도록 @match 추가, 사이트 내부 요청 주소를 현재 접속 주소 기준(location.origin)으로 변경

/*
 * ============================================================
 *  분리 안내
 *  - 이 스크립트는 원래 포장/packing-tools.user.js(포장 담당자용) 안의 블록4였습니다.
 *    실제로는 관리팀이 피킹리스트를 프린트할 때 쓰는 기능이라, 담당자 기준 폴더 구조에
 *    맞게 관리/ 폴더로 옮겼습니다. 로직 자체는 변경 없이 그대로 가져왔습니다.
 *  - 버전 이력(v75.0 → v75.2, JAN코드+상품명 합산 버그수정 등)은 아래 원본 주석에
 *    그대로 남아있습니다.
 *
 *  v1.1.0 (아타리쿠지 세트수 표시)
 *  - 사업자통관이 안 되는 메인 잔코드(…S숫자)는 출고목록에 안 나와서 세트수를 알 수 없었음.
 *  - 아래 KUJI_SETS 에 "기준등급이 몇 개면 1세트" 를 등록해두면, 메인 잔코드가 없어도
 *    피킹리스트 상단에 "○세트" 배너 + 기준등급 수량칸에 (○set) 를 표시함.
 *  - 미등록 상품은 인쇄창에서 [세트 기준 등록] 버튼으로 그 PC에만 임시 등록 가능.
 *    모든 PC에 적용하려면 KUJI_SETS 에 한 줄 추가해서 GitHub에 올리면 됨.
 *
 *  v1.3.0 (옵션 PCS 세트상품 표시)
 *  - 잔코드 끝이 -H(Half) 인 상품은 옵션칸에 "20PCS" 처럼 1세트 개수가 적혀 있음.
 *  - 피킹리스트 JANCODE 칸 아래에 옵션을 표시하고, 수량칸에 "×20pcs = 실제 개수"를 표시함.
 *  - -H 상품인데 옵션에서 PCS를 못 찾으면 "⚠ 옵션(PCS) 확인" 으로 표시함.
 *
 *  v1.4.0 (같은 Tracking 묶음 출고건 표시)
 *  - 포장화면의 "Tracking番号 重複確認" 팝업과 같은 방식(종합관리 검색)으로,
 *    배송대행 LH/OH 출고건의 Tracking번호를 다른 LH/OH 출고건도 쓰고 있으면
 *    피킹리스트 상단에 "🔗 같은 Tracking 묶음" 박스로 출고번호·진행상태를 표시함.
 *  - 이번에 같이 인쇄되는 출고건은 [이번 출력] 표시, 현재 출고건은 "← 현재" 표시.
 *  - 로케이션/트래킹 칸의 트래킹번호 옆에도 "🔗 n건" 표시.
 *
 *  v1.5.0 (피킹리스트 일본어화)
 *  - 인쇄창(피킹리스트)에 나오는 문구를 모두 일본어로 변경. 진행상태(출고 보류 등)도 일본어로 변환.
 *  - 관리팀이 보는 사이트 화면 안내창(주의 회원사 등)은 그대로 한국어.
 *
 *  v1.6.0 (무검품출하 표시)
 *  - 무검품출하 출고건이면 제목 옆에 빨간 "無検品出荷" 표시.
 *  - 출고건의 Tracking이 무검품출하 출고요청(다른 출고건 포함)에 들어가 있으면
 *    상단에 "⚠ 無検品出荷 Tracking" 박스(관련 출고번호·진행상태)와,
 *    로케이션/트래킹 칸에 "⚠ 無検品" 배지를 표시.
 *  - 같은 Tracking에 무검품출하 출고요청이 2건 이상이면 "⛔ 進行不可(管理者確認)" 로 표시.
 *    (포장 스크립트 packing-tools v1.5.0 의 팝업과 같은 기준)
 *
 *  v1.6.1 (요청: "중복되는 경우에만")
 *  - 상단 박스·로케이션 배지는 무검품출하 Tracking이 다른 출고요청에도 들어가 있을 때(중복)만 표시.
 *    제목 옆 "無検品出荷" 라벨은 무검품출하 출고건이면 그대로 표시.
 * ============================================================
 */

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

    /* ==========================================================
     * 아타리쿠지 세트 기준표 (모든 PC에 자동 업데이트로 배포됨)
     * 형식:  '메인잔코드': { grade: '기준등급', perSet: 1세트당 수량 },
     * 예) 4550624971331-1 이 2개 = 1세트  →  grade: '1', perSet: 2
     * ========================================================== */
    const KUJI_SETS = {
        '4550624971331': { grade: '1', perSet: 2 }, // SANRIO ATARIKUJI BLANKET SET
    };

    /* ==========================================================
     * [v1.2.0] 세트 기준 구글시트 (매월 입고 시 여기에 한 줄씩 추가)
     *  시트 열 순서: A 잔코드 | B 기준등급 | C 1세트수량 | D 상품명(메모)
     *  - KUJI_SHEET_CSV_URL : 파일 → 공유 → 웹에 게시 → CSV 로 받은 링크
     *  - KUJI_SHEET_EDIT_URL: 시트를 평소에 여는 주소 (인쇄창 [시트에 등록] 버튼용)
     *  우선순위: 구글시트 > 위 KUJI_SETS > 각 PC 임시등록
     * ========================================================== */
    const KUJI_SHEET_CSV_URL = '';
    const KUJI_SHEET_EDIT_URL = '';

    function parseCsv(text) {
        const rows = [];
        let row = [], cur = '', q = false;
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

    // 결과: { sets: {...}, error: '' }
    async function loadKujiSheet() {
        if (!KUJI_SHEET_CSV_URL) return { sets: {}, error: '' };
        try {
            const url = KUJI_SHEET_CSV_URL + (KUJI_SHEET_CSV_URL.includes('?') ? '&' : '?') + '_=' + Date.now();
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const sets = {};
            parseCsv(await res.text()).forEach(r => {
                const jan = String(r[0] || '').replace(/\s/g, '');
                const grade = String(r[1] || '').replace(/[-\s]/g, '');
                const per = parseInt(String(r[2] || '').replace(/[^\d]/g, ''), 10);
                if (/^\d{8,14}$/.test(jan) && /^\d+$/.test(grade) && per > 0) {
                    sets[jan] = { grade: grade, perSet: per };
                }
            });
            return { sets: sets, error: '' };
        } catch (e) {
            console.error('[쿠지 세트시트] 읽기 실패', e);
            return { sets: {}, error: String(e.message || e) };
        }
    }

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

    /* [v1.3.0] 상품 옵션 문자열 찾기 (필드 이름이 화면마다 달라서 후보를 넓게 확인) */
    function optionToText(v) {
        if (v == null) return '';
        if (Array.isArray(v)) return v.map(optionToText).filter(Boolean).join(' / ');
        if (typeof v === 'object') return Object.values(v).map(optionToText).filter(Boolean).join(' / ');
        return String(v).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }
    function extractOption(it) {
        const keys = ['option', 'option_name', 'options', 'item_option', 'option_str', 'option_text', 'option_value', 'opt', 'option1', 'variation', 'spec'];
        for (const k of keys) {
            const t = optionToText(it[k]);
            if (t && t !== '-' && t.toLowerCase() !== 'null') return t;
        }
        for (const k in it) {
            if (!/option/i.test(k)) continue;
            const t = optionToText(it[k]);
            if (t && t !== '-' && t.toLowerCase() !== 'null') return t;
        }
        // [v1.3.1] 마지막 수단: 상품 데이터 전체(안쪽 묶음까지)에서 "숫자+PCS" 가 들어간 값 찾기
        return findPcsText(it, 0) || '';
    }
    function findPcsText(obj, depth) {
        if (!obj || typeof obj !== 'object' || depth > 4) return '';
        for (const k in obj) {
            if (/image|url|img/i.test(k)) continue;
            const v = obj[k];
            if (typeof v === 'string' || typeof v === 'number') {
                const t = optionToText(v);
                if (/\d+\s*(PCS|PC|個|入)/i.test(t) && t.length <= 60) return t;
            } else if (v && typeof v === 'object') {
                const r = findPcsText(v, depth + 1);
                if (r) return r;
            }
        }
        return '';
    }
    // [v1.3.1] 상품 목록 밖(응답 전체)에 옵션이 따로 있는 경우: 같은 잔코드를 가진 묶음에서 PCS 찾기
    function findPcsByJan(root, jan) {
        let found = '';
        const base = String(jan).replace(/-H$/i, '');
        const walk = (o, d) => {
            if (found || !o || typeof o !== 'object' || d > 6) return;
            const vals = Object.values(o);
            const hasJan = vals.some(v => typeof v === 'string' && (v.trim() === jan || v.trim() === base));
            if (hasJan) { const t = findPcsText(o, 0); if (t) { found = t; return; } }
            vals.forEach(v => { if (v && typeof v === 'object') walk(v, d + 1); });
        };
        walk(root, 0);
        return found;
    }
    function extractPcs(optionText) {
        const m = String(optionText || '').match(/(\d+)\s*(PCS|PC|個|入|개)/i);
        return m ? parseInt(m[1], 10) : 0;
    }

    /* ==========================================================
     * [v1.4.0] 같은 Tracking번호를 쓰는 LH/OH 출고건 조회
     *  (포장 스크립트의 "Tracking番号 重複確認" 과 같은 종합관리 검색 사용)
     * ========================================================== */
    const DELIVERY_NO_PATTERN = /^(LH|OH)/i;
    const mgtCache = new Map();

    // [v1.7.0] 종합관리 Tracking 검색 공용 함수.
    // 예전에는 "같은 Tracking 출고건" 과 "무검품출하 확인" 이 같은 검색을 각각 따로 해서
    // Tracking 1개당 무거운 검색이 2번씩 나갔음 → 결과(HTML)를 3분간 공유해서 1번만 요청.
    const mgtHtmlCache = new Map();   // trackingNo → { at, promise }
    function getMgtHtml(trackingNo) {
        const c = mgtHtmlCache.get(trackingNo);
        if (c && Date.now() - c.at < 3 * 60 * 1000) return c.promise;
        const url = new URL(location.origin + '/admin/mgt/index');
        url.searchParams.set('action', 'search');
        url.searchParams.set('tracking_no', trackingNo);
        url.searchParams.set('pagesize', '500');
        const promise = fetch(url.toString(), { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(res => {
                if (!res.ok) throw new Error('総合管理 HTTP ' + res.status);
                return res.text();
            });
        promise.catch(() => mgtHtmlCache.delete(trackingNo));
        mgtHtmlCache.set(trackingNo, { at: Date.now(), promise: promise });
        return promise;
    }

    // [v1.7.0] 여러 작업을 정해진 개수만큼 동시에 실행
    async function runLimited(list, limit, fn) {
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

    function cellText(el) {
        return (el?.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function extractRowTrackingNo(row) {
        if (!row) return '';
        const fromData = (row.querySelector('.sub_checkbox')?.dataset.trackingno || '').trim();
        if (fromData) return fromData;
        const link = row.querySelector('.show_tracking_page');
        if (link?.dataset.trackingno) return String(link.dataset.trackingno).trim();
        const trackingCell = row.cells[6];
        if (!trackingCell) return '';
        return cellText(trackingCell).replace(/\s/g, '');
    }

    function parseMgtHtml(html, trackingNo) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const results = [];
        const seen = new Set();
        doc.querySelectorAll('table.table-bordered tbody tr').forEach(row => {
            if (row.cells.length < 15) return;
            const deliveryLink = row.cells[4]?.querySelector('.show-delivery-detail-btn');
            const deliveryNo = cellText(deliveryLink || row.cells[4]).split(/\s+/)[0];
            if (!DELIVERY_NO_PATTERN.test(deliveryNo)) return;
            const tl = row.cells[13]?.querySelector('.show_tracking_page');
            const rowTracking = (tl?.dataset.trackingno || cellText(row.cells[13])).replace(/\s/g, '');
            if (rowTracking !== trackingNo) return;
            const status = cellText(row.cells[14]?.querySelector('.badge') || row.cells[14]) || '-';
            if (seen.has(deliveryNo)) return;
            seen.add(deliveryNo);
            results.push({ deliveryNo: deliveryNo, status: status });
        });
        // 출고번호 큰 순서(포장화면 팝업과 같은 순서)
        results.sort((a, b) => b.deliveryNo.localeCompare(a.deliveryNo));
        return results;
    }

    async function fetchMgtByTracking(trackingNo) {
        if (mgtCache.has(trackingNo)) return mgtCache.get(trackingNo);
        const data = parseMgtHtml(await getMgtHtml(trackingNo), trackingNo);
        mgtCache.set(trackingNo, data);
        return data;
    }

    // 결과: { list: [{trackingNo, orders:[...] }], error: '' }  (2건 이상 묶인 것만)
    async function findSameTrackingOrders(trackingNos) {
        let error = '';
        // [v1.7.0] 하나씩 순서대로 → 3개씩 동시에 조회
        const results = await runLimited(trackingNos, 3, async (t) => {
            try {
                const orders = await fetchMgtByTracking(t);
                return orders.length >= 2 ? { trackingNo: t, orders: orders } : null;
            } catch (e) {
                console.error('[피킹리스트] 같은 Tracking 조회 실패', t, e);
                error = String(e.message || e);
                return null;
            }
        });
        return { list: results.filter(Boolean), error: error };
    }

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
            // [v1.7.0] 같은 Tracking 출고건 조회와 검색 결과 공유 (중복 요청 제거)
            const doc = new DOMParser().parseFromString(await getMgtHtml(trackingNo), 'text/html');
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
         *   - duplicate: 그 Tracking이 2건 이상의 출고요청에 들어가 있음(중복)
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
                    return { trackingNo: trackingNo, orders: orders, noInspOrders: noInspOrders, blocked: noInspOrders.length >= BLOCK_MIN_COUNT, duplicate: orders.length >= 2 };
                } catch (e) {
                    errors.push(trackingNo + ': ' + (e.message || e));
                    return null;
                }
            });
            return { list: results.filter(Boolean), error: errors.join(' / ') };
        }

        return { check: check, norm: norm, BLOCK_MIN_COUNT: BLOCK_MIN_COUNT, DELIVERY_NO_RE: DELIVERY_NO_RE };
    })();

    function extractLocationWithQty(it) {
        let totalQty = parseInt(it.quantity || it.display_quantity || it.qty || "1");

        let subList = it.locations || it.location_details || it.stock_locations || it.locations_info;
        if (Array.isArray(subList) && subList.length > 0) {
            return subList.map(s => {
                let lName = s.location || s.location_name || s.name || "未指定";
                let lQty = s.qty || s.quantity || s.count || 1;
                return `${lName} : ${lQty}個`;
            }).join('<br>');
        }

        let rawLoc = String(it.location_str || it.location || it.location_name || "").trim();

        if (/:\s*\d+(개|個)/.test(rawLoc)) {
            return rawLoc.replace(/(\d+)\s*개/g, '$1個').replace(/\|/g, '<br>').replace(/\s*\/\s*/g, '<br>');
        }

        let locParts = rawLoc.split(/[\n|\/]+/).map(s => s.trim()).filter(Boolean);

        if (locParts.length > 1) {
            let qtyArr = it.location_qty || it.qtys || it.quantities;
            if (Array.isArray(qtyArr) && qtyArr.length === locParts.length) {
                return locParts.map((loc, idx) => `${loc} : ${qtyArr[idx]}個`).join('<br>');
            }

            let remainQty = totalQty;
            let resultLines = [];
            for (let i = 0; i < locParts.length; i++) {
                if (i === locParts.length - 1) {
                    resultLines.push(`${locParts[i]} : ${remainQty}個`);
                } else {
                    let allocated = Math.max(1, Math.floor(totalQty / locParts.length));
                    resultLines.push(`${locParts[i]} : ${allocated}個`);
                    remainQty -= allocated;
                }
            }
            return resultLines.join('<br>');
        }

        if (locParts.length === 1 && locParts[0] !== "") {
            return `${locParts[0]} : ${totalQty}個`;
        }

        return "未指定";
    }

    async function startApiHarvest(checkedBoxes) {
        showOverlay(`🚀 데이터를 수집하여 이중 정렬 가공 중...`);
        const collectedGroups = [];
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
        // [v1.7.0] 쿠지 세트시트는 처음부터 같이 읽어 둠(마지막에 기다리지 않도록)
        const kujiSheetPromise = loadKujiSheet();
        const boxList = Array.from(checkedBoxes);
        let doneCount = 0;
        showOverlay(`🚀 데이터를 수집하여 이중 정렬 가공 중... (0 / ${boxList.length})`);

        // [v1.7.0] 출고건을 하나씩 기다리지 않고 3건씩 동시에 조회 (순서는 originalIndex로 유지)
        await runLimited(boxList, 3, async (box, i) => {
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
                rowTracking: extractRowTrackingNo(tr),
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
                        const janCode = (it.jancode || it.jan_code || it.item_id || "-").trim();
                        let option = extractOption(it);
                        const isHalf = /-H$/i.test(janCode);
                        if (isHalf && !extractPcs(option)) {
                            const alt = findPcsByJan(jsonData, janCode);
                            if (alt) option = alt;
                            else console.warn('[피킹리스트] -H 상품 옵션 PCS 못 찾음', JSON.stringify(it));
                        }

                        return {
                            imgHtml: `<img src="${it.image_url_thumb || it.image_url || ''}" style="max-width:55px; max-height:45px;">`,
                            productName: (it.title || it.item_name || it.product_name || "").trim(),
                            janCode: janCode,
                            option: option,
                            pcs: extractPcs(option),
                            isHalf: isHalf,
                            qty: parseInt(it.quantity || it.display_quantity || it.qty || "1"),
                            location: extractLocationWithQty(it),
                            tracking: trackNo
                        };
                    });

                    const combinedMap = new Map();
                    processedItems.forEach(item => {
                        // [수정] 잔코드만으로 합치면 같은 잔코드를 잘못 입력한 서로 다른 상품이
                        // 하나로 섞여버릴 수 있어, 상품명까지 같이 확인해서 합산 기준으로 삼음.
                        const key = `${item.tracking}_${item.janCode}_${item.productName.trim()}_${item.option}`;
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
                    if (parseInt(packingData.no_inspection) === 1) reqSet.add("検品なし出荷");
                    if (parseInt(packingData.add_material) === 1) reqSet.add("緩衝材追加");

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

                    // [v1.4.0] 배송대행 LH/OH 건: 같은 Tracking번호를 쓰는 다른 출고건 조회
                    let sameTracking = { list: [], error: '' };
                    // [v1.6.0] 무검품출하 표시 (현재 출고건 여부 + Tracking별 무검품출하 출고요청)
                    const isNoInspection = parseInt(packingData.no_inspection) === 1;
                    let noInsp = { list: [], error: '', current: isNoInspection };
                    if (DELIVERY_NO_PATTERN.test(task.outNum) && (task.type.includes('delivery') || tr?.innerText.includes('배송대행') || tr?.innerText.includes('배송 대행'))) {
                        const tSet = new Set();
                        if (task.rowTracking) tSet.add(task.rowTracking);
                        processedItems.forEach(it => { if (it.tracking) tSet.add(it.tracking); });
                        if (tSet.size > 0) {
                            // [v1.7.0] 두 조회를 동시에 실행 (종합관리 검색 결과는 공유되어 1번만 요청됨)
                            const tArr = Array.from(tSet);
                            const [st, ni] = await Promise.all([
                                findSameTrackingOrders(tArr),
                                NoInsp.check(tArr, { id: task.id, deliveryNo: task.outNum, noInspection: isNoInspection })
                                    .then(r => ({ list: r.list.filter(t => t.duplicate || t.blocked), error: r.error, current: isNoInspection }))
                                    .catch(e => ({ list: [], error: String(e.message || e), current: isNoInspection }))
                            ]);
                            sameTracking = st;
                            noInsp = ni;
                        }
                    }

                    for (let p = 0; p * ITEMS_PER_PAGE < processedItems.length; p++) {
                        collectedGroups.push({
                            outNum: task.outNum, receiver: task.receiver, orderDate: task.orderDate,
                            requests: Array.from(reqSet),
                            requirementMsg: cleanMsg,
                            isOcean: task.isOcean,
                            sameTracking: sameTracking,
                            noInsp: noInsp,
                            items: processedItems.slice(p * ITEMS_PER_PAGE, (p + 1) * ITEMS_PER_PAGE),
                            pageNum: p + 1, totalPage: Math.ceil(processedItems.length / ITEMS_PER_PAGE),
                            originalIndex: task.originalIndex
                        });
                    }
                }
            } catch (e) { console.error(e); }
            doneCount++;
            showOverlay(`🚀 데이터를 수집하여 이중 정렬 가공 중... (${doneCount} / ${boxList.length})`);
        });

        if (collectedGroups.length > 0) {
            collectedGroups.sort((a, b) => {
                if (a.originalIndex !== b.originalIndex) {
                    return b.originalIndex - a.originalIndex;
                }
                return a.pageNum - b.pageNum;
            });

            const kujiSheet = await kujiSheetPromise;
            openPrintWindow(collectedGroups, kujiSheet);
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

    function openPrintWindow(groups, kujiSheet) {
        const printWin = window.open('', '_blank');
        if(!printWin) return;
        kujiSheet = kujiSheet || { sets: {}, error: '' };
        const toSafe = (obj) => JSON.stringify(obj).replace(/[\u007F-￿]/g, chr => "\\u" + ("0000" + chr.charCodeAt(0).toString(16)).substr(-4));
        const safeData = toSafe(groups);
        const safeKuji = toSafe(Object.assign({}, KUJI_SETS, kujiSheet.sets));
        const safeSheetInfo = toSafe({ editUrl: KUJI_SHEET_EDIT_URL, error: kujiSheet.error });

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
            .kuji-banner { border:3px solid #d00; background:#fff4f4; padding:6px 10px; margin:0 0 8px 0; font-weight:900; font-size:15px; color:#000; display:flex; align-items:center; gap:10px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .kuji-banner.warn { border-color:#e69500; background:#fff8e6; }
            .st-box { border:3px solid #7b1fa2; background:#f8f0fc; padding:5px 8px; margin:0 0 8px 0; font-size:12px; color:#000; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .st-box .st-title { font-weight:900; font-size:14px; margin-bottom:4px; }
            .st-box .st-list { display:flex; flex-wrap:wrap; gap:4px; }
            .st-chip { border:1.5px solid #555; border-radius:4px; padding:2px 6px; background:#fff; font-weight:bold; white-space:nowrap; }
            .st-chip.cur { border-color:#7b1fa2; background:#fff3cd; font-weight:900; }
            .st-chip.done { color:#888; border-color:#bbb; }
            .st-chip .st-stat { font-weight:900; margin-left:4px; }
            .st-chip .st-stat.hold { color:#d00; }
            .st-chip .st-here { margin-left:4px; background:#7b1fa2; color:#fff; border-radius:3px; padding:0 4px; font-size:10px; }
            .ni-box { border:3px solid #e65100; background:#fff3e0; padding:5px 8px; margin:0 0 8px 0; font-size:12px; color:#000; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .ni-box.block { border-color:#c62828; background:#ffebee; }
            .kuji-reg { padding:3px 10px; background:#e69500; color:white; border:none; border-radius:4px; font-weight:bold; cursor:pointer; }
        </style>`;

        printWin.document.write(`<html><head>${style}<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script></head><body>
            <div class="no-print" style="position:fixed; top:10px; right:10px; z-index:1000;"><button onclick="window.print()" style="padding:4px 10px; background:#ff3e1d; color:white; border-radius:4px; font-weight:bold; border:none; cursor:pointer;">🖨️ 印刷</button></div>
            <div id="content-area"></div>
            <script>
                const groups = ${safeData};
                const KUJI_SETS_BASE = ${safeKuji};
                const KUJI_LOCAL_KEY = 'kujiSetsLocal';
                const KUJI_SHEET_INFO = ${safeSheetInfo};
                if (KUJI_SHEET_INFO.error) {
                    document.body.insertAdjacentHTML('afterbegin', '<div class="no-print" style="position:fixed; top:10px; left:10px; z-index:1000; background:#e69500; color:#fff; padding:6px 12px; border-radius:4px; font-weight:bold;">⚠ くじセット基準シートを読み込めませんでした (' + KUJI_SHEET_INFO.error + ') - コードに登録された基準のみ使用中</div>');
                }

                /* ---------- [v1.1.0] 아타리쿠지 세트수 계산 ---------- */
                function loadKujiSets() {
                    let local = {};
                    try { local = JSON.parse(localStorage.getItem(KUJI_LOCAL_KEY) || '{}') || {}; } catch (e) {}
                    return Object.assign({}, local, KUJI_SETS_BASE);
                }

                // 출고번호별로: 메인잔코드(S숫자)가 없는 쿠지 서브 잔코드 묶음 → 세트수 계산
                function computeKujiInfo(allGroups) {
                    const sets = loadKujiSets();
                    const byOut = {};
                    allGroups.forEach(g => {
                        const o = byOut[g.outNum] = byOut[g.outNum] || { mains: new Set(), subs: {} };
                        g.items.forEach(it => {
                            if (!it.productName.toUpperCase().includes("KUJI")) return;
                            if (/S\\d+/i.test(it.janCode)) {
                                o.mains.add(it.janCode.split(/S/i)[0].replace(/[- ]+$/, "").trim());
                                return;
                            }
                            const m = it.janCode.trim().match(/^(\\d{8,14})-(\\d+)$/);
                            if (!m) return;
                            const s = o.subs[m[1]] = o.subs[m[1]] || { name: it.productName, grades: {} };
                            s.grades[m[2]] = (s.grades[m[2]] || 0) + it.qty;
                        });
                    });
                    const result = {};
                    Object.keys(byOut).forEach(out => {
                        const o = byOut[out];
                        const map = {};
                        Object.keys(o.subs).forEach(base => {
                            if (o.mains.has(base)) return; // 메인 잔코드가 있으면 기존 (○set) 표시 사용
                            const s = o.subs[base];
                            const conf = sets[base];
                            const info = { base: base, name: s.name, grades: Object.keys(s.grades), conf: conf };
                            if (!conf) {
                                info.status = 'unregistered';
                            } else if (!s.grades[String(conf.grade)]) {
                                info.status = 'noref';
                            } else {
                                info.refQty = s.grades[String(conf.grade)];
                                info.sets = info.refQty / conf.perSet;
                                info.status = Number.isInteger(info.sets) ? 'ok' : 'odd';
                            }
                            map[base] = info;
                        });
                        result[out] = map;
                    });
                    return result;
                }

                function fmtSets(n) { return Number.isInteger(n) ? String(n) : n.toFixed(1); }

                function kujiBannerHtml(map) {
                    if (!map) return '';
                    return Object.keys(map).map(base => {
                        const k = map[base];
                        let cls = 'kuji-banner warn';
                        let body = '';
                        if (k.status === 'ok') {
                            cls = 'kuji-banner';
                            body = '<span style="font-size:22px; color:#d00;">' + k.sets + 'セット</span>' +
                                   '<span style="font-size:12px; font-weight:normal; color:#444;">(-' + k.conf.grade + ' 基準 ' + k.conf.perSet + '個 = 1セット)</span>';
                        } else if (k.status === 'odd') {
                            body = '<span style="font-size:20px; color:#d00;">' + fmtSets(k.sets) + 'セット ⚠ 数量確認</span>' +
                                   '<span style="font-size:12px; font-weight:normal; color:#444;">(-' + k.conf.grade + ' 現在 ' + k.refQty + '個 / 1セット ' + k.conf.perSet + '個)</span>';
                        } else if (k.status === 'noref') {
                            body = '<span>基準等級 -' + k.conf.grade + ' がリストにありません → セット数を確認してください</span>';
                        } else {
                            body = '<span>セット基準 未登録</span>' +
                                   (KUJI_SHEET_INFO.editUrl ? '<a class="no-print kuji-reg" style="text-decoration:none;" target="_blank" href="' + KUJI_SHEET_INFO.editUrl + '">📋 シートに登録</a>' : '') +
                                   '<button class="no-print kuji-reg kuji-local" style="background:#6b7280;" data-base="' + base + '" data-grades="' + k.grades.join(',') + '">このPCに仮登録</button>';
                        }
                        return '<div class="' + cls + '"><span>🎯 ' + k.name + ' (' + base + ') :</span>' + body + '</div>';
                    }).join('');
                }

                document.addEventListener('click', function(e) {
                    const btn = e.target.closest ? e.target.closest('.kuji-local') : null;
                    if (!btn) return;
                    const base = btn.getAttribute('data-base');
                    const grades = btn.getAttribute('data-grades').split(',').map(g => '-' + g).join(', ');
                    let grade = prompt('[' + base + '] 基準となる等級番号を入力してください\\n(リストにある等級: ' + grades + ')', '1');
                    if (!grade) return;
                    grade = grade.replace(/-/g, '').trim();
                    const per = parseInt(prompt('-' + grade + ' 等級は1セットに何個ですか？', '2'), 10);
                    if (!per || per < 1) return;
                    try {
                        const local = JSON.parse(localStorage.getItem(KUJI_LOCAL_KEY) || '{}') || {};
                        local[base] = { grade: grade, perSet: per };
                        localStorage.setItem(KUJI_LOCAL_KEY, JSON.stringify(local));
                    } catch (err) { alert('保存失敗: ' + err); return; }
                    renderAll();
                });
                /* ---------- [v1.1.0] 끝 ---------- */

                /* ---------- [v1.4.0] 같은 Tracking 묶음 출고건 표시 ---------- */
                const PRINTED_OUTS = new Set(groups.map(g => String(g.outNum).trim()));
                function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

                function sameTrackingHtml(g) {
                    const st = g.sameTracking || { list: [], error: '' };
                    let out = '';
                    st.list.forEach(t => {
                        const chips = t.orders.map(o => {
                            const isCur = o.deliveryNo === String(g.outNum).trim();
                            const isDone = o.status.indexOf('완료') >= 0 || o.status.indexOf('完了') >= 0;
                            const isHold = /보류|취소|保留|キャンセル/.test(o.status);
                            return '<span class="st-chip' + (isCur ? ' cur' : (isDone ? ' done' : '')) + '">' +
                                escHtml(o.deliveryNo) + (isCur ? ' ← 現在' : '') +
                                '<span class="st-stat' + (isHold ? ' hold' : '') + '">[' + escHtml(jaStatus(o.status)) + ']</span>' +
                                (!isCur && PRINTED_OUTS.has(o.deliveryNo) ? '<span class="st-here">今回出力</span>' : '') +
                                '</span>';
                        }).join('');
                        out += '<div class="st-box"><div class="st-title">🔗 同一Tracking番号の出荷件 ' + t.orders.length + '件 · Tracking No: ' + escHtml(t.trackingNo) + '</div>' +
                               '<div class="st-list">' + chips + '</div></div>';
                    });
                    if (st.error) {
                        out += '<div class="no-print" style="background:#e69500; color:#fff; padding:4px 8px; margin-bottom:6px; font-weight:bold; font-size:12px;">⚠ 同一Tracking出荷件の照会に失敗しました (' + escHtml(st.error) + ') - 梱包画面で確認してください</div>';
                    }
                    return out;
                }

                // 진행상태 한국어 → 일본어 (띄어쓰기 무시하고 비교, 모르는 상태는 그대로 표시)
                const STATUS_JA = {
                    '접수': '受付', '입고대기': '入庫待ち', '입고완료': '入庫完了', '검수완료': '検品完了',
                    '포장대기': '梱包待ち', '포장진행': '梱包進行', '포장완료': '梱包完了',
                    '출고요청': '出荷依頼', '출고대기': '出荷待ち', '출고보류': '出荷保留', '출고완료': '出荷完了',
                    '보류': '保留', '취소': 'キャンセル', '배송중': '配送中', '배송완료': '配送完了'
                };
                function jaStatus(s) {
                    const k = String(s || '').replace(/\\s+/g, '');
                    return STATUS_JA[k] || s;
                }

                /* ---------- [v1.6.0] 무검품출하 표시 ---------- */
                function noInspOf(g, trackingNo) {
                    const ni = g.noInsp || { list: [] };
                    const key = String(trackingNo || '').replace(/[\\s\\-]/g, '').toUpperCase();
                    return ni.list.find(t => String(t.trackingNo).replace(/[\\s\\-]/g, '').toUpperCase() === key) || null;
                }
                function noInspHtml(g) {
                    const ni = g.noInsp || { list: [], error: '' };
                    let out = '';
                    // 관련 출고건 구성이 똑같은 Tracking끼리는 한 칸으로 묶음
                    const grouped = [];
                    ni.list.forEach(t => {
                        const sig = (t.blocked ? 'B|' : 'I|') + t.orders.map(o => o.deliveryNo + ':' + o.noInspection + ':' + o.status).join(',');
                        const f = grouped.find(x => x.sig === sig);
                        if (f) f.trackingNos.push(t.trackingNo);
                        else grouped.push(Object.assign({}, t, { sig: sig, trackingNos: [t.trackingNo] }));
                    });
                    grouped.forEach(t => {
                        const chips = t.orders.map(o => {
                            const isCur = o.deliveryNo === String(g.outNum).trim();
                            return '<span class="st-chip' + (isCur ? ' cur' : '') + '" style="' + (o.noInspection ? 'border-color:#c62828; color:#c62828; font-weight:900;' : '') + '">' +
                                escHtml(o.deliveryNo) + (isCur ? ' ← 現在' : '') +
                                '<span class="st-stat">[' + escHtml(jaStatus(o.status)) + ']</span>' +
                                (o.noInspection ? ' 無検品' : '') + '</span>';
                        }).join('');
                        out += '<div class="ni-box' + (t.blocked ? ' block' : '') + '"><div class="st-title">' +
                            (t.blocked ? '⛔ 無検品出荷の依頼 ' + t.noInspOrders.length + '件 · 進行不可（管理者確認）' : '⚠ 無検品出荷Trackingが別の出荷件と重複') +
                            ' · Tracking No: ' + t.trackingNos.map(escHtml).join(', ') + '</div>' +
                            '<div class="st-list">' + chips + '</div></div>';
                    });
                    if (ni.error) {
                        out += '<div class="no-print" style="background:#e69500; color:#fff; padding:4px 8px; margin-bottom:6px; font-weight:bold; font-size:12px;">⚠ 無検品出荷の照会に一部失敗しました (' + escHtml(ni.error) + ') - 梱包画面で確認してください</div>';
                    }
                    return out;
                }
                /* ---------- [v1.6.0] 끝 ---------- */

                function sameTrackingCount(g, trackingNo) {
                    const st = g.sameTracking || { list: [] };
                    const f = st.list.find(t => t.trackingNo === trackingNo);
                    return f ? f.orders.length : 0;
                }
                /* ---------- [v1.4.0] 끝 ---------- */

                function renderAll() {
                const gs = JSON.parse(JSON.stringify(groups));
                const kujiInfo = computeKujiInfo(gs);
                let html = "";

                gs.forEach((g, idx) => {
                    let rows = "";
                    let currentMainNo = 0;
                    let currentSubNo = 0;
                    const kujiMap = kujiInfo[g.outNum] || {};

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
                            } else {
                                // [v1.1.0] 메인 잔코드가 없는 쿠지: 기준등급 행 수량칸에 (○set) 표시
                                const sm = it.janCode.trim().match(/^(\\d{8,14})-(\\d+)$/);
                                const k = sm ? kujiMap[sm[1]] : null;
                                if (k && (k.status === 'ok' || k.status === 'odd') && String(k.conf.grade) === sm[2]) {
                                    rowStyle = 'style="height:45px; background-color: #fff9c4 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;"';
                                    qtyTdHtml = '<td style="border:1.5px solid #000; text-align:center; vertical-align:middle; padding:2px 0;"><div style="font-size:26px; color:red; font-weight:900; line-height:1;">' + it.qty + '</div><div style="font-size:11px; color:#ff3e1d; font-weight:bold; margin-top:1px;">(' + fmtSets(k.sets) + 'set)</div></td>';
                                }
                            }
                        }

                        // [v1.3.0] 옵션 PCS 세트상품 (-H 등)
                        let janHtml = it.janCode;
                        if (it.option) {
                            janHtml += '<div style="font-size:12px; color:#d00; font-weight:900; letter-spacing:0; margin-top:2px;">' + String(it.option).replace(/</g, '&lt;') + '</div>';
                        }
                        if (it.pcs > 0 && (it.isHalf || !isKuji)) {
                            rowStyle = 'style="height:45px; background-color: #e3f2fd !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;"';
                            qtyTdHtml = '<td style="border:1.5px solid #000; text-align:center; vertical-align:middle; padding:2px 0;">' +
                                '<div style="font-size:26px; color:red; font-weight:900; line-height:1;">' + it.qty + '</div>' +
                                '<div style="font-size:11px; color:#1565c0; font-weight:900; margin-top:1px;">×' + it.pcs + 'pcs</div>' +
                                (it.qty > 1 ? '<div style="font-size:11px; color:#1565c0; font-weight:900;">=' + (it.qty * it.pcs) + '個</div>' : '') +
                                '</td>';
                        } else if (it.isHalf) {
                            janHtml += '<div style="font-size:12px; color:#fff; background:#e69500; font-weight:900; letter-spacing:0; margin-top:2px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">ハーフ · 個数は梱包画面のオプションを確認</div>';
                        }

                        let locContent = '<div style="font-weight:900; font-size:14px; line-height:1.3; text-align:center;">' + it.location + '</div>';
                        if (it.tracking) {
                            const stCnt = sameTrackingCount(g, it.tracking);
                            locContent += '<div style="font-size:12px; color:#3b82f6; font-weight:bold; margin-top:3px; text-align:center;">' + it.tracking + '</div>' +
                                (stCnt >= 2 ? '<div style="font-size:11px; color:#fff; background:#7b1fa2; font-weight:900; margin-top:2px; border-radius:3px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">🔗 同一Tracking ' + stCnt + '件</div>' : '');
                            const niT = noInspOf(g, it.tracking);
                            if (niT) {
                                locContent += '<div style="font-size:11px; color:#fff; background:' + (niT.blocked ? '#c62828' : '#e65100') + '; font-weight:900; margin-top:2px; border-radius:3px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">' +
                                    (niT.blocked ? '⛔ 無検品 ' + niT.noInspOrders.length + '件・進行不可' : '⚠ 無検品・重複') + '</div>';
                            }
                        }

                        rows += '<tr ' + rowStyle + '>' +
                            '<td style="border:1.5px solid #000; text-align:center; font-weight:bold; font-size:12px;">' + displayNo + '</td>' +
                            '<td style="border:1.5px solid #000; text-align:center;">' + it.imgHtml + '</td>' +
                            '<td ' + nameTdStyle + '>' + it.productName + '</td>' +
                            '<td ' + janTdStyle + '>' + janHtml + '</td>' +
                            qtyTdHtml +
                            (!skip ? '<td rowspan="' + rowspan + '" style="border:1.5px solid #000; text-align:center; background:#fff; padding:4px; max-width:140px; vertical-align:middle;">' + locContent + '</td>' : '') +
                            '<td style="border:1.5px solid #000; text-align:center; font-size:20px; color:#bbb;">□</td>' +
                            '</tr>';
                    });

                    const reqString = g.requests.length > 0 ? '🚩 ' + g.requests.join(' / ') : '';
                    const oceanLabel = g.isOcean ? '<div style="color:#007bff; font-weight:900; font-size:22px; margin-left:20px; border:3px solid #007bff; padding:2px 10px; border-radius:5px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">海運(OCEAN)</div>' : '';
                    const noInspLabel = (g.noInsp && g.noInsp.current) ? '<div style="color:#fff; background:#c62828; font-weight:900; font-size:20px; margin-left:12px; padding:2px 10px; border-radius:5px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">無検品出荷</div>' : '';
                    const watermarkHtml = g.isOcean ? '<div class="watermark-overlay"></div>' : '';

                    html += '<div class="sheet ' + (g.isOcean ? 'is-ocean' : '') + '">' +
                                watermarkHtml +
                                '<div class="content-wrapper">' +
                                    '<div style="display:flex; justify-content:space-between; align-items:flex-start;">' +
                                        '<div style="flex:1;">' +
                                            '<div style="display:flex; align-items:center;">' +
                                                '<h1 style="font-size:32px; margin:0; font-weight:900; letter-spacing:2px;">PICKING LIST</h1>' +
                                                oceanLabel + noInspLabel +
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
                                                    '<div style="font-size:9px; font-weight:bold; text-align:center; border-bottom:1px solid #000; background:#f4f4f4;">ピッキング担当者</div><div style="flex:1;"></div>' +
                                                '</div>' +
                                                '<div id="qr-'+idx+'"></div>' +
                                            '</div>' +
                                        '</div>' +
                                    '</div>' +
                                    '<div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2.5px solid #000; padding-bottom:5px; margin-bottom:10px; margin-top:5px;">' +
                                        '<div style="color:#ff0000; font-weight:900; font-size:12px; max-width:70%;">' + (g.pageNum===1?reqString:"") + '</div>' +
                                        '<div style="font-size:22px; font-weight:900; color:#000;">'+g.outNum+'</div>' +
                                    '</div>' +
                                    (g.pageNum === 1 ? noInspHtml(g) : '') +
                                    (g.pageNum === 1 ? sameTrackingHtml(g) : '') +
                                    kujiBannerHtml(kujiMap) +
                                    '<table style="width:100%; border-collapse:collapse; table-layout:fixed; border:2px solid #000;">' +
                                        '<thead style="background:#e8e8e8; font-size:13px; font-weight:bold;">' +
                                            '<tr style="height:35px;">' +
                                                '<th width="35" style="border:1.5px solid #000;">No</th><th width="65" style="border:1.5px solid #000;">画像</th><th width="auto" style="border:1.5px solid #000;">商品名</th><th width="180" style="border:1.5px solid #000;">JANCODE</th><th width="50" style="border:1.5px solid #000;">数量</th><th width="140" style="border:1.5px solid #000;">ロケ / トラッキング</th><th width="35" style="border:1.5px solid #000;">V</th>' +
                                            '</tr>' +
                                        '</thead>' +
                                        '<tbody>'+rows+'</tbody>' +
                                    '</table>' +
                                '</div>' +
                            '</div>';
                });
                document.getElementById('content-area').innerHTML = html;
                gs.forEach((g, i) => { if(g.pageNum === 1 && typeof QRCode !== 'undefined') new QRCode(document.getElementById("qr-" + i), {text: g.outNum, width: 80, height: 80}); });
                }

                renderAll();
            </script>
        </body></html>`);
        printWin.document.close();
    }

    setInterval(injectCustomButton, 500);
})();
