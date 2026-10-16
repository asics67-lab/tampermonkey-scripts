// ==UserScript==
// @name         [피킹] 태블릿 피킹 (タブレットピッキング)
// @namespace    https://github.com/asics67-lab/tampermonkey-scripts
// @version      1.3.0
// @description  피킹리스트를 인쇄하지 않고 태블릿에서 바로 보면서 피킹. 출고건 선택 → 로케이션 순서로 합친 피킹 화면 → 탭/JAN 스캔으로 체크 → 완료 후 출고건별 仕分けリスト 인쇄.
// @author       물류팀
// @match        https://www.platform.co.jp/admin/shipping/packing*
// @match        https://platform.co.jp/admin/shipping/packing*
// @match        https://platform.aispel.com/admin/shipping/packing*
// @match        https://www.platform.co.jp/admin/*
// @match        https://platform.co.jp/admin/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/피킹/tablet-picking.user.js
// @downloadURL  https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/피킹/tablet-picking.user.js
// ==/UserScript==

/*
 * ============================================================
 *  태블릿 피킹 v1.0.0 (2026-10-14)
 *
 *  [사용 순서]
 *  1) 출고관리(포장) 화면에서 피킹할 출고건을 체크 → "📱 タブレットピッキング" 버튼
 *  2) 고른 출고건의 상품을 "로케이션 + 상품" 기준으로 합쳐서 로케이션 순서로 보여줌
 *     각 줄 아래에 어느 출고건에 몇 개가 가는지 표시
 *  3) 체크 방법
 *     - 줄을 탭하면 +1 (−1 버튼, 全部 버튼 있음)
 *     - 블루투스 바코드 스캐너로 JAN을 찍으면 해당 상품 +1 (입력칸을 누르지 않아도 됨)
 *     - 📷 버튼: 태블릿 카메라로 JAN 스캔
 *  4) 完了 → 출고건별 仕分けリスト(어느 상품이 어느 출고요청건으로 가는지) 인쇄
 *     덜 집은 상품은 欠品으로 표시됨
 *
 *  - 진행 상황은 이 태블릿(브라우저)에 저장되므로 화면을 닫거나 새로고침해도 "再開"로 이어서 진행 가능
 *  - 출고건 데이터는 관리팀 피킹리스트 스크립트와 같은 방식(ajax_get_packing)으로 읽음
 *  - 시스템의 원래 PICKING LIST 버튼도 눌러서(PDF 창은 막음) 시스템상 "Picking..." 상태가 되게 함
 *    → 관리 PC의 피킹현황 카운터와 같은 기준 유지
 *  - 피킹 담당자용 화면이라 화면 문구는 일본어
 *
 *  v1.1.0 (2026-10-14) — 여러 명 동시 피킹 + 블루투스 프린터
 *  - 시작하면 바로 시스템 상태를 "Picking..."(PICKING LIST 인쇄됨)으로 바꿈 (새 탭/PDF 없이)
 *  - 시작 직전에 최신 목록을 다시 읽어서, 이미 다른 사람이 Picking... 중인 출고건은 제외하고 시작
 *  - "🆓 未ピッキングのみ" 버튼: 아직 아무도 안 가져간 출고건만 보기 (검색조건 PICKING LIST=미인쇄)
 *  - 피킹 화면 "✖ 取消": 시스템 Picking 상태를 풀어서(PICKING취소와 같은 처리) 다른 사람이 가져갈 수 있게 함
 *  - 完了 시 용지 선택: A4 / 80mm·58mm 롤지(블루투스 모바일 프린터용 세로 긴 레이아웃). 마지막 선택을 기억
 *
 *  v1.2.0 (2026-10-14)
 *  - 仕分けリスト에서 상품 리스트를 빼고 출고건 정보(출고번호·QR·수취인·점수·요청사항)만 인쇄.
 *    덜 집은 상품이 있을 때만 그 상품을 "欠品"으로 표시.
 *
 *  v1.3.0 (2026-10-16) — 태블릿에 이 스크립트 하나만 설치해서 쓰기
 *  - 보고: "태블릿에서 피킹시작 버튼 등 아무것도 나오지 않는다"
 *  - 원인: 버튼을 사이트 PICKING LIST 버튼 옆에만 넣었는데, 태블릿 화면 배치에서는 그 자리가
 *    안 보이거나 늦게 그려져서(20초만 재시도) 버튼이 안 나올 수 있었음.
 *  - 수정: 화면 아래에 항상 떠 있는 피킹 바 추가 (위치 상관없이 보임)
 *      [📱 ピッキング開始 (선택 n件)] [🆓 未ピッキングのみ] + "タブレットピッキング ON" 표시
 *  - 버튼이 사라져도 계속 다시 넣음(재시도 제한 없음)
 *  - 관리자 페이지 어디서든 동작: 포장 화면이 아니면 [📱 ピッキング画面へ] 버튼으로 바로 이동
 *  - 다른 스크립트 없이 이 파일 하나만으로 동작 (원래도 다른 스크립트에 의존하지 않음)
 * ============================================================
 */

