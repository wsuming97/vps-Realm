document.addEventListener('DOMContentLoaded', () => {
    const outputDiv = document.getElementById('output');
    const startButton = document.getElementById('startButton');
    const stopButton = document.getElementById('stopButton');
    const restartButton = document.getElementById('restartButton');
    const addRuleButton = document.getElementById('addRuleButton');
    const addBatchRulesButton = document.getElementById('addBatchRulesButton');
    const logoutButton = document.getElementById('logoutButton');
    const localPortInput = document.getElementById('localPort');
    const remoteIPInput = document.getElementById('remoteIP');
    const remotePortInput = document.getElementById('remotePort');
    const rulesInput = document.getElementById('rulesInput');

    let allRules = [];
    let currentPage = 1;
    let pageSize = 10;
    let totalRules = 0;
    let nodes = [];
    let currentNodeId = -1; // -1 表示本地模式

    const pageSizeSelect = document.getElementById('pageSizeSelect');

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
            nodes = data.nodes || [];

            if (nodes.length > 0) {
                renderNodeSelector();
                document.getElementById('nodeSelector').classList.add('visible');
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
            btn.textContent = node.name;
            btn.className = currentNodeId === index ? 'node-btn active' : 'node-btn';
            btn.onclick = () => selectNode(index);
            container.appendChild(btn);
        });

        // 添加管理节点按钮
        const manageBtn = document.createElement('button');
        manageBtn.textContent = '⚙ 管理节点';
        manageBtn.className = 'node-btn manage-btn';
        manageBtn.onclick = () => showNodeManager();
        container.appendChild(manageBtn);
    }

    // 显示节点管理对话框
    function showNodeManager() {
        let modal = document.getElementById('nodeManagerModal');
        if (!modal) {
            modal = createNodeManagerModal();
            document.body.appendChild(modal);
        }
        renderNodeList();
        modal.style.display = 'flex';
    }

    // 创建节点管理模态框 - Apple Vision Pro 风格
    function createNodeManagerModal() {
        const modal = document.createElement('div');
        modal.id = 'nodeManagerModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content glass-modal">
                <div class="modal-header">
                    <h3>🌐 节点管理</h3>
                    <button class="modal-close" onclick="document.getElementById('nodeManagerModal').style.display='none'">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="node-form glass-form">
                        <h4>✨ 添加新节点</h4>
                        <div class="form-row">
                            <input type="text" id="nodeName" placeholder="节点名称" class="glass-input" />
                            <input type="text" id="nodeHost" placeholder="IP 地址" class="glass-input" />
                        </div>
                        <div class="form-row">
                            <input type="number" id="nodePort" placeholder="端口" value="8081" class="glass-input" />
                            <input type="password" id="nodePassword" placeholder="面板密码" class="glass-input" />
                        </div>
                        <div class="form-row checkbox-row">
                            <label class="glass-checkbox"><input type="checkbox" id="nodeHttps" /> 使用 HTTPS</label>
                            <button class="control-btn" onclick="addNode()">➕ 添加节点</button>
                        </div>
                    </div>
                    <div class="node-list-container">
                        <h4>📋 已配置节点</h4>
                        <div id="managedNodeList" class="managed-list"></div>
                    </div>
                </div>
            </div>
        `;
        return modal;
    }

    // 渲染节点列表
    function renderNodeList() {
        const container = document.getElementById('managedNodeList');
        if (!container) return;
        
        if (nodes.length === 0) {
            container.innerHTML = '<p class="no-nodes">暂无配置的远程节点</p>';
            return;
        }

        container.innerHTML = nodes.map((node, index) => `
            <div class="managed-node-item">
                <div class="node-info">
                    <strong>${node.name}</strong>
                    <span>${node.host}:${node.port}</span>
                    <span class="node-protocol">${node.https ? 'HTTPS' : 'HTTP'}</span>
                </div>
                <div class="node-actions">
                    <button class="btn-test" onclick="testNode(${index})">测试</button>
                    <button class="btn-delete" onclick="deleteNode(${index})">删除</button>
                </div>
            </div>
        `).join('');
    }

    // 添加节点
    window.addNode = async function() {
        const name = document.getElementById('nodeName').value.trim();
        const host = document.getElementById('nodeHost').value.trim();
        const port = parseInt(document.getElementById('nodePort').value) || 8081;
        const password = document.getElementById('nodePassword').value;
        const https = document.getElementById('nodeHttps').checked;

        if (!name || !host || !password) {
            alert('请填写节点名称、IP地址和密码');
            return;
        }

        try {
            const response = await fetch('/api/nodes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, host, port, password, https })
            });

            const data = await response.json();
            if (response.ok) {
                nodes = data.nodes || [];
                renderNodeList();
                renderNodeSelector();
                // 清空表单
                document.getElementById('nodeName').value = '';
                document.getElementById('nodeHost').value = '';
                document.getElementById('nodePort').value = '8081';
                document.getElementById('nodePassword').value = '';
                document.getElementById('nodeHttps').checked = false;
                alert('节点添加成功');
            } else {
                alert(data.error || '添加失败');
            }
        } catch (error) {
            alert('添加节点失败: ' + error.message);
        }
    };

    // 测试节点连接
    window.testNode = async function(index) {
        try {
            const response = await fetch(`/api/nodes/${index}/test`, { method: 'POST' });
            const data = await response.json();
            if (data.success) {
                alert('✓ 连接成功');
            } else {
                alert('✗ 连接失败: ' + (data.error || '未知错误'));
            }
        } catch (error) {
            alert('测试失败: ' + error.message);
        }
    };

    // 删除节点
    window.deleteNode = async function(index) {
        if (!confirm(`确定要删除节点 "${nodes[index].name}" 吗？`)) {
            return;
        }

        try {
            const response = await fetch(`/api/nodes/${index}`, { method: 'DELETE' });
            const data = await response.json();
            if (response.ok) {
                nodes = data.nodes || [];
                renderNodeList();
                renderNodeSelector();
                // 如果删除的是当前选中的节点，切换到本机
                if (currentNodeId === index) {
                    selectNode(-1);
                } else if (currentNodeId > index) {
                    currentNodeId--;
                }
                alert('节点删除成功');
            } else {
                alert(data.error || '删除失败');
            }
        } catch (error) {
            alert('删除节点失败: ' + error.message);
        }
    };

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
                throw new Error('检查状态失败：' + response.statusText);
            }
            const data = await response.json();
            const statusElement = document.getElementById('serviceStatus');
            
            if (data.status === "启用") {
                statusElement.innerHTML = '<span class="status-dot"></span>运行中';
                statusElement.className = 'status-pill running';
            } else {
                statusElement.innerHTML = '<span class="status-dot"></span>已停止';
                statusElement.className = 'status-pill stopped';
            }
        } catch (error) {
            console.error('状态检查失败:', error);
            const statusElement = document.getElementById('serviceStatus');
            statusElement.innerHTML = '<span class="status-dot"></span>未知';
            statusElement.className = 'status-pill stopped';
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
                throw new Error('获取规则失败：' + response.statusText);
            }
    
            const data = await response.json();
            if (!Array.isArray(data.rules)) {
                throw new Error('服务器返回的数据格式不正确');
            }

            totalRules = data.total;
            allRules = data.rules.map(rule => {
                const listen = rule.Listen || rule.listen;
                const remote = rule.Remote || rule.remote;
                return { listen, remote };
            });

            renderForwardingRules();

            return allRules;
        } catch (error) {
            console.error('获取规则失败:', error);
            outputDiv.textContent = `获取转发规则失败: ${error.message}`;
            return [];
        }
    }

    function renderForwardingRules() {
        const tbody = document.querySelector('#forwardingTable tbody');
        tbody.innerHTML = '';

        allRules.forEach((rule, index) => {
            const listen = rule.listen;
            const remote = rule.remote;

            const localPort = listen.split(':')[1];
            const lastColonIndex = remote.lastIndexOf(':');
            const remoteIP = remote.substring(0, lastColonIndex);
            const remotePort = remote.substring(lastColonIndex + 1);

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${(currentPage - 1) * pageSize + index + 1}</td>
                <td>${localPort}</td>
                <td>${remoteIP}</td>
                <td>${remotePort}</td>
                <td><button class="delete-btn" data-listen="${listen}">删除</button></td>
            `;
            tbody.appendChild(row);
        });

        document.querySelectorAll('.delete-btn').forEach(button => {
            button.addEventListener('click', function() {
                deleteRule(this.getAttribute('data-listen'));
            });
        });

        updatePaginationInfo();
    }

    function updatePaginationInfo() {
        const pageInfo = document.getElementById('pageInfo');
        const totalPages = Math.ceil(totalRules / pageSize);
        pageInfo.textContent = `第 ${currentPage} / ${totalPages === 0 ? 1 : totalPages} 页`;

        document.getElementById('prevPage').disabled = (currentPage <= 1);
        document.getElementById('nextPage').disabled = (currentPage >= totalPages || totalPages === 0);
    }

    function goToPrevPage() {
        if (currentPage > 1) {
            currentPage--;
            fetchForwardingRules();
        }
    }

    function goToNextPage() {
        const totalPages = Math.ceil(totalRules / pageSize);
        if (currentPage < totalPages) {
            currentPage++;
            fetchForwardingRules();
        }
    }

    async function deleteRule(listenAddress) {
        try {
            const response = await fetch(getDeleteRuleUrl(listenAddress), {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('删除规则失败：' + response.statusText);
            }

            const restartResponse = await fetch(getActionUrl('restart'), {
                method: 'POST'
            });
            if (!restartResponse.ok) {
                throw new Error('重启服务失败：' + restartResponse.statusText);
            }

            outputDiv.textContent = '规则已删除，服务已重启';
            await fetchForwardingRules();
            await updateServiceStatus();
        } catch (error) {
            console.error('删除失败:', error);
            outputDiv.textContent = error.message;
        }
    }

    async function addRule() {
        const localPort = localPortInput.value.trim();
        const remoteIP = remoteIPInput.value.trim();
        const remotePort = remotePortInput.value.trim();

        if (!localPort || !remoteIP || !remotePort) {
            outputDiv.textContent = '请填写所有字段';
            return;
        }

        try {
            const usedPorts = new Set(allRules.map(r => r.listen.split(':')[1]));
            if (usedPorts.has(localPort)) {
                outputDiv.textContent = `端口 ${localPort} 已被占用`;
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
                throw new Error('添加规则失败：' + response.statusText);
            }

            const restartResponse = await fetch(getActionUrl('restart'), {
                method: 'POST'
            });
            if (!restartResponse.ok) {
                throw new Error('重启服务失败：' + restartResponse.statusText);
            }

            outputDiv.textContent = '规则添加成功，服务已重启';
            localPortInput.value = '';
            remoteIPInput.value = '';
            remotePortInput.value = '';
            await fetchForwardingRules();
            await updateServiceStatus();
        } catch (error) {
            console.error('添加失败:', error);
            outputDiv.textContent = error.message;
        }
    }

    async function addBatchRules() {
        const rules = rulesInput.value.trim().split('\n').filter(Boolean);
        if (rules.length === 0) {
            outputDiv.textContent = '请输入要添加的规则';
            return;
        }

        const usedPorts = new Set(allRules.map(r => r.listen.split(':')[1]));
        const failedRules = [];
        let hasSuccess = false;

        for (const rule of rules) {
            const match = rule.match(/^(\d+):(\[.*?\]:\d+|\S+)$/);
            if (!match) {
                failedRules.push(`格式错误: ${rule}`);
                continue;
            }

            const localPort = match[1];
            const remoteAddress = match[2];

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

        rulesInput.value = '';
        await fetchForwardingRules();
        await updateServiceStatus();

        if (failedRules.length > 0) {
            outputDiv.textContent = `添加完成。\n失败的规则：\n${failedRules.join('\n')}`;
        } else {
            outputDiv.textContent = '所有规则添加成功，服务已重启';
        }
    }

    startButton.addEventListener('click', async () => {
        try {
            const response = await fetch(getActionUrl('start'), {
                method: 'POST'
            });
            if (!response.ok) {
                throw new Error('启动服务失败：' + response.statusText);
            }
            outputDiv.textContent = '服务启动成功';
            await updateServiceStatus();
        } catch (error) {
            console.error('启动失败:', error);
            outputDiv.textContent = error.message;
        }
    });

    stopButton.addEventListener('click', async () => {
        try {
            const response = await fetch(getActionUrl('stop'), {
                method: 'POST'
            });
            if (!response.ok) {
                throw new Error('停止服务失败：' + response.statusText);
            }
            outputDiv.textContent = '服务停止成功';
            await updateServiceStatus();
        } catch (error) {
            console.error('停止失败:', error);
            outputDiv.textContent = error.message;
        }
    });

    restartButton.addEventListener('click', async () => {
        try {
            const response = await fetch(getActionUrl('restart'), {
                method: 'POST'
            });
            if (!response.ok) {
                throw new Error('重启服务失败：' + response.statusText);
            }
            outputDiv.textContent = '服务重启成功';
            await updateServiceStatus();
        } catch (error) {
            console.error('重启失败:', error);
            outputDiv.textContent = error.message;
        }
    });

    logoutButton.addEventListener('click', async () => {
        try {
            const response = await fetch('/logout', {
                method: 'POST'
            });
            if (response.ok) {
                window.location.href = '/login';
            } else {
                throw new Error('登出失败：' + response.statusText);
            }
        } catch (error) {
            console.error('登出失败:', error);
            outputDiv.textContent = error.message;
        }
    });

    addRuleButton.addEventListener('click', addRule);
    addBatchRulesButton.addEventListener('click', addBatchRules);

    document.getElementById('prevPage').addEventListener('click', goToPrevPage);
    document.getElementById('nextPage').addEventListener('click', goToNextPage);

    pageSizeSelect.addEventListener('change', () => {
        pageSize = parseInt(pageSizeSelect.value, 10);
        currentPage = 1;
        fetchForwardingRules();
    });
    loadNodes();
    fetchForwardingRules();
    updateServiceStatus();
    
    setInterval(updateServiceStatus, 15000);
});
