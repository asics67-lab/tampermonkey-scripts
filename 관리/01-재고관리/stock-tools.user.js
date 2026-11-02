// ==UserScript==
// @name         [관리] 재고관리 통합 도구 (통관방식조회 + 다나오로시 + FL로케이션현황)
// @namespace    https://github.com/asics67-lab/tampermonkey-scripts
// @version      1.6.0
// @description  재고관리(settlement/stock) 및 로케이션 조회 화면 통합본. 원본: 재고관리 통관방식 조회 v6.0(구글시트 공유) + 구매대행 다나오로시 출력본 v24.1(엑셀 합산/구분선 버그 수정) + FL 로케이션 사용 현황 v11.5
// @author       물류팀
// @match        https://www.platform.co.jp/admin/settlement/stock*
// @match        https://platform.co.jp/admin/settlement/stock*
// @match        https://www.platform.co.jp/admin/store/location-jan*
// @match        https://platform.co.jp/admin/store/location-jan*
// @match        https://www.platform.co.jp/admin/store/location-tracking*
// @match        https://platform.co.jp/admin/store/location-tracking*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      www.platform.co.jp
// @connect      platform.co.jp
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @updateURL    https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/관리/01-재고관리/stock-tools.user.js
// @downloadURL  https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/관리/01-재고관리/stock-tools.user.js
// ==/UserScript==
// [www 없는 주소 대응] platform.co.jp(www 없이) 로 접속해도 동작하도록 @match 추가, 사이트 내부 요청 주소를 현재 접속 주소 기준(location.origin)으로 변경

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
 *
 *  v1.2.0 수정 사항
 *  - v1.1.0으로도 같은 증상이 재현되어 재조사한 결과, 진짜 원인은 따로 있었음.
 *    원본 사이트의 로케이션 텍스트가 "G1-2-1 : 10개"처럼 콜론 뒤에 부가정보가 붙어서
 *    넘어오는 경우가 있어, 같은 자리(G1-2-1)인데도 뒤에 붙은 숫자가 다르면 문자열
 *    자체가 달라져 병합/구분선 판정에서 서로 다른 위치로 인식됐음.
 *    이제 로케이션 값을 저장할 때 콜론(:) 뒤는 잘라내고 순수 로케이션 코드만
 *    기준으로 쓰도록 수정하여, 진짜 같은 자리면 항상 합쳐지고 구분선도 로케이션이
 *    실제로 바뀔 때만 그어지도록 함.
 *
 *  v1.3.0 수정 사항 ([블록 2] 다나오로시만 수정, 블록 1·3은 변경 없음)
 *  1) 엑셀에서 로케이션이 날짜로 바뀌는 문제 수정
 *     - "H1-1-1"이 일본어 엑셀에서 平成1年1月1日(=S64.1.1)로 자동 변환되던 문제.
 *       로케이션·회원사명·상품명 칸에도 JAN 칸과 같은 문자열 서식(mso-number-format:'\@', x:str) 적용.
 *  2) 합쳐진 줄의 고객별 내역 표시
 *     - 같은 로케이션+JAN 합산 방식은 그대로 두고, 회원사명 칸에 "고객명 수량"을
 *       수량 많은 순으로 줄바꿈해서 모두 표시 (화면·인쇄·엑셀 동일). 고객 1명이면 고객명만.
 *  3) 출력 시각 기록
 *     - 화면 제목 아래·인쇄물 상단·엑셀 첫 줄에 "데이터 수집 시각: YYYY-MM-DD HH:mm:ss" 표시
 *       (다운로드 시점이 아니라 전체 페이지 수집을 끝낸 시점, 일본 시간).
 *     - 파일명: 다나오로시_전체재고통합_YYYY-MM-DD_HHmm.xls / 선택구역 파일도 동일하게 시각 추가.
 *     - toISOString()(UTC) 대신 일본 시간 기준으로 날짜 계산.
 *  4) 페이지 수집 실패 경고
 *     - 실패한 페이지는 2회까지 재시도, 그래도 실패하면 alert + 화면/인쇄/엑셀 상단에
 *       빨간 경고("N페이지 수집 실패 - 시트가 불완전합니다") 표시.
 *     - 수집 행 수와 화면의 "합계：N건"이 다르면 경고 표시.
 *     - 로케이션 없는 행만 있는 페이지에서 수집이 중간에 멈추던 문제도 함께 수정.
 *  5) 검색 조건이 걸린 상태로 실행 시 확인창
 *     - URL에 검색/필터 조건이 있으면 "전체 재고로 출력할까요?" 확인.
 *       [확인] 조건을 빼고 전체 수집 / [취소] 현재 조건 그대로 수집(상단에 조건 안내 표시).
 *  6) 비고 칸에 발송 대기 수량 자동 표시
 *     - "종류"가 발송 대기 재고인 수량을 합쳐 "발송대기 N"으로 비고 칸 위쪽에 표시
 *       (아래쪽은 실사 메모 공간으로 남김, 비고 칸 폭 8% → 10%).
 *
 *  v1.4.0 수정 사항 ([블록 1] 통관방식 조회만 수정, 블록 2·3은 변경 없음)
 *  1) 같은 기본 JAN(-1, -A, -H 등)은 검색 1번으로 한꺼번에 처리 → 검색 횟수 대폭 감소
 *  2) '미정' 상품을 매번 2번씩 조회하던 재시도 제거 (네트워크 오류·시간초과일 때만 재시도)
 *  3) 동시 조회 3개 → 6개
 *  4) 확정 결과(사업자/개인)를 PC에 12시간 저장 → 다음 페이지·새로고침 시 버튼 안 눌러도 즉시 표시
 *     Shift + 버튼 클릭 = 저장된 결과 지우고 새로 조회
 *  5) 완료 시 버튼에 걸린 시간(초) 표시
 *
 *  v1.5.0 수정 사항 ([블록 1] 통관방식 조회만 수정)
 *  1) 조회 결과 저장 기간 12시간 → 30일 (통관방식은 입고 때 정해지면 거의 안 바뀜)
 *  2) [통관 방식 조회]는 아직 모르는 JAN만 조회 → 대부분 즉시 표시
 *  3) [전체 미리 조회] 버튼 추가: 재고관리 전체 페이지의 JAN을 모아 모르는 것만 미리 조회
 *     중간에 멈춰도 진행분은 저장되고, 다시 누르면 남은 것만 이어서 조회
 *  4) Shift + [통관 방식 조회]는 이제 "현재 화면의 JAN만" 새로 조회 (전체 저장분은 유지)
 *
 *  v1.6.0 수정 사항 ([블록 1] 통관방식 조회만 수정)
 *  1) 조회 결과를 구글 시트("통관방식 공유")에 함께 저장 → 누가 조회하든 모든 PC가 같이 빨라짐
 *  2) 화면을 열 때 구글 시트 결과를 먼저 받아와 표시 (5분마다 갱신)
 *  3) 공유 주소는 PC마다 처음 한 번 입력 (Tampermonkey 메뉴 "통관방식 공유 시트 주소 설정"으로 변경 가능)
 *     공유 주소를 입력하지 않으면 예전처럼 그 PC에만 저장
 * ============================================================
 */

