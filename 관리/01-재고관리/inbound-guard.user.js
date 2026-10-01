// ==UserScript==
// @name         [관리] 입고데이터 보호 도구 (삭제 이중확인 + 삭제기록 + 사라진입고 탐지)
// @namespace    https://github.com/asics67-lab/tampermonkey-scripts
// @version      1.1.5
// @description  입고 처리 목록(일괄 삭제)과 Location관리(🗑) 화면에서 입고 데이터가 실수로 지워지는 것을 막고, 삭제 기록을 남기며, 기록 없이 사라진 입고 건을 찾아줍니다.
// @author       물류팀
// @match        https://www.platform.co.jp/admin/store/trackingno*
// @match        https://platform.co.jp/admin/store/trackingno*
// @match        https://www.platform.co.jp/admin/store/location-tracking*
// @match        https://platform.co.jp/admin/store/location-tracking*
// @icon         https://www.platform.co.jp/ui/custom/images/favicon.ico
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/관리/01-재고관리/inbound-guard.user.js
// @downloadURL  https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/관리/01-재고관리/inbound-guard.user.js
// ==/UserScript==
// [v1.1.4] 배포 위치 변경: 입고/03-inbound-guard.user.js → 관리/01-재고관리/inbound-guard.user.js (관리 담당자용 도구)
// [v1.1.5] 이름 앞머리 [입고] → [관리]. 반드시 Raw 재설치가 아니라 템퍼몽키 "업데이트 확인"으로 받을 것
//          (Raw로 설치하면 이름이 달라 새 스크립트로 하나 더 생김)

/*
 * ============================================================
 *  만든 이유 (2026-09-30)
 *  - 09-24에 입고된 364697406953(B4-3-3), 452355099840(B4-3-1)이 라벨까지 나왔는데
 *    나중에 입고 데이터가 사라짐. 입고창 🗑로 지우면 이력에 「削除」가 남는데,
 *    두 건은 削除 기록 없이 사라짐.
 *  - 기록 없이 지울 수 있는 후보: ① 입고 처리 목록의 「일괄 삭제」,
 *    ② Location관리 화면의 로케이션별 🗑 (둘 다 削除 기록 여부 미확인)
 *
 *  기능
 *  1) 삭제 이중확인
 *     - 입고 목록 「일괄 삭제」: 지워질 트래킹/회원사/로케이션을 크게 보여주고,
 *       삭제 건수를 직접 입력해야 진행됨. 전체선택(맨 위 체크박스)으로 5건 이상이면 추가 경고.
 *     - Location관리 🗑: 트래킹이 들어 있는 로케이션이면, 트래킹번호 끝 4자리를
 *       입력해야 삭제됨. (빈 로케이션은 사이트 기본 확인창 그대로)
 *     - Location관리 「업로드」(Excel 등록): 한 번 더 확인.
 *  2) 삭제 기록 남기기 (이 PC에 저장, 최근 1000건)
 *     - 누가(로그인 이름) / 언제 / 어느 화면에서 / 무엇을 지웠는지.
 *     - 「🗂 삭제 기록」 버튼 또는 Tampermonkey 메뉴에서 확인.
 *  3) 사라진 입고 탐지 (입고 처리 화면)
 *     - 입고 목록을 주기적으로(30분 간격, 화면 열 때) 저장해 두었다가, 다음에 봤을 때
 *       없어진 건 중 이력에 포장/削除가 없는 건을 "의심 건"으로 표시.
 *     - 「🔍 사라진 입고 확인」 버튼: 최근 N일 입고안내 메시지의 트래킹도 함께 점검.
 *
 *  v1.1.0 (2026-09-30) — 실제 원인 반영
 *  - 확인 결과: 입고창(Tracking No.입고 처리)에서 스캔 후 창을 닫기 전에 🗑로 지우면
 *    입고가 취소되고, 이력에 削除 기록도 알림도 남지 않음. 그런데 라벨은 이미 출력되어
 *    상자에 붙어 있을 수 있음 (09-24 두 건이 이 경우로 추정).
 *  - 입고창 🗑: 삭제되면 🗂 삭제 기록에 남김. (v1.1.2: 추가 확인창 없이 기록만)
 *  - v1.1.3: 같은 트래킹이 여러 줄(박스 여러 개)인 건이 있으면 "목록을 다 못 읽음"으로
 *    잘못 판단해 자동 점검 전체를 건너뛰던 버그 수정 (트래킹 수가 아닌 줄 수로 비교).
 *  - 입고창에서 스캔된 트래킹을 모두 기록해 두고(14일), 사라진 입고 점검 대상에 포함.
 *    → 창을 닫기 전에 지운 건도 잡힘. 입고창 삭제 기록이 있는 건은 "입고창에서 삭제"로
 *      따로 표시(경고창 없음), 기록이 없는 건만 "기록 없이 사라짐"으로 경고.
 * ============================================================
 */

