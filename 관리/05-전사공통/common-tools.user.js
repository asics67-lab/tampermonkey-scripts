// ==UserScript==
// @name         [관리] 전사공통 도구 (업무채팅알람봇 + 피킹현황카운터)
// @namespace    https://github.com/asics67-lab/tampermonkey-scripts
// @version      1.2.0
// @description  admin 전체 화면에서 공통으로 쓰는 도구 모음. 원본: 사내 만능 테스크 채팅 알람봇 v1.3 + 출고관리 피킹중/대기중 전체 합계 알림 v1.96
// @author       물류팀
// @match        https://www.platform.co.jp/admin*
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      www.platform.co.jp
// @updateURL    https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/관리/05-전사공통/common-tools.user.js
// @downloadURL  https://raw.githubusercontent.com/asics67-lab/tampermonkey-scripts/main/관리/05-전사공통/common-tools.user.js
// ==/UserScript==

/*
 * ============================================================
 *  통합 안내
 *  - admin/* (전체 페이지)에서 공통으로 뜨는 2개 원본 스크립트를 하나로 합쳤습니다.
 *    1) 사내 만능 테스크 채팅 알람봇 (대화방 타임라인 버전) v1.3
 *    2) 출고관리 피킹중/대기중 배송방법별 전체 합계 및 추가 시간 기록 알림 v1.96
 *       (본래 packing 기능이지만 @match가 admin/* 전체라 이 카테고리로 분류했습니다)
 *  - 이 파일은 모든 admin 페이지에서 실행되므로, 배포 전 페이지 로딩 속도에
 *    체감상 문제가 없는지 확인해 주세요.
 *
 *  v1.2.0 변경 사항
 *  - 노션 공지사항 스크립트(Notion API 토큰을 다루는 부분)를 이 파일에서 완전히 분리했습니다.
 *    해당 스크립트는 "notion-notice.user.js"라는 별도 파일로 개인 보관 중이며, 이 저장소(GitHub)에는
 *    올라가지 않습니다.
 *  - [블록 1] 업무채팅 알람봇의 MY_NAME 값은 이제 최초 실행 시 1회 입력창으로 받고,
 *    그 브라우저의 Tampermonkey 저장소에만 저장됩니다. GitHub에는 개인 이름이 올라가지 않습니다.
 *    재설정: Tampermonkey 메뉴 → "👤 업무채팅 - 내 이름 재설정"
 * ============================================================
 */

/* ------------------------------------------------------------
 * [블록 1] 사내 만능 테스크 채팅 알람봇 v1.3
 * ⚠️ 설치자 본인의 실제 이름이 필요합니다. 최초 실행 시 1회 입력창이 뜨고,
 *    이후에는 이 브라우저(Tampermonkey)에만 저장되어 자동으로 재사용됩니다.
 * ------------------------------------------------------------ */
