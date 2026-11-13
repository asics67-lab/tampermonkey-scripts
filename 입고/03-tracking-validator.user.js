// ==UserScript==
// @name         [입고] 송장번호 검증 (잘못된 바코드 입고 방지)
// @namespace    https://github.com/asics67-lab/tampermonkey-scripts
// @version      1.0.0
// @description  입고창에서 스캔한 값이 선택한 배송회사의 송장번호 형식과 맞지 않으면 입고를 막고 경고. 같은 값을 한 번 더 스캔하면 그대로 입고.
// @author       물류팀
// @match        https://platform.aispel.com/admin/store/trackingno*
// @match        https://www.platform.co.jp/admin/store/trackingno*
// @match        https://platform.co.jp/admin/store/trackingno*
// @updateURL    https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/입고/03-tracking-validator.user.js
// @downloadURL  https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/입고/03-tracking-validator.user.js
// @grant        none
// @run-at       document-start
// ==/UserScript==

/*
 * ============================================================
 *  송장번호 검증 규칙 (2026-11-13, 실제 입고 데이터 260건으로 확인)
 *  - 입고창(#storeModal)의 스캔칸(#scan_tracking_no)에서 Enter(스캐너 입력)가 들어오면,
 *    01-tracking-modal 스크립트보다 먼저 값을 검사합니다.
 *  - 형식이 맞으면 → 아무것도 하지 않고 기존대로 입고.
 *  - 형식이 틀리면 → 입고를 막고 빨간 경고 + 경고음.
 *    같은 값을 60초 안에 한 번 더 스캔(입력 후 Enter)하면 → 확인한 것으로 보고 그대로 입고.
 *    (송장이 아닌 값을 일부러 입력하는 경우, 특이한 송장인 경우에 사용)
 *
 *  배송회사별 규칙 (체크디지트 = 마지막 자리가 "나머지 자리 ÷ 7의 나머지"와 같은지)
 *   1 Yamato / 2 Sagawa / 3 Japan Post / 8 ecohai / 9 yomiuri
 *       : 숫자 12자리 + 체크디지트 일치  (Japan Post는 숫자 11자리도 허용)
 *   4 Seino    : 숫자 10~11자리
 *   5 Fukuyama : 숫자 11자리 (스캔 값이 더 길면 앞 11자리만 사용 — 01 스크립트와 동일)
 *                ※ 체크디지트가 맞지 않는 예외 번호가 있어 자릿수만 검사
 *   7 Amazon   : DA + 숫자 10자리
 *   그 외 회사 : 숫자 6~14자리
 *   배송회사를 선택하지 않은 경우 : 검사하지 않음 (사이트 자체 안내에 맡김)
 * ============================================================
 */

