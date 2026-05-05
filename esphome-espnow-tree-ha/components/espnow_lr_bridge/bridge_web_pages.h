#pragma once

/*
 * bridge_web_pages.h
 *
 * NEW web pages for the ESP-NOW LR bridge — runs in parallel with the
 * existing /topology, /ota, /api/ota/* routes.
 *
 * Routes added:
 *   GET  /login              — ESPHome-themed login form
 *   POST /api/auth/login     — validates api_key, sets session cookie
 *   POST /api/auth/logout    — clears session cookie
 *   GET  /v2/topology        — new WS-powered topology page
 *   GET  /v2/ota             — new WS-powered OTA page
 *
 * Pages use WebSocket at /espnow-tree/v1/ws with HMAC-SHA256 auth
 * using the same api_key as the login form.
 *
 * NOTE: Old routes (/topology, /topology.json, /ota, /api/ota/*) are
 * completely untouched and remain fully functional.
 */

// =========================================================================
// LOGIN PAGE — served at GET /login
// =========================================================================
static const char LOGIN_PAGE_HTML[] = R"raw(<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ESP-NOW LR · Sign In</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{
    font-family:'Inter',system-ui,-apple-system,sans-serif;
    background:#f5f7fa;color:#1c1c1e;min-height:100vh;
    display:flex;flex-direction:column;align-items:center;justify-content:center
  }
  .login-card{
    background:#fff;border-radius:12px;padding:40px;
    box-shadow:0 1px 3px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04);
    border:1px solid #e2e8f0;width:380px;max-width:94vw
  }
  h1{font-size:22px;font-weight:700;letter-spacing:-0.3px;margin-bottom:4px}
  .sub{color:#64748b;font-size:13px;margin-bottom:28px}
  .form-group{display:flex;flex-direction:column;gap:6px;margin-bottom:20px}
  .form-group label{font-size:13px;font-weight:600;color:#1c1c1e}
  .form-group input{
    border:1px solid #cbd5e1;border-radius:8px;padding:10px 14px;
    font-family:inherit;font-size:15px;transition:border-color 0.12s
  }
  .form-group input:focus{outline:none;border-color:#0b3b4b;box-shadow:0 0 0 3px rgba(11,59,75,0.1)}
  .btn{
    display:inline-flex;align-items:center;justify-content:center;gap:6px;
    font-family:inherit;font-size:14px;font-weight:600;
    padding:10px 20px;border-radius:8px;border:none;cursor:pointer;
    transition:all 0.12s;width:100%
  }
  .btn-primary{background:#0b3b4b;color:#fff}
  .btn-primary:hover{background:#0d4d5e}
  .btn-primary:disabled{opacity:0.5;cursor:not-allowed}
  .error-msg{background:#fef2f2;color:#991b1b;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:16px;display:none}
  .error-msg.visible{display:block}
  .loader{display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.6s linear infinite;vertical-align:middle}
  @keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div class="login-card">
  <h1>ESP-NOW LR</h1>
  <div class="sub">Bridge Control Panel</div>
  <div id="errorMsg" class="error-msg"></div>
  <form id="loginForm">
    <div class="form-group">
      <label for="apiKey">API Key</label>
      <input type="password" id="apiKey" placeholder="Enter bridge API key" autofocus>
    </div>
    <button type="submit" class="btn btn-primary" id="loginBtn">Sign In</button>
  </form>
</div>
<script>
document.getElementById('loginForm').addEventListener('submit', function(e) {
  e.preventDefault();
  var key = document.getElementById('apiKey').value.trim();
  if (!key) return;
  var btn = document.getElementById('loginBtn');
  var errEl = document.getElementById('errorMsg');
  btn.disabled = true;
  btn.innerHTML = '<span class="loader"></span> Signing in...';
  errEl.classList.remove('visible');
  fetch('/api/auth/login', {
    method: 'POST',
    headers: {'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
    body: new URLSearchParams({api_key: key}).toString()
  }).then(function(r) {
    if (!r.ok) throw new Error('Invalid API key');
    sessionStorage.setItem('espnow_api_key', key);
    var dest = new URLSearchParams(location.search).get('redirect') || '/v2/topology';
    window.location.href = dest;
  }).catch(function(err) {
    btn.disabled = false;
    btn.textContent = 'Sign In';
    errEl.textContent = err.message || 'Authentication failed';
    errEl.classList.add('visible');
  });
});
</script>
</body>
</html>)raw";

// =========================================================================
// TOPOLOGY V2 PAGE — served at GET /v2/topology
// Uses WebSocket for live data, no HTTP polling
// =========================================================================
static const char TOPOLOGY_V2_PAGE_HTML[] = R"raw(<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ESP-NOW LR · Topology</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{
    font-family:'Inter',system-ui,-apple-system,sans-serif;
    background:#f5f7fa;color:#1c1c1e;min-height:100vh;padding:0
  }
  .topbar{
    background:#0b3b4b;color:#fff;display:flex;align-items:center;
    justify-content:space-between;padding:0 24px;height:56px;
    box-shadow:0 1px 3px rgba(0,0,0,0.12);position:sticky;top:0;z-index:100
  }
  .topbar-left{display:flex;align-items:center;gap:16px}
  .topbar-logo{font-size:20px;font-weight:700;letter-spacing:-0.3px}
  .topbar-logo small{font-weight:400;opacity:0.7;font-size:13px;margin-left:6px}
  .topbar-nav{display:flex;gap:4px}
  .topbar-nav a{
    color:rgba(255,255,255,0.8);text-decoration:none;padding:8px 16px;
    border-radius:8px;font-size:14px;font-weight:500;transition:all 0.15s;cursor:pointer
  }
  .topbar-nav a:hover{background:rgba(255,255,255,0.1);color:#fff}
  .topbar-nav a.active{background:rgba(255,255,255,0.18);color:#fff;font-weight:600}
  .badge{display:inline-block;background:#f39c12;color:#fff;font-size:10px;font-weight:700;padding:1px 7px;border-radius:10px;margin-left:5px;vertical-align:middle}
  .topbar-right{display:flex;align-items:center;gap:12px}
  .version{font-size:12px;opacity:0.6}
  .app{max-width:1100px;margin:0 auto;padding:24px}
  .summary{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px}
  .summary-card{
    background:#fff;border-radius:12px;padding:20px 24px;
    box-shadow:0 1px 3px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04);
    border:1px solid #e2e8f0
  }
  .summary-card .num{font-size:32px;font-weight:700;color:#0b3b4b;line-height:1.2}
  .summary-card .label{font-size:13px;color:#64748b;margin-top:4px;font-weight:500}
  .card{
    background:#fff;border-radius:12px;
    box-shadow:0 1px 3px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04);
    border:1px solid #e2e8f0;margin-bottom:24px
  }
  .card-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #e2e8f0}
  .card-header h2{font-size:16px;font-weight:600}
  .card-body{padding:16px 20px}
  .tree-node{
    display:flex;align-items:center;gap:12px;padding:12px 14px;
    border:1px solid #e2e8f0;border-radius:10px;background:#fafbfc;
    margin-bottom:6px;cursor:pointer;transition:all 0.12s
  }
  .tree-node:hover{border-color:#0b3b4b;background:#f0f7fa}
  .tree-node .status-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
  .tree-node .status-dot.online{background:#22c55e}
  .tree-node .status-dot.offline{background:#ef4444}
  .tree-node .status-dot.connecting{background:#f59e0b}
  .tree-node .identity{flex:1;min-width:0}
  .tree-node .identity strong{display:block;font-size:14px;font-weight:600}
  .tree-node .identity small{font-size:12px;color:#94a3b8}
  .tree-node .metrics{display:flex;gap:8px;font-size:12px;color:#64748b}
  .tree-node .metrics span{background:#f1f5f9;padding:3px 8px;border-radius:6px;white-space:nowrap}
  .tree-node .ota-badge{
    background:#0b3b4b;color:#fff;font-size:11px;font-weight:600;
    padding:3px 10px;border-radius:6px;white-space:nowrap;text-decoration:none
  }
  .tree-node .ota-badge.queued{background:#f39c12}
  .tree-node .offline-note{font-size:12px;color:#ef4444;font-weight:500}
  .tree-child{margin-left:32px;border-left:2px solid #e2e8f0;padding-left:16px}
  .btn{
    display:inline-flex;align-items:center;gap:6px;font-family:inherit;
    font-size:13px;font-weight:500;padding:8px 16px;border-radius:8px;
    border:1px solid #e2e8f0;background:#fff;color:#1c1c1e;cursor:pointer;
    transition:all 0.12s
  }
  .btn:hover{background:#f8fafc;border-color:#cbd5e1}
  .btn-primary{background:#0b3b4b;color:#fff;border-color:#0b3b4b}
  .btn-primary:hover{background:#0d4d5e}
  .btn-sm{padding:5px 10px;font-size:12px}
  .hero{
    display:flex;justify-content:space-between;align-items:end;
    padding:20px 24px;margin-bottom:20px;background:#fff;border-radius:12px;
    border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.06)
  }
  .hero h2{font-size:28px;font-weight:700;margin-top:8px}
  .hero p{color:#64748b;font-size:14px;margin-top:6px}
  .state-pill{
    display:inline-block;padding:4px 12px;border-radius:20px;
    font-size:12px;font-weight:600;text-transform:uppercase
  }
  .state-pill.online{background:#dcfce7;color:#166534}
  .state-pill.offline{background:#fef2f2;color:#991b1b}
  .state-pill.connecting{background:#fef3c7;color:#92400e}
  .hero-rssi{font-size:20px;font-weight:700;color:#0b3b4b}
  .layout-2col{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}
  .diag-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .diag-item{background:#f8fafc;padding:10px 12px;border-radius:8px;border:1px solid #f1f5f9}
  .diag-item .lbl{font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;margin-bottom:4px}
  .diag-item .val{font-size:14px;font-weight:500;overflow-wrap:anywhere}
  .diag-item.sm{padding:6px 10px}
  .diag-item.sm .lbl{font-size:9px;margin-bottom:2px}
  .diag-item.sm .val{font-size:11px;font-family:monospace;color:#64748b;cursor:pointer}
  .diag-item.sm .val:hover{color:#0b3b4b}
  .detail-panel{display:none}
  .detail-panel.visible{display:block}
  .ws-status{
    display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:3px 10px;
    border-radius:20px;font-weight:500
  }
  .ws-status.connected{background:#dcfce7;color:#166534}
  .ws-status.disconnected{background:#fef2f2;color:#991b1b}
  @media (max-width:768px){
    .summary{grid-template-columns:1fr}
    .layout-2col{grid-template-columns:1fr}
    .diag-grid{grid-template-columns:1fr}
  }
</style>
</head>
<body>
<header class="topbar">
  <div class="topbar-left">
    <div class="topbar-logo">ESP-NOW LR <small>Tree Control</small></div>
  </div>
  <nav class="topbar-nav">
    <a class="active">Topology</a>
  </nav>
  <div class="topbar-right">
    <span class="ws-status disconnected" id="wsStatus">Disconnected</span>
  </div>
</header>
<div class="app">
  <div class="summary">
    <div class="summary-card"><div class="num" id="statOnline">0</div><div class="label">Online Nodes</div></div>
    <div class="summary-card"><div class="num" id="statRemotes">0</div><div class="label">Remotes</div></div>
    <div class="summary-card"><div class="num" id="statOta">IDLE</div><div class="label">OTA State</div></div>
  </div>
  <div class="card">
    <div class="card-header"><h2>Bridge Topology</h2></div>
    <div class="card-body" id="treeContainer"></div>
  </div>
  <div class="detail-panel" id="detailPanel">
    <div class="hero">
      <div>
        <span class="state-pill" id="detState">online</span>
        <h2 id="detName">—</h2>
        <p id="detSub">—</p>
      </div>
      <div class="hero-rssi" id="detRssi">—</div>
    </div>
    <div class="layout-2col">
      <div class="card">
        <div class="card-header"><h2>Diagnostics</h2></div>
        <div class="card-body">
          <div class="diag-grid">
            <div class="diag-item"><div class="lbl">MAC</div><div class="val" id="detMac">—</div></div>
            <div class="diag-item"><div class="lbl">Firmware</div><div class="val" id="detFw">—</div></div>
            <div class="diag-item"><div class="lbl">Project</div><div class="val" id="detProject">—</div></div>
            <div class="diag-item"><div class="lbl">Build</div><div class="val" id="detBuild">—</div></div>
            <div class="diag-item sm"><div class="lbl">MD5</div><div class="val" id="detMd5" title="">—</div></div>
            <div class="diag-item"><div class="lbl">Chip</div><div class="val" id="detChip">—</div></div>
            <div class="diag-item"><div class="lbl">RSSI</div><div class="val" id="detRssiVal">—</div></div>
            <div class="diag-item"><div class="lbl">Hops</div><div class="val" id="detHops">—</div></div>
            <div class="diag-item"><div class="lbl">Uptime</div><div class="val" id="detUptime">—</div></div>
            <div class="diag-item"><div class="lbl">Entities</div><div class="val" id="detEntities">—</div></div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h2>Actions</h2></div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:8px">
          <a class="btn btn-primary" id="detOtaLink" href="/v2/ota">OTA Update</a>
        </div>
      </div>
    </div>
  </div>
</div>
<script>
(function(){
  var POLL_INTERVAL = 5000;
  var pollTimer = null;
  var topology = [];
  var selectedMac = '';

  function loadTopology() {
    fetch('/api/v1/topology', { credentials: 'include' })
      .then(function(r) {
        if (!r.ok) {
          if (r.status === 401) { window.location.href = '/login?redirect=/v2/topology'; return; }
          throw new Error('fetch failed');
        }
        return r.json();
      })
      .then(function(data) {
        topology = Array.isArray(data) ? data : (data.payload || []);
        renderTopology();
        startPolling();
      })
      .catch(function(e) {
        setWsStatus(false);
        if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
        pollTimer = setTimeout(loadTopology, POLL_INTERVAL);
      });
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setTimeout(function() { pollTimer = null; loadTopology(); }, POLL_INTERVAL);
  }

  function fmtUptime(s) {
    var r=[];
    if(s>=86400){var d=Math.floor(s/86400);s%=86400;r.push(d+'d')}
    if(s>=3600){var h=Math.floor(s/3600);s%=3600;r.push(h+'h')}
    if(s>=60){var m=Math.floor(s/60);s%=60;r.push(m+'m')}
    r.push(s+'s');return r.join('');
  }

  function fmtRssi(rssi) {
    if (rssi === undefined || rssi === null) return '—';
    var pct = rssi <= -100 ? 0 : (rssi >= -60 ? 100 : Math.round((rssi+100)*5/2));
    return rssi + ' dBm';
  }

  function fmtMd5(el, md5) {
    if (!md5) { el.textContent = '—'; el.title = ''; return; }
    var abbr = md5.slice(0, 4) + '...' + md5.slice(-4);
    el.textContent = abbr;
    el.title = 'Click to copy: ' + md5;
    if (el.dataset.md5Listener) return;
    el.dataset.md5Listener = '1';
    el.addEventListener('click', function() {
      navigator.clipboard.writeText(md5).then(function() {
        var orig = el.textContent;
        el.textContent = 'copied!';
        setTimeout(function(){ el.textContent = abbr; }, 1200);
      });
    });
  }

  function renderTopology() {
    if (!topology || topology.length === 0) return;
    var root = topology.find(function(n){return n.hops===0;}) || topology[0];
    var bridgeMac = root ? root.mac : '';
    var children = {};
    topology.forEach(function(n){
      var p = n.parent_mac || bridgeMac;
      if (!children[p]) children[p] = [];
      children[p].push(n);
    });
    var stats = {online:0, remotes:0};
    topology.forEach(function(n){if(n.hops!==0)stats.remotes++;if(n.online)stats.online++;});
    document.getElementById('statOnline').textContent = stats.online;
    document.getElementById('statRemotes').textContent = stats.remotes;

    function renderNode(node, isRoot) {
      var div = document.createElement('div');
      div.className = 'tree-node';
      div.onclick = function(){ showDetail(node.mac); };
      var stateClass = node.online ? 'online' : (node.state >= 1 && node.state <= 4 ? 'connecting' : 'offline');
      var dot = document.createElement('span');
      dot.className = 'status-dot ' + stateClass;
      div.appendChild(dot);

      var id = document.createElement('div');
      id.className = 'identity';
      var strong = document.createElement('strong');
      strong.textContent = node.label || node.mac || 'Unknown';
      id.appendChild(strong);
      var small = document.createElement('small');
      small.textContent = node.mac || '';
      id.appendChild(small);
      div.appendChild(id);

      var metrics = document.createElement('div');
      metrics.className = 'metrics';
      if (node.uptime_s > 0) {
        var u = document.createElement('span');
        u.textContent = fmtUptime(node.uptime_s);
        metrics.appendChild(u);
      }
      if (node.rssi !== undefined && node.rssi !== null) {
        var r = document.createElement('span');
        r.textContent = fmtRssi(node.rssi);
        metrics.appendChild(r);
      }
      if (node.chip_name) {
        var c = document.createElement('span');
        c.textContent = node.chip_name;
        metrics.appendChild(c);
      }
      div.appendChild(metrics);

      if (!isRoot && node.hops !== 0) {
        var otaLink = document.createElement('a');
        otaLink.className = 'ota-badge';
        otaLink.href = '/v2/ota?mac=' + encodeURIComponent(node.mac);
        otaLink.textContent = 'OTA';
        otaLink.onclick = function(e){ e.stopPropagation(); };
        div.appendChild(otaLink);
      }

      if (!node.online) {
        var off = document.createElement('span');
        off.className = 'offline-note';
        off.textContent = (node.offline_s || 0) + 's offline';
        div.appendChild(off);
      }

      return div;
    }

    function renderSubtree(mac) {
      var container = document.createElement('div');
      if (mac !== '' && mac !== (root ? root.mac : '')) {
        container.className = 'tree-child';
      }
      var nodes = children[mac] || [];
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        var el = renderNode(n, false);
        container.appendChild(el);
        var sub = children[n.mac];
        if (sub && sub.length) container.appendChild(renderSubtree(n.mac));
      }
      return container;
    }

    var tc = document.getElementById('treeContainer');
    tc.innerHTML = '';
    if (root) tc.appendChild(renderNode(root, true));
    tc.appendChild(renderSubtree(root ? root.mac : ''));
    if (!selectedMac) selectedMac = root ? root.mac : '';
    showDetail(selectedMac);
  }

  function updateNodeAvailability(payload) {
    var mac = payload.mac || '';
    for (var i = 0; i < topology.length; i++) {
      if (topology[i].mac === mac) {
        topology[i].online = payload.online;
        topology[i].rssi = payload.rssi;
        renderTopology();
        break;
      }
    }
  }

  function showDetail(mac) {
    selectedMac = mac;
    var node = null;
    for (var i = 0; i < topology.length; i++) { if (topology[i].mac === mac) { node = topology[i]; break; } }
    var panel = document.getElementById('detailPanel');
    if (!node) { panel.classList.remove('visible'); return; }
    panel.classList.add('visible');
    var online = node.online;
    document.getElementById('detState').textContent = online ? 'online' : 'offline';
    document.getElementById('detState').className = 'state-pill ' + (online ? 'online' : 'offline');
    document.getElementById('detName').textContent = node.label || node.mac || '—';
    document.getElementById('detSub').textContent = (node.mac || '—') + ' / ' + (node.hops !== undefined ? node.hops + ' hop' + (node.hops !== 1 ? 's' : '') : '—') + ' / uptime ' + (node.uptime_s ? fmtUptime(node.uptime_s) : '—');
    document.getElementById('detRssi').textContent = fmtRssi(node.rssi);
    document.getElementById('detMac').textContent = node.mac || '—';
    document.getElementById('detFw').textContent = node.firmware_version || node.project_version || '—';
    document.getElementById('detProject').textContent = node.project_name || '—';
    document.getElementById('detBuild').textContent = node.firmware_build_date || '—';
    fmtMd5(document.getElementById('detMd5'), node.firmware_md5);
    document.getElementById('detChip').textContent = node.chip_name || '—';
    document.getElementById('detRssiVal').textContent = fmtRssi(node.rssi);
    document.getElementById('detHops').textContent = node.hops !== undefined ? String(node.hops) : '—';
    document.getElementById('detUptime').textContent = node.uptime_s ? fmtUptime(node.uptime_s) : '—';
    document.getElementById('detEntities').textContent = node.entity_count !== undefined ? String(node.entity_count) : '—';
    document.getElementById('detOtaLink').href = '/v2/ota?mac=' + encodeURIComponent(node.mac || '');
  }

  loadTopology();
})();
</script>
</body>
</html>)raw";

// =========================================================================
// OTA V2 PAGE — served at GET /v2/ota
// Uses WebSocket for all OTA operations (start, status, binary chunks, abort)
// =========================================================================
static const char OTA_V2_PAGE_HTML[] = R"raw(<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ESP-NOW LR · OTA Update</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{
    font-family:'Inter',system-ui,-apple-system,sans-serif;
    background:#f5f7fa;color:#1c1c1e;min-height:100vh;padding:0
  }
  .topbar{
    background:#0b3b4b;color:#fff;display:flex;align-items:center;
    justify-content:space-between;padding:0 24px;height:56px;
    box-shadow:0 1px 3px rgba(0,0,0,0.12);position:sticky;top:0;z-index:100
  }
  .topbar-left{display:flex;align-items:center;gap:16px}
  .topbar-logo{font-size:20px;font-weight:700;letter-spacing:-0.3px}
  .topbar-logo small{font-weight:400;opacity:0.7;font-size:13px;margin-left:6px}
  .topbar-nav{display:flex;gap:4px}
  .topbar-nav a{
    color:rgba(255,255,255,0.8);text-decoration:none;padding:8px 16px;
    border-radius:8px;font-size:14px;font-weight:500;transition:all 0.15s
  }
  .topbar-nav a:hover{background:rgba(255,255,255,0.1);color:#fff}
  .topbar-nav a.active{background:rgba(255,255,255,0.18);color:#fff;font-weight:600}
  .app{max-width:900px;margin:0 auto;padding:24px}
  .card{
    background:#fff;border-radius:12px;
    box-shadow:0 1px 3px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04);
    border:1px solid #e2e8f0;margin-bottom:20px
  }
  .card-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #e2e8f0}
  .card-header h2{font-size:16px;font-weight:600}
  .card-body{padding:16px 20px}
  .info-grid{display:grid;grid-template-columns:auto 1fr;gap:8px 16px;font-size:14px}
  .info-grid .lbl{color:#64748b;font-weight:500}
  .info-grid .val{font-weight:600}
  .info-grid .val.mono{font-family:monospace;font-size:12px;color:#64748b;cursor:pointer}
  .info-grid .val.mono:hover{color:#0b3b4b}
  .file-zone{
    border:2px dashed #cbd5e1;border-radius:10px;padding:32px;text-align:center;
    cursor:pointer;transition:all 0.12s;background:#fafbfc
  }
  .file-zone:hover,.file-zone.dragover{border-color:#0b3b4b;background:#f0f7fa}
  .file-zone strong{display:block;font-weight:600;margin-bottom:4px}
  .file-zone small{color:#94a3b8;font-size:13px}
  .file-zone input{display:none}
  .file-info{margin-top:12px;font-size:13px;color:#64748b;display:none}
  .file-info .fname{font-weight:600;color:#1c1c1e}
  .compare-table{width:100%;border-collapse:collapse;font-size:13px;margin:12px 0}
  .compare-table th,.compare-table td{padding:8px 10px;border:1px solid #e2e8f0;text-align:left}
  .compare-table th{background:#f8fafc;font-size:11px;text-transform:uppercase;color:#64748b;font-weight:600}
  .tag{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;margin-top:4px}
  .tag.match{background:#dcfce7;color:#166534}
  .tag.mismatch{background:#fef2f2;color:#991b1b}
  .tag.newer{background:#fef2f2;color:#991b1b}
  .tag.older{background:#dcfce7;color:#166534}
  .tag.same{background:#f1f5f9;color:#64748b}
  .warning-box{background:#fffbeb;border-left:4px solid #f59e0b;padding:12px;border-radius:6px;margin:12px 0;font-size:13px}
  .progress-wrap{width:100%;height:10px;background:#e2e8f0;border-radius:5px;overflow:hidden;margin:12px 0}
  .progress-fill{height:100%;background:#0b3b4b;border-radius:5px;transition:width 300ms ease,background 300ms ease}
  .progress-fill.success{background:#22c55e}
  .progress-fill.fail{background:#ef4444}
  .progress-fill.verifying{background:#f59e0b}
  .progress-text{font-size:13px;color:#64748b;display:flex;justify-content:space-between;margin-top:6px}
  .btn{
    display:inline-flex;align-items:center;gap:6px;font-family:inherit;
    font-size:13px;font-weight:500;padding:8px 16px;border-radius:8px;
    border:1px solid #e2e8f0;background:#fff;color:#1c1c1e;cursor:pointer;
    transition:all 0.12s
  }
  .btn:hover{background:#f8fafc;border-color:#cbd5e1}
  .btn-primary{background:#0b3b4b;color:#fff;border-color:#0b3b4b}
  .btn-primary:hover{background:#0d4d5e}
  .btn-primary:disabled{opacity:0.5;cursor:not-allowed}
  .btn-danger{background:#ef4444;color:#fff;border-color:#ef4444}
  .btn-danger:hover{background:#dc2626}
  .btn-row{display:flex;gap:8px;margin-top:12px}
  .phase{display:none}
  .phase.active{display:block}
  .result-card{padding:20px;border-radius:10px;text-align:center}
  .result-card.success{background:#f0fdf4;border:1px solid #22c55e}
  .result-card.fail{background:#fef2f2;border:1px solid #ef4444}
  .result-card h3{font-size:18px;margin-bottom:8px}
  .result-card.success h3{color:#166534}
  .result-card.fail h3{color:#991b1b}
  .md5-computing{color:#0b3b4b;font-size:13px;margin-top:8px;display:none}
  .ws-status{
    display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:3px 10px;
    border-radius:20px;font-weight:500
  }
  .ws-status.connected{background:#dcfce7;color:#166534}
  .ws-status.disconnected{background:#fef2f2;color:#991b1b}
  @media (max-width:768px){.info-grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<header class="topbar">
  <div class="topbar-left">
    <div class="topbar-logo">ESP-NOW LR <small>OTA Update</small></div>
  </div>
  <nav class="topbar-nav">
    <a href="/v2/topology">Topology</a>
    <a class="active">OTA</a>
  </nav>
  <div class="topbar-right">
    <span class="ws-status disconnected" id="wsStatus">Disconnected</span>
  </div>
</header>
<div class="app">

  <!-- Phase 1: Target & File Selection -->
  <div id="phase1" class="phase active">
    <div class="card">
      <div class="card-header"><h2>Target Device</h2></div>
      <div class="card-body">
        <div class="info-grid">
          <span class="lbl">MAC</span><span class="val" id="nodeMac">Loading...</span>
          <span class="lbl">Name</span><span class="val" id="nodeName">Loading...</span>
          <span class="lbl">Project</span><span class="val" id="nodeProject">—</span>
          <span class="lbl">Version</span><span class="val" id="nodeVersion">—</span>
          <span class="lbl">Build</span><span class="val" id="nodeBuild">—</span>
          <span class="lbl">MD5</span><span class="val mono" id="nodeFirmwareMd5" title="">—</span>
          <span class="lbl">Chip</span><span class="val" id="nodeChip">—</span>
          <span class="lbl">RSSI</span><span class="val" id="nodeRssi">—</span>
          <span class="lbl">Hops</span><span class="val" id="nodeHops">—</span>
          <span class="lbl">Entities</span><span class="val" id="nodeEntities">—</span>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h2>Firmware File</h2></div>
      <div class="card-body">
        <div id="fileZone" class="file-zone">
          <strong>Choose .ota.bin firmware</strong>
          <small>Click to browse or drag a .bin file here</small>
        </div>
        <input type="file" id="fileInput" accept=".bin,.ota.bin">
        <div class="file-info" id="fileInfo">
          <span class="fname" id="fileNameDisplay"></span> (<span id="fileSizeDisplay"></span> bytes)
        </div>
        <div class="md5-computing" id="md5Computing">Reading firmware header...</div>
      </div>
    </div>

    <div class="card" id="comparisonCard" style="display:none">
      <div class="card-header"><h2>Firmware Comparison</h2></div>
      <div class="card-body">
        <table class="compare-table">
          <thead><tr><th>Field</th><th>Current</th><th>New</th></tr></thead>
          <tbody id="comparisonBody"></tbody>
        </table>
        <div class="warning-box" id="warningBox" style="display:none">
          <label><input type="checkbox" id="acceptWarnings"> Accept warnings and proceed</label>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" id="startBtn" disabled>Start OTA Update</button>
          <button class="btn" id="cancelBtn">Cancel</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Phase 3: Transfer Progress -->
  <div id="phase3" class="phase">
    <div class="card">
      <div class="card-header"><h2>Transfer Progress</h2></div>
      <div class="card-body">
        <div style="display:flex;justify-content:space-between;font-size:14px">
          <span id="statusLabel">Starting...</span>
          <span><strong id="progressPct">0%</strong></span>
        </div>
        <div class="progress-wrap">
          <div class="progress-fill" id="progressFill" style="width:0%"></div>
        </div>
        <div class="progress-text">
          <span id="progressDetail">0 / 0 chunks</span>
        </div>
        <div class="btn-row" id="abortRow" style="display:none">
          <button class="btn btn-danger" id="abortBtn">Abort Transfer</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Phase 4: Result -->
  <div id="phase4" class="phase">
    <div class="result-card success" id="successCard" style="display:none">
      <h3>Update Complete</h3>
      <p style="color:#166534">Device is rebooting with new firmware.</p>
    </div>
    <div class="result-card fail" id="errorCard" style="display:none">
      <h3>Update Failed</h3>
      <p id="errorMsg" style="color:#991b1b"></p>
      <div class="btn-row" style="justify-content:center">
        <button class="btn" id="retryBtn">Try Again</button>
        <button class="btn" onclick="window.location.href='/v2/topology'">Back to Topology</button>
      </div>
    </div>
  </div>
</div>

<script>
(function(){
  var WS_PATH = '/espnow-tree/v1/ws';
  var ws = null;
  var reconnectTimer = null;
  var targetMac = new URLSearchParams(location.search).get('mac') || '';
  var nodeInfo = null;
  var binHeader = null;
  var fileSize = 0;
  var fileMd5 = '';
  var currentFile = null;
  var jobId = '';
  var maxChunkSize = 1024;
  var windowSize = 4;
  var nextSeq = 0;
  var transferActive = false;
  var statusTimer = null;
  var sentSequences = {};

  var CHIP_NAMES = {0:'ESP32',2:'ESP32-S2',5:'ESP32-C3',9:'ESP32-S3',12:'ESP32-C2',13:'ESP32-C6',16:'ESP32-H2',18:'ESP32-P4'};

  function el(id){return document.getElementById(id);}
  function showPhase(n){['phase1','phase3','phase4'].forEach(function(p){el(p).classList.toggle('active',p==='phase'+n);});}

  function wsConnect() {
    var apiKey = sessionStorage.getItem('espnow_api_key');
    if (!apiKey) { window.location.href = '/login?redirect=/v2/ota' + (targetMac ? '?mac='+encodeURIComponent(targetMac) : ''); return; }
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var url = proto + '//' + location.host + WS_PATH;
    try { ws = new WebSocket(url); } catch(e) { scheduleReconnect(); return; }
    ws.binaryType = 'arraybuffer';
    ws.onopen = function() {
      el('wsStatus').textContent = 'Connected';
      el('wsStatus').className = 'ws-status connected';
    };
    ws.onmessage = function(e) {
      if (typeof e.data !== 'string') return;
      try { var msg = JSON.parse(e.data); } catch(x){return;}
      var type = msg.type || '';
      var payload = msg.payload || {};
      if (type === 'auth.challenge') handleAuth(apiKey, payload);
      else if (type === 'auth.ok') afterAuth();
      else if (type === 'ota.accepted') handleOtaAccepted(payload);
      else if (type === 'ota.status.result') handleOtaStatus(payload);
      else if (type === 'ota.aborted') handleOtaAborted(payload);
      else if (type === 'error') handleWsError(payload);
    };
    ws.onclose = function() {
      el('wsStatus').textContent = 'Disconnected';
      el('wsStatus').className = 'ws-status disconnected';
      if (!transferActive) scheduleReconnect();
    };
    ws.onerror = function(){ ws.close(); };
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(function(){ reconnectTimer=null; wsConnect(); }, 3000);
  }

  function hexEncode(buf) {
    return Array.from(new Uint8Array(buf)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
  }

  function handleAuth(apiKey, challenge) {
    var serverNonce = challenge.server_nonce || '';
    var client = 'browser';
    var cn = '';
    for(var i=0;i<16;i++) cn += Math.floor(Math.random()*256).toString(16).padStart(2,'0');
    var input = 'espnow-tree-ws|v1|' + client + '|' + serverNonce + '|' + cn;
    var enc = new TextEncoder();
    crypto.subtle.importKey('raw', enc.encode(apiKey), {name:'HMAC',hash:'SHA-256'}, false, ['sign']).then(function(key){
      return crypto.subtle.sign('HMAC', key, enc.encode(input));
    }).then(function(sig){
      ws.send(JSON.stringify({v:1,type:'auth.response',id:'auth_ota',payload:{client:client,client_nonce:cn,hmac:hexEncode(sig)}}));
    });
  }

  function afterAuth() {
    if (targetMac) loadNodeInfo();
  }

  function wsSend(type, payload, id) {
    ws.send(JSON.stringify({v:1,type:type,id:id||'',payload:payload||{}}));
  }

  function loadNodeInfo() {
    wsSend('topology.get', {}, 'topo_ota');
    var handler = ws.onmessage;
    ws.onmessage = function(e) {
      if (typeof e.data !== 'string') return;
      try { var msg = JSON.parse(e.data); } catch(x){ return handler && handler(e); return; }
      if (msg.type === 'topology.snapshot') {
        var topo = Array.isArray(msg.payload) ? msg.payload : [];
        for (var i=0;i<topo.length;i++) {
          if (topo[i].mac.toUpperCase() === targetMac.toUpperCase()) {
            nodeInfo = topo[i];
            break;
          }
        }
        renderNodeInfo();
      }
      if (handler) handler(e);
    };
  }

  function renderNodeInfo() {
    var n = nodeInfo || {};
    el('nodeMac').textContent = n.mac || targetMac.toUpperCase() || '—';
    el('nodeName').textContent = n.label || n.esphome_name || '—';
    el('nodeProject').textContent = n.project_name || '—';
    el('nodeVersion').textContent = n.project_version || n.firmware_version || '—';
    el('nodeBuild').textContent = n.firmware_build_date || '—';
    fmtMd5(el('nodeFirmwareMd5'), n.firmware_md5);
    el('nodeChip').textContent = CHIP_NAMES[n.chip_type] || n.chip_name || '—';
    var r = n.rssi;
    el('nodeRssi').textContent = r !== undefined && r !== null ? r + ' dBm' : '—';
    el('nodeHops').textContent = n.hops !== undefined ? String(n.hops) : '—';
    el('nodeEntities').textContent = n.entity_count !== undefined ? String(n.entity_count) : '—';
  }

  function parseBinHeader(buf) {
    var v = new DataView(buf);
    function getStr(off, len) {
      var s=off; while(s<off+len && v.getUint8(s)===0) s++;
      var e=s; while(e<off+len && v.getUint8(e)!==0) e++;
      return e<=s?'':new TextDecoder().decode(new Uint8Array(buf,s,e-s));
    }
    return {
      name: getStr(0x50, 32),
      ver: getStr(0x90, 32),
      date: getStr(0x80, 16),
      time: getStr(0x70, 16),
      chip: v.getUint16(12, true),
      md5: Array.from(new Uint8Array(buf,0xc0,16)).map(function(b){return b.toString(16).padStart(2,'0');}).join('')
    };
  }

  function fmtDate(d,t) {
    if (!d) return '—';
    var months={'Jan':'01','Feb':'02','Mar':'03','Apr':'04','May':'05','Jun':'06','Jul':'07','Aug':'08','Sep':'09','Oct':'10','Nov':'11','Dec':'12'};
    var p=d.match(/(\w+)\s+(\d+)\s+(\d+)/);
    if(!p) return d+(t?' '+t:'');
    return p[3]+'-'+(months[p[1]]||'01')+'-'+p[2].padStart(2,'0')+(t?' '+t.trim()+' UTC':'');
  }

  function diffDays(a, b) {
    if(!a||!b||a==='—'||b==='—')return null;
    return Math.floor((new Date(a).getTime()-new Date(b).getTime())/86400000);
  }

  function handleFile(file) {
    if (!file) return;
    currentFile = file;
    fileSize = file.size;
    el('fileInfo').style.display = 'block';
    el('fileNameDisplay').textContent = file.name;
    el('fileSizeDisplay').textContent = fileSize;
    el('md5Computing').style.display = 'block';
    el('md5Computing').textContent = 'Reading firmware header...';
    el('comparisonCard').style.display = 'none';
    var reader = new FileReader();
    reader.onload = function(e) {
      binHeader = parseBinHeader(e.target.result);
      showComparison();
    };
    reader.readAsArrayBuffer(file.slice(0,256));
  }

  function showComparison() {
    var bin = binHeader;
    var n = nodeInfo || {};
    var curChip = CHIP_NAMES[n.chip_type] || n.chip_name || '—';
    var newChip = CHIP_NAMES[bin.chip] || '0x'+bin.chip.toString(16);
    var chipMatch = curChip !== '—' && newChip !== '—' && curChip === newChip;
    var binDate = fmtDate(bin.date, bin.time);
    var curDate = el('nodeBuild').textContent;
    var dd = diffDays(curDate, binDate);
    var dateTag = '';
    if (dd !== null) {
      if (dd === 0) dateTag = '<span class="tag same">SAME</span>';
      else if (dd < 0) dateTag = '<span class="tag newer">NEWER ' + Math.abs(dd) + 'd</span>';
      else dateTag = '<span class="tag older">OLDER ' + dd + 'd</span>';
    }
    var nameMatch = n.esphome_name && bin.name && n.esphome_name === bin.name;
    var hasWarnings = !nameMatch || !chipMatch || dd === null || dd !== 0;
    el('comparisonBody').innerHTML =
      '<tr><td>Name</td><td>'+(n.esphome_name||'—')+'</td><td>'+(bin.name||'—')+(nameMatch?' <span class="tag match">MATCH</span>':' <span class="tag mismatch">MISMATCH</span>')+'</td></tr>'+
      '<tr><td>Build Date</td><td>'+curDate+'</td><td>'+binDate+' '+dateTag+'</td></tr>'+
      '<tr><td>Chip Type</td><td>'+curChip+'</td><td>'+newChip+(chipMatch?' <span class="tag match">MATCH</span>':' <span class="tag mismatch">MISMATCH</span>')+'</td></tr>';
    el('comparisonCard').style.display = 'block';
    if (el('acceptWarnings')) el('acceptWarnings').checked = false;
    el('warningBox').style.display = hasWarnings ? 'block' : 'none';
    el('startBtn').disabled = hasWarnings || !currentFile;
  }

  el('fileZone').addEventListener('click', function(){ el('fileInput').click(); });
  el('fileInput').addEventListener('change', function(e){ handleFile(e.target.files[0]); });
  el('fileZone').addEventListener('dragover', function(e){ e.preventDefault(); el('fileZone').classList.add('dragover'); });
  el('fileZone').addEventListener('dragleave', function(){ el('fileZone').classList.remove('dragover'); });
  el('fileZone').addEventListener('drop', function(e){ e.preventDefault(); el('fileZone').classList.remove('dragover'); if(e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]); });
  if (el('acceptWarnings')) el('acceptWarnings').addEventListener('change', function(){ el('startBtn').disabled = !this.checked || !currentFile; });
  el('cancelBtn').addEventListener('click', function(){ currentFile=null; binHeader=null; fileMd5=''; el('fileInput').value=''; el('comparisonCard').style.display='none'; el('fileInfo').style.display='none'; el('md5Computing').style.display='none'; });
  el('startBtn').addEventListener('click', startOta);
  el('abortBtn').addEventListener('click', abortOta);
  el('retryBtn').addEventListener('click', function(){ showPhase(1); transferActive=false; });

  function computeMd5(file, cb) {
    var CHUNK=512*1024, offset=0, state=[1732584193,-271733879,-1732584194,271733878], tail=[], total=0;
    function add32(a,b){return(a+b)|0;}
    function cmn(q,a,b,x,s,t){a=add32(add32(a,q),add32(x,t));return add32((a<<s)|(a>>>(32-s)),b);}
    function ff(a,b,c,d,x,s,t){return cmn((b&c)|((~b)&d),a,b,x,s,t);}
    function gg(a,b,c,d,x,s,t){return cmn((b&d)|(c&(~d)),a,b,x,s,t);}
    function hh(a,b,c,d,x,s,t){return cmn(b^c^d,a,b,x,s,t);}
    function ii(a,b,c,d,x,s,t){return cmn(c^(b|(~d)),a,b,x,s,t);}
    function cycle(x,k){
      var a=x[0],b=x[1],c=x[2],d=x[3];
      a=ff(a,b,c,d,k[0],7,-680876936);d=ff(d,a,b,c,k[1],12,-389564586);c=ff(c,d,a,b,k[2],17,606105819);b=ff(b,c,d,a,k[3],22,-1044525330);
      a=ff(a,b,c,d,k[4],7,-176418897);d=ff(d,a,b,c,k[5],12,1200080426);c=ff(c,d,a,b,k[6],17,-1473231341);b=ff(b,c,d,a,k[7],22,-45705983);
      a=ff(a,b,c,d,k[8],7,1770035416);d=ff(d,a,b,c,k[9],12,-1958414417);c=ff(c,d,a,b,k[10],17,-42063);b=ff(b,c,d,a,k[11],22,-1990404162);
      a=ff(a,b,c,d,k[12],7,1804603682);d=ff(d,a,b,c,k[13],12,-40341101);c=ff(c,d,a,b,k[14],17,-1502002290);b=ff(b,c,d,a,k[15],22,1236535329);
      a=gg(a,b,c,d,k[1],5,-165796510);d=gg(d,a,b,c,k[6],9,-1069501632);c=gg(c,d,a,b,k[11],14,643717713);b=gg(b,c,d,a,k[0],20,-373897302);
      a=gg(a,b,c,d,k[5],5,-701558691);d=gg(d,a,b,c,k[10],9,38016083);c=gg(c,d,a,b,k[15],14,-660478335);b=gg(b,c,d,a,k[4],20,-405537848);
      a=gg(a,b,c,d,k[9],5,568446438);d=gg(d,a,b,c,k[14],9,-1019803690);c=gg(c,d,a,b,k[3],14,-187363961);b=gg(b,c,d,a,k[8],20,1163531501);
      a=gg(a,b,c,d,k[13],5,-1444681467);d=gg(d,a,b,c,k[2],9,-51403784);c=gg(c,d,a,b,k[7],14,1735328473);b=gg(b,c,d,a,k[12],20,-1926607734);
      a=hh(a,b,c,d,k[5],4,-378558);d=hh(d,a,b,c,k[8],11,-2022574463);c=hh(c,d,a,b,k[11],16,1839030562);b=hh(b,c,d,a,k[14],23,-35309556);
      a=hh(a,b,c,d,k[1],4,-1530992060);d=hh(d,a,b,c,k[4],11,1272893353);c=hh(c,d,a,b,k[7],16,-155497632);b=hh(b,c,d,a,k[10],23,-1094730640);
      a=hh(a,b,c,d,k[13],4,681279174);d=hh(d,a,b,c,k[0],11,-358537222);c=hh(c,d,a,b,k[3],16,-722521979);b=hh(b,c,d,a,k[6],23,76029189);
      a=hh(a,b,c,d,k[9],4,-640364487);d=hh(d,a,b,c,k[12],11,-421815835);c=hh(c,d,a,b,k[15],16,530742520);b=hh(b,c,d,a,k[2],23,-995338651);
      a=ii(a,b,c,d,k[0],6,-198630844);d=ii(d,a,b,c,k[7],10,1126891415);c=ii(c,d,a,b,k[14],15,-1416354905);b=ii(b,c,d,a,k[5],21,-57434055);
      a=ii(a,b,c,d,k[12],6,1700485571);d=ii(d,a,b,c,k[3],10,-1894986606);c=ii(c,d,a,b,k[10],15,-1051523);b=ii(b,c,d,a,k[1],21,-2054922799);
      a=ii(a,b,c,d,k[8],6,1873313359);d=ii(d,a,b,c,k[15],10,-30611744);c=ii(c,d,a,b,k[6],15,-1560198380);b=ii(b,c,d,a,k[13],21,1309151649);
      a=ii(a,b,c,d,k[4],6,-145523070);d=ii(d,a,b,c,k[11],10,-1120210379);c=ii(c,d,a,b,k[2],15,718787259);b=ii(b,c,d,a,k[9],21,-343485551);
      x[0]=add32(a,x[0]);x[1]=add32(b,x[1]);x[2]=add32(c,x[2]);x[3]=add32(d,x[3]);
    }
    function blk(bytes,start){
      return[bytes[start]|(bytes[start+1]<<8)|(bytes[start+2]<<16)|(bytes[start+3]<<24),
        bytes[start+4]|(bytes[start+5]<<8)|(bytes[start+6]<<16)|(bytes[start+7]<<24),
        bytes[start+8]|(bytes[start+9]<<8)|(bytes[start+10]<<16)|(bytes[start+11]<<24),
        bytes[start+12]|(bytes[start+13]<<8)|(bytes[start+14]<<16)|(bytes[start+15]<<24),
        bytes[start+16]|(bytes[start+17]<<8)|(bytes[start+18]<<16)|(bytes[start+19]<<24),
        bytes[start+20]|(bytes[start+21]<<8)|(bytes[start+22]<<16)|(bytes[start+23]<<24),
        bytes[start+24]|(bytes[start+25]<<8)|(bytes[start+26]<<16)|(bytes[start+27]<<24),
        bytes[start+28]|(bytes[start+29]<<8)|(bytes[start+30]<<16)|(bytes[start+31]<<24),
        bytes[start+32]|(bytes[start+33]<<8)|(bytes[start+34]<<16)|(bytes[start+35]<<24),
        bytes[start+36]|(bytes[start+37]<<8)|(bytes[start+38]<<16)|(bytes[start+39]<<24),
        bytes[start+40]|(bytes[start+41]<<8)|(bytes[start+42]<<16)|(bytes[start+43]<<24),
        bytes[start+44]|(bytes[start+45]<<8)|(bytes[start+46]<<16)|(bytes[start+47]<<24),
        bytes[start+48]|(bytes[start+49]<<8)|(bytes[start+50]<<16)|(bytes[start+51]<<24),
        bytes[start+52]|(bytes[start+53]<<8)|(bytes[start+54]<<16)|(bytes[start+55]<<24),
        bytes[start+56]|(bytes[start+57]<<8)|(bytes[start+58]<<16)|(bytes[start+59]<<24),
        bytes[start+60]|(bytes[start+61]<<8)|(bytes[start+62]<<16)|(bytes[start+63]<<24)];
    }
    function processBytes(bytes){
      var i=0;
      if(tail.length>0){while(tail.length<64&&i<bytes.length)tail.push(bytes[i++]);if(tail.length===64){cycle(state,blk(tail,0));tail=[];}}
      for(;i+64<=bytes.length;i+=64)cycle(state,blk(bytes,i));
      while(i<bytes.length)tail.push(bytes[i++]);
    }
    function finish(){
      var pad=tail.slice();pad.push(0x80);
      while((pad.length%64)!==56)pad.push(0);
      var bitLenLo=(total*8)>>>0,bitLenHi=Math.floor((total*8)/0x100000000)>>>0;
      pad.push(bitLenLo&0xFF,(bitLenLo>>>8)&0xFF,(bitLenLo>>>16)&0xFF,(bitLenLo>>>24)&0xFF);
      pad.push(bitLenHi&0xFF,(bitLenHi>>>8)&0xFF,(bitLenHi>>>16)&0xFF,(bitLenHi>>>24)&0xFF);
      for(var i=0;i<pad.length;i+=64)cycle(state,blk(pad,i));
      var h='0123456789abcdef';
      function rhex(n){var s='';for(var j=0;j<4;j++){var v=(n>>>(j*8))&0xFF;s+=h.charAt((v>>>4)&0x0F)+h.charAt(v&0x0F);}return s;}
      cb(rhex(state[0])+rhex(state[1])+rhex(state[2])+rhex(state[3]));
    }
    function next(){
      var slice=file.slice(offset,offset+CHUNK);
      var r=new FileReader();
      r.onload=function(e){
        var chunk=new Uint8Array(e.target.result);
        total+=chunk.length;processBytes(chunk);offset+=chunk.length;
        if(offset<file.size)setTimeout(next,0);else finish();
      };
      r.readAsArrayBuffer(slice);
    }
    next();
  }

  function startOta() {
    if (!currentFile || !targetMac) return;
    el('md5Computing').style.display = 'block';
    el('md5Computing').textContent = 'Computing MD5...';
    computeMd5(currentFile, function(md5) {
      fileMd5 = md5;
      el('md5Computing').style.display = 'none';
      showPhase(3);
      el('statusLabel').textContent = 'Starting OTA transfer...';
      el('abortRow').style.display = 'block';
      transferActive = true;
      sentSequences = {};
      wsSend('ota.start', {
        target_mac: targetMac,
        size: fileSize,
        md5: fileMd5,
        filename: currentFile.name,
        preferred_chunk_size: 1024
      }, 'ota_start_1');
    });
  }

  function handleOtaAccepted(payload) {
    jobId = payload.job_id || '';
    maxChunkSize = payload.max_chunk_size || 1024;
    windowSize = payload.window_size || 4;
    nextSeq = payload.next_sequence || 0;
    el('statusLabel').textContent = 'Transfer accepted, sending chunks...';
    startStatusPoll();
    sendNextChunks();
  }

  function sendNextChunks() {
    if (!transferActive) return;
    var windowSlots = windowSize;
    var inFlight = Object.keys(sentSequences).length;
    while (inFlight < windowSlots && nextSeq * maxChunkSize < fileSize) {
      sendChunk(nextSeq);
      nextSeq++;
      inFlight++;
    }
    if (inFlight === 0 && nextSeq * maxChunkSize >= fileSize) {
      el('statusLabel').textContent = 'All chunks sent, waiting for verification...';
    }
  }

  function sendChunk(seq) {
    var offset = seq * maxChunkSize;
    var len = Math.min(maxChunkSize, fileSize - offset);
    if (len <= 0) return;
    sentSequences[seq] = true;
    var slice = currentFile.slice(offset, offset + len);
    var reader = new FileReader();
    reader.onload = function(e) {
      var payload = new Uint8Array(e.target.result);
      var headerLen = 24;
      var frame = new ArrayBuffer(headerLen + payload.length);
      var v = new DataView(frame);
      // OtaChunkHeader: magic=0x5445, version=1, headerLen=24, jobId, seq, offset, payloadLen, flags, crc32=0
      v.setUint16(0, 0x5445, true);
      v.setUint8(2, 1);
      v.setUint8(3, 24);
      v.setUint32(4, parseInt(jobId) || 0, true);
      v.setUint32(8, seq, true);
      v.setUint32(12, offset, true);
      v.setUint16(16, payload.length, true);
      v.setUint16(18, (seq + 1) * maxChunkSize >= fileSize ? 0x0001 : 0x0000, true);
      v.setUint32(20, 0, true);
      new Uint8Array(frame, headerLen).set(payload);
      ws.send(frame);
      el('progressDetail').textContent = (seq + 1) + ' chunks sent';
    };
    reader.readAsArrayBuffer(slice);
  }

  function startStatusPoll() {
    if (statusTimer) clearInterval(statusTimer);
    statusTimer = setInterval(function() {
      if (!transferActive) { clearInterval(statusTimer); return; }
      wsSend('ota.status', {job_id: jobId}, 'ota_status_1');
    }, 500);
  }

  function handleOtaStatus(payload) {
    var pct = payload.percent || 0;
    var state = (payload.state || 'idle').toLowerCase();
    el('progressFill').style.width = pct + '%';
    el('progressFill').className = 'progress-fill ' + (state === 'success' ? 'success' : state === 'fail' || state === 'failed' ? 'fail' : state === 'verifying' ? 'verifying' : '');
    el('progressPct').textContent = pct + '%';
    el('statusLabel').textContent = state.charAt(0).toUpperCase() + state.slice(1);
    if (state === 'success') { transferActive = false; clearInterval(statusTimer); showResult(true); }
    else if (state === 'failed' || state === 'fail') { transferActive = false; clearInterval(statusTimer); showResult(false, payload.error || 'Transfer failed'); }
    else if (state === 'transferring' || state === 'uploading') sendNextChunks();
  }

  function handleOtaAborted(payload) {
    transferActive = false;
    if (statusTimer) clearInterval(statusTimer);
    showResult(false, 'Transfer aborted' + (payload.reason ? ': ' + payload.reason : ''));
  }

  function handleWsError(payload) {
    transferActive = false;
    if (statusTimer) clearInterval(statusTimer);
    showResult(false, payload.message || 'WebSocket error');
  }

  function abortOta() {
    el('abortRow').style.display = 'none';
    wsSend('ota.abort', {job_id: jobId, reason: 'user'}, 'ota_abort_1');
    el('statusLabel').textContent = 'Aborting...';
  }

  function showResult(success, errMsg) {
    showPhase(4);
    el('successCard').style.display = success ? 'block' : 'none';
    el('errorCard').style.display = success ? 'none' : 'block';
    if (!success && errMsg) el('errorMsg').textContent = errMsg;
  }

  wsConnect();
})();
</script>
</body>
</html>)raw";