/* ------------------------------------------------------------
 * [블록 1] 재고관리 통관방식 조회 (구글시트 공유형) v6.0
 *  - 조회 결과를 구글 시트에 함께 저장 → 한 사람이 조회하면 모든 PC에서 즉시 표시
 *  - 통관방식은 입고 때 정해지면 거의 바뀌지 않으므로, 한 번 조회한 결과를 PC에 30일 저장
 *  - [통관 방식 조회] : 현재 화면에서 "아직 모르는 JAN"만 조회 → 대부분 즉시 표시
 *  - [전체 미리 조회] : 재고관리 전체 페이지의 JAN을 모아 모르는 것만 미리 조회 (퇴근 전 1회 권장)
 *  - Shift + [통관 방식 조회] : 현재 화면 JAN만 저장 결과 무시하고 새로 조회 (통관방식 수정 시)
 *  - 같은 기본 JAN(-1, -A, -H 등)은 검색 1번으로 처리, 동시 조회 6개
 * ------------------------------------------------------------ */
(function () {
    'use strict';

    const CONCURRENCY = 6;
    const CACHE_KEY = 'clearanceCache_v1';
    const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30일
    const memCache = new Map();             // janCode -> status (이번 화면에서만, 미정 포함)
    let diskCache = loadDiskCache();        // janCode -> { s: status, t: 저장시각 }
    let busy = false;

    function loadDiskCache() {
        try {
            const raw = GM_getValue(CACHE_KEY, '{}');
            const obj = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
            const now = Date.now();
            for (const k of Object.keys(obj)) {
                if (!obj[k] || now - obj[k].t > CACHE_TTL) delete obj[k];
            }
            return obj;
        } catch (e) {
            return {};
        }
    }

    function saveDiskCache() {
        try { GM_setValue(CACHE_KEY, JSON.stringify(diskCache)); } catch (e) {}
    }

    function getCached(janCode) {
        if (memCache.has(janCode)) return memCache.get(janCode);
        const d = diskCache[janCode];
        if (d && Date.now() - d.t <= CACHE_TTL) return d.s;
        return null;
    }

    function setCached(janCode, status) {
        memCache.set(janCode, status);
        // 확정된 결과(사업자/개인)만 PC에 저장. 미정·오류는 다음에 다시 조회
        if (status.includes('사업자') || status.includes('개인')) {
            const t = Date.now();
            diskCache[janCode] = { s: status, t: t };
            pendingPush.set(janCode, { jan: janCode, s: status, t: t });
        }
    }

    function forget(janCode) {
        memCache.delete(janCode);
        delete diskCache[janCode];
    }

    /* ---------- 구글 시트 공유 저장소 ---------- */
    const SHARE_URL_KEY = 'clearanceShareUrl';
    const SHARE_PULL_KEY = 'clearanceSharePulledAt';
    const PULL_INTERVAL = 5 * 60 * 1000; // 5분
    const pendingPush = new Map();       // janCode -> { jan, s, t }

    function getShareUrl() {
        return GM_getValue(SHARE_URL_KEY, '') || '';
    }

    function askShareUrl() {
        const cur = getShareUrl();
        const v = prompt(
            '통관방식 공유 시트 주소를 붙여 넣어 주세요.\n' +
            '(https://script.google.com/macros/s/.../exec?key=... 형태)\n\n' +
            '비워 두고 확인을 누르면 공유 없이 이 PC에만 저장합니다.', cur);
        if (v === null) return cur;
        const url = v.trim();
        if (url && !/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec\?key=.+/.test(url)) {
            alert('주소 형식이 맞지 않습니다. 웹 앱 URL 뒤에 ?key=... 가 붙어 있는지 확인해 주세요.');
            return cur;
        }
        GM_setValue(SHARE_URL_KEY, url);
        GM_setValue(SHARE_PULL_KEY, 0);
        return url;
    }

    // 처음 한 번만 물어봄 (취소/빈칸이면 '-'로 기록해 다시 묻지 않음)
    function ensureShareUrl() {
        const cur = getShareUrl();
        if (cur) return cur === '-' ? '' : cur;
        const url = askShareUrl();
        if (!url) GM_setValue(SHARE_URL_KEY, '-');
        return url;
    }

    function shareRequest(method, payload) {
        const url = getShareUrl();
        if (!url || url === '-') return Promise.resolve(null);
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: method,
                url: url,
                timeout: 60000,
                headers: method === 'POST' ? { 'Content-Type': 'text/plain;charset=utf-8' } : {},
                data: payload ? JSON.stringify(payload) : undefined,
                onload: r => {
                    try {
                        const j = JSON.parse(r.responseText);
                        if (!j.ok) console.warn('[통관조회] 공유 시트 응답 오류', j);
                        resolve(j.ok ? j : null);
                    } catch (e) {
                        console.warn('[통관조회] 공유 시트 응답을 읽지 못함 (웹 앱 배포/권한 확인)', r.status);
                        resolve(null);
                    }
                },
                onerror: () => resolve(null),
                ontimeout: () => resolve(null)
            });
        });
    }

    // 구글 시트 → 이 PC (더 최신인 것만 반영)
    async function pullShared(force) {
        const last = Number(GM_getValue(SHARE_PULL_KEY, 0)) || 0;
        if (!force && Date.now() - last < PULL_INTERVAL) return 0;
        const j = await shareRequest('GET');
        if (!j || !j.data) return 0;
        let merged = 0;
        const now = Date.now();
        Object.keys(j.data).forEach(jan => {
            const [st, t] = j.data[jan];
            if (!st || now - t > CACHE_TTL) return;
            const local = diskCache[jan];
            if (!local || local.t < t) {
                diskCache[jan] = { s: st, t: t };
                memCache.delete(jan);
                merged++;
            }
        });
        GM_setValue(SHARE_PULL_KEY, now);
        saveDiskCache();
        console.log(`[통관조회] 공유 시트에서 ${Object.keys(j.data).length}건 받음 (새로 반영 ${merged}건)`);
        return merged;
    }

    // 이 PC → 구글 시트 (새로 조회한 확정 결과만, 300건씩)
    async function pushShared() {
        if (!pendingPush.size) return;
        const items = Array.from(pendingPush.values());
        pendingPush.clear();
        for (let i = 0; i < items.length; i += 300) {
            const chunk = items.slice(i, i + 300);
            const j = await shareRequest('POST', { items: chunk });
            if (!j) {
                // 실패분은 다음 기회에 다시 올림
                chunk.forEach(it => pendingPush.set(it.jan, it));
            }
        }
    }

    function findJanTable(root) {
        for (const table of root.querySelectorAll('table')) {
            for (const th of table.querySelectorAll('thead th')) {
                if (th.textContent.trim() === 'JAN CODE') return table;
            }
        }
        return null;
    }

    function getStockTable() {
        return findJanTable(document);
    }

    function getJanIndex(table) {
        let janIndex = -1;
        table.querySelectorAll('thead th').forEach((th, index) => {
            if (th.textContent.trim() === 'JAN CODE') janIndex = index;
        });
        return janIndex;
    }

    function makeButton(id, html, title) {
        const b = document.createElement('button');
        b.id = id;
        b.type = 'button';
        b.className = 'btn btn-primary btn-sm waves-effect flex-fill flex-sm-grow-0 ms-2';
        if (title) b.title = title;
        b.innerHTML = html;
        return b;
    }

    function cacheCountLabel() {
        return Object.keys(diskCache).length.toLocaleString();
    }

    function init() {
        const table = getStockTable();
        if (!table) return;

        const headers = table.querySelectorAll('thead th');
        const janIndex = getJanIndex(table);
        if (janIndex === -1) return;

        if (!table.querySelector('.custom-clearance-header')) {
            const janHeader = headers[janIndex];
            const th = document.createElement('th');
            th.className = 'text-nowrap custom-clearance-header';
            th.textContent = '통관 방식';
            janHeader.parentNode.insertBefore(th, janHeader.nextSibling);
        }

        table.querySelectorAll('tbody tr').forEach(row => {
            if (row.querySelector('.clearance-status-td')) return;
            const cells = row.querySelectorAll('td');
            if (cells.length <= janIndex) return;

            const janCell = cells[janIndex];
            const td = document.createElement('td');
            td.className = 'clearance-status-td';
            // 저장된 결과가 있으면 버튼 누르기 전에 바로 표시
            const cached = getCached(janCell.textContent.trim());
            if (cached) {
                renderStatus(td, cached);
            } else {
                td.innerHTML = '<small class="text-muted">-</small>';
            }
            janCell.parentNode.insertBefore(td, janCell.nextSibling);
        });

        const excelBtn = document.getElementById('download-excel-btn');
        if (!excelBtn) {
            console.log('[통관조회] Excel 버튼을 찾지 못함');
            return;
        }
        if (document.getElementById('fetch-clearance-btn')) return;

        const button = makeButton('fetch-clearance-btn',
            '<i class="ti ti-scan me-1"></i>통관 방식 조회',
            '아직 모르는 JAN만 조회합니다. Shift를 누른 채 클릭하면 이 화면의 JAN을 새로 조회합니다');
        const preBtn = makeButton('prefetch-clearance-btn',
            `<i class="ti ti-database me-1"></i>전체 미리 조회 (저장 ${cacheCountLabel()}건)`,
            '재고관리 전체 페이지의 JAN 중 아직 모르는 것만 미리 조회해 저장합니다 (퇴근 전 1회 권장)');
        preBtn.classList.replace('btn-primary', 'btn-outline-primary');

        excelBtn.parentNode.appendChild(button);
        excelBtn.parentNode.appendChild(preBtn);
        button.addEventListener('click', e => startFetching(e.shiftKey));
        preBtn.addEventListener('click', prefetchAll);
        console.log('[통관조회] 버튼 생성 완료');
    }

    // 검색 결과 페이지 1장에서 "JAN → 통관방식" 전부 뽑기
    function parseResultPage(html) {
        const result = new Map();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        doc.querySelectorAll('table tbody tr').forEach(row => {
            const tds = row.querySelectorAll('td');
            if (tds.length < 7) return;
            const jan = row.querySelector('td:nth-child(4)')?.textContent.trim();
            if (!jan || result.has(jan)) return;
            let status = '';
            tds.forEach(td => {
                const text = td.textContent.trim();
                if (text.includes('통관')) status = text;
            });
            result.set(jan, status || '미정');
        });
        return result;
    }

    function requestUrl(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                timeout: 60000,
                onload: r => (r.status >= 200 && r.status < 400) ? resolve(r.responseText) : reject(new Error('HTTP ' + r.status)),
                onerror: () => reject(new Error('network')),
                ontimeout: () => reject(new Error('timeout'))
            });
        });
    }

    // 네트워크 오류·시간초과일 때만 1번 재시도
    async function searchKeyword(keyword) {
        const url = location.origin + '/admin/store/jancode?target=2&keyword=' + encodeURIComponent(keyword);
        try {
            return parseResultPage(await requestUrl(url));
        } catch (e) {
            await new Promise(r => setTimeout(r, 500));
            try {
                return parseResultPage(await requestUrl(url));
            } catch (e2) {
                return e2.message === 'timeout' ? '시간초과' : '실패';
            }
        }
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
            while (index < items.length) {
                await worker(items[index++]);
            }
        }
        const workers = [];
        for (let i = 0; i < Math.min(workerCount, items.length); i++) workers.push(workerLoop());
        await Promise.all(workers);
    }

    // 모르는 JAN 목록을 기본 JAN 단위로 묶어서 조회. onResult(janCode, status), onProgress(done, total)
    async function lookupJans(janCodes, onResult, onProgress) {
        const groups = new Map();
        janCodes.forEach(janCode => {
            const base = janCode.split(/[- ]+/)[0];
            if (!base) { onResult(janCode, '무효'); return; }
            if (!groups.has(base)) groups.set(base, []);
            groups.get(base).push(janCode);
        });

        const bases = Array.from(groups.keys());
        let done = 0;
        onProgress(0, bases.length);

        await runQueue(bases, CONCURRENCY, async function (base) {
            const found = await searchKeyword(base);
            for (const janCode of groups.get(base)) {
                let status;
                if (typeof found === 'string') {
                    status = found; // 실패/시간초과
                } else if (found.has(janCode)) {
                    status = found.get(janCode);
                } else if (janCode !== base) {
                    // 기본 JAN 검색 결과(1페이지)에 없는 변형 JAN만 개별 검색
                    const single = await searchKeyword(janCode);
                    status = typeof single === 'string' ? single : (single.get(janCode) || '미정');
                } else {
                    status = '미정';
                }
                setCached(janCode, status);
                onResult(janCode, status);
            }
            done++;
            onProgress(done, bases.length);
            if (done % 50 === 0) {           // 중간에 창을 닫아도 진행분은 남도록
                saveDiskCache();
                pushShared();
            }
        });

        saveDiskCache();
        await pushShared();
        return bases.length;
    }

    async function startFetching(forceRefresh) {
        if (busy) return;
        const button = document.getElementById('fetch-clearance-btn');
        const table = getStockTable();
        if (!table) return;
        const janIndex = getJanIndex(table);
        if (janIndex === -1) return;

        busy = true;
        if (button) {
            button.disabled = true;
            button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>공유 시트 확인 중...';
        }
        ensureShareUrl();
        await pullShared(false);

        // JAN → 표시할 칸들
        const janMap = new Map();
        table.querySelectorAll('tbody tr').forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length <= janIndex) return;
            const janCode = cells[janIndex].textContent.trim();
            const resultCell = row.querySelector('.clearance-status-td');
            if (!janCode || !resultCell) return;
            if (!janMap.has(janCode)) janMap.set(janCode, []);
            janMap.get(janCode).push(resultCell);
        });

        const unknown = [];
        janMap.forEach((cells, janCode) => {
            if (forceRefresh) forget(janCode);
            const cached = getCached(janCode);
            if (cached) {
                cells.forEach(td => renderStatus(td, cached));
            } else {
                unknown.push(janCode);
                cells.forEach(td => {
                    td.innerHTML = '<span class="spinner-border spinner-border-sm text-primary" style="width:10px;height:10px;"></span>';
                });
            }
        });

        const t0 = Date.now();
        await lookupJans(unknown,
            (janCode, status) => (janMap.get(janCode) || []).forEach(td => renderStatus(td, status)),
            (done, total) => {
                if (button) button.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>새 JAN 조회 중... ${done} / ${total}`;
            });

        const sec = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`[통관조회] 화면 JAN ${janMap.size}건 중 새로 조회 ${unknown.length}건 / ${sec}초`);
        refreshPrefetchLabel();

        if (button) {
            button.disabled = false;
            button.innerHTML = `<i class="ti ti-check me-1"></i>조회 완료 (새로 ${unknown.length}건 · ${sec}초)`;
        }
        busy = false;
    }

    function refreshPrefetchLabel() {
        const b = document.getElementById('prefetch-clearance-btn');
        if (b && !b.disabled) b.innerHTML = `<i class="ti ti-database me-1"></i>전체 미리 조회 (저장 ${cacheCountLabel()}건)`;
    }

    // 재고관리 전체 페이지에서 JAN 모으기 (검색 조건 무시, 1000건씩)
    async function collectAllStockJans(setLabel) {
        const jans = new Set();
        const PAGE_SIZE = 1000;
        for (let page = 1; page <= 200; page++) {
            setLabel(`재고 목록 수집 중... ${page}페이지`);
            const url = location.origin + location.pathname + `?pagesize=${PAGE_SIZE}&page=${page}`;
            let html;
            try {
                html = await requestUrl(url);
            } catch (e) {
                try { html = await requestUrl(url); } catch (e2) {
                    throw new Error(`${page}페이지 수집 실패`);
                }
            }
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const table = findJanTable(doc);
            if (!table) break;
            const janIndex = getJanIndex(table);
            const rows = table.querySelectorAll('tbody tr');
            let added = 0;
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length <= janIndex) return;
                const jan = cells[janIndex].textContent.trim();
                if (jan) { jans.add(jan); added++; }
            });
            if (added === 0 || rows.length < PAGE_SIZE) break;
        }
        return Array.from(jans);
    }

    async function prefetchAll() {
        if (busy) return;
        const b = document.getElementById('prefetch-clearance-btn');
        const setLabel = text => { if (b) b.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>${text}`; };

        busy = true;
        if (b) b.disabled = true;
        const t0 = Date.now();

        try {
            ensureShareUrl();
            setLabel('공유 시트 받는 중...');
            await pullShared(true);
            const allJans = await collectAllStockJans(setLabel);
            const unknown = allJans.filter(j => !getCached(j));

            await lookupJans(unknown, () => {}, (done, total) => setLabel(`미리 조회 중... ${done} / ${total}`));

            const min = ((Date.now() - t0) / 60000).toFixed(1);
            console.log(`[통관조회] 전체 재고 JAN ${allJans.length}건 중 새로 조회 ${unknown.length}건 / ${min}분`);
            if (b) {
                b.disabled = false;
                b.innerHTML = `<i class="ti ti-check me-1"></i>미리 조회 완료 (새로 ${unknown.length}건 · ${min}분) · 저장 ${cacheCountLabel()}건`;
            }
            // 현재 화면도 저장된 결과로 바로 채우기
            document.querySelectorAll('.clearance-status-td').forEach(td => td.remove());
            init();
        } catch (e) {
            console.error('[통관조회] 전체 미리 조회 실패', e);
            saveDiskCache();
            if (b) {
                b.disabled = false;
                b.innerHTML = `<i class="ti ti-alert-triangle me-1"></i>미리 조회 중단 (${e.message}) — 다시 누르면 이어서 진행`;
            }
        }
        busy = false;
    }

    function refillFromCache() {
        document.querySelectorAll('.clearance-status-td').forEach(td => {
            if (td.querySelector('.spinner-border')) return;
            const row = td.parentNode;
            const table = getStockTable();
            if (!table || !row) return;
            const janIndex = getJanIndex(table);
            const cells = Array.from(row.querySelectorAll('td')).filter(c => c !== td);
            const jan = cells[janIndex] ? cells[janIndex].textContent.trim() : '';
            const cached = jan && getCached(jan);
            if (cached) renderStatus(td, cached);
        });
        refreshPrefetchLabel();
    }

    function boot() {
        GM_registerMenuCommand('통관방식 공유 시트 주소 설정', () => {
            askShareUrl();
            pullShared(true).then(refillFromCache);
        });
        init();
        pullShared(false).then(n => { if (n) refillFromCache(); });
        const observer = new MutationObserver(function () {
            if (!document.getElementById('fetch-clearance-btn')) init();
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
 * [블록 2] 구매대행 다나오로시 출력본 v24.1 (+ v1.3.0 개선)
 * ------------------------------------------------------------ */
(function() {
    'use strict';

    const rowsData = [];
    const zones = new Set();
    const selectedZones = new Set();

    // [v1.3.0] 수집 결과 정보 (수집 시각 / 실패 페이지 / 행 수 검증 / 검색 조건)
    const collectInfo = {
        collectedAt: null,      // collectAllPagesData()가 끝난 시점 (Date)
        failedPages: [],        // 재시도 후에도 실패한 페이지 번호
        totalCount: null,       // 사이트 화면의 "합계：N건"
        scannedCount: 0,        // 실제로 읽어 들인 재고 행 수 (로케이션 없는 행 포함)
        noLocationCount: 0,     // 로케이션이 비어 있어 시트에서 빠진 행 수
        appliedFilters: []      // 적용된 상태로 출력한 검색 조건 (전체 출력이면 빈 배열)
    };

    // [v1.3.0] 검색 조건이 아닌 파라미터 (이것 외에 값이 있는 파라미터는 검색/필터 조건으로 봄)
    const NON_FILTER_PARAMS = ['page', 'pagesize', 'sort', 'order', 'direction', 'sort_by', 'sort_order'];
    const PAGE_RETRY_COUNT = 2;   // 페이지 수집 실패 시 재시도 횟수

    const styleHTML = `
        <style id="simplified-inventory-style">
            #simplified-container { padding: 30px 20px; font-family: 'Public Sans', sans-serif; background: #fff; color: #333; max-width: 100%; margin: 0 auto; position: relative; z-index: 99999; }
            .tool-header { border-bottom: 3px solid #007bff; padding-bottom: 15px; margin-bottom: 25px; }
            .header-main { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
            .tool-title { margin: 0; font-size: 24px; font-weight: bold; color: #1e293b; }
            .tool-btn-group { display: flex; gap: 12px; }

            .collect-meta { font-size: 14px; font-weight: bold; color: #334155; margin-top: 6px; }
            .collect-warning { margin-top: 10px; padding: 10px 14px; border: 2px solid #dc2626; background: #fef2f2; color: #dc2626; font-size: 15px; font-weight: bold; border-radius: 6px; }
            .collect-notice { margin-top: 8px; padding: 8px 12px; border: 1px solid #f59e0b; background: #fffbeb; color: #b45309; font-size: 13px; font-weight: bold; border-radius: 6px; }
            .collect-note { margin-top: 6px; font-size: 12px; color: #64748b; }

            .client-breakdown { font-size: 12px; line-height: 1.5; }
            .waiting-note { display: block; color: #d63031; font-weight: bold; font-size: 11px; line-height: 1.3; }

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
                .collect-warning, .collect-notice { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .waiting-note { color: #000 !important; }
                @page { size: A4 portrait; margin: 12mm 8mm; }
            }
        </style>
    `;

    // [v1.3.0] HTML 특수문자 처리 (고객명/상품명에 & < > 가 있어도 표가 깨지지 않도록)
    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // [v1.3.0] 일본 시간(JST, UTC+9) 기준 날짜/시각 문자열
    // toISOString()은 UTC라서 일본 시간 오전 0~9시에는 날짜가 하루 전으로 찍히는 문제가 있었음
    function formatJst(date) {
        const d = new Date(date.getTime() + 9 * 60 * 60 * 1000);
        const p = n => String(n).padStart(2, '0');
        const ymd = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
        return {
            fileStamp: `${ymd}_${p(d.getUTCHours())}${p(d.getUTCMinutes())}`,
            display: `${ymd} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
        };
    }

    // [v1.3.0] 발송 대기 재고 판별 (재고관리 "종류" 열)
    function isWaitingStock(category) {
        return /발송\s*대기|発送待/.test(category || '');
    }

    // [v1.3.0] 현재 URL에 걸린 검색/필터 조건 목록
    function getActiveFilters() {
        const params = new URLSearchParams(window.location.search);
        const filters = [];
        params.forEach((value, key) => {
            if (NON_FILTER_PARAMS.includes(key.toLowerCase())) return;
            if (String(value).trim() === '') return;
            filters.push({ key, value });
        });
        return filters;
    }

    function parseTotalCount(text) {
        const match = (text || '').match(/합계：([0-9,]+)건/);
        return match ? (parseInt(match[1].replace(/,/g, '')) || 0) : null;
    }

    function fetchPageHtml(url) {
        return new Promise((resolve, reject) => {
            $.ajax({
                url: url, type: 'GET',
                success: function(data) { resolve(data); },
                error: function(err) { reject(err); }
            });
        });
    }

    // [v1.3.0] 실패 시 같은 페이지를 PAGE_RETRY_COUNT회까지 재시도
    async function fetchPageHtmlWithRetry(url, pageNo) {
        let lastError = null;
        for (let attempt = 0; attempt <= PAGE_RETRY_COUNT; attempt++) {
            try {
                return await fetchPageHtml(url);
            } catch (error) {
                lastError = error;
                console.warn(`${pageNo} 페이지 수집 실패 (시도 ${attempt + 1}/${PAGE_RETRY_COUNT + 1})`, error);
                if (attempt < PAGE_RETRY_COUNT) {
                    updateMaskText(`⚠️ ${pageNo} 페이지 수집 실패 - 재시도 중... (${attempt + 1}/${PAGE_RETRY_COUNT})`);
                    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                }
            }
        }
        throw lastError;
    }

    async function collectAllPagesData(removeFilters) {
        rowsData.length = 0;
        zones.clear();
        selectedZones.clear();
        collectInfo.failedPages = [];
        collectInfo.totalCount = null;
        collectInfo.scannedCount = 0;
        collectInfo.noLocationCount = 0;
        collectInfo.collectedAt = null;

        let currentPage = 1;
        let totalPages = 1;
        let hasNextPage = true;

        const baseUrl = window.location.origin + window.location.pathname;
        const urlParams = new URLSearchParams(window.location.search);

        // [v1.3.0] 전체 출력을 선택하면 검색/필터 조건을 빼고 수집
        const activeFilters = getActiveFilters();
        if (removeFilters) {
            activeFilters.forEach(f => urlParams.delete(f.key));
            collectInfo.appliedFilters = [];
        } else {
            collectInfo.appliedFilters = activeFilters;
        }
        urlParams.set('pagesize', '1000');

        // 화면의 합계는 필터를 뺀 경우 의미가 달라지므로, 필터를 유지할 때만 미리 사용
        if (!removeFilters) {
            const domTotal = parseTotalCount($('.text-start small').text());
            if (domTotal !== null) {
                collectInfo.totalCount = domTotal;
                totalPages = Math.ceil(domTotal / 1000) || 1;
            }
        }

        while (hasNextPage) {
            updateMaskText(`📋 데이터를 전수조사 중입니다... (${currentPage} / ${totalPages} 페이지 수집 중)`);
            urlParams.set('page', currentPage);

            const targetUrl = `${baseUrl}?${urlParams.toString()}`;

            let htmlData;
            try {
                htmlData = await fetchPageHtmlWithRetry(targetUrl, currentPage);
            } catch (error) {
                // [v1.3.0] 예전에는 여기서 조용히 멈췄음 → 실패 페이지를 기록하고,
                // 남은 페이지가 있으면 다음 페이지 수집을 계속함
                console.error(`${currentPage} 페이지 수집 중 오류 (재시도 ${PAGE_RETRY_COUNT}회 후 실패)`, error);
                collectInfo.failedPages.push(currentPage);
                if (currentPage < totalPages) {
                    currentPage++;
                    continue;
                }
                break;
            }

            const $html = $(htmlData);

            // [v1.3.0] 수집한 페이지의 "합계：N건"으로 총 건수/총 페이지 수를 확정
            if (collectInfo.totalCount === null) {
                const pageTotal = parseTotalCount($html.find('.text-start small').text());
                if (pageTotal !== null) {
                    collectInfo.totalCount = pageTotal;
                    totalPages = Math.ceil(pageTotal / 1000) || 1;
                }
            }

            const $rows = $html.find('.table-responsive table:last tbody tr');

            if ($rows.length === 0) {
                hasNextPage = false;
                break;
            }

            let dataRowFound = false;
            $rows.each(function() {
                const $row = $(this);
                if ($row.find('td').length < 10) return;

                dataRowFound = true;
                collectInfo.scannedCount++;

                const clientName = $row.find('td:nth-child(2)').text().trim() || '-';
                const category = $row.find('td:nth-child(3)').text().trim();
                const type = $row.find('td:nth-child(4)').text().trim();
                const janCode = $row.find('td:nth-child(5)').text().trim();
                const productName = $row.find('td:nth-child(6)').text().trim();
                const quantity = parseInt($row.find('td:nth-child(7)').text().trim()) || 0;
                const rawLocation = $row.find('td:nth-child(11)').text().trim();

                if (rawLocation) {
                    // [v1.2.0 수정] 원본 사이트의 로케이션 텍스트에 "G1-2-1 : 10개"처럼
                    // 콜론 뒤에 부가정보(박스당 개수 등)가 붙어 나오는 경우가 있어,
                    // 이 부분을 그대로 비교하면 같은 자리인데도 문자열이 달라서
                    // 병합이 안 되고 구분선도 엉뚱하게 그어지는 문제가 있었습니다.
                    // 콜론 뒤는 잘라내고 순수 로케이션 코드만 기준으로 사용합니다.
                    const location = rawLocation.replace(/[:：].*$/, '').trim() || rawLocation;

                    let zone = location.charAt(0).toUpperCase();

                    if (!/[A-Z]/.test(zone)) {
                        zone = '기타';
                    }
                    zones.add(zone);

                    const locParts = location.split('-');
                    const subLocation = locParts.length >= 2 ? `${locParts[0]}-${locParts[1]}` : location;
                    const isWaiting = isWaitingStock(category);

                    rowsData.push({ clientName, category, type, janCode, productName, quantity, location, subLocation, zone, isWaiting });
                } else {
                    collectInfo.noLocationCount++;
                }
            });

            const $nextButton = $html.find('.pagination .page-item:last-child:not(.disabled)');
            // [v1.3.0] 로케이션 없는 행만 있는 페이지에서도 수집이 멈추지 않도록 "데이터 행 존재" 기준으로 판단
            if (dataRowFound && $nextButton.length > 0 && $nextButton.find('a').length > 0) {
                currentPage++;
            } else {
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

        // [v1.3.0] 데이터 수집 완료 시각 (다운로드 시각이 아님)
        collectInfo.collectedAt = new Date();
    }

    // [v1.3.0] 수집 결과 경고 문구 목록
    function getCollectWarnings() {
        const warnings = [];
        if (collectInfo.failedPages.length > 0) {
            warnings.push(`${collectInfo.failedPages.join(', ')}페이지 수집 실패 - 시트가 불완전합니다`);
        }
        if (collectInfo.totalCount === null) {
            warnings.push(`화면의 합계 건수를 확인하지 못했습니다 - 수집 행 수 ${collectInfo.scannedCount.toLocaleString()}건 (누락 여부 확인 불가)`);
        } else if (collectInfo.scannedCount !== collectInfo.totalCount) {
            warnings.push(`수집 행 수 불일치 - 수집 ${collectInfo.scannedCount.toLocaleString()}건 / 화면 합계 ${collectInfo.totalCount.toLocaleString()}건`);
        }
        return warnings;
    }

    function getFilterNotice() {
        if (collectInfo.appliedFilters.length === 0) return '';
        const text = collectInfo.appliedFilters.map(f => `${f.key}=${f.value}`).join(', ');
        return `※ 검색 조건이 적용된 일부 재고만 출력됨 (${text})`;
    }

    function getCollectedAtText() {
        return collectInfo.collectedAt ? formatJst(collectInfo.collectedAt).display : '-';
    }

    function getFileStamp() {
        return formatJst(collectInfo.collectedAt || new Date()).fileStamp;
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
                // 수량 합산 방식은 기존과 동일
                match.quantity += row.quantity;
                // [v1.3.0] 고객별 내역과 발송 대기 수량도 함께 모음
                addClientQty(match, row);
                if (row.isWaiting) match.waitingQty += row.quantity;
            } else {
                const newGroup = { ...row, clients: [], waitingQty: row.isWaiting ? row.quantity : 0 };
                addClientQty(newGroup, row);
                grouped.push(newGroup);
            }
        });
        // 고객별 내역은 수량이 많은 순서로 표시
        grouped.forEach(g => g.clients.sort((a, b) => b.qty - a.qty));
        return grouped;
    }

    // [v1.3.0] 같은 고객이 여러 줄이면 한 고객으로 합쳐서 기록
    function addClientQty(group, row) {
        const existing = group.clients.find(c => c.name === row.clientName);
        if (existing) {
            existing.qty += row.quantity;
        } else {
            group.clients.push({ name: row.clientName, qty: row.quantity });
        }
    }

    // [v1.3.0] 회원사명 칸 내용: 고객 1명이면 고객명만, 여러 명이면 "고객명 수량"을 줄바꿈으로 나열
    function buildClientCell(row, lineBreak) {
        if (!row.clients || row.clients.length <= 1) {
            return escapeHtml(row.clientName);
        }
        return row.clients.map(c => `${escapeHtml(c.name)} ${c.qty}`).join(lineBreak);
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
                let waitingQty = 0;

                while (l + janSpan < locSpan && filteredRows[i + l].janCode === filteredRows[i + l + janSpan].janCode) {
                    totalQty += filteredRows[i + l + janSpan].quantity;
                    waitingQty += filteredRows[i + l + janSpan].waitingQty || 0;
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
                    const clientCell = buildClientCell(row, '<br>');
                    const clientClass = row.clients && row.clients.length > 1 ? ' class="client-breakdown"' : '';

                    tableRowsHTML += `<tr class="${rowClasses.join(' ')}" data-zone="${row.zone}">`;
                    tableRowsHTML += `<td style="width:23%; vertical-align:middle;"${clientClass}>${clientCell}</td>`;
                    tableRowsHTML += `<td style="width:30%; vertical-align:middle;">${escapeHtml(row.productName || '-')}</td>`;

                    if (l === 0 && k === 0) {
                        tableRowsHTML += `<td style="width:13%; font-weight:bold; color:#0f172a; vertical-align:middle;" rowspan="${locSpan}">${escapeHtml(row.location)}</td>`;
                    }

                    if (k === 0) {
                        const waitingHtml = waitingQty > 0 ? `<span class="waiting-note">발송대기 ${waitingQty}</span>` : '';
                        tableRowsHTML += `<td style="width:18%; vertical-align:middle;" rowspan="${janSpan}">${formattedJan}</td>`;
                        tableRowsHTML += `<td class="text-center" style="width:6%; vertical-align:middle; font-weight:bold;" rowspan="${janSpan}">${totalQty}</td>`;
                        tableRowsHTML += `<td style="width:10%; vertical-align:top;" rowspan="${janSpan}">${waitingHtml}</td>`;
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

        // [v1.3.0] 엑셀이 문자열을 날짜/숫자로 자동 변환하지 않도록 하는 서식
        // (예: 로케이션 "H1-1-1" → 平成1年1月1日 → "S64.1.1"로 바뀌던 문제)
        const TEXT_FMT = `mso-number-format:'\\@';`;
        // [v1.3.0] 셀 안에서 줄바꿈 (다음 셀로 넘어가지 않도록)
        const CELL_BR = '<br style="mso-data-placement:same-cell;">';

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
                let waitingQty = 0;

                while (l + janSpan < locSpan && filteredExcelRows[i + l].janCode === filteredExcelRows[i + l + janSpan].janCode) {
                    totalQty += filteredExcelRows[i + l + janSpan].quantity;
                    waitingQty += filteredExcelRows[i + l + janSpan].waitingQty || 0;
                    janSpan++;
                }

                for (let k = 0; k < janSpan; k++) {
                    const row = filteredExcelRows[i + l + k];
                    let borderStyle = 'border:1px solid #000000; text-align:center; vertical-align:middle;';
                    if (l === 0 && k === 0 && i > 0 && filteredExcelRows[i - 1].subLocation !== row.subLocation) {
                        borderStyle = 'border:1px solid #000000; border-top:3px double #ff9800; text-align:center; vertical-align:middle;';
                    }

                    let excelJanStr = formatJanCodeExcel(row.janCode, row.productName);
                    const clientCell = buildClientCell(row, CELL_BR);

                    excelRowsHTML += `<tr>`;
                    excelRowsHTML += `<td style="${borderStyle} ${TEXT_FMT} white-space:normal;" x:str>${clientCell}</td>`;
                    excelRowsHTML += `<td style="${borderStyle} ${TEXT_FMT}" x:str>${escapeHtml(row.productName || '-')}</td>`;

                    if (l === 0 && k === 0) {
                        excelRowsHTML += `<td style="font-weight:bold; ${borderStyle} ${TEXT_FMT}" x:str rowspan="${locSpan}">${escapeHtml(row.location)}</td>`;
                    }

                    if (k === 0) {
                        const remarkStyle = borderStyle.replace('vertical-align:middle;', 'vertical-align:top;');
                        const waitingText = waitingQty > 0 ? `<b style="color:#d63031;">발송대기 ${waitingQty}</b>` : '';
                        excelRowsHTML += `<td style="${borderStyle} mso-number-format:'\\@';" x:str rowspan="${janSpan}">${excelJanStr}</td>`;
                        excelRowsHTML += `<td style="font-weight:bold; ${borderStyle}" rowspan="${janSpan}">${totalQty}</td>`;
                        excelRowsHTML += `<td style="${remarkStyle} ${TEXT_FMT}" x:str rowspan="${janSpan}">${waitingText}</td>`;
                    }
                    excelRowsHTML += `</tr>`;
                }
                l += janSpan;
            }
            i += locSpan;
        }

        // [v1.3.0] 엑셀 첫 줄: 데이터 수집 시각 + (있으면) 경고/검색 조건 안내
        let infoRowsHTML = `<tr><td colspan="6" style="text-align:left; font-weight:bold; font-size:12pt; ${TEXT_FMT}" x:str>데이터 수집 시각: ${getCollectedAtText()}</td></tr>`;
        getCollectWarnings().forEach(w => {
            infoRowsHTML += `<tr><td colspan="6" style="text-align:left; font-weight:bold; color:#dc2626; ${TEXT_FMT}" x:str>⚠ ${escapeHtml(w)}</td></tr>`;
        });
        const filterNotice = getFilterNotice();
        if (filterNotice) {
            infoRowsHTML += `<tr><td colspan="6" style="text-align:left; font-weight:bold; color:#b45309; ${TEXT_FMT}" x:str>${escapeHtml(filterNotice)}</td></tr>`;
        }

        const excelTemplate = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta charset="UTF-8">
                <style>table { border-collapse:collapse; } th { border:1px solid #000000; background-color:#e2e8f0; font-weight:bold; text-align:center; }</style>
            </head>
            <body>
                <table>
                    <thead>${infoRowsHTML}<tr><th>회원사명</th><th>상품명</th><th>로케이션</th><th>JAN CODE</th><th>수량</th><th>비고</th></tr></thead>
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
        // [v1.3.0] 검색 조건이 걸린 상태면 전체 재고로 출력할지 먼저 확인
        const activeFilters = getActiveFilters();
        let removeFilters = false;
        if (activeFilters.length > 0) {
            const filterText = activeFilters.map(f => `  - ${f.key} = ${f.value}`).join('\n');
            removeFilters = confirm(
                '현재 검색 조건이 적용된 상태입니다. 전체 재고로 출력할까요?\n\n' +
                `${filterText}\n\n` +
                '[확인] 검색 조건을 빼고 전체 재고 수집\n' +
                '[취소] 현재 검색 조건 그대로 수집'
            );
        }

        const $mask = $('<div id="custom-sync-mask" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(255,255,255,0.9); z-index:999999; display:flex; flex-direction:column; justify-content:center; align-items:center; font-family:sans-serif;"><div style="border:4px solid #f3f3f3; border-top:4px solid #007bff; border-radius:50%; width:40px; height:40px; animation:spin 1s linear infinite; margin-bottom:10px;"></div><div id="custom-sync-mask-text" style="font-weight:bold; color:#007bff;">📋 전체 페이지 수집 상태 분석 중...</div><style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style></div>');
        $('body').prepend($mask);

        await collectAllPagesData(removeFilters);

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

        // [v1.3.0] 수집 시각 / 경고 / 검색 조건 안내 (화면 + 인쇄물 상단)
        const warnings = getCollectWarnings();
        const warningHTML = warnings.map(w => `<div class="collect-warning">⚠️ ${escapeHtml(w)}</div>`).join('');
        const filterNotice = getFilterNotice();
        const filterNoticeHTML = filterNotice ? `<div class="collect-notice">${escapeHtml(filterNotice)}</div>` : '';
        const noLocationHTML = collectInfo.noLocationCount > 0
            ? `<div class="collect-note">로케이션이 비어 있는 ${collectInfo.noLocationCount.toLocaleString()}행은 시트에서 제외됨</div>` : '';

        const containerHTML = `
            <div id="simplified-container">
                <div class="tool-header">
                    <div class="header-main">
                        <div>
                            <h2 class="tool-title">📋 구매대행 다나오로시(전체 재고조사) 리스트</h2>
                            <div class="collect-meta">데이터 수집 시각: ${getCollectedAtText()}</div>
                        </div>
                        <div class="tool-btn-group">
                            <button type="button" class="action-btn btn-zone-excel" id="simple-download-zone-excel">📥 선택 구역 Excel 다운로드</button>
                            <button type="button" class="action-btn btn-excel" id="simple-download-excel">📥 전체 Excel 다운로드</button>
                            <button type="button" class="action-btn btn-print" id="simple-trigger-print">🖨️ A4 용지 인쇄</button>
                            <button type="button" class="action-btn btn-restore" id="simple-trigger-restore">↩️ 원본 화면 복원</button>
                        </div>
                    </div>
                    ${warningHTML}
                    ${filterNoticeHTML}
                    ${noLocationHTML}
                    <div class="zone-filter-group" style="margin-top:12px;">
                        <span style="font-size:13px; font-weight:bold; color:#475569; align-self:center; margin-right:5px;">구역 필터 (다중 선택):</span>
                        ${zoneButtonsHTML}
                    </div>
                </div>
                <table class="inventory-table">
                    <thead>
                        <tr>
                            <th style="width: 23%;">회원사명</th>
                            <th style="width: 30%;">상품명</th>
                            <th style="width: 13%;">로케이션</th>
                            <th style="width: 18%;">JAN CODE</th>
                            <th style="width: 6%;">수량</th>
                            <th style="width: 10%;">비고</th>
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

        // [v1.3.0] 수집 실패/건수 불일치가 있으면 화면 표시 후 알림
        if (warnings.length > 0) {
            setTimeout(() => {
                alert('⚠️ 다나오로시 데이터 수집 경고\n\n' + warnings.join('\n') + '\n\n이 시트로 실사하면 일부 재고가 빠져 있을 수 있습니다. 다시 실행해 주세요.');
            }, 100);
        }

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

        // [v1.3.0] 파일명에 수집 시각(일본 시간, YYYY-MM-DD_HHmm) 표시
        $('#simple-download-excel').on('click', function() {
            const stamp = getFileStamp();
            const blob = generateExcelBlob(true);
            triggerExcelDownload(blob, `다나오로시_전체재고통합_${stamp}.xls`);
        });

        $('#simple-download-zone-excel').on('click', function() {
            if (selectedZones.size === 0) {
                alert('선택된 구역이 없습니다. 구역 필터에서 다운로드할 구역을 선택해 주세요.');
                return;
            }
            const stamp = getFileStamp();
            const zoneArray = Array.from(selectedZones).sort();
            const blob = generateExcelBlob(false);
            triggerExcelDownload(blob, `다나오로시_선택구역재고_${zoneArray.join('+')}구역_${stamp}.xls`);
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