(function () {
    'use strict';

    const CONFIRM_WINDOW_MS = 60 * 1000; // 같은 값 재스캔 인정 시간
    const COMPANY_NAMES = {
        '1': 'Yamato', '2': 'Sagawa', '3': 'Japan Post', '4': 'Seino', '5': 'Fukuyama',
        '6': 'pickgo', '7': 'Amazon', '8': 'ecohai', '9': 'yomiuri'
    };

    /* ---------------- 검증 로직 ---------------- */
    function normalize(raw) {
        return String(raw || '')
            .replace(/[０-９Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)) // 전각 → 반각
            .replace(/[\s\-‐－ー]/g, '')
            .toUpperCase();
    }
    function mod7ok(n) {
        if (!/^\d{2,}$/.test(n)) return false;
        let r = 0;
        const body = n.slice(0, -1);
        for (const ch of body) r = (r * 10 + (ch.charCodeAt(0) - 48)) % 7;
        return r === Number(n.slice(-1));
    }
    const is12Mod7 = n => /^\d{12}$/.test(n) && mod7ok(n);

    // 값만 보고 어느 택배사 송장처럼 보이는지 추정 (경고 문구용)
    function guessCarrier(v) {
        if (/^DA\d{10}$/.test(v)) return 'Amazon';
        if (is12Mod7(v)) return 'Yamato·Sagawa·Japan Post 등 (12자리)';
        return '';
    }

    /** @returns {{ok:boolean, reason?:string}} */
    function validateTracking(companyId, raw) {
        const id = String(companyId || '');
        if (!id) return { ok: true };
        let v = normalize(raw);
        if (id === '5' && /^\d{12,}$/.test(v)) v = v.substring(0, 11);
        if (!v) return { ok: true };

        let ok;
        let expect;
        switch (id) {
            case '1': case '2': case '8': case '9':
                ok = is12Mod7(v); expect = '숫자 12자리'; break;
            case '3':
                ok = is12Mod7(v) || /^\d{11}$/.test(v); expect = '숫자 11~12자리'; break;
            case '4':
                ok = /^\d{10,11}$/.test(v); expect = '숫자 10~11자리'; break;
            case '5':
                ok = /^\d{11}$/.test(v); expect = '숫자 11자리'; break;
            case '7':
                ok = /^DA\d{10}$/.test(v); expect = 'DA + 숫자 10자리'; break;
            default:
                ok = /^\d{6,14}$/.test(v); expect = '숫자 6~14자리'; break;
        }
        if (ok) return { ok: true };

        const companyName = COMPANY_NAMES[id] || ('배송회사 ' + id);
        let reason;
        if (/^\d{13}$/.test(v) && /^4[59]/.test(v)) {
            reason = '상품 JAN코드(13자리)를 스캔한 것 같습니다.';
        } else if (/^\d{12}$/.test(v) && ['1', '2', '3', '8', '9'].includes(id)) {
            reason = '12자리지만 송장번호 규칙(체크디지트)에 맞지 않습니다.\n상품 바코드 등 다른 바코드일 수 있습니다.';
        } else {
            const g = guessCarrier(v);
            reason = g
                ? `선택한 배송회사(${companyName})의 송장 형식이 아닙니다.\n${g} 송장으로 보입니다. 배송회사 선택을 확인하세요.`
                : `${companyName} 송장 형식(${expect})이 아닙니다.`;
        }
        return { ok: false, reason, value: v };
    }

    // Node 테스트용
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { validateTracking, normalize, mod7ok };
        return;
    }

    /* ---------------- 화면 처리 ---------------- */
    let pendingValue = '';
    let pendingAt = 0;
    let overlayTimer = null;

    function beep() {
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            const ctx = new Ctx();
            [0, 0.25, 0.5].forEach(t => {
                const o = ctx.createOscillator();
                const g = ctx.createGain();
                o.type = 'square';
                o.frequency.value = 880;
                g.gain.value = 0.15;
                o.connect(g); g.connect(ctx.destination);
                o.start(ctx.currentTime + t);
                o.stop(ctx.currentTime + t + 0.18);
            });
            setTimeout(() => { try { ctx.close(); } catch (e) {} }, 1200);
        } catch (e) {}
    }

    function hideOverlay() {
        const el = document.getElementById('tm-trk-validator-overlay');
        if (el) el.remove();
        if (overlayTimer) { clearTimeout(overlayTimer); overlayTimer = null; }
    }

    function showOverlay(kind, title, body, scanned) {
        hideOverlay();
        const el = document.createElement('div');
        el.id = 'tm-trk-validator-overlay';
        const bg = kind === 'error' ? 'rgba(200,0,0,0.93)' : 'rgba(230,140,0,0.93)';
        el.style.cssText = `position:fixed;inset:0;z-index:2147483647;background:${bg};color:#fff;` +
            'display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;' +
            'font-family:sans-serif;pointer-events:none;padding:40px;';
        const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        el.innerHTML =
            `<div style="font-size:64px;font-weight:900;margin-bottom:20px;">${esc(title)}</div>` +
            `<div style="font-size:30px;font-weight:700;background:rgba(0,0,0,0.25);padding:10px 24px;border-radius:8px;margin-bottom:24px;word-break:break-all;">${esc(scanned)}</div>` +
            `<div style="font-size:28px;line-height:1.5;white-space:pre-line;">${esc(body)}</div>`;
        document.body.appendChild(el);
        overlayTimer = setTimeout(hideOverlay, kind === 'error' ? 5000 : 1500);
    }

    function isStoreModalOpen() {
        return !!document.querySelector('.modal.show, .modal[style*="display: block"]');
    }

    // window 캡처 단계에 등록 → 01-tracking-modal(document 캡처)보다 먼저 실행됨
    window.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter') return;
        const input = document.getElementById('scan_tracking_no');
        if (!input || document.activeElement !== input || !isStoreModalOpen()) return;

        const raw = String(input.value || '').trim();
        if (!raw) return;
        const sel = document.getElementById('modal_delivery_company');
        const companyId = sel ? sel.value : '';

        const result = validateTracking(companyId, raw);
        if (result.ok) { pendingValue = ''; return; }

        const key = normalize(raw);
        if (pendingValue === key && Date.now() - pendingAt < CONFIRM_WINDOW_MS) {
            // 같은 값을 다시 스캔 → 확인한 것으로 보고 통과
            pendingValue = '';
            console.log('[송장검증] 재스캔 확인으로 입고 진행:', raw, result.reason);
            showOverlay('confirm', '확인 입고', '같은 값을 다시 스캔해서 그대로 입고합니다.', raw);
            return;
        }

        // 입고 차단
        event.preventDefault();
        event.stopImmediatePropagation();
        pendingValue = key;
        pendingAt = Date.now();
        console.warn('[송장검증] 입고 차단:', raw, result.reason);
        beep();
        showOverlay('error', '⛔ 입고 중지',
            result.reason + '\n\n송장 바코드를 다시 스캔하세요.\n(이 값이 맞다면 같은 값을 한 번 더 스캔하면 입고됩니다)', raw);
        input.value = '';
        input.focus();
    }, true);

    // 다른 키를 누르면 경고 화면 닫기
    window.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && document.getElementById('tm-trk-validator-overlay')) hideOverlay();
    }, true);
})();
