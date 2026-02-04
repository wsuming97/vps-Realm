# Realm 多节点集中管理 - 开发任务书

## 📋 需求概述

**目标**: 在一个 Web 面板中管理多台中转机的 Realm 转发规则

**场景**: 
- 用户有 A、B、C、D 四台机器
- A 和 B 是中转机，都安装了 Realm
- 需要配置 A→C、B→D 的转发
- 目前需要分别登录 A 和 B 的面板
- **期望**: 一个面板管理所有中转机

---

## 🏗️ 采用方案: 联邦架构

```
┌─────────────────────────────────────────────────────────────┐
│                    统一管理面板                              │
│                    (新增功能)                                │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP API 代理
        ┌─────────────┴─────────────┐
        │                           │
        ▼                           ▼
   ┌─────────────┐            ┌─────────────┐
   │  节点 A      │            │  节点 B      │
   │  原版面板    │            │  原版面板    │
   └─────────────┘            └─────────────┘
```

**架构特点**:
- 各节点保持原版面板不变
- 新增统一管理层，通过 API 代理请求
- 各节点可独立运行，无单点故障

---

## ✅ 开发任务清单

### 任务 1: 新增节点配置文件

**文件**: `web/nodes.toml` (新建)

```toml
# 节点配置示例
[[nodes]]
name = "中转机A"
host = "192.168.1.1"
port = 8081
password = "password_a"
https = false

[[nodes]]
name = "中转机B"  
host = "192.168.1.2"
port = 8081
password = "password_b"
https = false
```

---

### 任务 2: 后端新增节点管理功能

**文件**: `web/main.go` (修改)

#### 2.1 新增数据结构

```go
// 在现有 struct 后添加

type Node struct {
    Name     string `toml:"name" json:"name"`
    Host     string `toml:"host" json:"host"`
    Port     int    `toml:"port" json:"port"`
    Password string `toml:"password" json:"-"`
    HTTPS    bool   `toml:"https" json:"https"`
}

type NodesConfig struct {
    Nodes []Node `toml:"nodes"`
}

var nodesConfig NodesConfig
```

#### 2.2 新增加载节点配置函数

```go
func LoadNodesConfig() error {
    data, err := os.ReadFile("./nodes.toml")
    if err != nil {
        // 文件不存在时不报错，使用空配置
        if os.IsNotExist(err) {
            nodesConfig = NodesConfig{Nodes: []Node{}}
            return nil
        }
        return err
    }
    
    if _, err := toml.Decode(string(data), &nodesConfig); err != nil {
        return err
    }
    return nil
}
```

#### 2.3 新增 API 接口

在 `main()` 函数的 `authorized` 路由组中添加:

