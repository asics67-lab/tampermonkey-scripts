// ==UserScript==
// @name         [피킹] 태블릿 피킹 (タブレットピッキング)
// @namespace    https://github.com/asics67-lab/tampermonkey-scripts
// @version      1.9.0
// @description  피킹리스트를 인쇄하지 않고 태블릿에서 바로 보면서 피킹. 출고건 선택 → 로케이션 순서로 합친 피킹 화면 → 탭/JAN 스캔으로 체크 → 완료 후 출고건별 仕分けリスト 인쇄.
// @author       물류팀
// @match        https://www.platform.co.jp/admin/shipping/packing*
// @match        https://platform.co.jp/admin/shipping/packing*
// @match        https://platform.aispel.com/admin/shipping/packing*
// @match        https://www.platform.co.jp/admin/*
// @match        https://platform.co.jp/admin/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/태블릿/tablet-picking.user.js
// @downloadURL  https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/태블릿/tablet-picking.user.js
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
 *      [📱 피킹 시작 (선택 n件)] [🆓 未ピッキングのみ] + "タブレットピッキング ON" 표시
 *  - 버튼이 사라져도 계속 다시 넣음(재시도 제한 없음)
 *  - 관리자 페이지 어디서든 동작: 포장 화면이 아니면 [📱 피킹 화면으로] 버튼으로 바로 이동
 *  - 다른 스크립트 없이 이 파일 하나만으로 동작 (원래도 다른 스크립트에 의존하지 않음)
 *  - v1.3.1: GitHub 위치를 태블릿/ 폴더로 변경 (태블릿에만 설치하는 스크립트라 피킹리스트 등과 섞이지 않게)
 *
 *  v1.4.0 (2026-10-16) — 테스트 기간용 한국어 화면
 *  - 요청: "테스트가 끝날 때까지 화면 메시지·인쇄물을 전부 한국어로" (완성 후 전체 일본어로 다시 변경 예정)
 *  - 피킹 바·버튼·안내창·토스트·카메라 안내·仕分けリスト(→ 분류 리스트) 인쇄물 문구를 모두 한국어로 변경
 *    (欠品 → 결품, 点 → 개, 件 → 건 등). 인쇄 글꼴은 맑은 고딕을 우선 사용
 *  - @name 은 그대로 둠 (이름을 바꾸면 Tampermonkey가 다른 스크립트로 보고 새로 설치함)
 *
 *  v1.5.0 (2026-10-16) — 피킹 화면을 포장 화면처럼 출고건별로
 *  - 요청: "PICKING 화면이 포장화면처럼 나와야 실수가 없다. 특히 세트수량은 예민한 부분"
 *  - 여러 출고건을 로케이션으로 합쳐 보여주던 방식 → 출고건 하나씩 (위쪽 출고건 탭 / ◀ ▶ 로 이동)
 *    출고건 머리: 출고번호·수취인·요청사항(무검품 출하·완충재 추가 등)·추가요청 메모·OCEAN
 *    상품 줄: No · 이미지 · 상품명 · 잔코드(+옵션) · 수량 · 로케이션(로케이션별 개수)·Tracking · 집은 수
 *  - 합산·정렬·번호는 관리팀 피킹리스트와 같은 기준 (Tracking+잔코드+상품명+옵션 합산, Tracking→로케이션→쿠지 메인 순)
 *  - 아타리쿠지 세트수 (피킹리스트와 같은 기준)
 *      메인 잔코드(S숫자): 노란 줄 + 수량칸 "(n set)", 서브 등급은 1-1, 1-2 번호와 └ 표시
 *      메인 잔코드가 없으면 세트 기준표(KUJI_SETS / 태블릿 임시 등록)로 "n세트" 배너 + 기준등급 줄에 (n set)
 *  - 옵션 PCS(-H 등): 파란 줄 + "×20pcs = 실제 개수", PCS를 못 찾으면 "하프 · 개수 확인"
 *  - 스캔: 지금 출고건 안에서만 찾음. 실물 바코드(13자리 JAN)로 찍어도 잔코드(JAN-1, JAN-A …)와 맞춤.
 *    같은 JAN에 등급이 여러 개면 화면에서 골라서 +1. 다른 출고건 상품이면 알려 주고 이동 버튼 표시
 *  - 한 출고건을 다 집으면 자동으로 다음 출고건으로 이동
 *  - 결품 계산이 출고건별로 정확해짐 (예전엔 합친 줄을 앞 출고건부터 채워서 결품이 뒤 출고건으로 몰렸음)
 *  - 용지에 100mm 롤지 추가 (프린터 구매 후 실제 폭에 맞춰 조정 예정)
 *  - 진행 저장 키를 v2로 변경 (예전 버전에서 하던 진행 데이터는 이어지지 않음)
 *
 *  v1.6.0 (2026-10-16)
 *  - 아타리쿠지 세트 기준을 구글시트(아타리쿠지_세트기준)에서 읽음 — 관리팀 피킹리스트와 같은 시트라 한 곳만 고치면 됨
 *    (5분마다 다시 읽음, 미등록 배너에 [📋 시트에 등록] [🔄 다시 읽기] 버튼. 시트를 못 읽으면 경고 표시 후 스크립트 기준·임시 등록만 사용)
 *  - 분류 리스트 인쇄에서 상품 정보(결품 상품 목록) 제거 → 출고번호·QR·수취인·개수·결품 개수·요청사항만 인쇄
 *
 *  v1.7.0 (2026-10-16) — 배송대행은 Tracking 단위
 *  - 요청: "배송대행은 상품 갯수를 체크할 필요 없이 Tracking 번호만 1개 체크해서 가져가면 된다"
 *  - 배송대행 출고건은 상품 정보를 보여주지 않고 Tracking 줄(Tracking 번호 + 로케이션)만 표시, 1개씩 체크
 *    (Tracking 바코드를 스캔하거나 [체크] 버튼). 개수 표시는 "n / n Tracking", 덜 가져간 것은 "미확인"
 *  - Tracking이 비어 있는 상품만 예외로 상품 줄로 표시
 *
 *  v1.8.0 (2026-10-16) — 세트 개수 표시 (회사 시스템 데이터 확인 후)
 *  - 요청: "세트 수량 자세한 내용이 안 나온다. 몇 PCS인지 나와야 반카톤/한카톤 확인 가능"
 *  - 원인: 옵션을 option1부터 읽었는데 option1은 대부분 JAN이라, 세트 정보가 있는 option2가 안 나왔음
 *  - 포장 화면처럼 옵션1 / 옵션2를 표시 (옵션1이 JAN과 같으면 생략)
 *  - 수량칸: "1봉지 × 40개입 = 총 40개", "5P SET × 2세트" (상품명의 nP SET), "6pcs" 등
 *  - SET 상품인데 개수 정보가 없으면 "⚠ 세트 개수 미기재" (담당자 기재 누락)
 *  - 로케이션별 수량은 회사 시스템의 location_breakdown을 그대로 사용
 *  - 상품명 앞에 브랜드 표시 (포장 화면과 같게)
 *
 *  v1.9.0 (2026-10-16)
 *  - 배송대행 출고건 머리 오른쪽 위에 "📦 Tracking n개"를 크게 표시 (아래에 체크 진행 p / n)
 * ============================================================
 */

