// ==UserScript==
// @name         [관리] 판매관리 통합 도구 (엑셀 다운로드 + 쿠지 이미지 엑셀)
// @namespace    https://github.com/asics67-lab/tampermonkey-scripts
// @version      1.0.2
// @description  판매관리(shop) 화면 통합본. 원본: 판매관리 페이지 엑셀 다운로드 v2.3 + 판매관리 - 쿠지 정보 엑셀 다운로드 v41.0. v1.0.2: 상품 이미지가 아마존 S3로 바뀐 뒤 쿠지 엑셀이 안 받아지던 문제 수정(S3 접속 허용, 이미지 PNG 변환, 응답 없을 때 멈춤 방지, 이미지 없어도 엑셀은 저장).
// @author       물류팀
// @match        https://www.platform.co.jp/admin/shop/order*
// @match        https://platform.co.jp/admin/shop/order*
// @match        https://www.platform.co.jp/admin/shop/index*
// @match        https://platform.co.jp/admin/shop/index*
// @require      https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js
// @grant        GM_xmlhttpRequest
// @connect      assets.1kuji.com
// @connect      amazonaws.com
// @connect      platform.co.jp
// @connect      *
// @updateURL    https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/관리/04-판매관리/shop-tools.user.js
// @downloadURL  https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/관리/04-판매관리/shop-tools.user.js
// ==/UserScript==
// [www 없는 주소 대응] platform.co.jp(www 없이) 로 접속해도 동작하도록 @match 추가, 사이트 내부 요청 주소를 현재 접속 주소 기준(location.origin)으로 변경

/*
 * ============================================================
 *  통합 안내
 *  - 판매관리 화면에서 쓰는 2개 원본 스크립트를 하나로 합쳤습니다.
 *    1) 판매관리 페이지 엑셀 다운로드 (순수 수량 표시 + 배경색 일치) v2.3 (shop/order)
 *    2) 판매관리 - 쿠지 정보 엑셀 다운로드 (이미지 4배 초거대 확대판) v41.0 (shop/index)
 *  - 서로 다른 페이지(shop/order vs shop/index)에서 동작하므로 겹치는 부분이 없습니다.
 *  - @connect * 가 포함되어 있어(쿠지 이미지를 외부 CDN에서 가져오기 위함) 다소 넓은 권한입니다.
 *    필요 이상으로 넓다고 판단되면 실제 이미지 서버 도메인으로 좁히는 것을 권장드립니다.
 * ============================================================
 */

/* ------------------------------------------------------------
 * [블록 1] 판매관리 페이지 엑셀 다운로드 (순수 수량 표시 + 배경색 일치) v2.3
 * ------------------------------------------------------------ */