```go
// 获取所有节点列表
authorized.GET("/api/nodes", func(c *gin.Context) {
    c.JSON(200, gin.H{"nodes": nodesConfig.Nodes})
})

// 获取指定节点的规则
authorized.GET("/api/nodes/:id/rules", func(c *gin.Context) {
    id, _ := strconv.Atoi(c.Param("id"))
    if id < 0 || id >= len(nodesConfig.Nodes) {
        c.JSON(404, gin.H{"error": "节点不存在"})
        return
    }
    node := nodesConfig.Nodes[id]
    
    // 代理请求到目标节点
    resp, err := proxyToNode(node, "GET", "/get_rules?page=1&size=100", nil)
    if err != nil {
        c.JSON(500, gin.H{"error": "连接节点失败: " + err.Error()})
        return
    }
    defer resp.Body.Close()
    
    body, _ := io.ReadAll(resp.Body)
    c.Data(resp.StatusCode, "application/json", body)
})

// 向指定节点添加规则
authorized.POST("/api/nodes/:id/rules", func(c *gin.Context) {
    id, _ := strconv.Atoi(c.Param("id"))
    if id < 0 || id >= len(nodesConfig.Nodes) {
        c.JSON(404, gin.H{"error": "节点不存在"})
        return
    }
    node := nodesConfig.Nodes[id]
    
    body, _ := io.ReadAll(c.Request.Body)
    resp, err := proxyToNode(node, "POST", "/add_rule", body)
    if err != nil {
        c.JSON(500, gin.H{"error": "连接节点失败"})
        return
    }
    defer resp.Body.Close()
    
    respBody, _ := io.ReadAll(resp.Body)
    c.Data(resp.StatusCode, "application/json", respBody)
})

// 删除指定节点的规则
authorized.DELETE("/api/nodes/:id/rules", func(c *gin.Context) {
    id, _ := strconv.Atoi(c.Param("id"))
    listen := c.Query("listen")
    
    if id < 0 || id >= len(nodesConfig.Nodes) {
        c.JSON(404, gin.H{"error": "节点不存在"})
        return
    }
    node := nodesConfig.Nodes[id]
    
    resp, err := proxyToNode(node, "DELETE", "/delete_rule?listen="+url.QueryEscape(listen), nil)
    if err != nil {
        c.JSON(500, gin.H{"error": "连接节点失败"})
        return
    }
    defer resp.Body.Close()
    
    body, _ := io.ReadAll(resp.Body)
    c.Data(resp.StatusCode, "application/json", body)
})

// 获取指定节点状态
authorized.GET("/api/nodes/:id/status", func(c *gin.Context) {
    id, _ := strconv.Atoi(c.Param("id"))
    if id < 0 || id >= len(nodesConfig.Nodes) {
        c.JSON(404, gin.H{"error": "节点不存在"})
        return
    }
    node := nodesConfig.Nodes[id]
    
    resp, err := proxyToNode(node, "GET", "/check_status", nil)
    if err != nil {
        c.JSON(200, gin.H{"status": "离线", "error": err.Error()})
        return
    }
    defer resp.Body.Close()
    
    body, _ := io.ReadAll(resp.Body)
    c.Data(resp.StatusCode, "application/json", body)
})

// 控制指定节点服务
authorized.POST("/api/nodes/:id/:action", func(c *gin.Context) {
    id, _ := strconv.Atoi(c.Param("id"))
    action := c.Param("action")
    
    if id < 0 || id >= len(nodesConfig.Nodes) {
        c.JSON(404, gin.H{"error": "节点不存在"})
        return
    }
    
    validActions := map[string]string{
        "start":   "/start_service",
        "stop":    "/stop_service", 
        "restart": "/restart_service",
    }
    
    path, ok := validActions[action]
    if !ok {
        c.JSON(400, gin.H{"error": "无效操作"})
        return
    }
    
    node := nodesConfig.Nodes[id]
    resp, err := proxyToNode(node, "POST", path, nil)
    if err != nil {
        c.JSON(500, gin.H{"error": "连接节点失败"})
        return
    }
    defer resp.Body.Close()
    
    body, _ := io.ReadAll(resp.Body)
    c.Data(resp.StatusCode, "application/json", body)
})
```

#### 2.4 新增代理请求函数

```go
import (
    "io"
    "net/http"
    "net/http/cookiejar"
    "net/url"
    "time"
)

// 节点 Session 缓存
var nodeSessionCache = make(map[string]*http.Client)

func proxyToNode(node Node, method, path string, body []byte) (*http.Response, error) {
    scheme := "http"
    if node.HTTPS {
        scheme = "https"
    }
    
    baseURL := fmt.Sprintf("%s://%s:%d", scheme, node.Host, node.Port)
    
    // 获取或创建该节点的 HTTP 客户端
    client, exists := nodeSessionCache[baseURL]
    if !exists {
        jar, _ := cookiejar.New(nil)
        client = &http.Client{
            Timeout: 10 * time.Second,
            Jar:     jar,
        }
        
        // 先登录获取 session
        loginURL := baseURL + "/login"
        loginBody := fmt.Sprintf(`{"password":"%s"}`, node.Password)
        req, _ := http.NewRequest("POST", loginURL, bytes.NewBufferString(loginBody))
        req.Header.Set("Content-Type", "application/json")
        
        resp, err := client.Do(req)
        if err != nil {
            return nil, fmt.Errorf("登录失败: %v", err)
        }
        resp.Body.Close()
        
        if resp.StatusCode != 200 {
            return nil, fmt.Errorf("登录失败: 密码错误")
        }
        
        nodeSessionCache[baseURL] = client
    }
    
    // 发送实际请求
    targetURL := baseURL + path
    var bodyReader io.Reader
    if body != nil {
        bodyReader = bytes.NewReader(body)
    }
    
    req, err := http.NewRequest(method, targetURL, bodyReader)
    if err != nil {
        return nil, err
    }
    
    if body != nil {
        req.Header.Set("Content-Type", "application/json")
    }
    
    return client.Do(req)
}
```

#### 2.5 修改 main 函数

在 `main()` 函数开头添加:

```go
// 加载节点配置 (在 LoadPanelConfig 后面)
if err := LoadNodesConfig(); err != nil {
    log.Printf("警告: 无法加载节点配置: %v", err)
}
```

---

### 任务 3: 前端新增节点管理 UI

**文件**: `web/templates/index.html` (修改)

在页面顶部添加节点选择区域:

```html
<!-- 在 button-group 前面添加 -->
<div id="nodeSelector" style="margin-bottom: 20px; display: none;">
    <h3>选择节点</h3>
    <div id="nodeList" style="display: flex; gap: 10px; flex-wrap: wrap;">
        <!-- 节点按钮动态生成 -->
    </div>
</div>
```

**文件**: `web/static/app.js` (修改)

