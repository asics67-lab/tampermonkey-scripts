// ==UserScript==
// @name         [관리] 피킹리스트 인쇄 도구 (AISPEL 피킹리스트 V75.2)
// @namespace    https://github.com/asics67-lab/tampermonkey-scripts
// @version      1.0.0
// @description  포장/출고(shipping/packing) 화면에서 PICKING LIST 버튼 옆에 초광속 수집 버튼을 추가해 관리팀이 피킹리스트를 인쇄하는 도구. 원본: AISPEL 피킹리스트 v75.2(LH/OH 트래킹번호 미표시 수정). 원래 포장/packing-tools.user.js 안에 있었으나, 실제로는 관리팀이 프린트하는 기능이라 관리 폴더로 옮겼습니다.
// @author       물류팀
// @match        https://www.platform.co.jp/admin/shipping/packing*
// @match        https://www.platform.co.jp/admin/shipping/packingfinished*
// @match        https://www.platform.co.jp/admin/shipping/finished*
// @match        *://*.aispel.com/admin/shipping/packing*
// @match        https://platform.aispel.com/admin/shipping/packing*
// @require      https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js
// @grant        none
// @updateURL    https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/관리/05-피킹리스트/picking-list-tools.user.js
// @downloadURL  https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/관리/05-피킹리스트/picking-list-tools.user.js
// ==/UserScript==