(function() {
    'use strict';

    function injectCustomButton() {
        const existingBtn = document.getElementById('download-btn');
        if (!existingBtn || !existingBtn.parentNode) return;
        if (document.getElementById('custom-excel-dl-btn')) return;

        const newBtn = document.createElement('button');
        newBtn.id = 'custom-excel-dl-btn';
        newBtn.className = 'btn btn-success btn-sm waves-effect flex-fill flex-sm-grow-0 mx-1';
        newBtn.type = 'button';
        newBtn.style.fontWeight = 'bold';
        newBtn.innerHTML = '<i class="fa fa-flash me-2"></i>초고속 전체 Excel DL';

        newBtn.addEventListener('click', startFastExport);
        existingBtn.parentNode.insertBefore(newBtn, existingBtn.nextSibling);
    }

    setInterval(injectCustomButton, 800);

    const observer = new MutationObserver(() => {
        injectCustomButton();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    let aggregatedData = {};

    function getBoxUnit(supplier, priceText) {
        const price = parseInt(priceText.replace(/[^0-9]/g, ''), 10) || 0;
        const upperSupplier = supplier.toUpperCase();

        if (upperSupplier.includes("REBOOT")) {
            if (price === 6500 || price === 7000) return 6;
            if (price === 7800 || price === 8400) return 5;
        }
        if (upperSupplier.includes("CREATION") || upperSupplier.includes("クリエイション")) {
            if (price === 10500 || price === 6500 || price === 7000) return 6;
            if (price === 6000 || price === 7800 || price === 8400) return 5;
        }
        if (upperSupplier.includes("PRESTAGE")) {
            if (price === 6500 || price === 7000) return 6;
            if (price === 7800 || price === 8400) return 5;
        }
        return 6;
    }

    async function startFastExport() {
        aggregatedData = {};
        const btn = document.getElementById('custom-excel-dl-btn');
        if (!btn) return;

        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa fa-spinner fa-spin me-2"></i>총 건수 확인 중...';

        try {
            const totalTextElem = document.querySelector('.text-start small');
            if (!totalTextElem) {
                throw new Error('합계 건수 표시 영역을 찾을 수 없습니다.');
            }

            const textRaw = totalTextElem.innerText.replace(/\s+/g, '');
            const countMatch = textRaw.match(/합계：([0-9,]+)건/) || textRaw.match(/([0-9,]+)건/);

            if (!countMatch) {
                throw new Error('합계 건수 문장 해석에 실패했습니다.');
            }

            const totalCount = parseInt(countMatch[1].replace(/,/g, ''), 10);
            if (totalCount === 0 || isNaN(totalCount)) {
                alert('추출할 검색 리스트 데이터가 0건입니다.');
                return;
            }

            const pageSize = 1000;
            const totalPages = Math.ceil(totalCount / pageSize);

            btn.innerHTML = `<i class="fa fa-spinner fa-spin me-2"></i>전체 ${totalPages}개 페이지 병렬 통신 중...`;

            const baseUrl = new URL(window.location.href);
            baseUrl.searchParams.set('pagesize', pageSize.toString());

            const fetchPromises = [];
            for (let p = 1; p <= totalPages; p++) {
                const pageUrl = new URL(baseUrl.toString());
                pageUrl.searchParams.set('page', p.toString());

                fetchPromises.push(
                    fetch(pageUrl.toString())
                        .then(res => {
                            if (!res.ok) throw new Error(`${p}페이지 통신 실패`);
                            return res.text();
                        })
                        .catch(err => {
                            console.error(`네트워크 통신 일시 오류 [${p} Page]:`, err);
                            return null;
                        })
                );
            }

            const htmlPages = await Promise.all(fetchPromises);

            htmlPages.forEach((htmlText) => {
                if (!htmlText) return;
                const parser = new DOMParser();
                const doc = parser.parseFromString(htmlText, 'text/html');
                const rows = doc.querySelectorAll('table.table-bordered tbody tr');
                parseAndAggregate(rows);
            });

            generateExcelFile();

        } catch (error) {
            alert('데이터 추출 중 에러가 발생했습니다:\n' + error.message);
            console.error(error);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }

    function parseAndAggregate(rows) {
        rows.forEach(row => {
            const cells = row.cells;
            if (cells.length < 17 || cells[15] === undefined || cells[0].querySelector('input') === null) return;

            const orderDate = cells[3].innerText.trim();
            const supplier = cells[4].innerText.replace(/\s+/g, ' ').trim();
            const releaseMonth = cells[7].innerText.trim();

            const brandTag = cells[8].querySelector('.text-danger');
            const brand = brandTag ? brandTag.innerText.trim() : '';

            let fullProductText = cells[8].innerText.trim();
            if (brand) {
                fullProductText = fullProductText.replace(brand, '').trim();
            }
            const productTokens = fullProductText.split(/\s+/);
            const janCode = productTokens[0] || '';
            const productName = productTokens.slice(1).join(' ') || '';

            const quantityRaw = cells[9].innerText.trim().split('\n')[0];
            const quantity = parseInt(quantityRaw.trim(), 10) || 0;

            const basePrice = cells[10].innerText.trim();
            const dispatchNo = cells[14].innerText.trim();

            const memoTextarea = cells[15].querySelector('textarea');
            const memo = memoTextarea ? memoTextarea.value.trim() : '';

            const userMemoTextarea = cells[16].querySelector('textarea');
            const userMemo = userMemoTextarea ? userMemoTextarea.value.trim() : '';

            const groupKey = supplier + "_" + janCode;

            if (aggregatedData[groupKey]) {
                aggregatedData[groupKey].quantity += quantity;
                if (memo && !aggregatedData[groupKey].memo.includes(memo)) {
                    aggregatedData[groupKey].memo += " / " + memo;
                }
                if (userMemo && !aggregatedData[groupKey].userMemo.includes(userMemo)) {
                    aggregatedData[groupKey].userMemo += " / " + userMemo;
                }
                if (dispatchNo && !aggregatedData[groupKey].dispatchNo.includes(dispatchNo)) {
                    aggregatedData[groupKey].dispatchNo += " / " + dispatchNo;
                }
            } else {
                aggregatedData[groupKey] = {
                    releaseMonth: releaseMonth,
                    orderDate: orderDate,
                    supplier: supplier,
                    brand: brand,
                    productName: productName,
                    janCode: janCode,
                    quantity: quantity,
                    basePrice: basePrice,
                    dispatchNo: dispatchNo,
                    memo: memo,
                    userMemo: userMemo
                };
            }
        });
    }

    function generateExcelFile() {
        let excelHtml = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <style>
                    td, th {
                        text-align: center;
                        vertical-align: middle;
                        border: 0.5pt solid #ccc;
                        padding: 6px;
                    }
                    .text-format {
                        mso-number-format:"\\@";
                    }
                    th {
                        background-color: #f2f2f2;
                        font-weight: bold;
                    }
                    th.highlight-col {
                        background-color: #FFE699;
                        color: #000000;
                    }
                    td.highlight-col {
                        background-color: #FFE699;
                    }
                </style>
            </head>
            <body>
                <table>
                    <thead>
                        <tr>
                            <th>발매 월</th>
                            <th>주문일자</th>
                            <th>사입처</th>
                            <th>브랜드</th>
                            <th>상품명</th>
                            <th>JAN CODE</th>
                            <th>수량</th>
                            <th>기준 개입</th>
                            <th class="highlight-col">박스 수량</th>
                            <th class="highlight-col">잔여 수량</th>
                            <th>기준 가격</th>
                            <th>발주서 번호</th>
                            <th>메모</th>
                            <th>顧客閲覧メモ</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        for (const key in aggregatedData) {
            const item = aggregatedData[key];
            const boxUnit = getBoxUnit(item.supplier, item.basePrice);

            const boxCountRaw = Math.floor(item.quantity / boxUnit);
            const remainderRaw = item.quantity % boxUnit;

            const boxDisplay = boxCountRaw === 0 ? "-" : boxCountRaw;
            const remainderDisplay = remainderRaw === 0 ? "-" : remainderRaw;
            const qtyDisplay = item.quantity === 0 ? "-" : item.quantity;
            const unitDisplay = `${boxUnit}개입`;

            excelHtml += `
                <tr>
                    <td>${item.releaseMonth}</td>
                    <td>${item.orderDate}</td>
                    <td>${item.supplier}</td>
                    <td>${item.brand}</td>
                    <td>${item.productName}</td>
                    <td class="text-format">${item.janCode}</td>
                    <td class="text-format">${qtyDisplay}</td>
                    <td class="text-format">${unitDisplay}</td>
                    <td class="text-format highlight-col">${boxDisplay}</td>
                    <td class="text-format highlight-col">${remainderDisplay}</td>
                    <td class="text-format">${item.basePrice}</td>
                    <td class="text-format">${item.dispatchNo}</td>
                    <td>${item.memo}</td>
                    <td>${item.userMemo}</td>
                </tr>
            `;
        }

        excelHtml += `
                    </tbody>
                </table>
            </body>
            </html>
        `;

        const blob = new Blob([excelHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        const today = new Date().toISOString().slice(0, 10);
        link.setAttribute('href', url);
        link.setAttribute('download', `판매관리_마스터합산_리스트_${today}.xls`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
})();

/* ------------------------------------------------------------
 * [블록 2] 판매관리 - 쿠지 정보 엑셀 다운로드 (이미지 4배 초거대 확대판) v41.0
 * ------------------------------------------------------------ */
(function() {
    'use strict';

    setInterval(() => {
        const modal = document.getElementById('editModal');
        if (!modal || !modal.classList.contains('show')) return;
        if (document.getElementById('kuji-excel-down-btn')) return;

        const modalFooter = modal.querySelector('.modal-footer') || modal.querySelector('.col-12.text-center') || modal.querySelector('form .text-center');

        if (modalFooter) {
            const excelBtn = document.createElement('button');
            excelBtn.type = 'button';
            excelBtn.id = 'kuji-excel-down-btn';

            excelBtn.innerText = '🟢 이미지 포함 엑셀 다운로드';
            excelBtn.style.backgroundColor = '#1F7246';
            excelBtn.style.color = '#ffffff';
            excelBtn.style.fontWeight = 'bold';
            excelBtn.style.fontSize = '12px';
            excelBtn.style.padding = '6px 14px';
            excelBtn.style.border = '1px solid #165232';
            excelBtn.style.borderRadius = '4px';
            excelBtn.style.cursor = 'pointer';
            excelBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.15)';

            excelBtn.style.marginRight = 'auto';
            excelBtn.style.marginLeft = '10px';
            excelBtn.style.order = '-1';

            excelBtn.addEventListener('mouseover', () => excelBtn.style.backgroundColor = '#165232');
            excelBtn.addEventListener('mouseout', () => excelBtn.style.backgroundColor = '#1F7246');

            if (modalFooter.firstChild) {
                modalFooter.insertBefore(excelBtn, modalFooter.firstChild);
            } else {
                modalFooter.appendChild(excelBtn);
            }

            // [v1.0.2] 오류가 나도 조용히 멈추지 않고 알려 주도록 감쌈
            excelBtn.addEventListener('click', async () => {
                if (excelBtn.disabled) return;
                const label = excelBtn.innerText;
                excelBtn.disabled = true;
                excelBtn.innerText = '⏳ 엑셀 만드는 중...';
                try {
                    await downloadKujiExcelWithAbsoluteImage();
                } catch (e) {
                    console.error('[쿠지 엑셀] 실패', e);
                    alert('엑셀을 만들지 못했습니다.\n' + (e && e.message ? e.message : e));
                } finally {
                    excelBtn.disabled = false;
                    excelBtn.innerText = label;
                }
            });
        }
    }, 250);

    /* [v1.0.2] 이미지 가져오기 수정
     *  - 상품 이미지가 사이트 서버 → 아마존 S3(platform-s3.s3...amazonaws.com)로 바뀜.
     *    S3 주소는 10분짜리 임시 주소이고, 응답의 파일 종류 표시가 이미지가 아닐 수 있어
     *    예전처럼 그대로 엑셀에 넣으면 엑셀 저장 단계에서 실패하거나 깨진 파일이 됐음.
     *  - 받아온 데이터를 브라우저에서 그림으로 한 번 열어 본 뒤 PNG로 바꿔서 넣음
     *    (jpg/png/webp 모두 OK, 만료·오류 응답이면 그림으로 안 열려서 이미지 없이 진행).
     *  - 응답이 없을 때 끝없이 기다리지 않도록 20초 제한.
     */
    function fetchImageAsBase64(url) {
        return new Promise((resolve) => {
            if (!url) return resolve(null);
            if (url.startsWith('/')) {
                url = window.location.origin + url;
            }
            let finished = false;
            const done = (v, why) => {
                if (finished) return;
                finished = true;
                if (!v) console.warn('[쿠지 엑셀] 이미지 못 가져옴:', why, url);
                resolve(v);
            };
            setTimeout(() => done(null, '시간 초과'), 25000);

            GM_xmlhttpRequest({
                method: "GET",
                url: url,
                responseType: "arraybuffer",
                timeout: 20000,
                onload: function(response) {
                    if (response.status < 200 || response.status >= 300) return done(null, 'HTTP ' + response.status);
                    toPngBase64(response.response)
                        .then(b64 => done(b64 ? { base64: b64, extension: 'png' } : null, '그림으로 열 수 없음'))
                        .catch(e => done(null, String(e)));
                },
                onerror: function() { done(null, '접속 오류(템퍼몽키 접속 허용 확인)'); },
                ontimeout: function() { done(null, '시간 초과'); },
                onabort: function() { done(null, '중단됨'); }
            });
        });
    }

    async function toPngBase64(arrayBuffer) {
        if (!arrayBuffer || !arrayBuffer.byteLength) return null;
        const blob = new Blob([arrayBuffer]);
        const blobUrl = URL.createObjectURL(blob);
        try {
            const img = await new Promise((res, rej) => {
                const i = new Image();
                i.onload = () => res(i);
                i.onerror = () => rej(new Error('이미지 아님'));
                i.src = blobUrl;
            });
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            canvas.getContext('2d').drawImage(img, 0, 0);
            return canvas.toDataURL('image/png').split(',')[1] || null;
        } catch (e) {
            return null;
        } finally {
            URL.revokeObjectURL(blobUrl);
        }
    }

    async function downloadKujiExcelWithAbsoluteImage() {
        const modal = document.getElementById('editModal');
        if (!modal) return;

        let targetDoc = document;
        const iframe = document.getElementById('iframe_1') || modal.querySelector('iframe');
        if (iframe) {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                if (iframeDoc && iframeDoc.body) targetDoc = iframeDoc;
            } catch (e) {}
        }

        let brandName = '브랜드미지정';
        const select2Container = modal.querySelector('span[id^="select2-brand_id"]') || targetDoc.querySelector('span[id^="select2-brand_id"]');
        if (select2Container) {
            brandName = select2Container.getAttribute('title') || select2Container.innerText;
        }
        brandName = brandName.replace(/\s+/g, ' ').trim();

        let imgUrl = '';
        // [v1.0.2] modal.getElementById 는 없는 함수라(이미지가 없는 상품에서) 오류로 멈췄음 → querySelector 로 변경
        const mainImgTag = targetDoc.getElementById('edit_main1_cur_image') || modal.querySelector('#edit_main1_cur_image') || targetDoc.querySelector('img[src*="kuji"]') || targetDoc.querySelector('img[src*="/upload/"]');
        if (mainImgTag && mainImgTag.src) {
            imgUrl = mainImgTag.src;
        }

        const allRows = targetDoc.querySelectorAll('table tr, .card tr');
        let rawDataList = [];

        allRows.forEach((row) => {
            const janInput = row.querySelector('input[name^="option1_"]');
            const optionInput = row.querySelector('input[name^="option3_"]');

            if (janInput || optionInput) {
                const janVal = janInput && janInput.value ? janInput.value.trim() : '';
                const optVal = optionInput && optionInput.value ? optionInput.value.trim() : '';

                if (optVal.includes('예약') || optVal.match(/^\d{4}-\d{2}-\d{2}/)) return;

                if (janVal !== '' || optVal !== '') {
                    rawDataList.push({ jan: janVal, option: optVal });
                }
            }
        });

        if (rawDataList.length === 0) {
            alert('출력할 리스트 데이터가 없습니다.');
            return;
        }

        let firstJanCode = '미입력';
        for (let item of rawDataList) {
            if (item.jan && item.jan !== '' && !isNaN(item.jan.split('-')[0])) {
                firstJanCode = item.jan.split('-')[0].trim();
                break;
            }
        }

        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const dashDate = `${yyyy}-${mm}-${dd}`;
        const formattedDate = `${yyyy}${mm}${dd}`;

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Option_List');

        let sheetData = [
            ["날짜", dashDate, "", "JAN CODE", "옵션", "수량", "통관구분"],
            ["품번", firstJanCode, "", "", "", "", ""],
            ["브랜드", brandName, "", "", "", "", ""],
            ["캐릭터", "", "", "", "", "", ""],
            ["입고 수", "", "", "", "", "", ""],
            ["세트 구성", "예) 1세트 3박스", "", "", "", "", "" ],
            ["", "", "", "", "", "", ""],
            ["", "", "", "", "", "", ""],
            ["", "", "", "", "", "", ""],
            ["", "", "", "", "", "", ""],
            ["", "", "", "", "", "", ""],
            ["", "", "", "", "", "", ""],
            ["", "", "", "", "", "", ""],
            ["", "", "", "", "", "", ""],
            ["", "", "", "", "", "", ""],
            ["상품 이미지", "", "", "", "", "", ""]
        ];

        for (let i = 0; i < 19; i++) {
            sheetData.push(["", "", "", "", "", "", ""]);
        }

        rawDataList.forEach((item, index) => {
            if (index < sheetData.length - 1) {
                if (!sheetData[index + 1]) {
                    sheetData[index + 1] = ["", "", "", "", "", "", ""];
                }
                sheetData[index + 1][3] = item.jan;
                sheetData[index + 1][4] = item.option;
                sheetData[index + 1][5] = "";
                sheetData[index + 1][6] = "";
            } else {
                sheetData.push(["", "", "", item.jan, item.option, "", ""]);
            }
        });

        worksheet.addRows(sheetData);

        let imageMissing = false;
        if (imgUrl) {
            const imgData = await fetchImageAsBase64(imgUrl);
            if (!imgData) imageMissing = true;
            if (imgData && imgData.base64) {
                try {
                    const imageId = workbook.addImage({
                        base64: imgData.base64,
                        extension: imgData.extension,
                    });

                    for (let r = 17; r <= 36; r++) {
                        worksheet.getRow(r).height = 26;
                    }

                    worksheet.addImage(imageId, {
                        tl: { col: 1, row: 16 },
                        ext: { width: 720, height: 520 },
                        editAs: 'undefined'
                    });
                } catch (err) {}
            }
        }

        let colWidths = [14, 26, 4, 24, 40, 10, 14];

        worksheet.eachRow((row, rowIndex) => {
            if (rowIndex < 17 || rowIndex > 36) row.height = 22;

            row.eachCell((cell, colIndex) => {
                if (cell.value && typeof cell.value !== 'object') {
                    cell.value = String(cell.value);
                }

                cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

                const isLeftTitle = (colIndex === 1 && (rowIndex < 7 || rowIndex === 17));
                const isRightHeader = (rowIndex === 1 && colIndex >= 4);

                if (isLeftTitle || isRightHeader) {
                    cell.font = { bold: true, name: '맑은 고딕', size: 10, color: { argb: 'FF000000' } };
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFF2F2F2' }
                    };
                } else {
                    cell.font = { name: '맑은 고딕', size: 10 };
                }

                const cellVal = cell.value && typeof cell.value !== 'object' ? String(cell.value) : '';
                if (cellVal && (rowIndex < 17 || rowIndex > 36)) {
                    let textLength = 0;
                    for (let i = 0; i < cellVal.length; i++) {
                        textLength += cellVal.charCodeAt(i) > 128 ? 1.4 : 1.0;
                    }
                    textLength = Math.ceil(textLength) + 5;
                    if (textLength > colWidths[colIndex - 1]) {
                        colWidths[colIndex - 1] = textLength;
                    }
                }
            });
        });

        worksheet.columns = colWidths.map(w => ({ width: w }));

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const link = document.createElement('a');

        const cleanBrand = brandName.replace(/[\/:*?"<>|]/g, '').trim();
        const fileName = `${cleanBrand}_${firstJanCode}_${formattedDate}.xlsx`;

        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(link.href), 10000);

        if (imageMissing) {
            alert('엑셀은 저장했지만 상품 이미지는 넣지 못했습니다.\n(이미지 주소는 10분 지나면 만료됩니다. 편집 창을 닫았다가 다시 열고 한 번 더 눌러 보세요)');
        }
    }
})();