添加节点管理逻辑:

```javascript
// 在文件开头添加
let nodes = [];
let currentNodeId = -1; // -1 表示本地模式

// 加载节点列表
async function loadNodes() {
    try {
        const response = await fetch('/api/nodes');
        if (!response.ok) return;
        
        const data = await response.json();
        nodes = data.nodes || [];
        
        if (nodes.length > 0) {
            renderNodeSelector();
            document.getElementById('nodeSelector').style.display = 'block';
        }
    } catch (error) {
        console.log('节点管理功能未启用');
    }
}

function renderNodeSelector() {
    const container = document.getElementById('nodeList');
    container.innerHTML = '';
    
    // 添加本地节点按钮
    const localBtn = document.createElement('button');
    localBtn.textContent = '本机';
    localBtn.className = currentNodeId === -1 ? 'node-btn active' : 'node-btn';
    localBtn.onclick = () => selectNode(-1);
    container.appendChild(localBtn);
    
    // 添加远程节点按钮
    nodes.forEach((node, index) => {
        const btn = document.createElement('button');
        btn.textContent = node.name;
        btn.className = currentNodeId === index ? 'node-btn active' : 'node-btn';
        btn.onclick = () => selectNode(index);
        container.appendChild(btn);
    });
}

async function selectNode(nodeId) {
    currentNodeId = nodeId;
    renderNodeSelector();
    await fetchForwardingRules();
    await updateServiceStatus();
}

// 修改 fetchForwardingRules 函数
async function fetchForwardingRules() {
    try {
        let url = `/get_rules?page=${currentPage}&size=${pageSize}`;
        if (currentNodeId >= 0) {
            url = `/api/nodes/${currentNodeId}/rules`;
        }
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
        });
        // ... 其余代码不变
    }
}

// 修改 updateServiceStatus 函数
async function updateServiceStatus() {
    try {
        let url = '/check_status';
        if (currentNodeId >= 0) {
            url = `/api/nodes/${currentNodeId}/status`;
        }
        
        const response = await fetch(url);
        // ... 其余代码不变
    }
}

// 在 DOMContentLoaded 事件中调用
loadNodes();
```

---

### 任务 4: 新增节点按钮样式

**文件**: `web/templates/index.html` (修改)

在 `<style>` 中添加:

```css
.node-btn {
    padding: 8px 16px;
    border: 2px solid #ddd;
    border-radius: 5px;
    background-color: #fff;
    cursor: pointer;
    transition: all 0.3s;
}

.node-btn:hover {
    border-color: #28a745;
}

.node-btn.active {
    background-color: #28a745;
    color: white;
    border-color: #28a745;
}
```

---

## 📁 文件改动汇总

| 文件 | 操作 | 说明 |
|------|------|------|
| `web/nodes.toml` | 新建 | 节点配置文件 |
| `web/main.go` | 修改 | 新增节点管理 API 和代理函数 |
| `web/static/app.js` | 修改 | 新增节点切换逻辑 |
| `web/templates/index.html` | 修改 | 新增节点选择 UI 和样式 |

---

## 🔧 新增 import 依赖

在 `web/main.go` 开头的 import 中添加:

```go
import (
    // 现有的...
    "io"
    "net/http/cookiejar"
    "net/url"
    "time"
)
```

---

## 📝 测试步骤

1. 创建 `web/nodes.toml` 配置文件
2. 重新编译: `go build -o realm_web main.go`
3. 重启面板服务
4. 访问面板，应看到节点选择区域
5. 切换节点，验证规则显示和操作

---

## ⚠️ 注意事项

1. 各节点的面板端口需要可访问
2. 建议使用 HTTPS 保护节点间通信
3. 节点密码存储在配置文件中，注意文件权限

---

## 进度更新（2026-02-04）

1. 已新增 `web/nodes.toml` 示例配置文件，包含 `name`、`host`、`port`、`password`、`https` 字段，作为多节点列表来源。
2. 已完成后端多节点支持（`web/main.go`）：新增 `Node`/`NodesConfig`、`LoadNodesConfig()`、`proxyToNode()`（带 Cookie Session 缓存），并在 `main()` 中加载节点配置；新增 `/api/nodes`、`/api/nodes/:id/rules`、`/api/nodes/:id/status`、`/api/nodes/:id/:action` 代理接口，`rules` 支持 `page/size` 参数透传。
3. 已完成前端节点选择（`web/templates/index.html`、`web/static/app.js`）：新增节点选择区域与 `.node-btn` 样式；加载节点列表、切换节点后刷新规则与状态；规则新增/删除/批量新增/服务控制全部根据所选节点路由。
4. 验证待执行：请按“测试步骤”重新编译并实际切换节点验证功能；本次未运行构建/运行测试。