(function() {
    'use strict';

    function getMyName() {
        let name = GM_getValue('chatbot_my_name', '');
        if (!name) {
            name = prompt('[업무채팅 알람봇] 본인의 실제 이름을 입력해주세요.\n(예: 홍길동 — 최초 1회만 입력하면 저장됩니다)');
            if (name) {
                name = name.trim();
                GM_setValue('chatbot_my_name', name);
            }
        }
        return name;
    }

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('👤 업무채팅 - 내 이름 재설정', function() {
            const newName = prompt('본인의 실제 이름을 다시 입력해주세요.');
            if (newName) {
                GM_setValue('chatbot_my_name', newName.trim());
                alert('저장되었습니다. 페이지를 새로고침하면 적용됩니다.');
            }
        });
    }

    const MY_NAME = getMyName();
    if (!MY_NAME) {
        console.warn('[업무채팅 알람봇] 이름이 설정되지 않아 동작을 중단합니다.');
        return;
    }
    const BASE_URL = "https://www.platform.co.jp/admin/task";

    const MSG_SEPARATOR = "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";

    const style = `
        <style>
            #custom-chat-wrapper { position: fixed; bottom: 25px; right: 25px; z-index: 99999; font-family: 'Public Sans', -apple-system, sans-serif; }
            #chat-toggle-btn { width: 60px; height: 60px; border-radius: 50%; background: #4a90e2; color: white; border: none; cursor: pointer; box-shadow: 0 5px 15px rgba(74,144,226,0.4); position: relative; font-size: 26px; display: flex; align-items: center; justify-content: center; transition: transform 0.2s; }
            #chat-toggle-btn:hover { transform: scale(1.05); }
            #chat-badge { position: absolute; top: -3px; right: -3px; background: #e74c3c; color: white; border-radius: 50%; width: 22px; height: 22px; font-size: 11px; font-weight: bold; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px rgba(0,0,0,0.2); }

            #chat-window { width: 380px; height: 550px; background: #f8f9fa; border: 1px solid rgba(0,0,0,0.1); box-shadow: 0 10px 30px rgba(0,0,0,0.15); border-radius: 16px; display: none; flex-direction: column; overflow: hidden; margin-bottom: 15px; transition: all 0.3s; }
            .chat-header { background: #4a90e2; color: white; padding: 15px; font-weight: 600; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
            .chat-close { cursor: pointer; font-size: 20px; opacity: 0.8; transition: opacity 0.2s; }
            .chat-close:hover { opacity: 1; }
            .chat-body { flex: 1; overflow: hidden; display: flex; flex-direction: column; position: relative; }

            #sender-list-view { flex: 1; overflow-y: auto; padding: 10px 0; }
            .sender-list-item { padding: 15px 20px; border-bottom: 1px solid #f1f2f6; cursor: pointer; transition: background 0.2s; display: flex; flex-direction: column; gap: 4px; }
            .sender-list-item:hover { background: #edf2f7; }
            .sender-header { display: flex; justify-content: space-between; align-items: center; }
            .sender-name { font-weight: bold; font-size: 14px; color: #2d3748; }
            .sender-preview { font-size: 12.5px; color: #718096; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
            .sender-status-badge { font-size: 11px; padding: 2px 6px; border-radius: 12px; font-weight: 500; }
            .status-warning { background: #fef3c7; color: #d97706; }
            .status-success { background: #d1fae5; color: #059669; }

            .room-view { display: none; flex-direction: column; height: 100%; background: #eaeef2; }
            .back-btn { cursor: pointer; margin-right: 12px; color: white; background: none; border: none; font-size: 18px; padding: 0; display: inline-flex; align-items: center; }
            .msg-history { flex: 1; padding: 15px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }

            .msg-group { display: flex; flex-direction: column; max-width: 75%; }
            .msg-group.received { align-self: flex-start; align-items: flex-start; }
            .msg-group.sent { align-self: flex-end; align-items: flex-end; }

            .msg-meta-name { font-size: 11px; color: #718096; margin-bottom: 3px; font-weight: 500; }
            .msg-bubble { padding: 10px 14px; border-radius: 14px; line-height: 1.5; font-size: 13px; position: relative; box-shadow: 0 1px 2px rgba(0,0,0,0.05); word-break: break-all; }

            .received .msg-bubble { background: white; color: #2d3748; border-top-left-radius: 2px; }
            .sent .msg-bubble { background: #4a90e2; color: white; border-top-right-radius: 2px; }

            .msg-time { font-size: 10px; color: #a0aec0; margin-top: 4px; }

            .chat-img-preview { max-width: 100%; border-radius: 8px; margin-top: 8px; display: block; cursor: pointer; transition: opacity 0.2s; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
            .chat-img-preview:hover { opacity: 0.9; }
            .download-btn { display: inline-flex; align-items: center; gap: 4px; margin-top: 8px; padding: 6px 12px; background: rgba(0,0,0,0.05); border-radius: 6px; text-decoration: none; font-size: 11px; color: #4a5568; font-weight: 500; transition: background 0.2s; }
            .sent .download-btn { background: rgba(255,255,255,0.2); color: white; }
            .download-btn:hover { background: rgba(0,0,0,0.1); }
            .sent .download-btn:hover { background: rgba(255,255,255,0.3); }

            .chat-input-area { padding: 12px; border-top: 1px solid #e2e8f0; background: white; display: flex; flex-direction: column; gap: 8px; }
            .chat-textarea { width: 100%; height: 55px; border: 1px solid #cbd5e0; border-radius: 8px; resize: none; padding: 8px; font-size: 13px; outline: none; transition: border-color 0.2s; }
            .chat-textarea:focus { border-color: #4a90e2; }
            .chat-input-bottom { display: flex; justify-content: space-between; align-items: center; }
            .file-label { cursor: pointer; font-size: 18px; color: #718096; transition: color 0.2s; padding: 5px; display: flex; align-items: center; }
            .file-label:hover { color: #4a90e2; }
            .send-btn { background: #4a90e2; color: white; border: none; padding: 6px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; transition: background 0.2s; }
            .send-btn:hover { background: #357abd; }
            .file-info { font-size: 11px; color: #38a169; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
        </style>
    `;

    const chatHtml = `
        <div id="custom-chat-wrapper">
            <div id="chat-window">
                <div class="chat-header">
                    <span id="chat-title">나에게 온 대화 목록</span>
                    <span class="chat-close" id="chat-close-btn">✕</span>
                </div>
                <div class="chat-body">
                    <div id="sender-list-view"></div>

                    <div id="chat-room-view" class="room-view">
                        <div class="msg-history" id="msg-history-area"></div>
                        <div class="chat-input-area">
                            <textarea class="chat-textarea" id="chat-input-text" placeholder="답변 내용을 입력하세요..."></textarea>
                            <div class="chat-input-bottom">
                                <label class="file-label" title="파일 첨부">
                                    📁 <input type="file" id="chat-file-input" style="display:none;">
                                </label>
                                <span class="file-info" id="selected-file-name"></span>
                                <button class="send-btn" id="chat-send-btn">전송</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <button id="chat-toggle-btn">
                💬 <span id="chat-badge" style="display:none;">0</span>
            </button>
        </div>
    `;

    $('body').append(style + chatHtml);

    let taskDataStore = [];
    let currentActiveTaskId = null;
    let selectedFileBase64 = null;
    let selectedFileName = "";

    function getCurrentDateTime() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const date = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${date} ${hours}:${minutes}:${seconds}`;
    }

    function parseHistory(rawAnswer, defaultSender, defaultTime) {
        if (!rawAnswer || rawAnswer.trim() === "." || rawAnswer.trim() === "") return [];

        const messages = [];
        const blocks = rawAnswer.split(MSG_SEPARATOR);

        blocks.forEach(block => {
            block = block.trim();
            if (!block) return;

            const headerRegex = /^\[([^|\]]+)\s*\|\s*([^\]]+)\]\n([\s\S]*)$/;
            const match = block.match(headerRegex);

            if (match) {
                const sender = match[1].trim();
                const time = match[2].trim();
                let content = match[3].trim();

                let file = null;
                const fileRegex = /\[첨부파일:\s*([^\]]+)\]\n\[파일데이터:\s*([^\]]+)\]/;
                const fileMatch = content.match(fileRegex);
                if (fileMatch) {
                    file = {
                        name: fileMatch[1],
                        data: fileMatch[2]
                    };
                    content = content.replace(fileRegex, "").trim();
                }

                messages.push({ sender, time, content, file });
            } else {
                messages.push({
                    sender: defaultSender,
                    time: defaultTime || "기록 없음",
                    content: block,
                    file: null
                });
            }
        });

        return messages;
    }

    function fetchTasks() {
        GM_xmlhttpRequest({
            method: "GET",
            url: `${BASE_URL}/index`,
            onload: function(response) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(response.responseText, "text/html");
                const rows = doc.querySelectorAll("table tbody tr");

                let newStore = [];
                let unreadCount = 0;

                rows.forEach(row => {
                    const chkBox = row.querySelector(".sub_checkbox");
                    if (!chkBox) return;

                    const taskId = String(chkBox.getAttribute("data-taskid"));
                    const content = row.children[2]?.innerText.trim();

                    const receiverFull = row.children[3]?.innerHTML.trim() || "";
                    const senderFull = row.children[4]?.innerHTML.trim() || "";

                    const receiverName = receiverFull.split(/<br\s*\/?>/i)[0].trim();
                    const senderName = senderFull.split(/<br\s*\/?>/i)[0].trim();

                    const currentAnswer = row.children[5]?.innerText.trim();
                    const date = row.children[6]?.innerText.trim();
                    const statusText = row.querySelector(".badge")?.innerText.trim();

                    if (receiverName === MY_NAME) {
                        if (statusText !== "완료") {
                            unreadCount++;
                        }
                        newStore.push({ taskId, content, receiverName, senderName, currentAnswer, date, statusText });
                    }
                });

                if (taskDataStore.length > 0 && newStore.length > taskDataStore.length) {
                    const latestTask = newStore[0];
                    GM_notification({
                        title: "새로운 업무 메시지",
                        text: `${latestTask.senderName} 님이 대화를 걸었습니다.`,
                        timeout: 5000
                    });
                }

                taskDataStore = newStore;
                updateBadge(unreadCount);
                renderSenderList();

                if (currentActiveTaskId) {
                    refreshChatRoom(currentActiveTaskId);
                }
            }
        });
    }

    function updateBadge(count) {
        const badge = $('#chat-badge');
        if (count > 0) {
            badge.text(count).show();
        } else {
            badge.hide();
        }
    }

    function renderSenderList() {
        const listContainer = $('#sender-list-view');
        listContainer.empty();

        if (taskDataStore.length === 0) {
            listContainer.append('<div style="padding:30px 20px; text-align:center; color:#718096; font-size:13px;">나에게 배정된 업무 대화방이 없습니다.</div>');
            return;
        }

        taskDataStore.forEach(task => {
            const isCompleted = task.statusText === "완료";
            const badgeClass = isCompleted ? "status-success" : "status-warning";
            const previewText = task.currentAnswer && task.currentAnswer !== "." ? task.currentAnswer.split(MSG_SEPARATOR).pop() : task.content;

            const item = `
                <div class="sender-list-item" data-id="${task.taskId}">
                    <div class="sender-header">
                        <span class="sender-name">👤 ${task.senderName} 님과의 대화</span>
                        <span class="sender-status-badge ${badgeClass}">${task.statusText}</span>
                    </div>
                    <div class="sender-preview">${previewText.replace(/\[[^\]]+\]/g, "")}</div>
                </div>
            `;
            listContainer.append(item);
        });
    }

    function openChatRoom(taskId) {
        const targetId = String(taskId);
        currentActiveTaskId = targetId;
        const task = taskDataStore.find(t => String(t.taskId) === targetId);

        if (!task) {
            console.error("해당 Task ID를 찾을 수 없습니다:", targetId);
            return;
        }

        $('#chat-title').html(`<button class="back-btn" id="chat-back-btn">◀</button> ${task.senderName} 님`);
        $('#sender-list-view').hide();
        $('#chat-room-view').css('display', 'flex');

        refreshChatRoom(targetId);
    }

    function refreshChatRoom(taskId) {
        const targetId = String(taskId);
        const task = taskDataStore.find(t => String(t.taskId) === targetId);
        if (!task) return;

        const historyArea = $('#msg-history-area');

        const isAtBottom = historyArea[0].scrollHeight - historyArea.scrollTop() <= historyArea.outerHeight() + 30;

        historyArea.empty();

        historyArea.append(`
            <div class="msg-group received">
                <span class="msg-meta-name">${task.senderName}</span>
                <div class="msg-bubble">
                    ${task.content.replace(/\n/g, '<br>')}
                </div>
                <span class="msg-time">${task.date}</span>
            </div>
        `);

        const timeline = parseHistory(task.currentAnswer, MY_NAME, task.date);

        timeline.forEach(msg => {
            const isMe = msg.sender === MY_NAME;
            const groupClass = isMe ? "sent" : "received";
            let messageHtml = msg.content.replace(/\n/g, '<br>');

            let fileHtml = "";
            if (msg.file) {
                if (msg.file.data.startsWith("data:image/")) {
                    fileHtml = `<img class="chat-img-preview" src="${msg.file.data}" alt="${msg.file.name}" onclick="window.open('${msg.file.data}')">`;
                } else {
                    fileHtml = `<br><a href="${msg.file.data}" download="${msg.file.name}" class="download-btn">💾 ${msg.file.name} 다운로드</a>`;
                }
            }

            historyArea.append(`
                <div class="msg-group ${groupClass}">
                    <span class="msg-meta-name">${msg.sender}</span>
                    <div class="msg-bubble">
                        ${messageHtml}
                        ${fileHtml}
                    </div>
                    <span class="msg-time">${msg.time}</span>
                </div>
            `);
        });

        if (isAtBottom) {
            historyArea.scrollTop(historyArea[0].scrollHeight);
        }
    }

    function sendReply() {
        const textInput = $('#chat-input-text');
        let newMsg = textInput.val().trim();

        if (!newMsg && !selectedFileBase64) {
            alert("내용을 입력하거나 파일을 첨부해 주세요.");
            return;
        }

        const task = taskDataStore.find(t => String(t.taskId) === String(currentActiveTaskId));
        if (!task) return;

        const timeStamp = getCurrentDateTime();
        let payloadBlock = `[${MY_NAME} | ${timeStamp}]\n${newMsg}`;

        if (selectedFileBase64) {
            payloadBlock += `\n[첨부파일: ${selectedFileName}]\n[파일데이터: ${selectedFileBase64}]`;
        }

        let finalAnswer = "";
        if (task.currentAnswer && task.currentAnswer !== ".") {
            finalAnswer = task.currentAnswer + MSG_SEPARATOR + payloadBlock;
        } else {
            finalAnswer = payloadBlock;
        }

        GM_xmlhttpRequest({
            method: "POST",
            url: `${BASE_URL}/reply`,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "X-CSRF-TOKEN": $('meta[name="csrf-token"]').attr('content')
            },
            data: $.param({
                task_id: currentActiveTaskId,
                status: "2",
                answer: finalAnswer
            }),
            onload: function(res) {
                textInput.val("");
                selectedFileBase64 = null;
                selectedFileName = "";
                $('#selected-file-name').text("");

                fetchTasks();
            }
        });
    }

    function handleFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        selectedFileName = file.name;
        $('#selected-file-name').text(`선택됨: ${selectedFileName}`);

        const reader = new FileReader();
        reader.onload = function(event) {
            selectedFileBase64 = event.target.result;
        };
        reader.readAsDataURL(file);
    }

    $(document).on('click', '#chat-toggle-btn', () => $('#chat-window').toggle());
    $(document).on('click', '#chat-close-btn', () => $('#chat-window').hide());

    $(document).on('click', '.sender-list-item', function() {
        const id = $(this).attr('data-id');
        openChatRoom(id);
    });

    $(document).on('click', '#chat-back-btn', function() {
        currentActiveTaskId = null;
        $('#chat-title').text("나에게 온 대화 목록");
        $('#chat-room-view').hide();
        $('#sender-list-view').show();
    });

    $(document).on('click', '#chat-send-btn', sendReply);
    $(document).on('change', '#chat-file-input', handleFileSelect);

    fetchTasks();
    setInterval(fetchTasks, 5000);

})();

/* ------------------------------------------------------------
 * [블록 2] 출고관리 피킹중/대기중 배송방법별 전체 합계 및 추가 시간 기록 알림 v1.96
 * (원래 packing 화면 데이터지만 @match가 admin/* 전체라 이 파일로 분류했습니다)
 * ------------------------------------------------------------ */
(function() {
    'use strict';

    const savedLeft = localStorage.getItem('picking-counter-left') || '20px';
    const savedTop = localStorage.getItem('picking-counter-top') || '';
    const savedBottom = localStorage.getItem('picking-counter-bottom') || '20px';

    const container = document.createElement('div');
    container.id = 'picking-counter-container';
    container.style = `
        position: fixed;
        top: ${savedTop};
        bottom: ${savedBottom};
        left: ${savedLeft};
        z-index: 99999;
        background-color: #282c34;
        color: #ffffff;
        padding: 12px 14px;
        border-radius: 8px;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        font-family: 'Public Sans', sans-serif;
        font-size: 13px;
        pointer-events: auto;
        border-left: 5px solid #ff4d4f;
        cursor: move;
        user-select: none;
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 175px;
        width: fit-content;
    `;

    container.innerHTML = `
        <div style="font-weight: bold; color: #ff4d4f; border-bottom: 1px solid #444; padding-bottom: 4px; margin-bottom: 2px; display: flex; justify-content: flex-start; align-items: baseline; gap: 8px;">
            <span style="font-size: 14px; white-space: nowrap;">실시간 피킹 현황</span>
            <span id="sync-indicator" style="font-size: 10px; color: #aaa; font-weight: normal; white-space: nowrap;">동기화 중...</span>
        </div>

        <div style="font-weight: bold; color: #ff7875; margin-top: 2px; font-size: 11px;">피킹 진행 중</div>
        <div style="display: flex; justify-content: flex-start; align-items: center; padding-left: 6px; gap: 6px;">
            <span style="color: #40a9ff; min-width: 75px; white-space: nowrap;">✈️ LOTOS:</span>
            <div style="display: flex; align-items: center;">
                <span id="lotos-picking-count" style="font-weight: bold; color: #40a9ff; white-space: nowrap; cursor: pointer;" title="전체 목록 확인">조회 중...</span>
                <span id="lotos-picking-added" style="font-weight: bold; background-color: #ff4d4f; color: white; margin-left: 4px; font-size: 10px; padding: 1px 5px; border-radius: 10px; cursor: pointer; display: none;" title="추가 시간 확인"></span>
            </div>
        </div>
        <div style="display: flex; justify-content: flex-start; align-items: center; padding-left: 6px; border-bottom: 1px dashed #444; padding-bottom: 6px; gap: 6px;">
            <span style="color: #13c2c2; min-width: 75px; white-space: nowrap;">🚢 OCEAN:</span>
            <div style="display: flex; align-items: center;">
                <span id="ocean-picking-count" style="font-weight: bold; color: #13c2c2; white-space: nowrap; cursor: pointer;" title="전체 목록 확인">조회 중...</span>
                <span id="ocean-picking-added" style="font-weight: bold; background-color: #ff4d4f; color: white; margin-left: 4px; font-size: 10px; padding: 1px 5px; border-radius: 10px; cursor: pointer; display: none;" title="추가 시간 확인"></span>
            </div>
        </div>

        <div style="font-weight: bold; color: #ffd666; margin-top: 2px; font-size: 11px;">대기 중</div>
        <div style="display: flex; justify-content: flex-start; align-items: center; padding-left: 6px; gap: 6px;">
            <span style="color: #a0cfff; min-width: 75px; white-space: nowrap;">✈️ LOTOS:</span>
            <div style="display: flex; align-items: center;">
                <span id="lotos-waiting-count" style="font-weight: bold; color: #a0cfff; white-space: nowrap; cursor: pointer;" title="전체 목록 확인">조회 중...</span>
                <span id="lotos-waiting-added" style="font-weight: bold; background-color: #ff9c6e; color: white; margin-left: 4px; font-size: 10px; padding: 1px 5px; border-radius: 10px; cursor: pointer; display: none;" title="추가 시간 확인"></span>
            </div>
        </div>
        <div style="display: flex; justify-content: flex-start; align-items: center; padding-left: 6px; gap: 6px;">
            <span style="color: #87e8de; min-width: 75px; white-space: nowrap;">🚢 OCEAN:</span>
            <div style="display: flex; align-items: center;">
                <span id="ocean-waiting-count" style="font-weight: bold; color: #87e8de; white-space: nowrap; cursor: pointer;" title="전체 목록 확인">조회 중...</span>
                <span id="ocean-waiting-added" style="font-weight: bold; background-color: #ff9c6e; color: white; margin-left: 4px; font-size: 10px; padding: 1px 5px; border-radius: 10px; cursor: pointer; display: none;" title="추가 시간 확인"></span>
            </div>
        </div>
    `;
    document.body.appendChild(container);

    let initialSet = new Set();

    let lotosPickingAdded = [];
    let oceanPickingAdded = [];
    let lotosWaitingAdded = [];
    let oceanWaitingAdded = [];

    let currentLotosPickingList = [];
    let currentOceanPickingList = [];
    let currentLotosWaitingList = [];
    let currentOceanWaitingList = [];

    let isInitialLoadDone = false;

    let isDragging = false;
    let offsetX, offsetY;

    container.addEventListener('mousedown', (e) => {
        if (e.target.id.includes('added') || e.target.id.includes('count')) return;
        isDragging = true;
        offsetX = e.clientX - container.getBoundingClientRect().left;
        offsetY = e.clientY - container.getBoundingClientRect().top;
        container.style.bottom = 'auto';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const x = e.clientX - offsetX;
        const y = e.clientY - offsetY;
        container.style.left = `${x}px`;
        container.style.top = `${y}px`;
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            localStorage.setItem('picking-counter-left', container.style.left);
            localStorage.setItem('picking-counter-top', container.style.top);
            localStorage.removeItem('picking-counter-bottom');
        }
    });

    function parseItemsState(doc) {
        const rows = doc.querySelectorAll('#packingListTbody tr');
        const items = [];

        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 5) return;

            const deliveryNo = cells[2].textContent.trim();
            const shippingMethodText = cells[1].textContent.toUpperCase();

            const memberLink = cells[4].querySelector('.text-primary');
            const memberName = memberLink ? memberLink.textContent.trim() : '미확인';

            let method = 'UNKNOWN';
            if (shippingMethodText.includes('LOTOS')) {
                method = 'LOTOS';
            } else if (shippingMethodText.includes('OCEAN') || shippingMethodText.includes('해운')) {
                method = 'OCEAN';
            }

            const hasPickingText = Array.from(row.querySelectorAll('small.text-danger'))
                                        .some(el => el.textContent.trim() === 'Picking...');

            const state = hasPickingText ? 'PICKING_ON' : 'WAITING';

            items.push({ id: deliveryNo, client: memberName, method: method, state: state });
        });

        return items;
    }

    function getNowTime() {
        const now = new Date();
        return now.toTimeString().split(' ')[0];
    }

    async function syncSystemData() {
        const lPickSpan = document.getElementById('lotos-picking-count');
        const oPickSpan = document.getElementById('ocean-picking-count');
        const lWaitSpan = document.getElementById('lotos-waiting-count');
        const oWaitSpan = document.getElementById('ocean-waiting-count');

        const lPickAddedSpan = document.getElementById('lotos-picking-added');
        const oPickAddedSpan = document.getElementById('ocean-picking-added');
        const lWaitAddedSpan = document.getElementById('lotos-waiting-added');
        const oWaitAddedSpan = document.getElementById('ocean-waiting-added');

        const indicator = document.getElementById('sync-indicator');
        if (indicator) indicator.textContent = "갱신 중...";

        const baseOriginUrl = "https://www.platform.co.jp/admin/shipping/packing?s_status=1";

        GM_xmlhttpRequest({
            method: "GET",
            url: baseOriginUrl,
            onload: function(firstPageResponse) {
                try {
                    const parser = new DOMParser();
                    const firstDoc = parser.parseFromString(firstPageResponse.responseText, "text/html");

                    const pageLinks = firstDoc.querySelectorAll('ul.pagination li.page-item a.page-link');
                    const urls = new Set();
                    urls.add(baseOriginUrl);

                    pageLinks.forEach(link => {
                        const href = link.getAttribute('href');
                        if (href && href.includes('page=')) {
                            const absoluteUrl = new URL(href, baseOriginUrl).href;
                            urls.add(absoluteUrl);
                        }
                    });

                    let completed = 0;
                    const totalUrls = urls.size;
                    let allItems = [];

                    urls.forEach(url => {
                        GM_xmlhttpRequest({
                            method: "GET",
                            url: url,
                            onload: function(response) {
                                try {
                                    const pageParser = new DOMParser();
                                    const doc = pageParser.parseFromString(response.responseText, "text/html");
                                    const pageItems = parseItemsState(doc);
                                    allItems = allItems.concat(pageItems);
                                } catch (err) {
                                    console.error(`서버 동기화 중 오류:`, err);
                                } finally {
                                    completed++;

                                    if (completed === totalUrls) {
                                        if (!isInitialLoadDone) {
                                            allItems.forEach(item => {
                                                initialSet.add(item.id);
                                            });
                                        } else {
                                            allItems.forEach(item => {
                                                if (!initialSet.has(item.id)) {
                                                    const alreadyLogged = lotosPickingAdded.some(h => h.id === item.id) ||
                                                                          oceanPickingAdded.some(h => h.id === item.id) ||
                                                                          lotosWaitingAdded.some(h => h.id === item.id) ||
                                                                          oceanWaitingAdded.some(h => h.id === item.id);

                                                    if (!alreadyLogged) {
                                                        const log = { id: item.id, client: item.client, time: getNowTime() };

                                                        if (item.state === 'PICKING_ON') {
                                                            if (item.method === 'LOTOS') lotosPickingAdded.push(log);
                                                            else if (item.method === 'OCEAN') oceanPickingAdded.push(log);
                                                        } else {
                                                            if (item.method === 'LOTOS') lotosWaitingAdded.push(log);
                                                            else if (item.method === 'OCEAN') oceanWaitingAdded.push(log);
                                                        }
                                                    }
                                                }
                                            });

                                            const activeIds = new Set(allItems.map(i => i.id));
                                            lotosPickingAdded = lotosPickingAdded.filter(h => activeIds.has(h.id));
                                            oceanPickingAdded = oceanPickingAdded.filter(h => activeIds.has(h.id));
                                            lotosWaitingAdded = lotosWaitingAdded.filter(h => activeIds.has(h.id));
                                            oceanWaitingAdded = oceanWaitingAdded.filter(h => activeIds.has(h.id));
                                        }

                                        currentLotosPickingList = allItems.filter(i => i.method === 'LOTOS' && i.state === 'PICKING_ON');
                                        currentOceanPickingList = allItems.filter(i => i.method === 'OCEAN' && i.state === 'PICKING_ON');
                                        currentLotosWaitingList = allItems.filter(i => i.method === 'LOTOS' && i.state === 'WAITING');
                                        currentOceanWaitingList = allItems.filter(i => i.method === 'OCEAN' && i.state === 'WAITING');

                                        if (lPickSpan) lPickSpan.textContent = `${currentLotosPickingList.length} 건`;
                                        if (oPickSpan) oPickSpan.textContent = `${currentOceanPickingList.length} 건`;
                                        if (lWaitSpan) lWaitSpan.textContent = `${currentLotosWaitingList.length} 건`;
                                        if (oWaitSpan) oWaitSpan.textContent = `${currentOceanWaitingList.length} 건`;

                                        if (lotosPickingAdded.length > 0 && lPickAddedSpan) {
                                            lPickAddedSpan.textContent = `+${lotosPickingAdded.length}`;
                                            lPickAddedSpan.style.display = 'inline-block';
                                        } else if (lPickAddedSpan) lPickAddedSpan.style.display = 'none';

                                        if (oceanPickingAdded.length > 0 && oPickAddedSpan) {
                                            oPickAddedSpan.textContent = `+${oceanPickingAdded.length}`;
                                            oPickAddedSpan.style.display = 'inline-block';
                                        } else if (oPickAddedSpan) oPickAddedSpan.style.display = 'none';

                                        if (lotosWaitingAdded.length > 0 && lWaitAddedSpan) {
                                            lWaitAddedSpan.textContent = `+${lotosWaitingAdded.length}`;
                                            lWaitAddedSpan.style.display = 'inline-block';
                                        } else if (lWaitAddedSpan) lWaitAddedSpan.style.display = 'none';

                                        if (oceanWaitingAdded.length > 0 && oWaitAddedSpan) {
                                            oWaitAddedSpan.textContent = `+${oceanWaitingAdded.length}`;
                                            oWaitAddedSpan.style.display = 'inline-block';
                                        } else if (oWaitAddedSpan) oWaitAddedSpan.style.display = 'none';

                                        if (indicator) indicator.textContent = "동기화됨";
                                        isInitialLoadDone = true;
                                    }
                                }
                            },
                            onerror: function() { if (indicator) indicator.textContent = "연결 오류"; }
                        });
                    });

                } catch (e) {
                    console.error("첫 페이지 파싱 에러:", e);
                }
            },
            onerror: function() { if (indicator) indicator.textContent = "연결 오류"; }
        });
    }

    document.addEventListener('click', (e) => {
        const id = e.target.id;

        if (id === 'lotos-picking-added') {
            alert("✈️ [LOTOS 피킹중] 실시간 추가 건수 시간 목록\n--------------------------------------------\n" +
                  lotosPickingAdded.map((item, idx) => `${idx + 1}. [${item.id} / ${item.client}] ➔ ${item.time} 추가됨`).join('\n'));
        }
        else if (id === 'ocean-picking-added') {
            alert("🚢 [해운 피킹중] 실시간 추가 건수 시간 목록\n--------------------------------------------\n" +
                  oceanPickingAdded.map((item, idx) => `${idx + 1}. [${item.id} / ${item.client}] ➔ ${item.time} 추가됨`).join('\n'));
        }
        else if (id === 'lotos-waiting-added') {
            alert("✈️ [LOTOS 대기중] 실시간 추가 건수 시간 목록\n--------------------------------------------\n" +
                  lotosWaitingAdded.map((item, idx) => `${idx + 1}. [${item.id} / ${item.client}] ➔ ${item.time} 추가됨`).join('\n'));
        }
        else if (id === 'ocean-waiting-added') {
            alert("🚢 [해운 대기중] 실시간 추가 건수 시간 목록\n--------------------------------------------\n" +
                  oceanWaitingAdded.map((item, idx) => `${idx + 1}. [${item.id} / ${item.client}] ➔ ${item.time} 추가됨`).join('\n'));
        }

        else if (id === 'lotos-picking-count') {
            if (currentLotosPickingList.length === 0) return alert("현재 활성화된 LOTOS 피킹중 항목이 없습니다.");
            alert(`✈️ [LOTOS 피킹중] 전체 출고번호 목록 (${currentLotosPickingList.length}건)\n--------------------------------------------\n` +
                  currentLotosPickingList.map((item, idx) => `${idx + 1}. [${item.id}] ➔ ${item.client}`).join('\n'));
        }
        else if (id === 'ocean-picking-count') {
            if (currentOceanPickingList.length === 0) return alert("현재 활성화된 해운 피킹중 항목이 없습니다.");
            alert(`🚢 [해운 피킹중] 전체 출고번호 목록 (${currentOceanPickingList.length}건)\n--------------------------------------------\n` +
                  currentOceanPickingList.map((item, idx) => `${idx + 1}. [${item.id}] ➔ ${item.client}`).join('\n'));
        }
        else if (id === 'lotos-waiting-count') {
            if (currentLotosWaitingList.length === 0) return alert("현재 대기중인 LOTOS 항목이 없습니다.");
            alert(`✈️ [LOTOS 대기중] 전체 출고번호 목록 (${currentLotosWaitingList.length}건)\n--------------------------------------------\n` +
                  currentLotosWaitingList.map((item, idx) => `${idx + 1}. [${item.id}] ➔ ${item.client}`).join('\n'));
        }
        else if (id === 'ocean-waiting-count') {
            if (currentOceanWaitingList.length === 0) return alert("현재 대기중인 해운 항목이 없습니다.");
            alert(`🚢 [해운 대기중] 전체 출고번호 목록 (${currentOceanWaitingList.length}건)\n--------------------------------------------\n` +
                  currentOceanWaitingList.map((item, idx) => `${idx + 1}. [${item.id}] ➔ ${item.client}`).join('\n'));
        }
    });

    window.addEventListener('load', () => {
        setTimeout(() => {
            syncSystemData();
            setInterval(syncSystemData, 5000);
        }, 1000);
    });

})();