(function () {
    'use strict';

    const STORE_KEY = 'tmTabletPicking.batch.v1';
    const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
    const QR_URL = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';

    /* ==========================================================
     * 공용 도구
     * ========================================================== */
    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const normJan = (s) => String(s || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    const locCompare = (a, b) => {
        const ua = a === '未指定', ub = b === '未指定';
        if (ua !== ub) return ua ? 1 : -1;
        return a.localeCompare(b, 'ja', { numeric: true, sensitivity: 'base' });
    };

    function loadBatch() {
        try { const raw = localStorage.getItem(STORE_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    }
    function saveBatch(b) {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(b)); } catch (e) { console.error('[태블릿피킹] 저장 실패', e); }
    }
    function clearBatch() {
        try { localStorage.removeItem(STORE_KEY); } catch (e) {}
    }

    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = url; s.onload = resolve; s.onerror = () => reject(new Error('読み込み失敗: ' + url));
            document.head.appendChild(s);
        });
    }

    async function runLimited(list, limit, fn) {
        const out = new Array(list.length);
        let i = 0;
        const worker = async () => { while (i < list.length) { const k = i++; out[k] = await fn(list[k], k); } };
        await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
        return out;
    }

    /* ---------- 효과음 (스캔 성공/실패) ---------- */
    let audioCtx = null;
    function beep(ok) {
        try {
            audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            const o = audioCtx.createOscillator(), g = audioCtx.createGain();
            o.type = ok ? 'sine' : 'square';
            o.frequency.value = ok ? 1320 : 220;
            g.gain.value = 0.15;
            o.connect(g); g.connect(audioCtx.destination);
            o.start(); o.stop(audioCtx.currentTime + (ok ? 0.08 : 0.35));
        } catch (e) {}
        try { if (navigator.vibrate) navigator.vibrate(ok ? 40 : [120, 60, 120]); } catch (e) {}
    }

    /* ==========================================================
     * 출고건 데이터 읽기 (관리/05-피킹리스트 picking-list-tools 와 같은 방식)
     * ========================================================== */
    function optionToText(v) {
        if (v == null) return '';
        if (Array.isArray(v)) return v.map(optionToText).filter(Boolean).join(' / ');
        if (typeof v === 'object') return Object.values(v).map(optionToText).filter(Boolean).join(' / ');
        return String(v).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }
    function findPcsText(obj, depth) {
        if (!obj || typeof obj !== 'object' || depth > 4) return '';
        for (const k in obj) {
            // 로케이션("Q19 : 2個")·수량 칸을 옵션으로 잘못 읽지 않도록 제외
            if (/image|url|img|loc|qty|quantity|stock|tracking/i.test(k)) continue;
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
        return findPcsText(it, 0) || '';
    }
    function findPcsByJan(root, jan) {
        let found = '';
        const base = String(jan).replace(/-H$/i, '');
        const walk = (o, d) => {
            if (found || !o || typeof o !== 'object' || d > 6) return;
            const vals = Object.values(o);
            if (vals.some(v => typeof v === 'string' && (v.trim() === jan || v.trim() === base))) {
                const t = findPcsText(o, 0); if (t) { found = t; return; }
            }
            vals.forEach(v => { if (v && typeof v === 'object') walk(v, d + 1); });
        };
        walk(root, 0);
        return found;
    }
    function extractPcs(optionText) {
        const m = String(optionText || '').match(/(\d+)\s*(PCS|PC|個|入|개)/i);
        return m ? parseInt(m[1], 10) : 0;
    }

    // 상품 1개의 로케이션을 [{name, qty}] 로 (picking-list-tools 의 extractLocationWithQty 와 같은 규칙)
    function extractLocEntries(it, totalQty) {
        const subList = it.locations || it.location_details || it.stock_locations || it.locations_info;
        if (Array.isArray(subList) && subList.length > 0) {
            return subList.map(s => ({ name: String(s.location || s.location_name || s.name || '未指定').trim(), qty: parseInt(s.qty || s.quantity || s.count || 1) }));
        }
        const rawLoc = String(it.location_str || it.location || it.location_name || '').trim();
        if (/:\s*\d+\s*(개|個)/.test(rawLoc)) {
            return rawLoc.split(/<br\s*\/?>|\||\s*\/\s*|\n/i).map(x => x.trim()).filter(Boolean).map(line => {
                const m = line.match(/^(.*?)\s*:\s*(\d+)\s*(個|개)/);
                return m ? { name: m[1].trim(), qty: parseInt(m[2]) } : { name: line, qty: 0 };
            });
        }
        const parts = rawLoc.split(/[\n|\/]+/).map(s => s.trim()).filter(Boolean);
        if (parts.length > 1) {
            const qtyArr = it.location_qty || it.qtys || it.quantities;
            if (Array.isArray(qtyArr) && qtyArr.length === parts.length) return parts.map((p, i) => ({ name: p, qty: parseInt(qtyArr[i]) || 0 }));
            let remain = totalQty;
            return parts.map((p, i) => {
                if (i === parts.length - 1) return { name: p, qty: remain };
                const a = Math.max(1, Math.floor(totalQty / parts.length)); remain -= a; return { name: p, qty: a };
            });
        }
        if (parts.length === 1) return [{ name: parts[0], qty: totalQty }];
        return [{ name: '未指定', qty: totalQty }];
    }

    async function fetchOrder(task, csrf) {
        const fd = new FormData();
        fd.append('id', task.id);
        fd.append('type', task.type);
        if (csrf) fd.append('_token', csrf);
        const res = await fetch(location.origin + '/admin/shipping/ajax_get_packing', {
            method: 'POST', body: fd, credentials: 'include',
            headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-TOKEN': csrf || '' }
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        let json = JSON.parse(await res.text());
        if (typeof json === 'string') json = JSON.parse(json);

        let items = [];
        const findArray = (obj) => {
            if (!obj || typeof obj !== 'object') return;
            for (const k in obj) {
                if (Array.isArray(obj[k]) && obj[k].length > 0) { if (obj[k].length > items.length) items = obj[k]; }
                else if (typeof obj[k] === 'object') findArray(obj[k]);
            }
        };
        findArray(json);

        const out = items.map(it => {
            const jan = String(it.jancode || it.jan_code || it.item_id || '-').trim();
            let option = extractOption(it);
            const isHalf = /-H$/i.test(jan);
            if (isHalf && !extractPcs(option)) { const alt = findPcsByJan(json, jan); if (alt) option = alt; }
            const qty = parseInt(it.quantity || it.display_quantity || it.qty || '1') || 1;
            return {
                jan: jan,
                name: String(it.title || it.item_name || it.product_name || '').trim(),
                option: option,
                pcs: extractPcs(option),
                isHalf: isHalf,
                img: it.image_url_thumb || it.image_url || '',
                qty: qty,
                locs: extractLocEntries(it, qty),
                tracking: String(it.tracking_no || it.invoice_id || it.tracking || it.invoice_no || it.delivery_tracking_no || '').trim()
            };
        });

        const reqSet = new Set();
        const p = json.packing || {};
        if (parseInt(p.no_inspection) === 1) reqSet.add('検品なし出荷');
        if (parseInt(p.add_material) === 1) reqSet.add('緩衝材追加');
        ['put_sticker_str', 'remove_price_str', 'take_picture_str', 'seperate_str'].forEach(k => {
            const v = json[k];
            if (v && typeof v === 'string') v.split(/No\d+\s*[:：]\s*/i).forEach(x => {
                const c = x.replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim();
                if (c.length > 1) reqSet.add(c);
            });
        });
        const reqMsg = String(json.requirement || p.requirement || '').trim().replace(/^\[?추가\s?요청\]?\s*/i, '');
        return { items: out, requests: Array.from(reqSet), requirementMsg: reqMsg };
    }

    /* ---------- 피킹 줄 만들기: 로케이션 + 상품(잔코드·상품명·옵션) 기준으로 합침 ---------- */
    function buildLines(orders) {
        const map = new Map();
        orders.forEach((o, oi) => {
            o.items.forEach(it => {
                // 로케이션 개수 합이 상품 수량과 다르면(데이터 이상) 마지막 로케이션에서 맞춤
                let locs = it.locs.map(l => ({ name: l.name || '未指定', qty: l.qty || 0 }));
                const sum = locs.reduce((a, l) => a + l.qty, 0);
                if (sum !== it.qty && locs.length) locs[locs.length - 1].qty += (it.qty - sum);
                locs = locs.filter(l => l.qty > 0);
                locs.forEach(l => {
                    const key = [l.name, it.jan, it.name, it.option].join('\u0001');
                    if (!map.has(key)) {
                        map.set(key, {
                            key: key, loc: l.name, jan: it.jan, janN: normJan(it.jan), janBase: normJan(String(it.jan).replace(/-H$/i, '')),
                            name: it.name, option: it.option, pcs: it.pcs, isHalf: it.isHalf, img: it.img, total: 0, alloc: []
                        });
                    }
                    const line = map.get(key);
                    line.total += l.qty;
                    const a = line.alloc.find(x => x.oi === oi && x.tracking === it.tracking);
                    if (a) a.qty += l.qty; else line.alloc.push({ oi: oi, qty: l.qty, tracking: it.tracking });
                });
            });
        });
        const lines = Array.from(map.values());
        lines.sort((a, b) => locCompare(a.loc, b.loc) || a.jan.localeCompare(b.jan) || a.name.localeCompare(b.name));
        // 줄 번호를 키로 사용 (진행 상황 저장용)
        lines.forEach((l, i) => { l.key = 'L' + i; });
        return lines;
    }

    /* ==========================================================
     * 출고관리 화면: 버튼 추가 + 출고건 수집
     * ========================================================== */
    function injectButton() {
        if (document.getElementById('tm-tablet-pick-btn')) return;
        const origin = document.getElementById('btnDownloadPickingList');
        const area = origin || document.querySelector('.card-header .btn-group') || document.querySelector('.card-body .mb-3');
        if (!area) return;
        const btn = document.createElement('button');
        btn.id = 'tm-tablet-pick-btn';
        btn.type = 'button';
        btn.className = 'btn btn-sm';
        btn.textContent = '📱 タブレットピッキング';
        btn.style.cssText = 'background:#0f766e !important;color:#fff !important;margin:0 8px;border:none;padding:6px 16px;font-weight:bold;border-radius:4px;';
        btn.onclick = onStartClick;
        if (origin) origin.parentNode.insertBefore(btn, origin.nextSibling); else area.appendChild(btn);

        // [v1.1.0] 아직 아무도 피킹하지 않은 출고건만 보기 (검색조건 PICKING LIST = 미인쇄)
        const sel = document.querySelector('select[name="s_picking"]');
        const form = document.getElementById('search-form');
        if (sel && form) {
            const f = document.createElement('button');
            f.id = 'tm-tablet-pick-filter';
            f.type = 'button';
            f.className = 'btn btn-sm';
            const on = sel.value === '2';
            f.textContent = on ? '👀 全部表示' : '🆓 未ピッキングのみ';
            f.style.cssText = 'background:#fff !important;color:#0f766e !important;border:2px solid #0f766e;padding:4px 12px;font-weight:bold;border-radius:4px;';
            f.onclick = () => { sel.value = on ? '' : '2'; form.submit(); };
            btn.parentNode.insertBefore(f, btn.nextSibling);
        }
    }

    function injectResumeButton() {
        const b = loadBatch();
        let el = document.getElementById('tm-tablet-pick-resume');
        if (!b) { if (el) el.remove(); return; }
        if (!el) {
            el = document.createElement('button');
            el.id = 'tm-tablet-pick-resume';
            el.type = 'button';
            el.style.cssText = 'position:fixed;right:16px;bottom:96px;z-index:99998;background:#0f766e;color:#fff;border:none;border-radius:28px;padding:14px 22px;font-size:17px;font-weight:bold;box-shadow:0 6px 18px rgba(0,0,0,.3);';
            el.onclick = () => openPicker(loadBatch());
            document.body.appendChild(el);
        }
        const st = batchStats(b);
        el.textContent = `📱 ピッキング再開 (${st.picked}/${st.total})`;
    }

    function readSelectedTasks(boxes) {
        return boxes.map((box, i) => {
            const tr = box.closest('tr');
            const method = tr ? (tr.querySelector('td:nth-child(3)')?.innerText || '').toUpperCase() : '';
            return {
                id: box.getAttribute('data-id'),
                outNum: tr ? (tr.querySelector('td:nth-child(4)')?.innerText.trim() || 'N/A') : 'N/A',
                receiver: box.getAttribute('data-name') || '-',
                type: box.getAttribute('data-type') || (tr && tr.innerText.includes('배송대행') ? 'delivery' : 'shop'),
                isOcean: method.includes('OCEAN'),
                idx: i
            };
        });
    }

    function onStartClick() {
        const boxes = Array.from(document.querySelectorAll('input.sub_checkbox:checked'));
        if (boxes.length === 0) { toastMsg('出庫を選択してください', false); return; }
        const cur = loadBatch();
        const go = async () => {
            const ov = overlayMsg('ほかの人のピッキング状況を確認中...');
            const taken = await findTakenIds(readSelectedTasks(boxes));
            ov.close();
            if (taken.size) {
                const takenBoxes = boxes.filter(b => taken.has(b.getAttribute('data-id') + ':' + b.getAttribute('data-type')));
                const names = takenBoxes.map(b => esc(b.closest('tr')?.querySelector('td:nth-child(4)')?.innerText.trim() || b.getAttribute('data-id'))).join(', ');
                const rest = boxes.filter(b => !takenBoxes.includes(b));
                modal(`次の出庫はすでに <b style="color:#dc2626">ほかの人がピッキング中</b> です:<br><b>${names}</b>`, [
                    ...(rest.length ? [{ label: `除外して開始 (${rest.length}件)`, color: '#0f766e', fn: () => checkIssueAndStart(rest) }] : []),
                    { label: 'キャンセル', color: '#6b7280', fn: () => location.reload() }
                ]);
                return;
            }
            checkIssueAndStart(boxes);
        };
        const checkIssueAndStart = (boxes) => {
            const issue = boxes.filter(b => {
                const a = b.closest('tr')?.querySelector('td:nth-child(6) a');
                return a && (a.classList.contains('text-warning') || a.classList.contains('text-danger'));
            });
            if (issue.length) {
                modal(`注意会員の出庫が <b style="color:#dc2626">${issue.length}件</b> 含まれています。`, [
                    { label: `除外して開始 (${boxes.length - issue.length}件)`, color: '#dc2626', fn: () => { const n = boxes.filter(b => !issue.includes(b)); if (n.length) startBatch(n); } },
                    { label: `全部で開始 (${boxes.length}件)`, color: '#2563eb', fn: () => startBatch(boxes) },
                    { label: 'キャンセル', color: '#6b7280' }
                ]);
            } else startBatch(boxes);
        };
        if (cur) {
            const st = batchStats(cur);
            modal(`途中のピッキングがあります (${st.picked}/${st.total})。<br>破棄して新しく始めますか？`, [
                { label: '途中のを再開', color: '#0f766e', fn: () => openPicker(cur) },
                { label: '破棄して新規', color: '#dc2626', fn: go },
                { label: 'キャンセル', color: '#6b7280' }
            ]);
        } else go();
    }

    /* ---------- [v1.1.0] 여러 명이 동시에 피킹할 때: 시스템 "Picking..." 상태 ----------
     * 시스템의 PICKING LIST 버튼은 download-pickinglist 로 POST 하면서 출고건을 "PICKING LIST 인쇄됨"
     * (목록에 빨간 Picking...) 상태로 바꿈. 태블릿에서는 새 탭(PDF) 없이 같은 요청만 보냄.
     * 시작 전에 최신 목록을 다시 읽어서, 이미 다른 사람이 Picking... 으로 가져간 출고건은 제외함. */
    function isRowPicking(tr) {
        return !!tr && Array.from(tr.querySelectorAll('small.text-danger, .text-danger')).some(el => el.textContent.trim() === 'Picking...');
    }
    async function findTakenIds(tasks) {
        const taken = new Set();
        // 지금 화면 기준
        tasks.forEach(t => {
            const box = document.querySelector(`input.sub_checkbox[data-id="${t.id}"][data-type="${t.type}"]`);
            if (box && isRowPicking(box.closest('tr'))) taken.add(t.id + ':' + t.type);
        });
        // 서버 최신 목록 기준 (다른 태블릿이 방금 시작한 건)
        try {
            const res = await fetch(location.href, { credentials: 'include', cache: 'no-store' });
            if (res.ok) {
                const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
                tasks.forEach(t => {
                    const box = doc.querySelector(`input.sub_checkbox[data-id="${t.id}"][data-type="${t.type}"]`);
                    if (box && isRowPicking(box.closest('tr'))) taken.add(t.id + ':' + t.type);
                });
            }
        } catch (e) { console.warn('[태블릿피킹] 최신 상태 확인 실패(화면 기준으로만 확인)', e); }
        return taken;
    }
    async function markSystemPicking(tasks) {
        try {
            const form = document.getElementById('search-form');
            const fd = form ? new FormData(form) : new FormData();
            fd.set('_token', document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '');
            fd.set('packings', JSON.stringify(tasks.map(t => ({ id: isNaN(t.id) ? t.id : Number(t.id), type: t.type }))));
            const res = await fetch(location.origin + '/admin/shipping/download-pickinglist', { method: 'POST', body: fd, credentials: 'include' });
            return res.ok;
        } catch (e) { console.error('[태블릿피킹] Picking 상태 변경 실패', e); return false; }
    }
    function cancelSystemPicking(orders) {
        return new Promise((resolve) => {
            const $ = window.jQuery;
            const packings = orders.filter(o => o.id).map(o => ({ id: o.id, type: o.type }));
            if (!$ || !packings.length) { resolve(false); return; }
            $.ajax({ type: 'POST', dataType: 'json', url: location.origin + '/admin/shipping/ajax_cancel_picking', data: { packings: packings } })
                .done(j => resolve(j && j.status === 'success'))
                .fail(() => resolve(false));
        });
    }

    async function startBatch(boxes) {
        const tasks = readSelectedTasks(boxes);
        const ovMark = overlayMsg('ピッキング中に変更中...');
        const marked = await markSystemPicking(tasks);
        ovMark.close();
        const csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
        const ov = overlayMsg(`データ取得中... (0 / ${tasks.length})`);
        let done = 0;
        const failed = [];
        const orders = await runLimited(tasks, 6, async (t) => {
            try {
                const d = await fetchOrder(t, csrf);
                return { id: t.id, outNum: t.outNum, receiver: t.receiver, isOcean: t.isOcean, type: t.type, items: d.items, requests: d.requests, requirementMsg: d.requirementMsg };
            } catch (e) {
                console.error('[태블릿피킹] 출고건 읽기 실패', t, e);
                failed.push(t.outNum);
                return null;
            } finally {
                done++; ov.set(`データ取得中... (${done} / ${tasks.length})`);
            }
        });
        ov.close();
        const okOrders = orders.filter(o => o && o.items.length);
        if (!okOrders.length) { modal('商品データを取得できませんでした。画面を更新して再度お試しください。', [{ label: 'OK', color: '#6b7280' }]); return; }
        const batch = {
            id: 'B' + Date.now(),
            createdAt: new Date().toISOString(),
            orders: okOrders,
            lines: buildLines(okOrders),
            picked: {},
            failed: failed
        };
        saveBatch(batch);
        openPicker(batch);
        if (!marked) modal('システムの「ピッキング中」への変更に失敗しました。<br>ほかの人に同じ出庫が見えている可能性があります。管理者に確認してください。', [{ label: 'OK', color: '#6b7280' }]);
        if (failed.length) modal(`次の出庫は読み込めず、リストに入っていません:<br><b>${failed.map(esc).join(', ')}</b>`, [{ label: 'OK', color: '#6b7280' }]);
    }

    function batchStats(b) {
        let total = 0, picked = 0, linesDone = 0;
        b.lines.forEach(l => {
            const p = Math.min(b.picked[l.key] || 0, l.total);
            total += l.total; picked += p; if (p >= l.total) linesDone++;
        });
        return { total, picked, linesDone, lines: b.lines.length };
    }

    /* ==========================================================
     * 피킹 화면 (태블릿 전체화면)
     * ========================================================== */
    const CSS = `
    #tmtp{position:fixed;inset:0;z-index:99999;background:#f1f5f9;font-family:"Hiragino Sans","Meiryo","Malgun Gothic",sans-serif;color:#0f172a;display:flex;flex-direction:column;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
    #tmtp *{box-sizing:border-box}
    #tmtp .hd{background:#0f172a;color:#fff;padding:10px 14px;display:flex;flex-wrap:wrap;align-items:center;gap:10px}
    #tmtp .hd .ttl{font-weight:800;font-size:18px;white-space:nowrap}
    #tmtp .hd .prog{flex:1;min-width:180px}
    #tmtp .hd .ptxt{font-size:15px;font-weight:700;margin-bottom:4px}
    #tmtp .hd .ptxt b{font-size:22px}
    #tmtp .bar{height:10px;background:#334155;border-radius:5px;overflow:hidden}
    #tmtp .bar i{display:block;height:100%;background:#22c55e;transition:width .2s}
    #tmtp .hb{border:none;border-radius:10px;padding:12px 16px;font-size:16px;font-weight:800;color:#fff;background:#334155;min-height:48px}
    #tmtp .hb.done{background:#16a34a}
    #tmtp .hb.on{background:#0ea5e9}
    #tmtp .sub{background:#fff;border-bottom:1px solid #cbd5e1;padding:8px 14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    #tmtp .sub input{flex:1;min-width:160px;font-size:18px;padding:10px 12px;border:2px solid #94a3b8;border-radius:10px;-webkit-user-select:text;user-select:text}
    #tmtp .sub .sb{border:2px solid #0f172a;background:#fff;border-radius:10px;padding:9px 14px;font-size:15px;font-weight:800;min-height:46px}
    #tmtp .sub .sb.on{background:#0f172a;color:#fff}
    #tmtp .list{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:10px 12px 120px}
    #tmtp .locH{font-size:13px;font-weight:800;color:#475569;margin:14px 4px 6px;letter-spacing:.5px}
    #tmtp .card{background:#fff;border:2px solid #cbd5e1;border-radius:14px;margin-bottom:10px;display:flex;align-items:stretch;overflow:hidden;transition:background .15s,border-color .15s}
    #tmtp .card.part{border-color:#f59e0b;background:#fffbeb}
    #tmtp .card.full{border-color:#86efac;background:#f0fdf4;opacity:.62}
    #tmtp .card.flash{border-color:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.45)}
    #tmtp .card.over{border-color:#dc2626;box-shadow:0 0 0 4px rgba(220,38,38,.4)}
    #tmtp .loc{width:118px;flex:none;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;text-align:center;font-size:24px;font-weight:900;padding:6px;word-break:break-all;line-height:1.1}
    #tmtp .card.full .loc{background:#16a34a}
    #tmtp .body{flex:1;min-width:0;padding:10px 12px;display:flex;gap:12px}
    #tmtp .img{width:72px;height:72px;flex:none;border-radius:8px;background:#f1f5f9;border:1px solid #e2e8f0;display:flex;align-items:center;justify-content:center;overflow:hidden}
    #tmtp .img img{max-width:100%;max-height:100%;object-fit:contain}
    #tmtp .info{flex:1;min-width:0}
    #tmtp .nm{font-size:16px;font-weight:700;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    #tmtp .jan{font-size:14px;color:#475569;margin-top:3px;font-family:Consolas,monospace}
    #tmtp .jan b{font-size:20px;color:#0f172a}
    #tmtp .opt{display:inline-block;margin-top:4px;font-size:13px;font-weight:800;background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:1px 6px}
    #tmtp .alloc{margin-top:6px;display:flex;flex-wrap:wrap;gap:5px}
    #tmtp .chip{font-size:13px;font-weight:700;border:1.5px solid #94a3b8;border-radius:6px;padding:2px 7px;background:#fff;white-space:nowrap}
    #tmtp .chip b{font-size:15px}
    #tmtp .chip.oc{border-color:#0284c7;color:#0369a1}
    #tmtp .cnt{width:150px;flex:none;border-left:2px dashed #cbd5e1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:8px}
    #tmtp .num{font-size:34px;font-weight:900;line-height:1}
    #tmtp .num small{font-size:20px;color:#64748b}
    #tmtp .pcs{font-size:12px;font-weight:800;color:#b45309}
    #tmtp .btns{display:flex;gap:6px}
    #tmtp .mb{border:none;border-radius:8px;min-width:52px;min-height:40px;font-size:15px;font-weight:900;background:#e2e8f0;color:#0f172a}
    #tmtp .mb.all{background:#0f766e;color:#fff}
    #tmtp .empty{text-align:center;color:#16a34a;font-size:22px;font-weight:900;padding:60px 10px}
    #tmtp .toast{position:fixed;left:50%;top:18%;transform:translateX(-50%);z-index:100001;padding:16px 26px;border-radius:14px;font-size:22px;font-weight:900;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.35);pointer-events:none;max-width:90vw;text-align:center}
    #tmtp-cam{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px}
    #tmtp-cam video{width:min(92vw,720px);max-height:62vh;border-radius:12px;background:#000;object-fit:cover}
    #tmtp-cam .cmsg{color:#fff;font-size:18px;font-weight:700;font-family:sans-serif}
    #tmtp-cam button{border:none;border-radius:12px;padding:14px 28px;font-size:18px;font-weight:900;background:#fff}
    @media (max-width:700px){#tmtp .loc{width:84px;font-size:18px}#tmtp .cnt{width:112px}#tmtp .num{font-size:26px}#tmtp .img{width:52px;height:52px}}
    `;

    let PK = null; // 현재 열린 피킹 화면 상태

    function openPicker(batch) {
        if (!batch) return;
        closePicker(true);
        if (!document.getElementById('tmtp-css')) {
            const st = document.createElement('style'); st.id = 'tmtp-css'; st.textContent = CSS; document.head.appendChild(st);
        }
        const root = document.createElement('div');
        root.id = 'tmtp';
        root.innerHTML = `
            <div class="hd">
                <div class="ttl">📱 ピッキング</div>
                <div class="prog"><div class="ptxt"></div><div class="bar"><i></i></div></div>
                <button class="hb" data-act="cam">📷 カメラ</button>
                <button class="hb" data-act="pause">⏸ 中断</button>
                <button class="hb" data-act="cancel" style="background:#7f1d1d">✖ 取消</button>
                <button class="hb done" data-act="finish">✅ 完了</button>
            </div>
            <div class="sub">
                <input type="text" inputmode="numeric" placeholder="JANスキャン / 手入力 → Enter" autocomplete="off">
                <button class="sb on" data-flt="todo">未完了</button>
                <button class="sb" data-flt="all">すべて</button>
            </div>
            <div class="list"></div>`;
        document.body.appendChild(root);
        document.documentElement.style.overflow = 'hidden';

        PK = { batch: batch, root: root, filter: 'todo', keyBuf: '', keyAt: 0 };
        const input = root.querySelector('.sub input');

        root.addEventListener('click', (e) => {
            const actBtn = e.target.closest('[data-act]');
            if (actBtn) {
                const a = actBtn.dataset.act;
                if (a === 'pause') closePicker();
                else if (a === 'finish') onFinish();
                else if (a === 'cam') openCamera();
                else if (a === 'cancel') onCancelBatch();
                return;
            }
            const flt = e.target.closest('[data-flt]');
            if (flt) { PK.filter = flt.dataset.flt; render(); return; }
            const mb = e.target.closest('.mb');
            const card = e.target.closest('.card');
            if (!card) return;
            const key = card.dataset.key;
            if (mb) {
                if (mb.dataset.d === 'minus') addPick(key, -1);
                else if (mb.dataset.d === 'all') setPick(key, 'all');
                return;
            }
            addPick(key, +1);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); const v = input.value; input.value = ''; handleScan(v); }
        });

        // 블루투스 스캐너: 입력칸을 누르지 않아도 빠르게 들어오는 숫자열 + Enter 를 스캔으로 처리
        PK.onKey = (e) => {
            if (!PK || document.activeElement === input) return;
            if (document.getElementById('tmtp-cam')) return;
            const now = Date.now();
            if (now - PK.keyAt > 80) PK.keyBuf = '';
            PK.keyAt = now;
            if (e.key === 'Enter') {
                if (PK.keyBuf.length >= 6) { e.preventDefault(); handleScan(PK.keyBuf); }
                PK.keyBuf = '';
            } else if (e.key && e.key.length === 1 && /[0-9A-Za-z\-]/.test(e.key)) {
                PK.keyBuf += e.key;
            }
        };
        document.addEventListener('keydown', PK.onKey, true);

        render();
        injectResumeButton();
    }

    function closePicker(silent) {
        const r = document.getElementById('tmtp');
        if (r) r.remove();
        closeCamera();
        if (PK && PK.onKey) document.removeEventListener('keydown', PK.onKey, true);
        PK = null;
        document.documentElement.style.overflow = '';
        if (!silent) injectResumeButton();
    }

    function render(flashKey, flashCls) {
        if (!PK) return;
        const b = PK.batch;
        const st = batchStats(b);
        const pct = st.total ? Math.round(st.picked / st.total * 100) : 0;
        PK.root.querySelector('.ptxt').innerHTML = `<b>${st.picked}</b> / ${st.total} 点　(${st.linesDone}/${st.lines} 行・出庫 ${b.orders.length}件)`;
        PK.root.querySelector('.bar i').style.width = pct + '%';
        PK.root.querySelectorAll('[data-flt]').forEach(x => x.classList.toggle('on', x.dataset.flt === PK.filter));

        const list = PK.root.querySelector('.list');
        const scrollTop = list.scrollTop;
        let html = '';
        let lastLocGroup = null;
        let shown = 0;
        b.lines.forEach(l => {
            const p = Math.min(b.picked[l.key] || 0, l.total);
            const full = p >= l.total;
            if (PK.filter === 'todo' && full && l.key !== flashKey) return;
            shown++;
            const grp = String(l.loc).split(/[-\s]/)[0];
            if (grp !== lastLocGroup) { html += `<div class="locH">■ ${esc(grp)}</div>`; lastLocGroup = grp; }
            const jan = String(l.jan);
            const janHtml = jan.length > 4 ? `${esc(jan.slice(0, -4))}<b>${esc(jan.slice(-4))}</b>` : `<b>${esc(jan)}</b>`;
            const chips = l.alloc.map(a => {
                const o = b.orders[a.oi];
                return `<span class="chip${o.isOcean ? ' oc' : ''}">${esc(o.outNum)} <b>×${a.qty}</b></span>`;
            }).join('');
            const cls = 'card' + (full ? ' full' : (p > 0 ? ' part' : '')) + (l.key === flashKey ? ' ' + (flashCls || 'flash') : '');
            html += `
                <div class="${cls}" data-key="${esc(l.key)}">
                    <div class="loc">${esc(l.loc)}</div>
                    <div class="body">
                        <div class="img">${l.img ? `<img src="${esc(l.img)}" alt="">` : ''}</div>
                        <div class="info">
                            <div class="nm">${esc(l.name)}</div>
                            <div class="jan">${janHtml}</div>
                            ${l.option ? `<span class="opt">${esc(l.option)}</span>` : ''}
                            <div class="alloc">${chips}</div>
                        </div>
                    </div>
                    <div class="cnt">
                        <div class="num">${full ? '✓ ' : ''}${p}<small> / ${l.total}</small></div>
                        ${l.pcs ? `<div class="pcs">×${l.pcs}pcs = ${l.total * l.pcs}個</div>` : (l.isHalf ? '<div class="pcs">⚠ PCS確認</div>' : '')}
                        <div class="btns"><button class="mb" data-d="minus">−1</button><button class="mb all" data-d="all">全部</button></div>
                    </div>
                </div>`;
        });
        if (!shown) html = `<div class="empty">🎉 すべてピッキング完了<br><span style="font-size:16px;color:#475569">右上の「✅ 完了」で仕分けリストを印刷</span></div>`;
        list.innerHTML = html;
        list.scrollTop = scrollTop;
        if (flashKey) {
            const el = list.querySelector(`.card[data-key="${cssEsc(flashKey)}"]`);
            if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }
    function cssEsc(s) { return String(s).replace(/[^A-Za-z0-9_-]/g, ''); }

    function addPick(key, d) {
        const b = PK.batch;
        const l = b.lines.find(x => x.key === key);
        if (!l) return;
        const cur = b.picked[key] || 0;
        const next = Math.max(0, Math.min(l.total, cur + d));
        if (d > 0 && cur >= l.total) { beep(false); toastMsg('数量オーバー', false); render(key, 'over'); return; }
        b.picked[key] = next;
        saveBatch(b);
        render(key);
    }
    function setPick(key, v) {
        const b = PK.batch;
        const l = b.lines.find(x => x.key === key);
        if (!l) return;
        b.picked[key] = v === 'all' ? l.total : v;
        saveBatch(b);
        render(key);
    }

    function handleScan(raw) {
        if (!PK) return;
        const code = normJan(raw);
        if (!code) return;
        const b = PK.batch;
        const hits = b.lines.filter(l => l.janN === code || l.janBase === code);
        if (!hits.length) {
            beep(false); toastMsg(`リストにないJAN<br><span style="font-size:16px">${esc(raw)}</span>`, false); return;
        }
        // 아직 덜 집은 줄 중 화면 순서(로케이션 순)로 첫 번째에 +1
        const target = hits.find(l => (b.picked[l.key] || 0) < l.total);
        if (!target) {
            beep(false); toastMsg('この商品はすべてピッキング済み', false); render(hits[0].key, 'over'); return;
        }
        b.picked[target.key] = (b.picked[target.key] || 0) + 1;
        saveBatch(b);
        beep(true);
        const p = b.picked[target.key];
        toastMsg(`${esc(target.loc)}　${p} / ${target.total}`, true);
        render(target.key);
    }

    let toastTimer = null;
    function toastMsg(html, ok) {
        const host = document.getElementById('tmtp') || document.body;
        let t = document.getElementById('tmtp-toast');
        if (!t) { t = document.createElement('div'); t.id = 'tmtp-toast'; t.className = 'toast'; }
        if (!document.getElementById('tmtp')) t.style.cssText = 'position:fixed;left:50%;top:18%;transform:translateX(-50%);z-index:100001;padding:14px 24px;border-radius:12px;font-size:18px;font-weight:900;color:#fff;';
        host.appendChild(t);
        t.innerHTML = html;
        t.style.background = ok ? '#16a34a' : '#dc2626';
        t.style.display = 'block';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { t.style.display = 'none'; }, ok ? 900 : 2200);
    }

    /* ---------- 카메라 JAN 스캔 ---------- */
    let camState = null;
    async function openCamera() {
        closeCamera();
        const wrap = document.createElement('div');
        wrap.id = 'tmtp-cam';
        wrap.innerHTML = `<div class="cmsg">JANバーコードを枠に入れてください</div><video playsinline muted></video><button>閉じる</button>`;
        document.body.appendChild(wrap);
        wrap.querySelector('button').onclick = closeCamera;
        const video = wrap.querySelector('video');
        const msg = wrap.querySelector('.cmsg');
        camState = { wrap: wrap, stop: null, last: '', lastAt: 0 };
        const onCode = (text) => {
            const now = Date.now();
            if (text === camState.last && now - camState.lastAt < 1500) return; // 같은 바코드 연속 인식 방지
            camState.last = text; camState.lastAt = now;
            handleScan(text);
        };
        try {
            if ('BarcodeDetector' in window) {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                video.srcObject = stream; await video.play();
                const det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code'] });
                let alive = true;
                camState.stop = () => { alive = false; stream.getTracks().forEach(t => t.stop()); };
                const loop = async () => {
                    if (!alive) return;
                    try { const r = await det.detect(video); if (r && r[0]) onCode(r[0].rawValue); } catch (e) {}
                    setTimeout(loop, 150);
                };
                loop();
            } else {
                msg.textContent = 'カメラ準備中...';
                if (!window.ZXing) await loadScript(ZXING_URL);
                const reader = new window.ZXing.BrowserMultiFormatReader();
                camState.stop = () => { try { reader.reset(); } catch (e) {} };
                msg.textContent = 'JANバーコードを枠に入れてください';
                await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, video, (res) => { if (res) onCode(res.getText()); });
            }
        } catch (e) {
            console.error('[태블릿피킹] 카메라 오류', e);
            msg.textContent = 'カメラを起動できません: ' + (e.message || e) + '（ブラウザのカメラ許可を確認）';
        }
    }
    function closeCamera() {
        if (camState) { try { camState.stop && camState.stop(); } catch (e) {} camState.wrap.remove(); camState = null; }
    }

    /* ==========================================================
     * 완료 → 仕分けリスト 인쇄
     * ========================================================== */
    // 집은 개수를 출고건에 앞에서부터 배분하고, 모자란 만큼은 欠品
    function allocate(batch) {
        const per = batch.orders.map(() => []);
        batch.lines.forEach(l => {
            let left = Math.min(batch.picked[l.key] || 0, l.total);
            l.alloc.forEach(a => {
                const got = Math.min(left, a.qty); left -= got;
                per[a.oi].push({ loc: l.loc, jan: l.jan, name: l.name, option: l.option, pcs: l.pcs, img: l.img, tracking: a.tracking, need: a.qty, got: got });
            });
        });
        per.forEach(rows => rows.sort((x, y) => locCompare(x.loc, y.loc)));
        return per;
    }

    // [v1.1.0] 피킹 취소: 시스템 Picking 상태를 풀어서 다른 사람이 가져갈 수 있게 함
    function onCancelBatch() {
        const b = PK.batch;
        modal(`このピッキング（出庫 ${b.orders.length}件）を取り消しますか？<br><span style="font-size:14px;color:#475569">システムの「ピッキング中」を解除して、ほかの人がピッキングできる状態に戻します。</span>`, [
            { label: '取り消す', color: '#dc2626', fn: async () => {
                const ov = overlayMsg('取消中...');
                const ok = await cancelSystemPicking(b.orders);
                ov.close();
                if (!ok) { modal('システムのピッキング取消に失敗しました。<br>出庫管理画面の「PICKING取消」で解除してください。', [{ label: 'OK', color: '#6b7280' }]); return; }
                clearBatch(); closePicker(); location.reload();
            } },
            { label: '戻る', color: '#6b7280' }
        ]);
    }

    function onFinish() {
        const b = PK.batch;
        const st = batchStats(b);
        const short = b.lines.filter(l => (b.picked[l.key] || 0) < l.total);
        const doPrint = () => choosePaper((paper) => {
            const ok = printSortSheet(b, paper);
            if (!ok) return;
            modal('仕分けリストを開きました。<br>このピッキングを終了しますか？', [
                { label: '終了する', color: '#16a34a', fn: () => { clearBatch(); closePicker(); } },
                { label: 'まだ続ける', color: '#6b7280' }
            ]);
        });
        if (short.length) {
            const listHtml = short.slice(0, 8).map(l => `<li>${esc(l.loc)}　${esc(l.name).slice(0, 24)}　<b>${(b.picked[l.key] || 0)}/${l.total}</b></li>`).join('');
            modal(`まだ <b style="color:#dc2626">${st.total - st.picked}点</b> 残っています。<ul style="text-align:left;font-size:14px;margin:8px 0">${listHtml}${short.length > 8 ? `<li>…他 ${short.length - 8}行</li>` : ''}</ul>残りは「欠品」として印刷しますか？`, [
                { label: '欠品として印刷', color: '#dc2626', fn: doPrint },
                { label: '戻る', color: '#6b7280' }
            ]);
        } else doPrint();
    }

    // [v1.1.0] 용지 선택: A4(일반 프린터) / 80mm·58mm(블루투스 모바일·영수증 프린터)
    const PAPER_KEY = 'tmTabletPicking.paper';
    function choosePaper(cb) {
        let last = 'a4';
        try { last = localStorage.getItem(PAPER_KEY) || 'a4'; } catch (e) {}
        const opts = [
            { v: 'a4', label: '🖨 A4' },
            { v: '80', label: '🧾 80mm ロール' },
            { v: '58', label: '🧾 58mm ロール' }
        ];
        opts.sort((x, y) => (y.v === last) - (x.v === last));
        modal('印刷する用紙を選んでください', opts.map((o, i) => ({
            label: o.label + (i === 0 ? '（前回）' : ''),
            color: i === 0 ? '#16a34a' : '#334155',
            fn: () => { try { localStorage.setItem(PAPER_KEY, o.v); } catch (e) {} cb(o.v); }
        })).concat([{ label: '戻る', color: '#6b7280' }]));
    }

    function printSortSheet(b, paper) {
        if (paper === '80' || paper === '58') return printReceipt(b, paper);
        const per = allocate(b);
        const st = batchStats(b);
        const created = new Date(b.createdAt);
        const fmt = (d) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        let shortTotal = 0;
        const blocks = b.orders.map((o, oi) => {
            const rows = per[oi];
            const need = rows.reduce((a, r) => a + r.need, 0);
            const got = rows.reduce((a, r) => a + r.got, 0);
            shortTotal += need - got;
            // [v1.2.0] 상품 리스트는 인쇄하지 않고, 欠品(덜 집은 상품)만 표시
            const trs = rows.filter(r => r.need > r.got).map(r => {
                const sh = r.need - r.got;
                const jan = String(r.jan);
                return `<tr class="${sh ? 'sh' : ''}">
                    <td class="ck">${sh === r.need ? '' : '☐'}</td>
                    <td class="lc">${esc(r.loc)}</td>
                    <td class="im">${r.img ? `<img src="${esc(r.img)}">` : ''}</td>
                    <td class="nm">${esc(r.name)}${r.option ? `<div class="op">${esc(r.option)}</div>` : ''}${r.tracking ? `<div class="tr">Tracking …${esc(r.tracking.slice(-6))}</div>` : ''}</td>
                    <td class="jn">${esc(jan.slice(0, -4))}<b>${esc(jan.slice(-4))}</b></td>
                    <td class="qt"><b>${r.got}</b>${sh ? `<div class="kp">欠品 ${sh}</div>` : ''}${r.pcs ? `<div class="pc">×${r.pcs}pcs</div>` : ''}</td>
                </tr>`;
            }).join('');
            const reqs = (o.requests || []).map(x => `<span class="rq">${esc(x)}</span>`).join('') + (o.requirementMsg ? `<div class="rm">📝 ${esc(o.requirementMsg)}</div>` : '');
            return `<section class="ord${o.isOcean ? ' ocean' : ''}">
                <div class="oh">
                    <div class="qr" id="qr${oi}"></div>
                    <div class="ohm">
                        <div class="on">${esc(o.outNum)}${o.isOcean ? ' <span class="oct">OCEAN</span>' : ''}</div>
                        <div class="rv">${esc(o.receiver)}</div>
                    </div>
                    <div class="os">${got} / ${need} 点${need - got ? `<div class="kp">欠品 ${need - got}</div>` : ''}</div>
                </div>
                ${reqs ? `<div class="rqs">${reqs}</div>` : ''}
                ${trs ? `<div class="kh">欠品</div><table><tbody>${trs}</tbody></table>` : ''}
            </section>`;
        }).join('');

        const qrJs = b.orders.map((o, oi) => `try{new QRCode(document.getElementById("qr${oi}"),{text:${JSON.stringify(String(o.outNum))},width:56,height:56,correctLevel:1})}catch(e){}`).join('');
        const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
            <title>仕分けリスト ${fmt(created)}</title>
            <style>
                @page{size:A4;margin:8mm}
                body{font-family:"Hiragino Sans","Meiryo","Malgun Gothic",sans-serif;margin:0;color:#000;background:#e5e7eb}
                .wrap{max-width:194mm;margin:0 auto;background:#fff;padding:6mm}
                .top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #000;padding-bottom:4px;margin-bottom:6px}
                .top h1{font-size:22px;margin:0}
                .top .sm{font-size:12px;text-align:right}
                .top .kp{font-size:14px}
                .ord{border:2px solid #000;margin:0 0 6mm;page-break-inside:avoid;break-inside:avoid}
                .ord.ocean{border-style:double;border-width:5px}
                .oh{display:flex;align-items:center;gap:10px;padding:4px 8px;border-bottom:2px solid #000}
                .qr{width:56px;height:56px;flex:none}
                .ohm{flex:1}
                .on{font-size:22px;font-weight:900}
                .oct{font-size:12px;border:1.5px solid #000;padding:0 4px;vertical-align:middle}
                .rv{font-size:12px}
                .os{font-size:16px;font-weight:900;text-align:right}
                .kp{color:#000;font-weight:900;background:#000;color:#fff;padding:0 4px;display:inline-block;font-size:12px;margin-top:2px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
                .rqs{padding:3px 8px;border-bottom:1px solid #000;font-size:12px}
                .rq{display:inline-block;border:1.5px solid #000;padding:0 5px;margin:1px 4px 1px 0;font-weight:800}
                .rm{margin-top:2px}
                .kh{font-size:12px;font-weight:900;padding:2px 8px;border-bottom:1px solid #000}
                table{width:100%;border-collapse:collapse;font-size:12px}
                th{background:#eee;border-bottom:1px solid #000;padding:2px 4px;font-size:11px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
                td{border-bottom:1px solid #999;padding:3px 4px;vertical-align:middle}
                td.ck{width:20px;font-size:18px;text-align:center}
                td.lc{width:62px;font-weight:900;font-size:14px}
                td.im{width:40px}td.im img{max-width:38px;max-height:34px}
                td.nm .op{font-weight:800;font-size:11px}
                td.nm .tr{font-size:10px;color:#444}
                td.jn{width:118px;white-space:nowrap;font-family:Consolas,monospace;font-size:11px}td.jn b{font-size:14px}
                td.qt{width:58px;text-align:center}td.qt b{font-size:18px}
                td.qt .pc{font-size:10px}
                tr.sh td{background:repeating-linear-gradient(45deg,#fff,#fff 4px,#ddd 4px,#ddd 6px);-webkit-print-color-adjust:exact;print-color-adjust:exact}
                .np{position:sticky;top:0;text-align:center;padding:8px;background:#0f172a}
                .np button{font-size:18px;font-weight:900;padding:10px 30px;border:none;border-radius:10px;background:#22c55e;color:#fff}
                @media print{body{background:#fff}.np{display:none}.wrap{padding:0;max-width:none}}
            </style></head><body>
            <div class="np"><button onclick="window.print()">🖨 印刷</button></div>
            <div class="wrap">
                <div class="top"><h1>仕分けリスト</h1>
                    <div class="sm">${fmt(created)} 開始 / ${fmt(new Date())} 完了<br>出庫 ${b.orders.length}件・${st.picked} / ${st.total} 点${shortTotal ? ` <span class="kp">欠品 ${shortTotal}点</span>` : ''}</div>
                </div>
                ${blocks}
            </div>
            <script>
                (function(){
                    // QR 라이브러리는 비동기로 읽음 (느리거나 실패해도 리스트는 바로 보이고 인쇄 가능)
                    var printed=false;
                    function go(){ if(printed) return; printed=true; setTimeout(function(){window.print()},300); }
                    var s=document.createElement('script'); s.src=${JSON.stringify(QR_URL)};
                    s.onload=function(){ ${qrJs} go(); }; s.onerror=go;
                    document.head.appendChild(s);
                    setTimeout(go,2500);
                })();
            <\/script>
            </body></html>`;
        const w = window.open('', '_blank');
        if (!w) { modal('ポップアップがブロックされました。ブラウザでポップアップを許可してください。', [{ label: 'OK', color: '#6b7280' }]); return false; }
        w.document.open(); w.document.write(html); w.document.close();
        return true;
    }

    /* ---------- [v1.1.0] 롤지(80mm/58mm) 仕分けリスト: 블루투스 모바일 프린터용 ---------- */
    function printReceipt(b, paper) {
        const per = allocate(b);
        const W = paper === '58' ? 48 : 72;     // 인쇄 폭(mm)
        const big = paper === '58' ? 15 : 19;
        const d = new Date();
        const ts = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        let shortAll = 0;
        const blocks = b.orders.map((o, oi) => {
            const rows = per[oi];
            const need = rows.reduce((a, r) => a + r.need, 0), got = rows.reduce((a, r) => a + r.got, 0);
            shortAll += need - got;
            // [v1.2.0] 상품 리스트는 인쇄하지 않고, 欠品(덜 집은 상품)만 표시
            const items = rows.filter(r => r.need > r.got).map(r => {
                const sh = r.need - r.got;
                const jan = String(r.jan);
                return `<div class="it${sh ? ' sh' : ''}">
                    <div class="l1"><span class="ck">${sh === r.need ? '✕' : '☐'}</span><span class="lc">${esc(r.loc)}</span><span class="q">×${r.got}</span></div>
                    <div class="nm">${esc(r.name)}${r.option ? ` <b>[${esc(r.option)}]</b>` : ''}</div>
                    <div class="jn">${esc(jan.slice(0, -4))}<b>${esc(jan.slice(-4))}</b>${r.pcs ? `　×${r.pcs}pcs` : ''}</div>
                    ${sh ? `<div class="kp">欠品 ${sh}</div>` : ''}
                </div>`;
            }).join('');
            const reqs = (o.requests || []).map(x => `<span class="rq">${esc(x)}</span>`).join('') + (o.requirementMsg ? `<div>📝 ${esc(o.requirementMsg)}</div>` : '');
            return `<div class="ord">
                <div class="oh"><div class="qr" id="qr${oi}"></div><div><div class="on">${esc(o.outNum)}</div><div class="rv">${esc(o.receiver)}${o.isOcean ? ' <b>[OCEAN]</b>' : ''}</div><div class="ct">${got}/${need}点${need - got ? ` <span class="kp">欠品${need - got}</span>` : ''}</div></div></div>
                ${reqs ? `<div class="rqs">${reqs}</div>` : ''}
                ${items ? `<div class="kh">欠品</div>${items}` : ''}
            </div>`;
        }).join('');
        const qrJs = b.orders.map((o, oi) => `try{new QRCode(document.getElementById("qr${oi}"),{text:${JSON.stringify(String(o.outNum))},width:${paper === '58' ? 44 : 56},height:${paper === '58' ? 44 : 56},correctLevel:1})}catch(e){}`).join('');
        const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
            <title>仕分け ${ts}</title>
            <style>
                @page{size:${paper}mm auto;margin:2mm}
                body{margin:0;font-family:"Hiragino Sans","Meiryo",sans-serif;color:#000;background:#e5e7eb}
                .wrap{width:${W}mm;margin:0 auto;background:#fff;padding:2mm;font-size:${paper === '58' ? 10 : 12}px}
                .tp{text-align:center;font-weight:900;font-size:${big - 3}px;border-bottom:2px solid #000;padding-bottom:2px}
                .tp small{display:block;font-size:10px;font-weight:400}
                .ord{border-bottom:2px dashed #000;padding:3mm 0;break-inside:avoid;page-break-inside:avoid}
                .oh{display:flex;gap:6px;align-items:center}
                .qr{flex:none;width:${paper === '58' ? 44 : 56}px;height:${paper === '58' ? 44 : 56}px}
                .on{font-size:${big}px;font-weight:900;line-height:1.1}
                .rv,.ct{font-size:11px}
                .ct{font-weight:900}
                .rqs{margin:3px 0;font-size:10px}
                .rq{display:inline-block;border:1px solid #000;padding:0 3px;margin:1px 2px 1px 0;font-weight:800}
                .kh{font-weight:900;margin-top:3px}
                .it{border-top:1px solid #999;padding:2px 0}
                .l1{display:flex;align-items:baseline;gap:5px}
                .ck{font-size:${big - 2}px}
                .lc{font-size:${big - 3}px;font-weight:900;flex:1}
                .q{font-size:${big}px;font-weight:900}
                .nm{font-size:${paper === '58' ? 10 : 11}px;line-height:1.25}
                .jn{font-family:Consolas,monospace;font-size:10px}.jn b{font-size:13px}
                .kp{display:inline-block;background:#000;color:#fff;font-weight:900;padding:0 4px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
                .it.sh .lc,.it.sh .nm{text-decoration:line-through}
                .np{position:sticky;top:0;text-align:center;padding:8px;background:#0f172a}
                .np button{font-size:18px;font-weight:900;padding:10px 30px;border:none;border-radius:10px;background:#22c55e;color:#fff}
                @media print{body{background:#fff}.np{display:none}.wrap{padding:0}}
            </style></head><body>
            <div class="np"><button onclick="window.print()">🖨 印刷</button></div>
            <div class="wrap">
                <div class="tp">仕分けリスト<small>${ts}　出庫${b.orders.length}件${shortAll ? `　欠品${shortAll}点` : ''}</small></div>
                ${blocks}
            </div>
            <script>
                (function(){
                    var printed=false;
                    function go(){ if(printed) return; printed=true; setTimeout(function(){window.print()},300); }
                    var s=document.createElement('script'); s.src=${JSON.stringify(QR_URL)};
                    s.onload=function(){ ${qrJs} go(); }; s.onerror=go;
                    document.head.appendChild(s);
                    setTimeout(go,2500);
                })();
            <\/script></body></html>`;
        const w = window.open('', '_blank');
        if (!w) { modal('ポップアップがブロックされました。ブラウザでポップアップを許可してください。', [{ label: 'OK', color: '#6b7280' }]); return false; }
        w.document.open(); w.document.write(html); w.document.close();
        return true;
    }

    /* ==========================================================
     * 작은 UI 도구 (모달 / 로딩)
     * ========================================================== */
    function modal(html, buttons) {
        const m = document.createElement('div');
        m.style.cssText = 'position:fixed;inset:0;z-index:100002;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;font-family:"Hiragino Sans","Meiryo",sans-serif';
        m.innerHTML = `<div style="background:#fff;border-radius:16px;max-width:520px;width:92vw;padding:22px;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.35)">
            <div style="font-size:17px;line-height:1.6;color:#0f172a;margin-bottom:18px">${html}</div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center"></div></div>`;
        const row = m.querySelector('div > div:last-child');
        buttons.forEach(bt => {
            const x = document.createElement('button');
            x.type = 'button';
            x.textContent = bt.label;
            x.style.cssText = `flex:1;min-width:130px;min-height:52px;border:none;border-radius:12px;color:#fff;font-size:16px;font-weight:900;background:${bt.color || '#334155'}`;
            x.onclick = () => { m.remove(); if (bt.fn) bt.fn(); };
            row.appendChild(x);
        });
        document.body.appendChild(m);
    }
    function overlayMsg(text) {
        const o = document.createElement('div');
        o.style.cssText = 'position:fixed;inset:0;z-index:100003;background:rgba(15,23,42,.88);color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:900;font-family:sans-serif';
        o.textContent = text;
        document.body.appendChild(o);
        return { set: (t) => { o.textContent = t; }, close: () => o.remove() };
    }

    /* ==========================================================
     * 시작
     * ========================================================== */
    /* ---------- [v1.3.0] 화면 아래 고정 피킹 바 (태블릿에서도 항상 보이게) ---------- */
    const isPackingList = () => /^\/admin\/shipping\/packing\/?$/.test(location.pathname);
    const isLoginPage = () => /login/i.test(location.pathname);
    function injectBottomBar() {
        if (isLoginPage()) return;
        let bar = document.getElementById('tm-tablet-pick-bar');
        if (!bar) {
            if (!document.body) return;
            bar = document.createElement('div');
            bar.id = 'tm-tablet-pick-bar';
            bar.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:99997;display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:rgba(255,255,255,.96);border:2px solid #0f766e;border-radius:14px;padding:8px 10px;box-shadow:0 6px 18px rgba(0,0,0,.25);font-family:sans-serif;max-width:calc(100vw - 24px);';
            const btnCss = 'border:none;border-radius:10px;padding:12px 18px;font-size:17px;font-weight:bold;';
            if (isPackingList()) {
                bar.innerHTML =
                    '<span style="font-size:12px;font-weight:bold;color:#0f766e;">✅ タブレットピッキング ON</span>' +
                    '<button type="button" data-act="start" style="' + btnCss + 'background:#0f766e;color:#fff;">📱 ピッキング開始</button>' +
                    '<button type="button" data-act="filter" style="' + btnCss + 'background:#fff;color:#0f766e;border:2px solid #0f766e;"></button>';
                bar.querySelector('[data-act="start"]').onclick = onStartClick;
                bar.querySelector('[data-act="filter"]').onclick = () => {
                    const sel = document.querySelector('select[name="s_picking"]');
                    const form = document.getElementById('search-form');
                    if (sel && form) { sel.value = sel.value === '2' ? '' : '2'; form.submit(); }
                    else location.href = location.origin + '/admin/shipping/packing?s_picking=2';
                };
            } else {
                bar.innerHTML =
                    '<span style="font-size:12px;font-weight:bold;color:#0f766e;">✅ タブレットピッキング ON</span>' +
                    '<button type="button" data-act="go" style="' + btnCss + 'background:#0f766e;color:#fff;">📱 ピッキング画面へ</button>';
                bar.querySelector('[data-act="go"]').onclick = () => { location.href = location.origin + '/admin/shipping/packing'; };
            }
            document.body.appendChild(bar);
        }
        if (isPackingList()) {
            const n = document.querySelectorAll('input.sub_checkbox:checked').length;
            const sb = bar.querySelector('[data-act="start"]');
            const txt = n ? `📱 ピッキング開始 (${n}件)` : '📱 ピッキング開始';
            if (sb && sb.textContent !== txt) sb.textContent = txt;
            const fb = bar.querySelector('[data-act="filter"]');
            const sel = document.querySelector('select[name="s_picking"]');
            const ftxt = sel && sel.value === '2' ? '👀 全部表示' : '🆓 未ピッキングのみ';
            if (fb && fb.textContent !== ftxt) fb.textContent = ftxt;
        }
    }

    /* ==========================================================
     * 시작
     * ========================================================== */
    function boot() {
        if (isPackingList()) injectButton();
        injectBottomBar();
        injectResumeButton();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
    // [v1.3.0] 화면이 늦게 그려지거나 다시 그려져서 버튼이 사라져도 계속 다시 넣음 (제한 없음)
    setInterval(() => {
        try {
            if (isPackingList()) injectButton();
            injectBottomBar();
        } catch (e) { console.warn('[태블릿피킹] 버튼 추가 실패', e); }
    }, 1000);
    document.addEventListener('change', (e) => {
        if (e.target && e.target.matches && e.target.matches('input.sub_checkbox, input[type="checkbox"]')) injectBottomBar();
    }, true);
})();
