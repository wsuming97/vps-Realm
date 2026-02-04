document.addEventListener('DOMContentLoaded', () => {
    const noticeEl = document.getElementById('notice');
    const statusEl = document.getElementById('serviceStatus');
    const statusTextEl = statusEl
        ? (statusEl.querySelector('.status-text') || statusEl.querySelector('span:last-child'))
        : null;

    const pageInfo = document.getElementById('pageInfo');
    const pageSizeSelect = document.getElementById('pageSizeSelect');
    const prevPageBtn = document.getElementById('prevPage');
    const nextPageBtn = document.getElementById('nextPage');

    const listenPortInput = document.getElementById('listenPort');
    const remoteIPInput = document.getElementById('remoteIP');
    const remotePortInput = document.getElementById('remotePort');
    const batchRulesInput = document.getElementById('batchRules');
    const batchForm = document.getElementById('batchForm');
    const rulesTableBody = document.getElementById('rulesTableBody');

    let allRules = [];
    let currentPage = 1;
    let pageSize = pageSizeSelect ? parseInt(pageSizeSelect.value, 10) || 10 : 10;
    let totalRules = 0;

    let nodes = [];
    let currentNodeId = -1; // -1 表示本地模式

    let noticeTimer = null;

    function showNotice(message, type) {
        if (!noticeEl) {
            if (type === 'error') {
                console.error(message);
            } else {
                console.log(message);
            }
            return;
        }
        noticeEl.textContent = message;
        noticeEl.classList.remove('success', 'error');
        if (type === 'success') {
            noticeEl.classList.add('success');
        }
        if (type === 'error') {
            noticeEl.classList.add('error');
        }
        noticeEl.classList.add('show');
        if (noticeTimer) {
            clearTimeout(noticeTimer);
        }
        noticeTimer = setTimeout(() => {
            noticeEl.classList.remove('show');
        }, 4000);
    }

    function setStatus(text, isRunning) {
        if (!statusEl) {
            return;
        }
        if (statusTextEl) {
            statusTextEl.textContent = text;
        } else {
            statusEl.textContent = text;
        }
        statusEl.classList.toggle('running', isRunning);
        statusEl.classList.toggle('stopped', !isRunning);
    }

    function isRemoteNode() {
        return currentNodeId >= 0;
    }

    function getRulesUrl() {
        const base = isRemoteNode() ? `/api/nodes/${currentNodeId}/rules` : '/get_rules';
        return `${base}?page=${currentPage}&size=${pageSize}`;
    }

    function getAddRuleUrl() {
        return isRemoteNode() ? `/api/nodes/${currentNodeId}/rules` : '/add_rule';
    }

    function getDeleteRuleUrl(listenAddress) {
        const base = isRemoteNode() ? `/api/nodes/${currentNodeId}/rules` : '/delete_rule';
        return `${base}?listen=${encodeURIComponent(listenAddress)}`;
    }

    function getStatusUrl() {
        return isRemoteNode() ? `/api/nodes/${currentNodeId}/status` : '/check_status';
    }

    function getActionUrl(action) {
        if (isRemoteNode()) {
            return `/api/nodes/${currentNodeId}/${action}`;
        }

        if (action === 'start') {
            return '/start_service';
        }
        if (action === 'stop') {
            return '/stop_service';
        }
        if (action === 'restart') {
            return '/restart_service';
        }
        return '/';
    }

    async function loadNodes() {
        try {
            const response = await fetch('/api/nodes');
            if (!response.ok) {
                return;
            }

            const data = await response.json();
            nodes = Array.isArray(data.nodes) ? data.nodes : [];

            const nodeSelector = document.getElementById('nodeSelector');
            if (nodes.length > 0) {
                if (currentNodeId >= nodes.length) {
                    currentNodeId = -1;
                }
                renderNodeSelector();
                if (nodeSelector) {
                    nodeSelector.classList.add('visible');
                }
            } else if (nodeSelector) {
                nodeSelector.classList.remove('visible');
            }
        } catch (error) {
            console.log('节点管理功能未启用');
        }
    }

    function renderNodeSelector() {
        const container = document.getElementById('nodeList');
        if (!container) {
            return;
        }
        container.innerHTML = '';

        const localBtn = document.createElement('button');
        localBtn.textContent = '本机';
        localBtn.className = currentNodeId === -1 ? 'node-btn active' : 'node-btn';
        localBtn.onclick = () => selectNode(-1);
        container.appendChild(localBtn);

        nodes.forEach((node, index) => {
            const btn = document.createElement('button');
            btn.textContent = node.name || `${node.host}:${node.port}`;
            btn.className = currentNodeId === index ? 'node-btn active' : 'node-btn';
            btn.onclick = () => selectNode(index);
            container.appendChild(btn);
        });
    }

    async function selectNode(nodeId) {
        currentNodeId = nodeId;
        currentPage = 1;
        renderNodeSelector();
        await fetchForwardingRules();
        await updateServiceStatus();
    }

    async function updateServiceStatus() {
        try {
            const response = await fetch(getStatusUrl());
            if (!response.ok) {
                throw new Error('检查状态失败: ' + response.statusText);
            }
            const data = await response.json();
            const isRunning = data.status === '启用' || data.status === '运行中';
            const displayText = isRunning ? '运行中' : (data.status || '已停止');
            setStatus(displayText, isRunning);
        } catch (error) {
            console.error('状态检查失败', error);
            setStatus('未知', false);
        }
    }

    async function fetchForwardingRules() {
        try {
            const response = await fetch(getRulesUrl(), {
                method: 'GET',
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
            });

            if (!response.ok) {
                throw new Error('获取规则失败: ' + response.statusText);
            }

            const data = await response.json();
            if (!Array.isArray(data.rules)) {
                throw new Error('服务返回的数据格式不正确');
            }

            totalRules = typeof data.total === 'number' ? data.total : data.rules.length;
            allRules = data.rules.map(rule => {
                const listen = rule.Listen || rule.listen;
                const remote = rule.Remote || rule.remote;
                return { listen, remote };
            }).filter(rule => rule.listen && rule.remote);

            renderForwardingRules();

            return allRules;
        } catch (error) {
            console.error('获取规则失败:', error);
            showNotice(`获取转发规则失败: ${error.message}`, 'error');
            allRules = [];
            totalRules = 0;
            renderForwardingRules();
            return [];
        }
    }

    function renderForwardingRules() {
        if (!rulesTableBody) {
            return;
        }
        rulesTableBody.innerHTML = '';

        if (allRules.length === 0) {
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = '<td colspan="5">暂无规则</td>';
            rulesTableBody.appendChild(emptyRow);
            updatePaginationInfo();
            return;
        }

        allRules.forEach((rule, index) => {
            const listen = rule.listen;
            const remote = rule.remote;

            const localPort = listen.includes(':') ? listen.split(':').pop() : listen;
            const lastColonIndex = remote.lastIndexOf(':');
            const remoteIP = lastColonIndex > -1 ? remote.substring(0, lastColonIndex) : remote;
            const remotePort = lastColonIndex > -1 ? remote.substring(lastColonIndex + 1) : '';

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${(currentPage - 1) * pageSize + index + 1}</td>
                <td>${localPort}</td>
                <td>${remoteIP}</td>
                <td>${remotePort}</td>
                <td><button class="delete-btn" data-listen="${listen}">删除</button></td>
            `;
            rulesTableBody.appendChild(row);
        });

        rulesTableBody.querySelectorAll('.delete-btn').forEach(button => {
            button.addEventListener('click', function() {
                deleteRule(this.getAttribute('data-listen'));
            });
        });

        updatePaginationInfo();
    }

    function updatePaginationInfo() {
        const totalPages = Math.max(1, Math.ceil(totalRules / pageSize));
        if (currentPage > totalPages) {
            currentPage = totalPages;
            fetchForwardingRules();
            return;
        }

        if (pageInfo) {
            pageInfo.textContent = `第 ${currentPage} / ${totalPages} 页`;
        }
        if (prevPageBtn) {
            prevPageBtn.disabled = currentPage <= 1;
        }
        if (nextPageBtn) {
            nextPageBtn.disabled = currentPage >= totalPages;
        }
    }

    function goToPrevPage() {
        if (currentPage > 1) {
            currentPage--;
            fetchForwardingRules();
        }
    }

    function goToNextPage() {
        const totalPages = Math.max(1, Math.ceil(totalRules / pageSize));
        if (currentPage < totalPages) {
            currentPage++;
            fetchForwardingRules();
        }
    }

    function changePageSize() {
        if (!pageSizeSelect) {
            return;
        }
        pageSize = parseInt(pageSizeSelect.value, 10) || pageSize;
        currentPage = 1;
        fetchForwardingRules();
    }

    function toggleBatchForm() {
        if (!batchForm) {
            return;
        }
        batchForm.classList.toggle('visible');
    }

    async function deleteRule(listenAddress) {
        try {
            const response = await fetch(getDeleteRuleUrl(listenAddress), {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('删除规则失败: ' + response.statusText);
            }

            const restartResponse = await fetch(getActionUrl('restart'), {
                method: 'POST'
            });
            if (!restartResponse.ok) {
                throw new Error('重启服务失败: ' + restartResponse.statusText);
            }

            showNotice('规则已删除，服务已重启', 'success');
            await fetchForwardingRules();
            await updateServiceStatus();
        } catch (error) {
            console.error('删除失败:', error);
            showNotice(error.message, 'error');
        }
    }

    async function addRule() {
        if (!listenPortInput || !remoteIPInput || !remotePortInput) {
            showNotice('表单未初始化', 'error');
            return;
        }

        const localPort = listenPortInput.value.trim();
        const remoteIP = remoteIPInput.value.trim();
        const remotePort = remotePortInput.value.trim();

        if (!localPort || !remoteIP || !remotePort) {
            showNotice('请填写所有字段', 'error');
            return;
        }

        try {
            const usedPorts = new Set(allRules.map(r => r.listen.split(':').pop()));
            if (usedPorts.has(localPort)) {
                showNotice(`端口 ${localPort} 已被占用`, 'error');
                return;
            }

            const response = await fetch(getAddRuleUrl(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    listen: `0.0.0.0:${localPort}`,
                    remote: `${remoteIP}:${remotePort}`
                })
            });

            if (!response.ok) {
                throw new Error('添加规则失败: ' + response.statusText);
            }

            const restartResponse = await fetch(getActionUrl('restart'), {
                method: 'POST'
            });
            if (!restartResponse.ok) {
                throw new Error('重启服务失败: ' + restartResponse.statusText);
            }

            showNotice('规则添加成功，服务已重启', 'success');
            listenPortInput.value = '';
            remoteIPInput.value = '';
            remotePortInput.value = '';
            await fetchForwardingRules();
            await updateServiceStatus();
        } catch (error) {
            console.error('添加失败:', error);
            showNotice(error.message, 'error');
        }
    }

    function parseBatchLine(line) {
        const csvParts = line.split(',').map(part => part.trim()).filter(Boolean);
        if (csvParts.length === 3) {
            return {
                localPort: csvParts[0],
                remoteAddress: `${csvParts[1]}:${csvParts[2]}`
            };
        }

        const legacyMatch = line.match(/^(\d+):(\[.*?\]:\d+|\S+)$/);
        if (legacyMatch) {
            return {
                localPort: legacyMatch[1],
                remoteAddress: legacyMatch[2]
            };
        }

        return null;
    }

    async function addBatchRules() {
        if (!batchRulesInput) {
            showNotice('表单未初始化', 'error');
            return;
        }

        const rules = batchRulesInput.value
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean);

        if (rules.length === 0) {
            showNotice('请输入要添加的规则', 'error');
            return;
        }

        const usedPorts = new Set(allRules.map(r => r.listen.split(':').pop()));
        const failedRules = [];
        let hasSuccess = false;

        for (const rule of rules) {
            const parsed = parseBatchLine(rule);
            if (!parsed) {
                failedRules.push(`格式错误: ${rule}`);
                continue;
            }

            const localPort = parsed.localPort;
            const remoteAddress = parsed.remoteAddress;

            if (usedPorts.has(localPort)) {
                failedRules.push(`端口 ${localPort} 已被占用`);
                continue;
            }

            try {
                const response = await fetch(getAddRuleUrl(), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        listen: `0.0.0.0:${localPort}`,
                        remote: remoteAddress
                    })
                });

                if (!response.ok) {
                    failedRules.push(`添加失败: ${rule}`);
                    continue;
                }

                usedPorts.add(localPort);
                hasSuccess = true;
            } catch (error) {
                failedRules.push(`添加失败: ${rule} - ${error.message}`);
            }
        }

        if (hasSuccess) {
            try {
                const restartResponse = await fetch(getActionUrl('restart'), {
                    method: 'POST'
                });
                if (!restartResponse.ok) {
                    throw new Error('重启服务失败');
                }
            } catch (error) {
                failedRules.push('服务重启失败');
            }
        }

        batchRulesInput.value = '';
        await fetchForwardingRules();
        await updateServiceStatus();

        if (failedRules.length > 0) {
            showNotice(`添加完成。失败的规则：\n${failedRules.join('\n')}`, 'error');
        } else {
            showNotice('所有规则添加成功，服务已重启', 'success');
        }
    }

    async function controlService(action) {
        const labels = {
            start: '启动',
            stop: '停止',
            restart: '重启'
        };
        try {
            const response = await fetch(getActionUrl(action), {
                method: 'POST'
            });
            if (!response.ok) {
                throw new Error(`${labels[action] || '操作'}服务失败: ${response.statusText}`);
            }
            showNotice(`服务${labels[action] || ''}成功`, 'success');
            await updateServiceStatus();
        } catch (error) {
            console.error('服务控制失败:', error);
            showNotice(error.message, 'error');
        }
    }

    async function logout() {
        try {
            const response = await fetch('/logout', {
                method: 'POST'
            });
            if (response.ok) {
                window.location.href = '/login';
            } else {
                throw new Error('登出失败: ' + response.statusText);
            }
        } catch (error) {
            console.error('登出失败:', error);
            showNotice(error.message, 'error');
        }
    }

    window.goToPrevPage = goToPrevPage;
    window.goToNextPage = goToNextPage;
    window.changePageSize = changePageSize;
    window.toggleBatchForm = toggleBatchForm;
    window.addRule = addRule;
    window.addBatchRules = addBatchRules;
    window.controlService = controlService;
    window.logout = logout;

    loadNodes();
    fetchForwardingRules();
    updateServiceStatus();

    setInterval(updateServiceStatus, 15000);
});