(function () {
    'use strict';

    const STORE_KEY = 'tmTabletPicking.batch.v2'; // [v1.5.0] 출고건별 구조로 바뀌어 v2 (옛 진행 데이터와 섞이지 않게)
    const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
    const QR_URL = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';

    /* ==========================================================
     * 공용 도구
     * ========================================================== */
    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const normJan = (s) => String(s || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    const locCompare = (a, b) => {
        const ua = a === '미지정', ub = b === '미지정';
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
            s.src = url; s.onload = resolve; s.onerror = () => reject(new Error('불러오기 실패: ' + url));
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
    /* [v1.8.0] 세트 정보: 회사 시스템 포장 화면과 같은 칸(옵션1 / 옵션2)을 읽음
     *  - 옵션2에 세트 정보: "1봉지40개입", "1BOX 4PCS", "6pcs", "48PCS" …
     *  - 옵션1은 대부분 JAN과 같은 값이라, JAN과 같으면 표시하지 않음 (예전엔 이 JAN을 옵션으로 읽어서 세트 정보가 안 나왔음)
     *  - 상품명에 "5P SET"처럼 적힌 세트는 수량(quantity)=낱개 수, display_quantity=세트 수 */
    function packOptionText(it, jan) {
        const o1 = optionToText(it.option1), o2 = optionToText(it.option2);
        const same = (x) => normJan(x) === normJan(jan) || normJan(x) === normJan(String(jan).replace(/-H$/i, ''));
        const parts = [o1 && !same(o1) ? o1 : '', o2 && !same(o2) ? o2 : ''].filter(x => x && x !== '-' && x.toLowerCase() !== 'null');
        return parts.join(' / ');
    }
    function setInfoOf(it, jan, option, qty) {
        const info = { pcs: 0, unit: '', pset: 0, sets: 0 };
        const m = String(option || '').match(/(\d+)\s*(봉지|봉|BOX|박스|카톤|ケース|箱|袋|세트|セット)\s*(\d+)\s*(개입|PCS|PC|入|個|개)/i);
        if (m) { info.pcs = parseInt(m[3], 10); info.unit = m[2]; }
        else {
            const m2 = String(option || '').match(/(\d+)\s*(PCS|PC|개입|個入|入|個|개)(?![a-z])/i);
            if (m2) info.pcs = parseInt(m2[1], 10);
        }
        const t = String(it.display_title || it.title || '');
        const m3 = t.match(/(\d+)\s*P\s*SET/i);
        if (m3) {
            info.pset = parseInt(m3[1], 10);
            const dq = parseInt(it.display_quantity, 10);
            info.sets = (dq > 0 && dq * info.pset === qty) ? dq : (qty % info.pset === 0 ? qty / info.pset : 0);
        }
        return info;
    }
    function extractOption(it) {
        const keys = ['option', 'option_name', 'options', 'item_option', 'option_str', 'option_text', 'option_value', 'opt', 'variation', 'spec'];
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
        // [v1.8.0] 회사 시스템의 로케이션별 수량 (location_breakdown). 수량이 비어 있으면(배송대행) 이름만 사용
        if (Array.isArray(it.location_breakdown) && it.location_breakdown.length) {
            const lb = it.location_breakdown.map(r => ({ name: String(r.location || '미지정').trim() || '미지정', qty: r.quantity == null ? null : parseInt(r.quantity, 10) }));
            if (lb.every(r => r.qty != null && !isNaN(r.qty))) return lb;
            if (lb.length === 1) return [{ name: lb[0].name, qty: totalQty }];
        }
        const subList = it.locations || it.location_details || it.stock_locations || it.locations_info;
        if (Array.isArray(subList) && subList.length > 0) {
            return subList.map(s => ({ name: String(s.location || s.location_name || s.name || '미지정').trim(), qty: parseInt(s.qty || s.quantity || s.count || 1) }));
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
        return [{ name: '미지정', qty: totalQty }];
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
            let option = ('option1' in it || 'option2' in it) ? packOptionText(it, jan) : extractOption(it);
            const isHalf = /-H$/i.test(jan);
            if (isHalf && !extractPcs(option)) { const alt = findPcsByJan(json, jan); if (alt) option = alt; }
            const qty = parseInt(it.quantity || it.display_quantity || it.qty || '1') || 1;
            const si = setInfoOf(it, jan, option, qty);
            const title = String(it.title || it.item_name || it.product_name || '').trim();
            const brand = String(it.brand || '').trim();
            return {
                jan: jan,
                name: (brand && title.toUpperCase().indexOf(brand.toUpperCase()) < 0 ? brand + ' ' : '') + title,
                isSetName: /SET|セット|세트/i.test(title),
                option: option,
                pcs: si.pcs, unit: si.unit, pset: si.pset, sets: si.sets,
                isHalf: isHalf,
                img: it.image_url_thumb || it.image_url || '',
                qty: qty,
                locs: extractLocEntries(it, qty),
                tracking: String(it.tracking_no || it.invoice_id || it.tracking || it.invoice_no || it.delivery_tracking_no || '').trim()
            };
        });

        const reqSet = new Set();
        const p = json.packing || {};
        if (parseInt(p.no_inspection) === 1) reqSet.add('무검품 출하');
        if (parseInt(p.add_material) === 1) reqSet.add('완충재 추가');
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

    /* ---------- [v1.5.0] 피킹 줄 만들기: 출고건별로 (포장 화면·피킹리스트와 같은 합산·정렬) ----------
     *  - 같은 출고건 안에서 Tracking + 잔코드 + 상품명 + 옵션이 같으면 한 줄로 합침
     *  - SHOP구매(배송대행 아님)의 쿠지는 Tracking이 달라도 잔코드+상품명+옵션이 같으면 합침
     *  - 정렬: Tracking → 로케이션 → 쿠지 메인(S숫자) 먼저
     *  - 번호: 메인 잔코드가 있는 쿠지 서브 등급은 1-1, 1-2 …  */
    const isKujiName = (n) => /KUJI/i.test(String(n || ''));
    // 잔코드 앞의 순수 JAN(8~14자리). "4550624971331-1", "4550624971331-A", "4550624971331S10", "4901234567890-H" → 4550624971331 / 4901234567890
    function janBaseOf(jan) {
        const m = String(jan || '').match(/^\s*(\d{8,14})/);
        return m ? m[1] : normJan(String(jan || '').replace(/-H$/i, ''));
    }
    function mergeLocInto(dst, src) {
        src.forEach(l => {
            const f = dst.find(x => x.name === l.name);
            if (f) f.qty += (l.qty || 0); else dst.push({ name: l.name, qty: l.qty || 0 });
        });
    }
    function buildLines(orders) {
        const lines = [];
        orders.forEach((o, oi) => {
            // [v1.7.0] 배송대행: 상품 개수는 확인하지 않고 Tracking(상자) 단위로 1개씩만 체크
            let trkCount = 0;
            if (String(o.type || '').includes('delivery')) {
                const tm = new Map(), rest = [];
                o.items.forEach(it => {
                    const t = String(it.tracking || '').trim();
                    if (!t) { rest.push(it); return; }   // Tracking이 없는 상품은 예외로 상품 줄로 보여 줌
                    if (!tm.has(t)) tm.set(t, { tracking: t, locs: [] });
                    const x = tm.get(t);
                    it.locs.forEach(l => { const nm = l.name || '미지정'; if (!x.locs.some(y => y.name === nm)) x.locs.push({ name: nm, qty: 0 }); });
                });
                const trks = Array.from(tm.values());
                trks.forEach(t => { if (!t.locs.length) t.locs.push({ name: '미지정', qty: 0 }); });
                trks.sort((a, b) => locCompare(a.locs[0].name, b.locs[0].name) || a.tracking.localeCompare(b.tracking));
                trks.forEach((t, i) => {
                    lines.push({
                        key: 'O' + oi + 'T' + i, oi: oi, no: String(i + 1), isTrk: true,
                        loc: t.locs[0].name, locs: t.locs,
                        jan: t.tracking, janN: normJan(t.tracking), janBase: normJan(t.tracking),
                        name: '', option: '', pcs: 0, isHalf: false, img: '',
                        tracking: t.tracking, total: 1,
                        alloc: [{ oi: oi, qty: 1, tracking: t.tracking }],
                        isKuji: false, isMain: false, isSub: false, setDiv: 0
                    });
                });
                trkCount = trks.length;
                if (!rest.length) return;
                o = Object.assign({}, o, { items: rest });
            }
            const map = new Map();
            o.items.forEach(it => {
                const key = [it.tracking, it.jan, it.name, it.option].join('\u0001');
                if (!map.has(key)) map.set(key, Object.assign({}, it, { locs: it.locs.map(l => ({ name: l.name || '미지정', qty: l.qty || 0 })) }));
                else { const x = map.get(key); x.qty += it.qty; x.sets = (x.sets || 0) + (it.sets || 0); mergeLocInto(x.locs, it.locs); }
            });
            let items = Array.from(map.values());
            if (!String(o.type || '').includes('delivery')) {
                const km = new Map(), out = [];
                items.forEach(it => {
                    if (!isKujiName(it.name)) { out.push(it); return; }
                    const k = [it.jan, it.name, it.option].join('\u0001');
                    if (km.has(k)) { const x = km.get(k); x.qty += it.qty; x.sets = (x.sets || 0) + (it.sets || 0); mergeLocInto(x.locs, it.locs); }
                    else { km.set(k, it); out.push(it); }
                });
                items = out;
            }
            // 로케이션 개수 합이 상품 수량과 다르면(데이터 이상) 마지막 로케이션에서 맞춤
            items.forEach(it => {
                let locs = it.locs.filter(l => l.qty > 0);
                if (!locs.length) locs = [{ name: (it.locs[0] && it.locs[0].name) || '미지정', qty: 0 }];
                const sum = locs.reduce((a, l) => a + l.qty, 0);
                if (sum !== it.qty) locs[locs.length - 1].qty += (it.qty - sum);
                it.locs = locs.filter(l => l.qty > 0);
                if (!it.locs.length) it.locs = [{ name: '미지정', qty: it.qty }];
            });
            const isMain = (it) => isKujiName(it.name) && /S\d+/i.test(it.jan);
            const firstLoc = (it) => it.locs[0].name;
            items.sort((a, b) =>
                String(a.tracking || '').localeCompare(String(b.tracking || '')) ||
                locCompare(firstLoc(a), firstLoc(b)) ||
                (isMain(b) - isMain(a)));
            const mains = new Set(items.filter(isMain).map(it => janBaseOf(it.jan)));
            let mainNo = trkCount, subNo = 0;
            items.forEach((it, i) => {
                const kuji = isKujiName(it.name), main = kuji && /S\d+/i.test(it.jan);
                const base = janBaseOf(it.jan);
                const sub = kuji && !main && mains.has(base);
                let no;
                if (sub) { subNo++; no = mainNo + '-' + subNo; } else { mainNo++; subNo = 0; no = String(mainNo); }
                const sm = main ? String(it.jan).match(/S(\d+)/i) : null;
                lines.push({
                    key: 'O' + oi + 'L' + i, oi: oi, no: no,
                    loc: firstLoc(it), locs: it.locs,
                    jan: it.jan, janN: normJan(it.jan), janBase: base,
                    name: it.name, option: it.option, pcs: it.pcs, isHalf: it.isHalf, img: it.img,
                    unit: it.unit || '', pset: it.pset || 0, sets: it.sets || 0, isSetName: !!it.isSetName,
                    tracking: it.tracking, total: it.qty,
                    alloc: [{ oi: oi, qty: it.qty, tracking: it.tracking }],
                    isKuji: kuji, isMain: main, isSub: sub, setDiv: sm ? parseInt(sm[1], 10) : 0
                });
            });
        });
        return lines;
    }

    /* ---------- [v1.5.0] 아타리쿠지 세트 기준 (관리/05-피킹리스트 picking-list-tools 와 같은 기준) ----------
     *  메인 잔코드(S숫자)가 있으면: 메인 수량 ÷ S숫자 = 세트수 (내림)
     *  메인 잔코드가 없으면(통관불가 등): 아래 기준표의 "기준등급 n개 = 1세트"로 계산
     *  기준표에 없으면 화면에서 [이 태블릿에 임시 등록] (모든 태블릿에 쓰려면 여기 KUJI_SETS에 한 줄 추가) */
    const KUJI_SETS = {
        '4550624971331': { grade: '1', perSet: 2 }, // SANRIO ATARIKUJI BLANKET SET
    };
    const KUJI_LOCAL_KEY = 'kujiSetsLocal';
    /* [v1.6.0] 세트 기준 구글시트 (관리팀 피킹리스트와 같은 시트) — 시트에 한 줄 추가하면 모든 태블릿·PC에 반영
     *  시트 열: A 잔코드(메인 JAN) | B 기준등급 | C 1세트수량 | D~ 메모
     *  우선순위: 구글시트 > 위 KUJI_SETS > 이 태블릿 임시 등록 */
    const KUJI_SHEET_ID = '1dEuXsgKJsdsM4FFHEgnuSE3droNVPQawF5z8hQgO59Q';
    const KUJI_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/' + KUJI_SHEET_ID + '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent('세트기준');
    const KUJI_SHEET_EDIT_URL = 'https://docs.google.com/spreadsheets/d/' + KUJI_SHEET_ID + '/edit';
    let kujiSheet = { sets: {}, error: '', at: 0, loading: null };
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
    // 5분에 한 번만 다시 읽음 (force면 바로)
    function refreshKujiSheet(force) {
        if (kujiSheet.loading) return kujiSheet.loading;
        if (!force && kujiSheet.at && Date.now() - kujiSheet.at < 5 * 60 * 1000) return Promise.resolve();
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 10000);
        kujiSheet.loading = fetch(KUJI_SHEET_CSV_URL + '&_=' + Date.now(), { cache: 'no-store', signal: ctrl.signal })
            .then(res => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.text(); })
            .then(text => {
                if (/^\s*</.test(text)) throw new Error('시트 공유 설정 확인 필요');
                const sets = {};
                parseCsv(text).forEach(r => {
                    const jan = String(r[0] || '').replace(/\s/g, '').replace(/\.0+$/, '');
                    const grade = String(r[1] || '').replace(/[-\s]/g, '').replace(/\.0+$/, '');
                    const per = parseInt(String(r[2] || '').replace(/[^\d]/g, ''), 10);
                    if (/^\d{8,14}$/.test(jan) && /^[0-9A-Za-z]+$/.test(grade) && per > 0) sets[jan] = { grade: grade, perSet: per };
                });
                kujiSheet = { sets: sets, error: '', at: Date.now(), loading: null };
            })
            .catch(e => {
                console.warn('[태블릿피킹] 세트 기준 시트 읽기 실패', e);
                kujiSheet = { sets: kujiSheet.sets, error: (e && e.name === 'AbortError') ? '응답 없음' : String(e.message || e), at: Date.now(), loading: null };
            })
            .finally(() => { clearTimeout(timer); if (PK) render(); });
        return kujiSheet.loading;
    }
    function kujiSets() {
        let local = {};
        try { local = JSON.parse(localStorage.getItem(KUJI_LOCAL_KEY) || '{}') || {}; } catch (e) {}
        return Object.assign({}, local, KUJI_SETS, kujiSheet.sets);
    }
    const fmtSets = (n) => Number.isInteger(n) ? String(n) : n.toFixed(1);
    // 출고건 하나: 메인 잔코드가 없는 쿠지 묶음별 세트 계산
    function kujiInfoFor(b, oi) {
        const sets = kujiSets();
        const ls = b.lines.filter(l => l.oi === oi && l.isKuji);
        const mains = new Set(ls.filter(l => l.isMain).map(l => l.janBase));
        const subs = {};
        ls.forEach(l => {
            if (l.isMain) return;
            const m = String(l.jan).trim().match(/^(\d{8,14})\s*-\s*([0-9A-Za-z]+)$/);
            if (!m) return;
            const s = subs[m[1]] = subs[m[1]] || { name: l.name, grades: {} };
            s.grades[m[2]] = (s.grades[m[2]] || 0) + l.total;
        });
        const res = {};
        Object.keys(subs).forEach(base => {
            if (mains.has(base)) return;
            const s = subs[base], conf = sets[base];
            const info = { base: base, name: s.name, grades: Object.keys(s.grades), conf: conf };
            if (!conf) info.status = 'unregistered';
            else if (!s.grades[String(conf.grade)]) info.status = 'noref';
            else {
                info.refQty = s.grades[String(conf.grade)];
                info.sets = info.refQty / conf.perSet;
                info.status = Number.isInteger(info.sets) ? 'ok' : 'odd';
            }
            res[base] = info;
        });
        return res;
    }

    /* ==========================================================
     * 출고관리 화면: 버튼 추가 + 출고건 수집
     * ========================================================== */
    function injectButton() {
        if (document.querySelector('meta[name="tm-tablet-print"]')) return; // 인쇄용 새 창 제외
        if (document.getElementById('tm-tablet-pick-btn')) return;
        const origin = document.getElementById('btnDownloadPickingList');
        const area = origin || document.querySelector('.card-header .btn-group') || document.querySelector('.card-body .mb-3');
        if (!area) return;
        const btn = document.createElement('button');
        btn.id = 'tm-tablet-pick-btn';
        btn.type = 'button';
        btn.className = 'btn btn-sm';
        btn.textContent = '📱 태블릿 피킹';
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
            f.textContent = on ? '👀 전체 보기' : '🆓 미피킹만';
            f.style.cssText = 'background:#fff !important;color:#0f766e !important;border:2px solid #0f766e;padding:4px 12px;font-weight:bold;border-radius:4px;';
            f.onclick = () => { sel.value = on ? '' : '2'; form.submit(); };
            btn.parentNode.insertBefore(f, btn.nextSibling);
        }
    }

    function injectResumeButton() {
        if (document.querySelector('meta[name="tm-tablet-print"]')) return; // 인쇄용 새 창 제외
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
        el.textContent = `📱 피킹 이어하기 (${st.picked}/${st.total})`;
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
        if (boxes.length === 0) { toastMsg('출고건을 선택해 주세요', false); return; }
        const cur = loadBatch();
        const go = async () => {
            const ov = overlayMsg('다른 사람의 피킹 상황 확인 중...');
            const taken = await findTakenIds(readSelectedTasks(boxes));
            ov.close();
            if (taken.size) {
                const takenBoxes = boxes.filter(b => taken.has(b.getAttribute('data-id') + ':' + b.getAttribute('data-type')));
                const names = takenBoxes.map(b => esc(b.closest('tr')?.querySelector('td:nth-child(4)')?.innerText.trim() || b.getAttribute('data-id'))).join(', ');
                const rest = boxes.filter(b => !takenBoxes.includes(b));
                modal(`다음 출고건은 이미 <b style="color:#dc2626">다른 사람이 피킹 중</b>입니다:<br><b>${names}</b>`, [
                    ...(rest.length ? [{ label: `제외하고 시작 (${rest.length}건)`, color: '#0f766e', fn: () => checkIssueAndStart(rest) }] : []),
                    { label: '취소', color: '#6b7280', fn: () => location.reload() }
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
                modal(`주의 회원사 출고건이 <b style="color:#dc2626">${issue.length}건</b> 포함되어 있습니다.`, [
                    { label: `제외하고 시작 (${boxes.length - issue.length}건)`, color: '#dc2626', fn: () => { const n = boxes.filter(b => !issue.includes(b)); if (n.length) startBatch(n); } },
                    { label: `전체로 시작 (${boxes.length}건)`, color: '#2563eb', fn: () => startBatch(boxes) },
                    { label: '취소', color: '#6b7280' }
                ]);
            } else startBatch(boxes);
        };
        if (cur) {
            const st = batchStats(cur);
            modal(`진행 중이던 피킹이 있습니다 (${st.picked}/${st.total}).<br>버리고 새로 시작할까요?`, [
                { label: '이어서 하기', color: '#0f766e', fn: () => openPicker(cur) },
                { label: '버리고 새로 시작', color: '#dc2626', fn: go },
                { label: '취소', color: '#6b7280' }
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
        const ovMark = overlayMsg('피킹 중으로 변경 중...');
        const marked = await markSystemPicking(tasks);
        ovMark.close();
        const csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
        const ov = overlayMsg(`데이터 불러오는 중... (0 / ${tasks.length})`);
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
                done++; ov.set(`데이터 불러오는 중... (${done} / ${tasks.length})`);
            }
        });
        ov.close();
        const okOrders = orders.filter(o => o && o.items.length);
        if (!okOrders.length) { modal('상품 데이터를 불러오지 못했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.', [{ label: 'OK', color: '#6b7280' }]); return; }
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
        if (!marked) modal('시스템을 「피킹 중」으로 바꾸지 못했습니다.<br>다른 사람에게도 같은 출고건이 보일 수 있습니다. 관리자에게 확인해 주세요.', [{ label: 'OK', color: '#6b7280' }]);
        if (failed.length) modal(`다음 출고건은 불러오지 못해 목록에 들어가지 않았습니다:<br><b>${failed.map(esc).join(', ')}</b>`, [{ label: 'OK', color: '#6b7280' }]);
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
    #tmtp{position:fixed;inset:0;z-index:99999;background:#f1f5f9;font-family:"Malgun Gothic","Hiragino Sans","Meiryo",sans-serif;color:#0f172a;display:flex;flex-direction:column;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
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
    
    #tmtp .tabs{background:#e2e8f0;padding:8px 12px;display:flex;gap:8px;overflow-x:auto;-webkit-overflow-scrolling:touch;align-items:center}
    #tmtp .tabs .nv{border:none;border-radius:10px;min-width:56px;min-height:48px;font-size:22px;font-weight:900;background:#0f172a;color:#fff;flex:none}
    #tmtp .oc{flex:none;border:2px solid #94a3b8;background:#fff;border-radius:10px;padding:6px 12px;font-size:16px;font-weight:900;min-height:48px;color:#0f172a}
    #tmtp .oc small{display:block;font-size:12px;font-weight:700;color:#475569}
    #tmtp .oc.cur{border-color:#0f766e;background:#0f766e;color:#fff}
    #tmtp .oc.cur small{color:#ccfbf1}
    #tmtp .oc.done{border-color:#16a34a;background:#dcfce7}
    #tmtp .oc.cur.done{background:#16a34a;color:#fff}
    #tmtp .obox{background:#fff;border:3px solid #0f172a;border-radius:14px;padding:10px 14px;margin-bottom:10px}
    #tmtp .obox.ocean{border-color:#0284c7}
    #tmtp .obox .r1{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
    #tmtp .obox .on{font-size:30px;font-weight:900;letter-spacing:1px}
    #tmtp .obox .rv{font-size:16px;font-weight:700;color:#334155}
    #tmtp .obox .op{margin-left:auto;font-size:20px;font-weight:900}
    #tmtp .obox .op.trkc{border:3px solid #0f172a;border-radius:10px;padding:4px 14px;font-size:24px;text-align:right;line-height:1.1}
    #tmtp .obox .op.trkc b{font-size:36px;color:#d00}
    #tmtp .obox .op.trkc small{display:block;font-size:14px;color:#475569}
    #tmtp .tag{display:inline-block;font-size:15px;font-weight:900;border-radius:6px;padding:2px 8px;margin:4px 6px 0 0;border:2px solid #0f172a}
    #tmtp .tag.red{background:#c62828;border-color:#c62828;color:#fff}
    #tmtp .tag.blue{border-color:#0284c7;color:#0369a1}
    #tmtp .memo{margin-top:6px;font-size:16px;font-weight:800;color:#c62828;white-space:pre-wrap;border-left:4px solid #c62828;padding-left:8px}
    #tmtp .kb{margin-top:8px;border:3px solid #d00;background:#fff4f4;border-radius:8px;padding:6px 10px;font-size:16px;font-weight:900;display:flex;flex-wrap:wrap;align-items:center;gap:8px}
    #tmtp .kb.warn{border-color:#e69500;background:#fff8e6}
    #tmtp .kb .big{font-size:26px;color:#d00}
    #tmtp .kb button{border:none;border-radius:8px;padding:8px 12px;font-size:14px;font-weight:900;background:#6b7280;color:#fff}
    #tmtp .card .no{width:58px;flex:none;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;background:#f1f5f9;border-right:1px solid #e2e8f0}
    #tmtp .card.main{background:#fff9c4;border-color:#e6b800}
    #tmtp .card.half{background:#e3f2fd;border-color:#64b5f6}
    #tmtp .card.ksub .nm,#tmtp .card.ksub .jan{color:#555;font-weight:500}
    #tmtp .card.ksub .jan b{color:#555}
    #tmtp .card .sb2{color:#ff3e1d;font-weight:900;margin-right:4px}
    #tmtp .qty{width:104px;flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;border-left:1px solid #e2e8f0;padding:4px}
    #tmtp .qty .q{font-size:32px;font-weight:900;color:#d00;line-height:1}
    #tmtp .qty .st{font-size:15px;font-weight:900;color:#ff3e1d;margin-top:2px}
    #tmtp .qty .pc{font-size:13px;font-weight:900;color:#1565c0;margin-top:2px;text-align:center}
    #tmtp .qty .warn{font-size:12px;font-weight:900;color:#fff;background:#e69500;border-radius:4px;padding:1px 4px;margin-top:2px}
    #tmtp .lcs{width:150px;flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;border-left:1px solid #e2e8f0;padding:4px;text-align:center;font-size:17px;font-weight:900;line-height:1.3;word-break:break-all}
    #tmtp .lcs .tk{font-size:12px;font-weight:700;color:#3b82f6;margin-top:3px}
    #tmtp .card.full .lcs{background:#16a34a;color:#fff}
    #tmtp .card.full .lcs .tk{color:#dcfce7}
    #tmtp .card.trk .tkl{font-size:13px;font-weight:800;color:#64748b}
    #tmtp .card.trk .tkn{font-size:20px;font-family:Consolas,monospace;color:#334155;word-break:break-all}
    #tmtp .card.trk .tkn b{font-size:34px;color:#0f172a}
    #tmtp .card.trk .lcs{width:200px;font-size:24px}
        @media (max-width:900px){#tmtp .lcs{width:110px;font-size:15px}#tmtp .qty{width:84px}#tmtp .qty .q{font-size:26px}#tmtp .card .no{width:44px;font-size:16px}#tmtp .obox .on{font-size:24px}}
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
                <div class="ttl">📱 피킹</div>
                <div class="prog"><div class="ptxt"></div><div class="bar"><i></i></div></div>
                <button class="hb" data-act="cam">📷 카메라</button>
                <button class="hb" data-act="pause">⏸ 중단</button>
                <button class="hb" data-act="cancel" style="background:#7f1d1d">✖ 취소</button>
                <button class="hb done" data-act="finish">✅ 완료</button>
            </div>
            <div class="tabs"></div>
            <div class="sub">
                <input type="text" inputmode="numeric" placeholder="JAN · Tracking 스캔 / 직접 입력 → Enter" autocomplete="off">
                <button class="sb on" data-flt="todo">미완료</button>
                <button class="sb" data-flt="all">전체</button>
            </div>
            <div class="list"></div>`;
        document.body.appendChild(root);
        document.documentElement.style.overflow = 'hidden';

        PK = { batch: batch, root: root, filter: 'todo', keyBuf: '', keyAt: 0, oi: firstOpenOrder(batch, 0) };
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
            const oc = e.target.closest('[data-oi]');
            if (oc) { PK.oi = parseInt(oc.dataset.oi, 10) || 0; render(); PK.root.querySelector('.list').scrollTop = 0; return; }
            const nv = e.target.closest('[data-nav]');
            if (nv) { moveOrder(parseInt(nv.dataset.nav, 10)); return; }
            const kr = e.target.closest('[data-kreg]');
            if (kr) { registerKujiLocal(kr.dataset.kreg, kr.dataset.grades || ''); return; }
            if (e.target.closest('[data-ksheet]')) { window.open(KUJI_SHEET_EDIT_URL, '_blank'); return; }
            if (e.target.closest('[data-kreload]')) { refreshKujiSheet(true); toastMsg('세트 기준 시트를 다시 읽는 중...', true); return; }
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
        refreshKujiSheet(false);
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

    // [v1.7.0] 배송대행은 Tracking(상자) 단위, 그 외는 상품 개수
    const isDelivery = (o) => String((o && o.type) || '').includes('delivery');
    const unitOf = (o) => isDelivery(o) ? 'Tracking' : '개';
    function orderStats(b, oi) {
        let t = 0, p = 0;
        b.lines.forEach(l => { if (l.oi !== oi) return; t += l.total; p += Math.min(b.picked[l.key] || 0, l.total); });
        return { t: t, p: p, done: t > 0 && p >= t };
    }
    function firstOpenOrder(b, from) {
        const n = b.orders.length;
        for (let k = 0; k < n; k++) { const oi = (from + k) % n; if (!orderStats(b, oi).done) return oi; }
        return Math.min(from, n - 1);
    }
    function moveOrder(d) {
        if (!PK) return;
        const n = PK.batch.orders.length;
        PK.oi = (PK.oi + d + n) % n;
        render();
        PK.root.querySelector('.list').scrollTop = 0;
    }
    function registerKujiLocal(base, gradesCsv) {
        const grades = String(gradesCsv || '').split(',').filter(Boolean).map(g => '-' + g).join(', ');
        let grade = prompt('[' + base + '] 기준이 되는 등급을 입력해 주세요\n(목록에 있는 등급: ' + grades + ')', '1');
        if (!grade) return;
        grade = grade.replace(/-/g, '').trim();
        const per = parseInt(prompt('-' + grade + ' 등급은 1세트에 몇 개입니까?', '2'), 10);
        if (!per || per < 1) return;
        try {
            const local = JSON.parse(localStorage.getItem(KUJI_LOCAL_KEY) || '{}') || {};
            local[base] = { grade: grade, perSet: per };
            localStorage.setItem(KUJI_LOCAL_KEY, JSON.stringify(local));
        } catch (e) { toastMsg('저장 실패', false); return; }
        render();
    }

    function kujiBannerHtml(map) {
        return Object.keys(map).map(base => {
            const k = map[base];
            let cls = 'kb warn', body = '';
            if (k.status === 'ok') { cls = 'kb'; body = `<span class="big">${k.sets}세트</span><span style="font-size:13px;font-weight:600;color:#444">(-${esc(k.conf.grade)} 기준 ${k.conf.perSet}개 = 1세트)</span>`; }
            else if (k.status === 'odd') body = `<span class="big">${fmtSets(k.sets)}세트 ⚠ 수량 확인</span><span style="font-size:13px;font-weight:600;color:#444">(-${esc(k.conf.grade)} 지금 ${k.refQty}개 / 1세트 ${k.conf.perSet}개)</span>`;
            else if (k.status === 'noref') body = `<span>기준 등급 -${esc(k.conf.grade)} 이(가) 목록에 없습니다 → 세트수를 확인해 주세요</span>`;
            else body = `<span>세트 기준 미등록</span><button data-ksheet="1" style="background:#e69500">📋 시트에 등록</button><button data-kreload="1" style="background:#0f766e">🔄 다시 읽기</button><button data-kreg="${esc(base)}" data-grades="${esc(k.grades.join(','))}">이 태블릿에 임시 등록</button>`;
            return `<div class="${cls}"><span>🎯 ${esc(k.name)} (${esc(base)}) :</span>${body}</div>`;
        }).join('') + (Object.keys(map).length && kujiSheet.error ? `<div class="kb warn" style="font-size:13px">⚠ 세트 기준 시트를 읽지 못했습니다 (${esc(kujiSheet.error)}) — 스크립트에 넣어 둔 기준·임시 등록만 사용 중</div>` : '');
    }

    function render(flashKey, flashCls) {
        if (!PK) return;
        const b = PK.batch;
        const st = batchStats(b);
        const pct = st.total ? Math.round(st.picked / st.total * 100) : 0;
        PK.root.querySelector('.ptxt').innerHTML = `<b>${st.picked}</b> / ${st.total}　(출고 ${b.orders.filter((o, i) => orderStats(b, i).done).length} / ${b.orders.length}건 완료)`;
        PK.root.querySelector('.bar i').style.width = pct + '%';
        PK.root.querySelectorAll('[data-flt]').forEach(x => x.classList.toggle('on', x.dataset.flt === PK.filter));

        // 출고건 탭
        const tabs = PK.root.querySelector('.tabs');
        tabs.innerHTML = (b.orders.length > 1 ? '<button class="nv" data-nav="-1">◀</button>' : '') +
            b.orders.map((o, oi) => {
                const s2 = orderStats(b, oi);
                return `<button class="oc${oi === PK.oi ? ' cur' : ''}${s2.done ? ' done' : ''}" data-oi="${oi}">${s2.done ? '✓ ' : ''}${esc(o.outNum)}<small>${s2.p} / ${s2.t}</small></button>`;
            }).join('') +
            (b.orders.length > 1 ? '<button class="nv" data-nav="1">▶</button>' : '');
        const curTab = tabs.querySelector('.oc.cur');
        if (curTab && curTab.scrollIntoView) curTab.scrollIntoView({ inline: 'center', block: 'nearest' });

        const oi = PK.oi;
        const o = b.orders[oi];
        const os = orderStats(b, oi);
        const kmap = kujiInfoFor(b, oi);

        // 출고건 정보 (포장 화면 머리 부분처럼)
        const tags = (o.requests || []).map(x => `<span class="tag${/무검품/.test(x) ? ' red' : ''}">${esc(x)}</span>`).join('') +
            (o.isOcean ? '<span class="tag blue">해운(OCEAN)</span>' : '');
        let html = `<div class="obox${o.isOcean ? ' ocean' : ''}">
            <div class="r1"><span class="on">${esc(o.outNum)}</span><span class="rv">${esc(o.receiver)}</span>${isDelivery(o) ? `<span class="op trkc">📦 Tracking <b>${os.t}</b>개<small>${os.done ? '✅ ' : ''}체크 ${os.p} / ${os.t}</small></span>` : `<span class="op">${os.done ? '✅ ' : ''}${os.p} / ${os.t} ${unitOf(o)}</span>`}</div>
            ${tags ? `<div>${tags}</div>` : ''}
            ${o.requirementMsg ? `<div class="memo">${esc(o.requirementMsg)}</div>` : ''}
            ${kujiBannerHtml(kmap)}
        </div>`;

        let shown = 0;
        b.lines.forEach(l => {
            if (l.oi !== oi) return;
            const p = Math.min(b.picked[l.key] || 0, l.total);
            const full = p >= l.total;
            if (PK.filter === 'todo' && full && l.key !== flashKey) return;
            shown++;
            const jan = String(l.jan);
            const janHtml = jan.length > 4 ? `${esc(jan.slice(0, -4))}<b>${esc(jan.slice(-4))}</b>` : `<b>${esc(jan)}</b>`;
            if (l.isTrk) {
                // [v1.7.0] 배송대행 Tracking 줄: 상품 정보 없이 Tracking 번호 + 로케이션만
                const cls = 'card trk' + (full ? ' full' : '') + (l.key === flashKey ? ' ' + (flashCls || 'flash') : '');
                html += `
                <div class="${cls}" data-key="${esc(l.key)}">
                    <div class="no">${esc(l.no)}</div>
                    <div class="body"><div class="info">
                        <div class="tkl">Tracking</div>
                        <div class="tkn">${janHtml}</div>
                    </div></div>
                    <div class="lcs">${l.locs.map(x => esc(x.name)).join('<br>')}</div>
                    <div class="cnt">
                        <div class="num">${full ? '✓ ' : ''}${p}<small> / 1</small></div>
                        <div class="btns">${full ? '<button class="mb" data-d="minus">취소</button>' : '<button class="mb all" data-d="all">체크</button>'}</div>
                    </div>
                </div>`;
                return;
            }
            // 수량 칸: 쿠지 세트 / 옵션 PCS
            let qtyExtra = '';
            let rowCls = '';
            if (l.isMain && l.setDiv > 0) { qtyExtra = `<div class="st">(${Math.floor(l.total / l.setDiv)} set)</div>`; rowCls = ' main'; }
            else if (l.isKuji && !l.isMain && !l.isSub) {
                const m = jan.trim().match(/^(\d{8,14})\s*-\s*([0-9A-Za-z]+)$/);
                const k = m ? kmap[m[1]] : null;
                if (k && (k.status === 'ok' || k.status === 'odd') && String(k.conf.grade) === m[2]) { qtyExtra = `<div class="st">(${fmtSets(k.sets)} set)</div>`; rowCls = ' main'; }
            }
            // [v1.8.0] 세트 개수 (포장 화면 옵션 / 상품명 "nP SET")
            if (l.pset > 0 && !l.isKuji) {
                qtyExtra += `<div class="pc">${l.pset}P SET${l.sets ? `<br>× ${l.sets}세트` : ''}</div>`; rowCls = ' half';
            } else if (l.pcs > 0 && (l.isHalf || !l.isKuji)) {
                const u = l.unit || '세트';
                qtyExtra += `<div class="pc">${l.total}${esc(u)} × ${l.pcs}개입<br>= 총 ${l.total * l.pcs}개</div>`; rowCls = ' half';
            } else if (l.isHalf || (l.isSetName && !l.isKuji)) qtyExtra += '<div class="warn">⚠ 세트 개수 미기재</div>';
            if (l.isSub) rowCls += ' ksub';
            const locHtml = l.locs.map(x => `${esc(x.name)} : ${x.qty}개`).join('<br>') +
                (l.tracking ? `<div class="tk">…${esc(String(l.tracking).slice(-6))}</div>` : '');
            const cls = 'card' + rowCls + (full ? ' full' : (p > 0 ? ' part' : '')) + (l.key === flashKey ? ' ' + (flashCls || 'flash') : '');
            html += `
                <div class="${cls}" data-key="${esc(l.key)}">
                    <div class="no">${esc(l.no)}</div>
                    <div class="body">
                        <div class="img">${l.img ? `<img src="${esc(l.img)}" alt="">` : ''}</div>
                        <div class="info">
                            <div class="nm">${l.isSub ? '<span class="sb2">└</span>' : ''}${esc(l.name)}</div>
                            <div class="jan">${janHtml}</div>
                            ${l.option ? `<span class="opt">${esc(l.option)}</span>` : ''}
                        </div>
                    </div>
                    <div class="qty"><div class="q">${l.total}</div>${qtyExtra}</div>
                    <div class="lcs">${locHtml}</div>
                    <div class="cnt">
                        <div class="num">${full ? '✓ ' : ''}${p}<small> / ${l.total}</small></div>
                        <div class="btns"><button class="mb" data-d="minus">−1</button><button class="mb all" data-d="all">전부</button></div>
                    </div>
                </div>`;
        });
        if (!shown) {
            const next = firstOpenOrder(b, (oi + 1) % b.orders.length);
            html += (st.picked >= st.total)
                ? `<div class="empty">🎉 모든 출고건 피킹 완료<br><span style="font-size:16px;color:#475569">오른쪽 위 「✅ 완료」를 눌러 분류 리스트를 인쇄하세요</span></div>`
                : `<div class="empty">✅ 이 출고건은 피킹 완료<br><button class="hb" style="background:#0f766e;margin-top:14px" data-oi="${next}">다음 출고건 ${esc(b.orders[next].outNum)} ▶</button></div>`;
        }
        const list = PK.root.querySelector('.list');
        const scrollTop = list.scrollTop;
        list.innerHTML = html;
        list.scrollTop = scrollTop;
        if (flashKey) {
            const el = list.querySelector(`.card[data-key="${cssEsc(flashKey)}"]`);
            if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }
    function cssEsc(s) { return String(s).replace(/[^A-Za-z0-9_-]/g, ''); }

    // 한 줄에 +1 하고, 출고건이 다 끝나면 다음 출고건으로 넘어감
    function afterPick(l) {
        const b = PK.batch;
        const os = orderStats(b, l.oi);
        if (os.done) {
            const st = batchStats(b);
            if (st.picked >= st.total) { toastMsg('🎉 모든 출고건 피킹 완료', true); render(l.key); return; }
            toastMsg(`✅ ${esc(b.orders[l.oi].outNum)} 완료 → 다음 출고건`, true);
            render(l.key);
            setTimeout(() => { if (PK && PK.oi === l.oi) { PK.oi = firstOpenOrder(b, (l.oi + 1) % b.orders.length); render(); PK.root.querySelector('.list').scrollTop = 0; } }, 900);
            return;
        }
        render(l.key);
    }
    function addPick(key, d) {
        const b = PK.batch;
        const l = b.lines.find(x => x.key === key);
        if (!l) return;
        const cur = b.picked[key] || 0;
        const next = Math.max(0, Math.min(l.total, cur + d));
        if (d > 0 && cur >= l.total) { beep(false); toastMsg('수량 초과', false); render(key, 'over'); return; }
        b.picked[key] = next;
        saveBatch(b);
        if (d > 0) afterPick(l); else render(key);
    }
    function setPick(key, v) {
        const b = PK.batch;
        const l = b.lines.find(x => x.key === key);
        if (!l) return;
        b.picked[key] = v === 'all' ? l.total : v;
        saveBatch(b);
        afterPick(l);
    }
    function pickOne(l) {
        const b = PK.batch;
        if ((b.picked[l.key] || 0) >= l.total) { beep(false); toastMsg('수량 초과', false); render(l.key, 'over'); return; }
        b.picked[l.key] = (b.picked[l.key] || 0) + 1;
        saveBatch(b);
        beep(true);
        toastMsg(`No.${esc(l.no)}　${b.picked[l.key]} / ${l.total}`, true);
        afterPick(l);
    }
    // 등급 표시: 잔코드에서 JAN 뒤에 붙은 부분 (-1, -A, S10, -H)
    function gradeOf(l) {
        const rest = String(l.jan).trim().slice(String(l.janBase).length).trim();
        if (l.isMain) return '메인(세트)' + (rest ? ' ' + rest : '');
        return rest || '';
    }

    // [v1.5.0] 스캔: 지금 보고 있는 출고건 안에서만 찾음.
    //  - 잔코드 전체가 같거나, 잔코드 앞의 JAN(13자리 등)이 같으면 해당
    //  - 같은 JAN에 등급(-1, -2, -A …)이 여러 개면 화면에서 고르게 함
    //  - 다른 출고건 상품이면 알려 주고 그 출고건으로 이동할 수 있게 함
    function handleScan(raw) {
        if (!PK) return;
        const code = normJan(raw);
        if (!code) return;
        const b = PK.batch;
        const match = (l) => l.janN === code || normJan(l.janBase) === code;
        const cur = b.lines.filter(l => l.oi === PK.oi && match(l));
        if (!cur.length) {
            const other = b.lines.filter(match);
            beep(false);
            if (other.length) {
                const ois = Array.from(new Set(other.map(l => l.oi)));
                modal(`이 상품은 지금 출고건(<b>${esc(b.orders[PK.oi].outNum)}</b>)이 아니라<br><b style="color:#dc2626">${ois.map(i => esc(b.orders[i].outNum)).join(', ')}</b> 출고건 상품입니다.`,
                    ois.map(i => ({ label: `${b.orders[i].outNum}(으)로 이동`, color: '#0f766e', fn: () => { PK.oi = i; render(); PK.root.querySelector('.list').scrollTop = 0; } }))
                        .concat([{ label: '닫기', color: '#6b7280' }]));
            } else {
                toastMsg(`목록에 없는 JAN<br><span style="font-size:16px">${esc(raw)}</span>`, false);
            }
            return;
        }
        const exact = cur.filter(l => l.janN === code);
        const pool = exact.length ? exact : cur;
        const open = pool.filter(l => (b.picked[l.key] || 0) < l.total);
        if (!open.length) { beep(false); toastMsg('이 상품은 이미 다 피킹했습니다', false); render(pool[0].key, 'over'); return; }
        if (open.length === 1) { pickOne(open[0]); return; }
        // 같은 바코드에 등급·옵션이 여러 개 → 고르기
        beep(true);
        modal(`같은 바코드 상품이 <b>${open.length}개</b> 있습니다.<br>집은 상품을 골라 주세요.`,
            open.map(l => ({
                label: `No.${l.no}  ${gradeOf(l)}${l.option ? ' [' + l.option + ']' : ''}  ${l.loc}  (${b.picked[l.key] || 0}/${l.total})`,
                color: l.isMain ? '#b45309' : '#0f766e',
                fn: () => pickOne(l)
            })).concat([{ label: '취소', color: '#6b7280' }]), true);
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
        wrap.innerHTML = `<div class="cmsg">JAN 바코드를 화면 안에 맞춰 주세요</div><video playsinline muted></video><button>닫기</button>`;
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
                msg.textContent = '카메라 준비 중...';
                if (!window.ZXing) await loadScript(ZXING_URL);
                const reader = new window.ZXing.BrowserMultiFormatReader();
                camState.stop = () => { try { reader.reset(); } catch (e) {} };
                msg.textContent = 'JAN 바코드를 화면 안에 맞춰 주세요';
                await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, video, (res) => { if (res) onCode(res.getText()); });
            }
        } catch (e) {
            console.error('[태블릿피킹] 카메라 오류', e);
            msg.textContent = '카메라를 켤 수 없습니다: ' + (e.message || e) + ' (브라우저 카메라 권한을 확인해 주세요)';
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
        modal(`이 피킹(출고 ${b.orders.length}건)을 취소할까요?<br><span style="font-size:14px;color:#475569">시스템의 「피킹 중」을 풀어서 다른 사람이 피킹할 수 있는 상태로 되돌립니다.</span>`, [
            { label: '취소하기', color: '#dc2626', fn: async () => {
                const ov = overlayMsg('취소 중...');
                const ok = await cancelSystemPicking(b.orders);
                ov.close();
                if (!ok) { modal('시스템 피킹 취소에 실패했습니다.<br>출고관리 화면의 「PICKING취소」로 풀어 주세요.', [{ label: 'OK', color: '#6b7280' }]); return; }
                clearBatch(); closePicker(); location.reload();
            } },
            { label: '돌아가기', color: '#6b7280' }
        ]);
    }

    function onFinish() {
        const b = PK.batch;
        const st = batchStats(b);
        const short = b.lines.filter(l => (b.picked[l.key] || 0) < l.total);
        const doPrint = () => choosePaper((paper) => {
            const ok = printSortSheet(b, paper);
            if (!ok) return;
            modal('분류 리스트를 열었습니다.<br>이 피킹을 끝낼까요?', [
                { label: '끝내기', color: '#16a34a', fn: () => { clearBatch(); closePicker(); } },
                { label: '계속하기', color: '#6b7280' }
            ]);
        });
        if (short.length) {
            const listHtml = short.slice(0, 8).map(l => `<li><b>${esc(b.orders[l.oi].outNum)}</b> No.${esc(l.no)}　${esc(l.loc)}　${l.isTrk ? 'Tracking …' + esc(String(l.tracking).slice(-6)) : esc(l.name).slice(0, 20)}　<b>${(b.picked[l.key] || 0)}/${l.total}</b></li>`).join('');
            modal(`아직 <b style="color:#dc2626">${st.total - st.picked}개</b> 남아 있습니다.<ul style="text-align:left;font-size:14px;margin:8px 0">${listHtml}${short.length > 8 ? `<li>…외 ${short.length - 8}줄</li>` : ''}</ul>남은 것은 「결품」으로 인쇄할까요?`, [
                { label: '결품으로 인쇄', color: '#dc2626', fn: doPrint },
                { label: '돌아가기', color: '#6b7280' }
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
            { v: '100', label: '🧾 100mm 롤지' },
            { v: '80', label: '🧾 80mm 롤지' },
            { v: '58', label: '🧾 58mm 롤지' }
        ];
        opts.sort((x, y) => (y.v === last) - (x.v === last));
        modal('인쇄할 용지를 골라 주세요', opts.map((o, i) => ({
            label: o.label + (i === 0 ? ' (지난번)' : ''),
            color: i === 0 ? '#16a34a' : '#334155',
            fn: () => { try { localStorage.setItem(PAPER_KEY, o.v); } catch (e) {} cb(o.v); }
        })).concat([{ label: '돌아가기', color: '#6b7280' }]));
    }

    function printSortSheet(b, paper) {
        if (paper === '100' || paper === '80' || paper === '58') return printReceipt(b, paper);
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
            // [v1.6.0] 상품 정보는 인쇄하지 않음 (출고건 정보 + 결품 개수만)
            const reqs = (o.requests || []).map(x => `<span class="rq">${esc(x)}</span>`).join('') + (o.requirementMsg ? `<div class="rm">📝 ${esc(o.requirementMsg)}</div>` : '');
            return `<section class="ord${o.isOcean ? ' ocean' : ''}">
                <div class="oh">
                    <div class="qr" id="qr${oi}"></div>
                    <div class="ohm">
                        <div class="on">${esc(o.outNum)}${o.isOcean ? ' <span class="oct">OCEAN</span>' : ''}</div>
                        <div class="rv">${esc(o.receiver)}</div>
                    </div>
                    <div class="os">${got} / ${need} ${isDelivery(o) ? 'Tracking' : '개'}${need - got ? `<div class="kp">${isDelivery(o) ? '미확인' : '결품'} ${need - got}</div>` : ''}</div>
                </div>
                ${reqs ? `<div class="rqs">${reqs}</div>` : ''}
            </section>`;
        }).join('');

        const qrJs = b.orders.map((o, oi) => `try{new QRCode(document.getElementById("qr${oi}"),{text:${JSON.stringify(String(o.outNum))},width:56,height:56,correctLevel:1})}catch(e){}`).join('');
        const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="tm-tablet-print" content="1"><meta name="viewport" content="width=device-width,initial-scale=1">
            <title>분류 리스트 ${fmt(created)}</title>
            <style>
                @page{size:A4;margin:8mm}
                body{font-family:"Malgun Gothic","Hiragino Sans","Meiryo",sans-serif;margin:0;color:#000;background:#e5e7eb}
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
            <div class="np"><button onclick="window.print()">🖨 인쇄</button></div>
            <div class="wrap">
                <div class="top"><h1>분류 리스트</h1>
                    <div class="sm">${fmt(created)} 시작 / ${fmt(new Date())} 완료<br>출고 ${b.orders.length}건${shortTotal ? ` <span class="kp">미완료 ${shortTotal}</span>` : ''}</div>
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
        if (!w) { modal('팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.', [{ label: 'OK', color: '#6b7280' }]); return false; }
        w.document.open(); w.document.write(html); w.document.close();
        return true;
    }

    /* ---------- [v1.1.0] 롤지(80mm/58mm) 仕分けリスト: 블루투스 모바일 프린터용 ---------- */
    function printReceipt(b, paper) {
        const per = allocate(b);
        // 인쇄 폭(mm): 용지 폭에서 여백을 뺀 값. 100mm는 [v1.5.0] 추가 (프린터 구매 후 실제 폭에 맞춰 조정)
        const W = paper === '58' ? 48 : (paper === '100' ? 92 : 72);
        const big = paper === '58' ? 15 : (paper === '100' ? 22 : 19);
        const d = new Date();
        const ts = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        let shortAll = 0;
        const blocks = b.orders.map((o, oi) => {
            const rows = per[oi];
            const need = rows.reduce((a, r) => a + r.need, 0), got = rows.reduce((a, r) => a + r.got, 0);
            shortAll += need - got;
            // [v1.6.0] 상품 정보는 인쇄하지 않음 (출고건 정보 + 결품 개수만)
            const reqs = (o.requests || []).map(x => `<span class="rq">${esc(x)}</span>`).join('') + (o.requirementMsg ? `<div>📝 ${esc(o.requirementMsg)}</div>` : '');
            return `<div class="ord">
                <div class="oh"><div class="qr" id="qr${oi}"></div><div><div class="on">${esc(o.outNum)}</div><div class="rv">${esc(o.receiver)}${o.isOcean ? ' <b>[OCEAN]</b>' : ''}</div><div class="ct">${got}/${need}${isDelivery(o) ? ' Tracking' : '개'}${need - got ? ` <span class="kp">${isDelivery(o) ? '미확인' : '결품'}${need - got}</span>` : ''}</div></div></div>
                ${reqs ? `<div class="rqs">${reqs}</div>` : ''}
            </div>`;
        }).join('');
        const qrJs = b.orders.map((o, oi) => `try{new QRCode(document.getElementById("qr${oi}"),{text:${JSON.stringify(String(o.outNum))},width:${paper === '58' ? 44 : 56},height:${paper === '58' ? 44 : 56},correctLevel:1})}catch(e){}`).join('');
        const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="tm-tablet-print" content="1"><meta name="viewport" content="width=device-width,initial-scale=1">
            <title>분류 ${ts}</title>
            <style>
                @page{size:${paper}mm auto;margin:2mm}
                body{margin:0;font-family:"Malgun Gothic","Hiragino Sans","Meiryo",sans-serif;color:#000;background:#e5e7eb}
                .wrap{width:${W}mm;margin:0 auto;background:#fff;padding:2mm;font-size:${paper === '58' ? 10 : (paper === '100' ? 14 : 12)}px}
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
            <div class="np"><button onclick="window.print()">🖨 인쇄</button></div>
            <div class="wrap">
                <div class="tp">분류 리스트<small>${ts}　출고 ${b.orders.length}건${shortAll ? `　미완료 ${shortAll}` : ''}</small></div>
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
        if (!w) { modal('팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.', [{ label: 'OK', color: '#6b7280' }]); return false; }
        w.document.open(); w.document.write(html); w.document.close();
        return true;
    }

    /* ==========================================================
     * 작은 UI 도구 (모달 / 로딩)
     * ========================================================== */
    function modal(html, buttons, stack) {
        const m = document.createElement('div');
        m.style.cssText = 'position:fixed;inset:0;z-index:100002;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;font-family:"Malgun Gothic","Hiragino Sans","Meiryo",sans-serif';
        m.innerHTML = `<div style="background:#fff;border-radius:16px;max-width:520px;width:92vw;padding:22px;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.35)">
            <div style="font-size:17px;line-height:1.6;color:#0f172a;margin-bottom:18px">${html}</div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center"></div></div>`;
        const row = m.firstElementChild.lastElementChild; // 버튼 줄 (예전 선택자는 바깥 상자를 잡아서 버튼 정렬이 어긋났음)
        buttons.forEach(bt => {
            const x = document.createElement('button');
            x.type = 'button';
            x.textContent = bt.label;
            x.style.cssText = `flex:1;min-width:130px;min-height:52px;border:none;border-radius:12px;color:#fff;font-size:16px;font-weight:900;background:${bt.color || '#334155'};${stack ? 'flex:1 1 100%;text-align:left;padding:0 16px;font-size:18px;min-height:58px;' : ''}`;
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
        if (isLoginPage() || !/^https?:$/.test(location.protocol) || document.querySelector('meta[name="tm-tablet-print"]')) return; // 인쇄용 새 창에는 표시 안 함
        let bar = document.getElementById('tm-tablet-pick-bar');
        if (!bar) {
            if (!document.body) return;
            bar = document.createElement('div');
            bar.id = 'tm-tablet-pick-bar';
            bar.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:99997;display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:rgba(255,255,255,.96);border:2px solid #0f766e;border-radius:14px;padding:8px 10px;box-shadow:0 6px 18px rgba(0,0,0,.25);font-family:sans-serif;max-width:calc(100vw - 24px);';
            const btnCss = 'border:none;border-radius:10px;padding:12px 18px;font-size:17px;font-weight:bold;';
            if (isPackingList()) {
                bar.innerHTML =
                    '<span style="font-size:12px;font-weight:bold;color:#0f766e;">✅ 태블릿 피킹 ON</span>' +
                    '<button type="button" data-act="start" style="' + btnCss + 'background:#0f766e;color:#fff;">📱 피킹 시작</button>' +
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
                    '<span style="font-size:12px;font-weight:bold;color:#0f766e;">✅ 태블릿 피킹 ON</span>' +
                    '<button type="button" data-act="go" style="' + btnCss + 'background:#0f766e;color:#fff;">📱 피킹 화면으로</button>';
                bar.querySelector('[data-act="go"]').onclick = () => { location.href = location.origin + '/admin/shipping/packing'; };
            }
            document.body.appendChild(bar);
        }
        if (isPackingList()) {
            const n = document.querySelectorAll('input.sub_checkbox:checked').length;
            const sb = bar.querySelector('[data-act="start"]');
            const txt = n ? `📱 피킹 시작 (${n}건)` : '📱 피킹 시작';
            if (sb && sb.textContent !== txt) sb.textContent = txt;
            const fb = bar.querySelector('[data-act="filter"]');
            const sel = document.querySelector('select[name="s_picking"]');
            const ftxt = sel && sel.value === '2' ? '👀 전체 보기' : '🆓 미피킹만';
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