/*
 * ============================================================
 *  분리 안내
 *  - 이 스크립트는 원래 포장/packing-tools.user.js(포장 담당자용) 안의 블록4였습니다.
 *    실제로는 관리팀이 피킹리스트를 프린트할 때 쓰는 기능이라, 담당자 기준 폴더 구조에
 *    맞게 관리/ 폴더로 옮겼습니다. 로직 자체는 변경 없이 그대로 가져왔습니다.
 *  - 버전 이력(v75.0 → v75.2, JAN코드+상품명 합산 버그수정 등)은 아래 원본 주석에
 *    그대로 남아있습니다.
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

    function extractLocationWithQty(it) {
        let totalQty = parseInt(it.quantity || it.display_quantity || it.qty || "1");

        let subList = it.locations || it.location_details || it.stock_locations || it.locations_info;
        if (Array.isArray(subList) && subList.length > 0) {
            return subList.map(s => {
                let lName = s.location || s.location_name || s.name || "미지정";
                let lQty = s.qty || s.quantity || s.count || 1;
                return `${lName} : ${lQty}개`;
            }).join('<br>');
        }

        let rawLoc = String(it.location_str || it.location || it.location_name || "").trim();

        if (/:\s*\d+개/.test(rawLoc)) {
            return rawLoc.replace(/\|/g, '<br>').replace(/\s*\/\s*/g, '<br>');
        }

        let locParts = rawLoc.split(/[\n|\/]+/).map(s => s.trim()).filter(Boolean);

        if (locParts.length > 1) {
            let qtyArr = it.location_qty || it.qtys || it.quantities;
            if (Array.isArray(qtyArr) && qtyArr.length === locParts.length) {
                return locParts.map((loc, idx) => `${loc} : ${qtyArr[idx]}개`).join('<br>');
            }

            let remainQty = totalQty;
            let resultLines = [];
            for (let i = 0; i < locParts.length; i++) {
                if (i === locParts.length - 1) {
                    resultLines.push(`${locParts[i]} : ${remainQty}개`);
                } else {
                    let allocated = Math.max(1, Math.floor(totalQty / locParts.length));
                    resultLines.push(`${locParts[i]} : ${allocated}개`);
                    remainQty -= allocated;
                }
            }
            return resultLines.join('<br>');
        }

        if (locParts.length === 1 && locParts[0] !== "") {
            return `${locParts[0]} : ${totalQty}개`;
        }

        return "미지정";
    }

    async function startApiHarvest(checkedBoxes) {
        showOverlay(`🚀 데이터를 수집하여 이중 정렬 가공 중...`);
        const collectedGroups = [];
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

        for (let i = 0; i < checkedBoxes.length; i++) {
            const box = checkedBoxes[i];
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

                        return {
                            imgHtml: `<img src="${it.image_url_thumb || it.image_url || ''}" style="max-width:55px; max-height:45px;">`,
                            productName: (it.title || it.item_name || it.product_name || "").trim(),
                            janCode: (it.jancode || it.jan_code || it.item_id || "-").trim(),
                            qty: parseInt(it.quantity || it.display_quantity || it.qty || "1"),
                            location: extractLocationWithQty(it),
                            tracking: trackNo
                        };
                    });

                    const combinedMap = new Map();
                    processedItems.forEach(item => {
                        // [수정] 잔코드만으로 합치면 같은 잔코드를 잘못 입력한 서로 다른 상품이
                        // 하나로 섞여버릴 수 있어, 상품명까지 같이 확인해서 합산 기준으로 삼음.
                        const key = `${item.tracking}_${item.janCode}_${item.productName.trim()}`;
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
                    if (parseInt(packingData.no_inspection) === 1) reqSet.add("무검품 출하");
                    if (parseInt(packingData.add_material) === 1) reqSet.add("완충재 추가");

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

                    for (let p = 0; p * ITEMS_PER_PAGE < processedItems.length; p++) {
                        collectedGroups.push({
                            outNum: task.outNum, receiver: task.receiver, orderDate: task.orderDate,
                            requests: Array.from(reqSet),
                            requirementMsg: cleanMsg,
                            isOcean: task.isOcean,
                            items: processedItems.slice(p * ITEMS_PER_PAGE, (p + 1) * ITEMS_PER_PAGE),
                            pageNum: p + 1, totalPage: Math.ceil(processedItems.length / ITEMS_PER_PAGE),
                            originalIndex: task.originalIndex
                        });
                    }
                }
            } catch (e) { console.error(e); }
        }

        if (collectedGroups.length > 0) {
            collectedGroups.sort((a, b) => {
                if (a.originalIndex !== b.originalIndex) {
                    return b.originalIndex - a.originalIndex;
                }
                return a.pageNum - b.pageNum;
            });

            openPrintWindow(collectedGroups);
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

    function openPrintWindow(groups) {
        const printWin = window.open('', '_blank');
        if(!printWin) return;
        const safeData = JSON.stringify(groups).replace(/[\u007F-\uFFFF]/g, chr => "\\u" + ("0000" + chr.charCodeAt(0).toString(16)).substr(-4));

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
        </style>`;

        printWin.document.write(`<html><head>${style}<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script></head><body>
            <div class="no-print" style="position:fixed; top:10px; right:10px; z-index:1000;"><button onclick="window.print()" style="padding:4px 10px; background:#ff3e1d; color:white; border-radius:4px; font-weight:bold; border:none; cursor:pointer;">🖨️ 인쇄</button></div>
            <div id="content-area"></div>
            <script>
                const groups = ${safeData};
                let html = "";

                groups.forEach((g, idx) => {
                    let rows = "";
                    let currentMainNo = 0;
                    let currentSubNo = 0;

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
                            }
                        }

                        let locContent = '<div style="font-weight:900; font-size:14px; line-height:1.3; text-align:center;">' + it.location + '</div>';
                        if (it.tracking) {
                            locContent += '<div style="font-size:12px; color:#3b82f6; font-weight:bold; margin-top:3px; text-align:center;">' + it.tracking + '</div>';
                        }

                        rows += '<tr ' + rowStyle + '>' +
                            '<td style="border:1.5px solid #000; text-align:center; font-weight:bold; font-size:12px;">' + displayNo + '</td>' +
                            '<td style="border:1.5px solid #000; text-align:center;">' + it.imgHtml + '</td>' +
                            '<td ' + nameTdStyle + '>' + it.productName + '</td>' +
                            '<td ' + janTdStyle + '>' + it.janCode + '</td>' +
                            qtyTdHtml +
                            (!skip ? '<td rowspan="' + rowspan + '" style="border:1.5px solid #000; text-align:center; background:#fff; padding:4px; max-width:140px; vertical-align:middle;">' + locContent + '</td>' : '') +
                            '<td style="border:1.5px solid #000; text-align:center; font-size:20px; color:#bbb;">□</td>' +
                            '</tr>';
                    });

                    const reqString = g.requests.length > 0 ? '🚩 ' + g.requests.join(' / ') : '';
                    const oceanLabel = g.isOcean ? '<div style="color:#007bff; font-weight:900; font-size:22px; margin-left:20px; border:3px solid #007bff; padding:2px 10px; border-radius:5px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">해운(OCEAN)</div>' : '';
                    const watermarkHtml = g.isOcean ? '<div class="watermark-overlay"></div>' : '';

                    html += '<div class="sheet ' + (g.isOcean ? 'is-ocean' : '') + '">' +
                                watermarkHtml +
                                '<div class="content-wrapper">' +
                                    '<div style="display:flex; justify-content:space-between; align-items:flex-start;">' +
                                        '<div style="flex:1;">' +
                                            '<div style="display:flex; align-items:center;">' +
                                                '<h1 style="font-size:32px; margin:0; font-weight:900; letter-spacing:2px;">PICKING LIST</h1>' +
                                                oceanLabel +
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
                                                    '<div style="font-size:9px; font-weight:bold; text-align:center; border-bottom:1px solid #000; background:#f4f4f4;">피킹 담당자</div><div style="flex:1;"></div>' +
                                                '</div>' +
                                                '<div id="qr-'+idx+'"></div>' +
                                            '</div>' +
                                        '</div>' +
                                    '</div>' +
                                    '<div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2.5px solid #000; padding-bottom:5px; margin-bottom:10px; margin-top:5px;">' +
                                        '<div style="color:#ff0000; font-weight:900; font-size:12px; max-width:70%;">' + (g.pageNum===1?reqString:"") + '</div>' +
                                        '<div style="font-size:22px; font-weight:900; color:#000;">'+g.outNum+'</div>' +
                                    '</div>' +
                                    '<table style="width:100%; border-collapse:collapse; table-layout:fixed; border:2px solid #000;">' +
                                        '<thead style="background:#e8e8e8; font-size:13px; font-weight:bold;">' +
                                            '<tr style="height:35px;">' +
                                                '<th width="35" style="border:1.5px solid #000;">No</th><th width="65" style="border:1.5px solid #000;">이미지</th><th width="auto" style="border:1.5px solid #000;">상품명</th><th width="180" style="border:1.5px solid #000;">JANCODE</th><th width="50" style="border:1.5px solid #000;">수량</th><th width="140" style="border:1.5px solid #000;">로케이션 / 트래킹</th><th width="35" style="border:1.5px solid #000;">V</th>' +
                                            '</tr>' +
                                        '</thead>' +
                                        '<tbody>'+rows+'</tbody>' +
                                    '</table>' +
                                '</div>' +
                            '</div>';
                });
                document.getElementById('content-area').innerHTML = html;
                groups.forEach((g, i) => { if(g.pageNum === 1) new QRCode(document.getElementById("qr-" + i), {text: g.outNum, width: 80, height: 80}); });
            </script>
        </body></html>`);
        printWin.document.close();
    }

    setInterval(injectCustomButton, 500);
})();