(function () {
    'use strict';

    const IS_TRACKING = /\/admin\/store\/trackingno/.test(location.pathname);
    const IS_LOCATION = /\/admin\/store\/location-tracking/.test(location.pathname);

    const KEY_LOG = 'tm_guard_delete_log';
    const KEY_SNAPSHOT = 'tm_guard_snapshot';
    const KEY_MISSING = 'tm_guard_missing';
    const KEY_SEEN = 'tm_guard_seen_inbound';      // 입고창에서 스캔된 트래킹 (14일 보관)
    const KEY_MODAL_DEL = 'tm_guard_modal_deleted'; // 입고창 🗑로 삭제된 트래킹
    const SEEN_KEEP_MS = 14 * 86400000;
    const KEY_DISMISSED = 'tm_guard_dismissed';    // 「확인함」 누른 건 (다시 안 띄움)
    const SNAPSHOT_INTERVAL_MS = 30 * 60 * 1000;

    const norm = (v) => String(v || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    const nowStr = () => {
        const d = new Date();
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    };
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const getAdminName = () => {
        const el = document.querySelector('.dropdown-user span.fw-semibold') || document.querySelector('.dropdown-user .menu-link div');
        return el ? el.textContent.trim() : '(알 수 없음)';
    };
    const getCsrf = () => document.querySelector('meta[name="csrf-token"]')?.content || '';

    /* ---------------- 공통 모달 ---------------- */
    function injectStyle() {
        if (document.getElementById('tm-guard-style')) return;
        const st = document.createElement('style');
        st.id = 'tm-guard-style';
        st.textContent = `
            #tm-guard-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483000;display:flex;align-items:center;justify-content:center;font-family:'Public Sans',sans-serif}
            #tm-guard-box{background:#fff;border-radius:10px;width:min(760px,94vw);max-height:88vh;display:flex;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,.35)}
            #tm-guard-box .tg-head{padding:14px 18px;font-size:18px;font-weight:800;color:#fff;border-radius:10px 10px 0 0}
            #tm-guard-box .tg-body{padding:14px 18px;overflow:auto;font-size:14px;color:#333}
            #tm-guard-box .tg-foot{padding:12px 18px;border-top:1px solid #eee;display:flex;gap:8px;justify-content:flex-end;align-items:center}
            #tm-guard-box table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}
            #tm-guard-box th,#tm-guard-box td{border:1px solid #ddd;padding:5px 7px;text-align:left}
            #tm-guard-box th{background:#f5f5f5}
            #tm-guard-box .tg-warn{background:#fff3f0;border:2px solid #ff3e1d;color:#c62828;padding:10px;border-radius:6px;font-weight:700;margin:8px 0}
            #tm-guard-box input.tg-input{font-size:18px;padding:6px 10px;width:160px;border:2px solid #ff3e1d;border-radius:6px}
            #tm-guard-box button{padding:7px 16px;border-radius:6px;border:none;font-weight:700;cursor:pointer}
            #tm-guard-box .tg-cancel{background:#e0e0e0;color:#333}
            #tm-guard-box .tg-ok{background:#ff3e1d;color:#fff}
            #tm-guard-box .tg-ok:disabled{background:#f3a99b;cursor:not-allowed}
            #tm-guard-box .tg-blue{background:#1e5aa8;color:#fff}
            .tm-guard-btn{margin-left:6px}
            .tm-guard-badge{display:inline-block;background:#ff3e1d;color:#fff;border-radius:10px;padding:0 7px;margin-left:5px;font-size:12px}
        `;
        document.head.appendChild(st);
    }

    function openModal({ title, color = '#ff3e1d', bodyHTML, footHTML, onMount }) {
        injectStyle();
        closeModal();
        const ov = document.createElement('div');
        ov.id = 'tm-guard-overlay';
        ov.innerHTML = `<div id="tm-guard-box">
            <div class="tg-head" style="background:${color}">${title}</div>
            <div class="tg-body">${bodyHTML}</div>
            <div class="tg-foot">${footHTML}</div></div>`;
        document.body.appendChild(ov);
        // 모달 안의 키 입력이 다른 스크립트(스캔 등)로 새지 않게 차단
        ov.addEventListener('keydown', (e) => e.stopPropagation());
        if (onMount) onMount(ov);
        return ov;
    }
    function closeModal() { document.getElementById('tm-guard-overlay')?.remove(); }

    /** 확인 문구를 입력해야만 진행되는 삭제 확인창 */
    function confirmDelete({ title, bodyHTML, expected, hint }) {
        return new Promise((resolve) => {
            openModal({
                title,
                bodyHTML: `${bodyHTML}
                    <div style="margin-top:12px">${hint}</div>
                    <div style="margin-top:6px"><input class="tg-input" type="text" autocomplete="off"></div>`,
                footHTML: `<button class="tg-cancel">취소</button><button class="tg-ok" disabled>삭제</button>`,
                onMount: (ov) => {
                    const input = ov.querySelector('.tg-input');
                    const ok = ov.querySelector('.tg-ok');
                    const done = (v) => { closeModal(); resolve(v); };
                    input.addEventListener('input', () => { ok.disabled = input.value.trim() !== String(expected); });
                    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !ok.disabled) done(true); if (e.key === 'Escape') done(false); });
                    ok.addEventListener('click', () => done(true));
                    ov.querySelector('.tg-cancel').addEventListener('click', () => done(false));
                    setTimeout(() => input.focus(), 50);
                }
            });
        });
    }

    /* ---------------- 삭제 기록 ---------------- */
    function addDeleteLog(entry) {
        const log = GM_getValue(KEY_LOG, []);
        log.unshift({ at: nowStr(), admin: getAdminName(), ...entry });
        GM_setValue(KEY_LOG, log.slice(0, 1000));
    }

    function showDeleteLog() {
        const log = GM_getValue(KEY_LOG, []);
        const rows = log.map((e) => {
            const items = (e.items || []).map((i) => `${esc(i.tracking || '-')} / ${esc(i.member || '-')} / ${esc(i.location || '-')}`).join('<br>');
            return `<tr><td style="white-space:nowrap">${esc(e.at)}</td><td>${esc(e.admin)}</td><td>${esc(e.page)}</td><td>${items || esc(e.note || '')}</td></tr>`;
        }).join('');
        openModal({
            title: '🗂 삭제 기록 (이 PC)',
            color: '#1e5aa8',
            bodyHTML: log.length
                ? `<div>이 PC에서 입고데이터 보호 도구를 거쳐 삭제된 기록입니다. (최근 ${log.length}건)</div>
                   <table><thead><tr><th>일시</th><th>작업자</th><th>화면</th><th>트래킹 / 회원사 / 로케이션</th></tr></thead><tbody>${rows}</tbody></table>`
                : '아직 기록이 없습니다.',
            footHTML: `<button class="tg-cancel">닫기</button>`,
            onMount: (ov) => ov.querySelector('.tg-cancel').addEventListener('click', closeModal)
        });
    }
    GM_registerMenuCommand('🗂 삭제 기록 보기', showDeleteLog);

    /* =========================================================
     * [1] 입고 처리 목록: 일괄 삭제 이중확인
     * ========================================================= */
    let bypassBulk = false;
    function readRowInfo(tr) {
        const c = tr.cells;
        return {
            member: c[2]?.innerText.trim() || '',
            location: c[3]?.innerText.trim() || '',
            tracking: tr.querySelector('.show_tracking_page')?.dataset.trackingno || c[4]?.innerText.trim() || ''
        };
    }

    if (IS_TRACKING) {
        window.addEventListener('click', async (e) => {
            const btn = e.target.closest && e.target.closest('#btnDelete');
            if (!btn) return;
            if (bypassBulk) { bypassBulk = false; return; } // 확인 끝난 뒤의 재클릭은 사이트 원래 동작으로 통과

            const checked = [...document.querySelectorAll('.sub_checkbox:checked')];
            if (checked.length === 0) return; // 사이트가 "선택하세요" 안내

            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();

            const items = checked.map((cb) => readRowInfo(cb.closest('tr')));
            const allChecked = document.querySelector('.checkbox_all')?.checked;
            const rows = items.map((i) => `<tr><td>${esc(i.tracking)}</td><td>${esc(i.member)}</td><td><b>${esc(i.location)}</b></td></tr>`).join('');
            const bigWarn = (allChecked || items.length >= 5)
                ? `<div class="tg-warn">⚠ ${items.length}건이 한꺼번에 선택되어 있습니다.${allChecked ? ' (맨 위 전체선택 체크박스가 켜져 있음)' : ''}<br>정말 전부 지워도 되는지 한 번 더 확인하세요.</div>` : '';

            const ok = await confirmDelete({
                title: `🗑 입고 데이터 일괄 삭제 — ${items.length}건`,
                bodyHTML: `<div class="tg-warn">아래 입고 데이터가 삭제됩니다. 이 방법으로 지우면 입고 이력에 削除 기록이 남지 않을 수 있습니다.</div>
                    ${bigWarn}
                    <table><thead><tr><th>구분</th><th>Tracking No.</th><th>회원사</th><th>로케이션</th></tr></thead><tbody>${rows}</tbody></table>`,
                expected: items.length,
                hint: `삭제하려면 삭제할 건수 <b style="color:#ff3e1d;font-size:16px">${items.length}</b> 을(를) 입력하세요.`
            });
            if (!ok) return;

            addDeleteLog({ page: '입고 목록 · 일괄 삭제', items });
            bypassBulk = true;
            btn.click(); // 사이트 원래 일괄 삭제 실행 (사이트 확인창이 한 번 더 뜸)
        }, true);
    }

    /* =========================================================
     * [1-2] 입고창(Tracking No.입고 처리): 🗑 삭제 확인 + 스캔 기록 (v1.1.0)
     * ========================================================= */
    function readScanRow(tr) {
        const c = tr ? tr.cells : [];
        return {
            tracking: tr?.getAttribute('data-trackingno') || c[4]?.innerText.trim() || '',
            member: c[1]?.innerText.trim() || '',
            location: c[6]?.innerText.trim() || ''
        };
    }
    function recordSeen(info) {
        if (!info.tracking) return;
        const now = Date.now();
        const list = GM_getValue(KEY_SEEN, []).filter((x) => now - x.ts < SEEN_KEEP_MS);
        const k = norm(info.tracking) + '|' + info.location;
        if (list.some((x) => norm(x.tracking) + '|' + x.location === k)) return;
        list.unshift({ ...info, ts: now, at: nowStr(), admin: getAdminName() });
        GM_setValue(KEY_SEEN, list.slice(0, 3000));
    }

    if (IS_TRACKING) {
        // 입고창에 줄이 생길 때마다 기록
        const scanObs = () => {
            const tb = document.getElementById('scan-tbody');
            if (!tb) { setTimeout(scanObs, 1000); return; }
            const grab = () => tb.querySelectorAll('tr').forEach((tr) => recordSeen(readScanRow(tr)));
            grab();
            new MutationObserver(grab).observe(tb, { childList: true });
        };
        scanObs();

        // 입고창 🗑: 확인창 없이 삭제 내역만 기록 (사이트 기본 확인창은 그대로)
        window.addEventListener('click', (e) => {
            const btn = e.target.closest && e.target.closest('#scan-tbody .btn-delete');
            if (!btn) return;
            const tr = btn.closest('tr');
            const info = readScanRow(tr);
            // 먼저 기록해 두고(점검과 겹쳐도 "입고창에서 삭제"로 분류되도록), 실제로 안 지워졌으면 되돌림
            const stamp = Date.now();
            const del = GM_getValue(KEY_MODAL_DEL, []).filter((x) => stamp - x.ts < SEEN_KEEP_MS);
            del.unshift({ ...info, ts: stamp, at: nowStr(), admin: getAdminName() });
            GM_setValue(KEY_MODAL_DEL, del.slice(0, 2000));
            setTimeout(() => {
                if (tr && tr.isConnected) { // 취소했거나 실패 → 기록 되돌림
                    GM_setValue(KEY_MODAL_DEL, GM_getValue(KEY_MODAL_DEL, []).filter((x) => x.ts !== stamp));
                    return;
                }
                addDeleteLog({ page: '입고창 · 🗑 (입고 취소)', items: [info] });
            }, 5000);
        }, true);
    }

    /* =========================================================
     * [2] Location관리: 🗑 삭제 이중확인 + 업로드 확인
     * ========================================================= */
    if (IS_LOCATION) {
        window.addEventListener('click', async (e) => {
            const btn = e.target.closest && e.target.closest('button');
            if (!btn) return;

            // Excel 업로드
            if (btn.textContent.trim() === '업로드') {
                if (!confirm('⚠ 로케이션 Excel 업로드\n\n업로드하면 기존 로케이션과 입고 데이터의 연결이 바뀔 수 있습니다.\n파일 내용을 확인했나요?')) {
                    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
                } else {
                    addDeleteLog({ page: 'Location관리 · Excel 업로드', note: 'Excel 업로드 실행' });
                }
                return;
            }

            const onclick = btn.getAttribute('onclick') || '';
            const m = onclick.match(/delete-form-(\d+)/);
            if (!m) return;

            const tr = btn.closest('tr');
            const c = tr ? tr.cells : [];
            const info = {
                location: c[1]?.innerText.trim() || '',
                tracking: c[2]?.innerText.trim() || '',
                box: c[3]?.innerText.trim() || '',
                stockDate: c[5]?.innerText.trim() || ''
            };
            if (!info.tracking) return; // 빈 로케이션은 사이트 기본 확인창으로

            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();

            const last4 = norm(info.tracking).slice(-4);
            const ok = await confirmDelete({
                title: `🗑 로케이션 ${esc(info.location)} 삭제`,
                bodyHTML: `<div class="tg-warn">이 로케이션에는 입고된 짐이 있습니다. 삭제하면 입고 데이터가 함께 사라질 수 있고, 입고 이력에 削除 기록이 남지 않을 수 있습니다.</div>
                    <table><tbody>
                        <tr><th>로케이션</th><td><b>${esc(info.location)}</b></td></tr>
                        <tr><th>Tracking No.</th><td><b>${esc(info.tracking)}</b></td></tr>
                        <tr><th>박스 수</th><td>${esc(info.box)}</td></tr>
                        <tr><th>입고 일자</th><td>${esc(info.stockDate)}</td></tr>
                    </tbody></table>`,
                expected: last4,
                hint: `정말 삭제하려면 트래킹번호 <b>끝 4자리</b>(<b style="color:#ff3e1d;font-size:16px">${esc(last4)}</b>)를 입력하세요.`
            });
            if (!ok) return;

            addDeleteLog({ page: 'Location관리 · 🗑', items: [{ tracking: info.tracking, location: info.location, member: '' }] });
            document.getElementById(`delete-form-${m[1]}`)?.submit();
        }, true);
    }

    /* =========================================================
     * [3] 사라진 입고 탐지 (입고 처리 화면)
     * ========================================================= */
    async function fetchCurrentList() {
        const map = {};
        let total = null;
        let rowCount = 0; // [v1.1.3] 같은 트래킹이 여러 줄(박스 여러 개)일 수 있으므로 줄 수로 비교
        for (let page = 1; page <= 20; page++) {
            const html = await fetch(`/admin/store/trackingno?pagesize=1000&page=${page}`, { credentials: 'same-origin' }).then((r) => r.text());
            const doc = new DOMParser().parseFromString(html, 'text/html');
            if (total === null) {
                const t = (doc.body.innerText.match(/합계\s*[：:]\s*([\d,]+)/) || [])[1];
                total = t ? parseInt(t.replace(/,/g, ''), 10) : null;
            }
            const rows = [...doc.querySelectorAll('table tbody tr')].filter((tr) => tr.querySelector('.show_tracking_page'));
            rowCount += rows.length;
            rows.forEach((tr) => {
                const info = readRowInfo(tr);
                const date = (tr.cells[8]?.innerText.trim() || '').slice(0, 10);
                map[norm(info.tracking)] = { tracking: info.tracking, member: info.member, location: info.location, date };
            });
            if (rows.length < 1000) break;
        }
        const count = rowCount;
        return { map, complete: total === null || count >= total, total, count };
    }

    async function fetchLogs(tracking) {
        try {
            const r = await fetch('/admin/mgt/ajax_get_trackingno_log', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-CSRF-TOKEN': getCsrf(), 'X-Requested-With': 'XMLHttpRequest' },
                body: new URLSearchParams({ tracking_no: tracking })
            });
            const j = await r.json();
            return j && j.status === 'success' ? (j.logs || []) : null;
        } catch (err) { return null; }
    }

    /** 이력을 보고 "정상적으로 빠진 건"인지 판정. 마지막 이력(출고요청 제외)이 입고면 의심 */
    function judge(logs) {
        if (!logs || logs.length === 0) return { suspicious: false, reason: '이력 없음' };
        const sorted = [...logs].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        const last = sorted.find((l) => l.type !== '출고 요청');
        if (!last) return { suspicious: false, reason: '출고요청만 있음' };
        if (last.type === '입고') return { suspicious: true, last };
        return { suspicious: false, reason: last.type, last };
    }

    async function mapLimit(arr, limit, fn, onProgress) {
        const out = new Array(arr.length);
        let idx = 0, done = 0;
        const workers = Array.from({ length: Math.min(limit, arr.length) }, async () => {
            while (idx < arr.length) {
                const i = idx++;
                out[i] = await fn(arr[i]);
                done++;
                if (onProgress) onProgress(done, arr.length);
            }
        });
        await Promise.all(workers);
        return out;
    }

    /** 입고창 삭제 기록이 있으면 "입고창에서 삭제", 없으면 "기록 없이 사라짐" */
    function classify(item) {
        const del = GM_getValue(KEY_MODAL_DEL, []).find((x) => norm(x.tracking) === norm(item.tracking));
        if (del) return { ...item, kind: 'modal', note: `${del.at} ${del.admin} 입고창에서 삭제` };
        return { ...item, kind: 'unknown' };
    }
    const getMissing = () => GM_getValue(KEY_MISSING, []).map((x) => (x.kind === 'modal' ? x : classify(x)));
    const unknownCount = () => getMissing().filter((x) => x.kind !== 'modal').length;

    /** 입고창에서 스캔됐는데 지금 목록에 없는 건 점검 */
    async function checkSeen(curMap) {
        const now = Date.now();
        const seen = GM_getValue(KEY_SEEN, []).filter((x) => now - x.ts < SEEN_KEEP_MS);
        const byKey = new Map();
        seen.forEach((x) => { if (!curMap[norm(x.tracking)]) byKey.set(norm(x.tracking), x); });
        const results = await mapLimit([...byKey.values()], 4, async (x) => {
            const logs = await fetchLogs(x.tracking);
            const j = judge(logs);
            if (!j.suspicious) return null;
            return classify({
                tracking: x.tracking, member: x.member, location: j.last.location || x.location,
                inboundAt: j.last.created_at, inboundBy: j.last.admin_name || x.admin || '',
                foundAt: nowStr(), source: '입고창 스캔 기록'
            });
        });
        const found = results.filter(Boolean);
        if (found.length) saveMissing(found);
        return found;
    }

    function saveMissing(found) {
        const list = GM_getValue(KEY_MISSING, []);
        const keyOf = (x) => `${norm(x.tracking)}|${x.inboundAt}`;
        const existing = new Set(list.map(keyOf).concat(GM_getValue(KEY_DISMISSED, [])));
        found.forEach((f) => { if (!existing.has(keyOf(f))) list.unshift(f); });
        GM_setValue(KEY_MISSING, list.slice(0, 300));
        updateBadge();
    }

    /** 이전 스냅샷과 비교해서 사라진 건 확인 (자동 실행) */
    async function snapshotAndCompare(force) {
        const prev = GM_getValue(KEY_SNAPSHOT, null);
        const cur = await fetchCurrentList();
        if (!cur.complete) { console.warn('[입고보호] 목록을 전부 못 읽어서 비교를 건너뜀', cur); return []; }

        // 입고창 스캔 기록 점검은 화면을 열 때마다 (가벼움)
        let found = await checkSeen(cur.map);
        if (!force && prev && Date.now() - prev.ts < SNAPSHOT_INTERVAL_MS) return found;

        if (prev && prev.map) {
            const gone = Object.keys(prev.map).filter((k) => !cur.map[k]);
            const results = await mapLimit(gone, 4, async (k) => {
                const p = prev.map[k];
                const logs = await fetchLogs(p.tracking);
                const j = judge(logs);
                if (!j.suspicious) return null;
                // 같은 트래킹이 다시 입고되어 현재 목록에 있으면 제외 (위에서 이미 걸러짐)
                return classify({
                    tracking: p.tracking, member: p.member, location: j.last.location || p.location,
                    inboundAt: j.last.created_at, inboundBy: j.last.admin_name || '',
                    foundAt: nowStr(), source: '목록 비교'
                });
            });
            const f2 = results.filter(Boolean);
            if (f2.length) saveMissing(f2);
            found = found.concat(f2);
        }
        GM_setValue(KEY_SNAPSHOT, { ts: Date.now(), at: nowStr(), map: cur.map });
        return found;
    }

    /** 최근 N일 입고안내 메시지의 트래킹 중, 목록에 없고 이력상 마지막이 입고인 건 */
    async function checkByMessages(days, onStatus) {
        const since = new Date(Date.now() - days * 86400000);
        const sinceStr = since.toISOString().slice(0, 10);
        const trackings = new Map();
        for (let page = 1; page <= 30; page++) {
            onStatus(`입고안내 메시지 읽는 중... (${page}페이지)`);
            const html = await fetch(`/admin/message/index?pagesize=500&page=${page}`, { credentials: 'same-origin' }).then((r) => r.text());
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const rows = [...doc.querySelectorAll('table tbody tr')].map((tr) => tr.innerText.replace(/\s+/g, ' '));
            if (!rows.length) break;
            let older = false;
            rows.forEach((t) => {
                const d = (t.match(/(20\d\d-\d\d-\d\d) \d\d:\d\d/) || [])[1];
                if (d && d < sinceStr) { older = true; return; }
                const m = t.match(/TRACKING NO:\s*([A-Za-z0-9\-]+)/);
                if (m) trackings.set(norm(m[1]), m[1]);
            });
            if (older) break;
        }
        onStatus('현재 입고 목록 읽는 중...');
        const cur = await fetchCurrentList();
        const candidates = [...trackings.entries()].filter(([k]) => !cur.map[k]).map(([, v]) => v);
        const results = await mapLimit(candidates, 4, async (t) => {
            const logs = await fetchLogs(t);
            const j = judge(logs);
            if (!j.suspicious) return null;
            return classify({
                tracking: t, member: String(j.last.user_id || ''), location: j.last.location || '',
                inboundAt: j.last.created_at, inboundBy: j.last.admin_name || '',
                foundAt: nowStr(), source: `메시지 점검(${days}일)`
            });
        }, (d, n) => onStatus(`이력 확인 중... ${d}/${n}`));
        const found = results.filter(Boolean);
        if (found.length) saveMissing(found);
        return found;
    }

    function showMissing() {
        const list = getMissing();
        const prev = GM_getValue(KEY_SNAPSHOT, null);
        const rows = list.map((x, i) => `<tr style="${x.kind === 'modal' ? 'color:#777' : ''}">
                <td>${x.kind === 'modal'
                    ? `<span style="background:#9e9e9e;color:#fff;border-radius:4px;padding:1px 6px;font-size:12px">입고창에서 삭제</span><br><small>${esc(x.note || '')}</small>`
                    : '<span style="background:#ff3e1d;color:#fff;border-radius:4px;padding:1px 6px;font-size:12px">기록 없이 사라짐</span>'}</td>
                <td><b>${esc(x.tracking)}</b></td><td>${esc(x.member)}</td><td>${esc(x.location)}</td>
                <td style="white-space:nowrap">${esc(x.inboundAt)}<br><small>${esc(x.inboundBy)}</small></td>
                <td style="white-space:nowrap"><small>${esc(x.foundAt)}<br>${esc(x.source)}</small></td>
                <td><button class="tg-cancel tg-dismiss" data-i="${i}" style="padding:3px 8px">확인함</button></td></tr>`).join('');
        openModal({
            title: `🔍 사라진 입고 — 기록 없음 ${unknownCount()}건 / 입고창 삭제 ${list.length - unknownCount()}건`,
            color: '#1e5aa8',
            bodyHTML: `<div>입고 이력의 마지막이 「입고」인데 지금 입고 목록에 없는 건입니다. 포장·削除 기록이 있는 정상 건은 제외했습니다.<br>
                    <b>기록 없이 사라짐</b>: 실물 위치를 확인하고, 필요하면 다시 입고하세요.<br>
                    <b>입고창에서 삭제</b>: 입고창에서 입고를 취소한 건입니다. 라벨 로케이션에 짐·라벨이 남아 있지 않은지 확인하세요.<br>
                    확인이 끝나면 「확인함」을 눌러 목록에서 지우세요.</div>
                    <div style="margin-top:6px;color:#777;font-size:12px">마지막 목록 저장: ${esc(prev ? prev.at : '없음')} (30분 간격으로 입고 화면을 열 때 자동 비교)</div>
                    ${list.length ? `<table><thead><tr><th>Tracking No.</th><th>회원사</th><th>로케이션</th><th>입고 일시/작업자</th><th>발견</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<div style="margin-top:10px">현재 의심 건이 없습니다.</div>'}
                    <div id="tg-status" style="margin-top:10px;color:#1e5aa8;font-weight:700"></div>`,
            footHTML: `<span style="margin-right:auto;font-size:13px">과거 점검: 최근 <input id="tg-days" type="number" value="14" min="1" max="60" style="width:55px"> 일</span>
                    <button class="tg-blue" id="tg-run">지금 점검</button><button class="tg-cancel" id="tg-close">닫기</button>`,
            onMount: (ov) => {
                ov.querySelector('#tg-close').addEventListener('click', closeModal);
                ov.querySelectorAll('.tg-dismiss').forEach((b) => b.addEventListener('click', () => {
                    const l = GM_getValue(KEY_MISSING, []);
                    const [gone] = l.splice(parseInt(b.dataset.i, 10), 1);
                    if (gone) {
                        const dis = GM_getValue(KEY_DISMISSED, []);
                        dis.unshift(`${norm(gone.tracking)}|${gone.inboundAt}`);
                        GM_setValue(KEY_DISMISSED, dis.slice(0, 2000));
                    }
                    GM_setValue(KEY_MISSING, l);
                    updateBadge();
                    showMissing();
                }));
                ov.querySelector('#tg-run').addEventListener('click', async (ev) => {
                    const btn = ev.currentTarget;
                    const status = ov.querySelector('#tg-status');
                    const days = Math.max(1, Math.min(60, parseInt(ov.querySelector('#tg-days').value, 10) || 14));
                    btn.disabled = true;
                    try {
                        status.textContent = '목록 비교 중...';
                        await snapshotAndCompare(true);
                        await checkByMessages(days, (s) => { status.textContent = s; });
                        showMissing();
                    } catch (err) {
                        status.textContent = '점검 중 오류: ' + err.message;
                        btn.disabled = false;
                    }
                });
            }
        });
    }
    GM_registerMenuCommand('🔍 사라진 입고 확인', () => IS_TRACKING ? showMissing() : alert('입고 처리 화면에서 실행하세요.'));

    function updateBadge() {
        const b = document.getElementById('tm-guard-missing-btn');
        if (!b) return;
        const n = unknownCount();
        const m = GM_getValue(KEY_MISSING, []).length - n;
        b.innerHTML = `🔍 사라진 입고 확인${n ? `<span class="tm-guard-badge">${n}</span>` : ''}${m ? `<span class="tm-guard-badge" style="background:#9e9e9e">${m}</span>` : ''}`;
        b.className = `btn btn-sm waves-effect tm-guard-btn ${n ? 'btn-warning' : 'btn-outline-secondary'}`;
    }

    /* ---------------- 버튼 배치 ---------------- */
    function addButtons() {
        injectStyle();
        if (IS_TRACKING) {
            const del = document.getElementById('btnDelete');
            if (!del || document.getElementById('tm-guard-log-btn')) return;
            const logBtn = document.createElement('button');
            logBtn.type = 'button';
            logBtn.id = 'tm-guard-log-btn';
            logBtn.className = 'btn btn-outline-secondary btn-sm waves-effect tm-guard-btn';
            logBtn.textContent = '🗂 삭제 기록';
            logBtn.addEventListener('click', showDeleteLog);
            const missBtn = document.createElement('button');
            missBtn.type = 'button';
            missBtn.id = 'tm-guard-missing-btn';
            missBtn.addEventListener('click', showMissing);
            del.insertAdjacentElement('afterend', logBtn);
            logBtn.insertAdjacentElement('afterend', missBtn);
            updateBadge();
        }
        if (IS_LOCATION) {
            if (document.getElementById('tm-guard-log-btn')) return;
            const logBtn = document.createElement('button');
            logBtn.type = 'button';
            logBtn.id = 'tm-guard-log-btn';
            logBtn.className = 'btn btn-outline-secondary btn-sm';
            logBtn.style.cssText = 'position:fixed;right:20px;bottom:90px;z-index:9999;background:#fff;';
            logBtn.textContent = '🗂 삭제 기록';
            logBtn.addEventListener('click', showDeleteLog);
            document.body.appendChild(logBtn);
        }
    }

    addButtons();
    if (IS_TRACKING) {
        // 입고 화면을 열 때마다(30분 간격) 자동으로 목록 저장 + 비교
        setTimeout(() => {
            const before = unknownCount();
            snapshotAndCompare(false).then(() => {
                updateBadge();
                const added = unknownCount() - before; // 새로 발견된 건만 알림 (같은 건 반복 알림 방지)
                if (added > 0) {
                    alert(`⚠ 삭제 기록 없이 사라진 입고가 ${added}건 새로 발견되었습니다.\n「🔍 사라진 입고 확인」 버튼에서 확인하세요.`);
                }
            }).catch((err) => console.warn('[입고보호] 자동 비교 실패', err));
        }, 3000);
    }
})();
