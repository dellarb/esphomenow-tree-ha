#pragma once

static const char OTA_WEB_PAGE_HTML[] = R"raw(<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OTA Update</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:system-ui,sans-serif;background:#1a1a2e;color:#e0e0e0;padding:1.5em;min-height:100vh}
    h1,h2,h3{color:#00d4ff;margin-bottom:0.5em}
    h1{font-size:1.4em}h2{font-size:1.1em;margin-top:1.2em}
    .card{background:#16213e;border:1px solid #0f3460;border-radius:8px;padding:1.2em;margin-bottom:1em}
    .card h2{color:#00d4ff;font-size:1em;margin-top:0;margin-bottom:0.8em}
    .back-link{display:inline-block;margin-bottom:1em;color:#00d4ff;text-decoration:none;font-size:0.9em}
    .back-link:hover{text-decoration:underline}
    .info-grid{display:grid;grid-template-columns:auto 1fr;gap:0.4em 1em;margin-bottom:0.5em}
    .info-grid .label{color:#888;font-size:0.85em}
    .info-grid .value{color:#e0e0e0;font-weight:500}
    .status-row{display:flex;align-items:center;gap:0.7em;margin-bottom:0.8em}
    .dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;background:#888;transition:background-color 200ms ease}
    .dot.idle{background:#00e676}.dot.start_received{background:#00d4ff}.dot.uploading{background:#00d4ff}
    .dot.transferring{background:#00d4ff}.dot.verifying{background:#ffb300}.dot.success{background:#00e676}
    .dot.fail{background:#ff5252}
    .status-label{font-size:0.9em;font-weight:500}
    .progress-wrap{margin:1em 0}
    .progress-bar{height:20px;background:#0f3460;border-radius:4px;overflow:hidden;transition:width 300ms ease,background-color 200ms ease}
    .progress-fill{height:100%;background:#00d4ff;transition:width 300ms ease,background-color 200ms ease}
    .progress-fill.success{background:#00e676}
    .progress-fill.fail{background:#ff5252}
    .progress-fill.verifying{background:#ffb300}
    .progress-fill.start_received,.progress-fill.uploading,.progress-fill.transferring{background:#00d4ff}
    .progress-text{margin-top:0.4em;font-size:0.85em;color:#888;display:flex;justify-content:space-between}
    .progress-text .pct{font-size:1.1em;font-weight:600;color:#e0e0e0}
    .target-mac{margin-top:0.8em;font-size:0.85em;color:#888}
    .target-mac span{color:#00d4ff;font-family:monospace}
    .btn{display:inline-block;padding:0.6em 1.4em;border:none;border-radius:6px;cursor:pointer;font-size:0.9em;font-weight:600;transition:opacity 150ms ease,background 150ms ease}
    .btn-primary{background:#00d4ff;color:#1a1a2e}.btn-primary:hover{background:#00b8e6}.btn-primary:disabled{opacity:0.4;cursor:not-allowed}
    .btn-danger{background:#ff5252;color:#fff}.btn-danger:hover{background:#e64a4a}.btn-danger:disabled{opacity:0.4;cursor:not-allowed}
    .btn-secondary{background:#0f3460;color:#e0e0e0}.btn-secondary:hover{background:#1a4a7a}
    .file-zone{border:2px dashed #0f3460;border-radius:8px;padding:2em;text-align:center;cursor:pointer;transition:border-color 150ms ease,background 150ms ease}
    .file-zone:hover,.file-zone.dragover{border-color:#00d4ff;background:rgba(0,212,255,0.05)}
    .file-zone input{display:none}
    .file-zone .dz-label{color:#888;font-size:0.9em}
    .file-zone .dz-hint{color:#00d4ff;font-size:0.85em;margin-top:0.3em}
    .file-info{margin-top:0.8em;font-size:0.85em;color:#888}
    .file-info .fname{color:#e0e0e0;font-weight:500}
    .md5-computing{color:#00d4ff;font-size:0.85em;margin-top:0.4em}
    table{width:100%;border-collapse:collapse;margin:0.8em 0;font-size:0.9em}
    th,td{padding:0.5em 0.8em;text-align:left;border-bottom:1px solid #0f3460}
    th{color:#888;font-weight:500;font-size:0.8em;text-transform:uppercase}
    td{color:#e0e0e0}
    tr.current td{color:#888}
    tr.new td{color:#00e676;font-weight:500}
    .btn-row{margin-top:1em;display:flex;gap:0.6em}
    .rejoin-msg{margin-top:0.8em;padding:0.7em;background:rgba(0,230,118,0.1);border:1px solid #00e676;border-radius:6px;color:#00e676;font-size:0.9em;display:none}
    .rejoin-msg.visible{display:block}
    .error-msg{padding:0.7em;background:rgba(255,82,82,0.1);border:1px solid #ff5252;border-radius:6px;color:#ff5252;font-size:0.9em;margin-top:0.8em;display:none}
    .error-msg.visible{display:block}
    .phase{display:none}
    .phase.active{display:block}
    .success-card{padding:1.5em;background:rgba(0,230,118,0.08);border:1px solid #00e676;border-radius:8px;text-align:center}
    .success-card h3{color:#00e676}
    .error-card{padding:1.5em;background:rgba(255,82,82,0.08);border:1px solid #ff5252;border-radius:8px;text-align:center}
    .error-card h3{color:#ff5252}
    .hidden{display:none!important}
    .err-detail{font-size:0.8em;color:#ff8888;margin-top:0.3em}
    .ver-badge{display:inline-block;padding:0.2em 0.6em;border-radius:4px;font-size:0.75em;font-weight:600;margin-left:0.5em}
    .ver-badge.newer{background:rgba(0,230,118,0.2);color:#00e676}
    .ver-badge.same{background:rgba(136,136,136,0.2);color:#888}
    .ver-badge.older{background:rgba(255,82,82,0.2);color:#ff5252}
    .ver-badge.match{background:rgba(0,230,118,0.2);color:#00e676}
    .ver-badge.mismatch{background:rgba(255,82,82,0.2);color:#ff5252}
    .ver-badge-label{display:block;font-size:0.7em;margin-top:0.2em;color:#888}
    .warning-box{padding:0.8em;background:rgba(255,82,82,0.1);border:1px solid #ff5252;border-radius:6px;margin:0.8em 0}
    .warning-box label{cursor:pointer;font-size:0.9em;color:#ff5252}
    .warning-box input[type="checkbox"]{margin-right:0.5em}
  </style>
</head>
<body>

<a class="back-link" href="/topology">&larr; Back to Topology</a>

<h1>OTA Update</h1>

<div id="phase1" class="phase active">
  <div class="card">
    <h2>Target Device</h2>
    <div class="info-grid">
      <span class="label">Node ID (MAC)</span><span class="value" id="nodeMac">Loading...</span>
      <span class="label">Name</span><span class="value" id="nodeName">Loading...</span>
      <span class="label">Project</span><span class="value" id="nodeProject">—</span>
      <span class="label">Version</span><span class="value" id="nodeVersion">—</span>
      <span class="label">Build Date</span><span class="value" id="nodeBuildDate">—</span>
      <span class="label">Chip Type</span><span class="value" id="nodeChip">—</span>
      <span class="label">Online</span><span class="value" id="nodeOnline">—</span>
      <span class="label">Signal (RSSI)</span><span class="value" id="nodeRssi">—</span>
      <span class="label">Hops</span><span class="value" id="nodeHops">—</span>
      <span class="label">Entities</span><span class="value" id="nodeEntities">—</span>
    </div>
  </div>
  <div class="card" id="fileZoneCard">
    <h2>Select Firmware</h2>
    <div id="fileZone" class="file-zone">
      <div class="dz-label">Click to browse or drag a .bin file here</div>
      <div class="dz-hint">.ota.bin files supported</div>
    </div>
    <input type="file" id="fileInput" accept=".bin,.ota.bin" style="display:none">
    <div id="fileInfo" class="file-info hidden">
      <div><span class="fname" id="fileNameDisplay"></span> (<span id="fileSizeDisplay"></span> bytes)</div>
    </div>
    <div id="md5Computing" class="md5-computing hidden">Reading firmware header...</div>
  </div>

  <div class="card" id="comparisonCard" style="display:none">
    <h2>Comparison</h2>
    <table>
      <thead><tr><th>Field</th><th>Current (Remote)</th><th>New (Firmware)</th></tr></thead>
      <tbody id="comparisonBody">
      </tbody>
    </table>
    <div id="warningBox" class="warning-box" style="display:none">
      <label><input type="checkbox" id="acceptWarnings"> Accept warnings. I know what I'm doing.</label>
    </div>
    <div class="btn-row">
      <button class="btn btn-primary" id="startUploadBtn" disabled>Start Upload</button>
      <button class="btn btn-secondary" id="cancelBtn">Cancel</button>
    </div>
  </div>
</div>

<div id="phase3" class="phase">
  <div class="card">
    <h2>Transfer Status</h2>
    <div class="status-row">
      <div class="dot" id="statusDot"></div>
      <span class="status-label" id="statusLabel">Idle</span>
    </div>
    <div class="progress-wrap">
      <div class="progress-bar"><div class="progress-fill" id="progressFill" style="width:0%"></div></div>
      <div class="progress-text">
        <span class="pct" id="progressPct">0%</span>
        <span id="progressDetail">0 / 0 packets</span>
        <span id="progressRate"></span>
      </div>
    </div>
    <div class="target-mac">Target MAC: <span id="targetMacDisplay"></span></div>
    <div class="btn-row" id="abortRow" style="display:none">
      <button class="btn btn-danger" id="abortBtn">Abort Transfer</button>
    </div>
  </div>
</div>

<div id="phase4" class="phase">
  <div id="successCard" class="card success-card hidden">
    <h3>Upload Complete</h3>
    <p>Success — Node Rebooting</p>
    <p style="font-size:0.85em;color:#888;margin-top:0.4em">Waiting for remote to come back online...</p>
    <div id="rejoinMsg" class="rejoin-msg">Remote back online</div>
  </div>
  <div id="errorCard" class="card error-card hidden">
    <h3>Transfer Failed</h3>
    <p id="errorMsgText" style="margin-top:0.5em">Unknown error</p>
    <div class="btn-row" style="justify-content:center;margin-top:1em">
      <button class="btn btn-secondary" id="retryBtn">Try Again</button>
      <button class="btn btn-secondary" id="backBtn">Back to Topology</button>
    </div>
  </div>
</div>

<script>
(function() {
  var CHIP_TYPES = {
    0x0000: 'ESP32',
    0x0002: 'ESP32-S2',
    0x0005: 'ESP32-C3',
    0x0009: 'ESP32-S3',
    0x000C: 'ESP32-C2',
    0x000D: 'ESP32-C6',
    0x0010: 'ESP32-H2',
    0x0012: 'ESP32-P4',
    0x0014: 'ESP32-C61',
    0x0017: 'ESP32-C5',
    0x0019: 'ESP32-H21',
    0x001C: 'ESP32-H4',
    0x001F: 'ESP32-S3/FH'
  };

  var CHIP_TYPE_DECIMAL = {
    1: 'ESP32',
    2: 'ESP32-S2',
    5: 'ESP32-C3',
    9: 'ESP32-S3',
    12: 'ESP32-C2',
    13: 'ESP32-C6',
    16: 'ESP32-H2',
    18: 'ESP32-P4',
    20: 'ESP32-C61',
    23: 'ESP32-C5',
    25: 'ESP32-H21',
    28: 'ESP32-H4',
    31: 'ESP32-S3/FH'
  };

  function parseQueryMac() {
    var params = new URLSearchParams(location.search);
    return params.get('mac') || '';
  }

  function fetchTopology() {
    return fetch('/topology.json').then(function(r) { return r.json(); }).catch(function() { return []; });
  }

  function findNode(topology, mac) {
    return topology.find(function(n) { return n.mac.toUpperCase() === mac.toUpperCase(); });
  }

  function fmtBytes(b) {
    if (b < 1024) return b;
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(2) + ' MB';
  }

  function fmtBinDateTime(dateStr, timeStr) {
    if (!dateStr) return '\u2014';
    var months = {'Jan':'01','Feb':'02','Mar':'03','Apr':'04','May':'05','Jun':'06','Jul':'07','Aug':'08','Sep':'09','Oct':'10','Nov':'11','Dec':'12'};
    var parts = dateStr.match(/(\w+)\s+(\d+)\s+(\d+)/);
    if (!parts) return (dateStr + ' ' + timeStr).trim();
    var mm = months[parts[1]] || '01';
    var dd = parts[2].padStart(2, '0');
    var yyyy = parts[3];
    var time = timeStr ? timeStr.trim() : '00:00:00';
    return yyyy + '-' + mm + '-' + dd + ' ' + time + ' UTC';
  }

  function parseDateForCompare(dateStr, timeStr) {
    var months = {'Jan':0,'Feb':1,'Mar':2,'Apr':3,'May':4,'Jun':5,'Jul':6,'Aug':7,'Sep':8,'Oct':9,'Nov':10,'Dec':11};
    var parts = dateStr.match(/(\w+)\s+(\d+)\s+(\d+)/);
    if (!parts) return null;
    var mm = months[parts[1]];
    var dd = parseInt(parts[2], 10);
    var yyyy = parseInt(parts[3], 10);
    var timeParts = (timeStr || '00:00:00').split(':');
    var hh = parseInt(timeParts[0], 10) || 0;
    var min = parseInt(timeParts[1], 10) || 0;
    var ss = parseInt(timeParts[2], 10) || 0;
    var d = new Date(Date.UTC(yyyy, mm, dd, hh, min, ss));
    return d;
  }

  function compareDateBadge(currentDateStr, binDateStr, binTimeStr) {
    if (!currentDateStr || !binDateStr) return '';
    var formattedBin = fmtBinDateTime(binDateStr, binTimeStr);
    if (currentDateStr === formattedBin) {
      return '<span class="ver-badge same">SAME</span>';
    }
    var diff = new Date(currentDateStr).getTime() - new Date(formattedBin).getTime();
    var absDiff = Math.abs(diff);
    var dayDiff = Math.floor(absDiff / 86400000);
    var hourDiff = Math.floor((absDiff % 86400000) / 3600000);
    var timeDesc;
    if (dayDiff > 0) {
      timeDesc = dayDiff + 'd';
    } else if (hourDiff > 0) {
      timeDesc = hourDiff + 'h';
    } else {
      timeDesc = Math.floor(absDiff / 60000) + 'm';
    }
    if (diff < 0) {
      return '<span class="ver-badge older">OLDER -' + timeDesc + '</span>';
    } else {
      return '<span class="ver-badge newer">NEWER +' + timeDesc + '</span>';
    }
  }

  function parseBinHeader(arrayBuffer) {
    var view = new DataView(arrayBuffer);
    var getField = function(offset, len) {
      var start = offset;
      while (start < offset + len && view.getUint8(start) === 0) start++;
      var end = start;
      while (end < offset + len && view.getUint8(end) !== 0) end++;
      if (end <= start) return '';
      var bytes = new Uint8Array(arrayBuffer, start, end - start);
      return new TextDecoder().decode(bytes);
    };
    var chipType = view.getUint16(12, true);
    return {
      esphome_name: getField(0x50, 32),
      esphome_version: getField(0x30, 16),
      build_time: getField(0x70, 16),
      build_date: getField(0x80, 16),
      project_version: getField(0x90, 32),
      header_md5: Array.from(new Uint8Array(arrayBuffer, 0xc0, 16))
                  .map(function(b) { return b.toString(16).padStart(2, '0'); }).join(''),
      chip_type: chipType,
      chip_name: CHIP_TYPES[chipType] || ('Unknown 0x' + chipType.toString(16))
    };
  }

  function computeFileMd5(file, onProgress) {
    return new Promise(function(resolve, reject) {
      var CHUNK = 512 * 1024;
      var offset = 0;
      var state = [1732584193, -271733879, -1732584194, 271733878];
      var tail = [];
      var totalBytes = 0;
      var hex = '0123456789abcdef';
      function add32(a, b) { return (a + b) | 0; }
      function cmn(q, a, b, x, s, t) {
        a = add32(add32(a, q), add32(x, t));
        return add32((a << s) | (a >>> (32 - s)), b);
      }
      function ff(a, b, c, d, x, s, t) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
      function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
      function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
      function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }
      function md5cycle(x, k) {
        var a = x[0], b = x[1], c = x[2], d = x[3];
        a = ff(a, b, c, d, k[0], 7, -680876936);
        d = ff(d, a, b, c, k[1], 12, -389564586);
        c = ff(c, d, a, b, k[2], 17, 606105819);
        b = ff(b, c, d, a, k[3], 22, -1044525330);
        a = ff(a, b, c, d, k[4], 7, -176418897);
        d = ff(d, a, b, c, k[5], 12, 1200080426);
        c = ff(c, d, a, b, k[6], 17, -1473231341);
        b = ff(b, c, d, a, k[7], 22, -45705983);
        a = ff(a, b, c, d, k[8], 7, 1770035416);
        d = ff(d, a, b, c, k[9], 12, -1958414417);
        c = ff(c, d, a, b, k[10], 17, -42063);
        b = ff(b, c, d, a, k[11], 22, -1990404162);
        a = ff(a, b, c, d, k[12], 7, 1804603682);
        d = ff(d, a, b, c, k[13], 12, -40341101);
        c = ff(c, d, a, b, k[14], 17, -1502002290);
        b = ff(b, c, d, a, k[15], 22, 1236535329);

        a = gg(a, b, c, d, k[1], 5, -165796510);
        d = gg(d, a, b, c, k[6], 9, -1069501632);
        c = gg(c, d, a, b, k[11], 14, 643717713);
        b = gg(b, c, d, a, k[0], 20, -373897302);
        a = gg(a, b, c, d, k[5], 5, -701558691);
        d = gg(d, a, b, c, k[10], 9, 38016083);
        c = gg(c, d, a, b, k[15], 14, -660478335);
        b = gg(b, c, d, a, k[4], 20, -405537848);
        a = gg(a, b, c, d, k[9], 5, 568446438);
        d = gg(d, a, b, c, k[14], 9, -1019803690);
        c = gg(c, d, a, b, k[3], 14, -187363961);
        b = gg(b, c, d, a, k[8], 20, 1163531501);
        a = gg(a, b, c, d, k[13], 5, -1444681467);
        d = gg(d, a, b, c, k[2], 9, -51403784);
        c = gg(c, d, a, b, k[7], 14, 1735328473);
        b = gg(b, c, d, a, k[12], 20, -1926607734);

        a = hh(a, b, c, d, k[5], 4, -378558);
        d = hh(d, a, b, c, k[8], 11, -2022574463);
        c = hh(c, d, a, b, k[11], 16, 1839030562);
        b = hh(b, c, d, a, k[14], 23, -35309556);
        a = hh(a, b, c, d, k[1], 4, -1530992060);
        d = hh(d, a, b, c, k[4], 11, 1272893353);
        c = hh(c, d, a, b, k[7], 16, -155497632);
        b = hh(b, c, d, a, k[10], 23, -1094730640);
        a = hh(a, b, c, d, k[13], 4, 681279174);
        d = hh(d, a, b, c, k[0], 11, -358537222);
        c = hh(c, d, a, b, k[3], 16, -722521979);
        b = hh(b, c, d, a, k[6], 23, 76029189);
        a = hh(a, b, c, d, k[9], 4, -640364487);
        d = hh(d, a, b, c, k[12], 11, -421815835);
        c = hh(c, d, a, b, k[15], 16, 530742520);
        b = hh(b, c, d, a, k[2], 23, -995338651);

        a = ii(a, b, c, d, k[0], 6, -198630844);
        d = ii(d, a, b, c, k[7], 10, 1126891415);
        c = ii(c, d, a, b, k[14], 15, -1416354905);
        b = ii(b, c, d, a, k[5], 21, -57434055);
        a = ii(a, b, c, d, k[12], 6, 1700485571);
        d = ii(d, a, b, c, k[3], 10, -1894986606);
        c = ii(c, d, a, b, k[10], 15, -1051523);
        b = ii(b, c, d, a, k[1], 21, -2054922799);
        a = ii(a, b, c, d, k[8], 6, 1873313359);
        d = ii(d, a, b, c, k[15], 10, -30611744);
        c = ii(c, d, a, b, k[6], 15, -1560198380);
        b = ii(b, c, d, a, k[13], 21, 1309151649);
        a = ii(a, b, c, d, k[4], 6, -145523070);
        d = ii(d, a, b, c, k[11], 10, -1120210379);
        c = ii(c, d, a, b, k[2], 15, 718787259);
        b = ii(b, c, d, a, k[9], 21, -343485551);

        x[0] = add32(a, x[0]);
        x[1] = add32(b, x[1]);
        x[2] = add32(c, x[2]);
        x[3] = add32(d, x[3]);
      }
      function md5blk(bytes, start) {
        return [
          (bytes[start]) | (bytes[start + 1] << 8) | (bytes[start + 2] << 16) | (bytes[start + 3] << 24),
          (bytes[start + 4]) | (bytes[start + 5] << 8) | (bytes[start + 6] << 16) | (bytes[start + 7] << 24),
          (bytes[start + 8]) | (bytes[start + 9] << 8) | (bytes[start + 10] << 16) | (bytes[start + 11] << 24),
          (bytes[start + 12]) | (bytes[start + 13] << 8) | (bytes[start + 14] << 16) | (bytes[start + 15] << 24),
          (bytes[start + 16]) | (bytes[start + 17] << 8) | (bytes[start + 18] << 16) | (bytes[start + 19] << 24),
          (bytes[start + 20]) | (bytes[start + 21] << 8) | (bytes[start + 22] << 16) | (bytes[start + 23] << 24),
          (bytes[start + 24]) | (bytes[start + 25] << 8) | (bytes[start + 26] << 16) | (bytes[start + 27] << 24),
          (bytes[start + 28]) | (bytes[start + 29] << 8) | (bytes[start + 30] << 16) | (bytes[start + 31] << 24),
          (bytes[start + 32]) | (bytes[start + 33] << 8) | (bytes[start + 34] << 16) | (bytes[start + 35] << 24),
          (bytes[start + 36]) | (bytes[start + 37] << 8) | (bytes[start + 38] << 16) | (bytes[start + 39] << 24),
          (bytes[start + 40]) | (bytes[start + 41] << 8) | (bytes[start + 42] << 16) | (bytes[start + 43] << 24),
          (bytes[start + 44]) | (bytes[start + 45] << 8) | (bytes[start + 46] << 16) | (bytes[start + 47] << 24),
          (bytes[start + 48]) | (bytes[start + 49] << 8) | (bytes[start + 50] << 16) | (bytes[start + 51] << 24),
          (bytes[start + 52]) | (bytes[start + 53] << 8) | (bytes[start + 54] << 16) | (bytes[start + 55] << 24),
          (bytes[start + 56]) | (bytes[start + 57] << 8) | (bytes[start + 58] << 16) | (bytes[start + 59] << 24),
          (bytes[start + 60]) | (bytes[start + 61] << 8) | (bytes[start + 62] << 16) | (bytes[start + 63] << 24)
        ];
      }
      function processBytes(bytes) {
        var i = 0;
        if (tail.length > 0) {
          while (tail.length < 64 && i < bytes.length) {
            tail.push(bytes[i++]);
          }
          if (tail.length === 64) {
            md5cycle(state, md5blk(tail, 0));
            tail = [];
          }
        }
        for (; i + 64 <= bytes.length; i += 64) {
          md5cycle(state, md5blk(bytes, i));
        }
        while (i < bytes.length) {
          tail.push(bytes[i++]);
        }
      }
      function rhex(n) {
        var s = '';
        for (var j = 0; j < 4; j++) {
          var v = (n >>> (j * 8)) & 0xFF;
          s += hex.charAt((v >>> 4) & 0x0F) + hex.charAt(v & 0x0F);
        }
        return s;
      }
      function finish() {
        var padding = tail.slice();
        padding.push(0x80);
        while ((padding.length % 64) !== 56) padding.push(0);
        var bitLenLo = (totalBytes * 8) >>> 0;
        var bitLenHi = Math.floor((totalBytes * 8) / 0x100000000) >>> 0;
        padding.push(bitLenLo & 0xFF, (bitLenLo >>> 8) & 0xFF, (bitLenLo >>> 16) & 0xFF, (bitLenLo >>> 24) & 0xFF);
        padding.push(bitLenHi & 0xFF, (bitLenHi >>> 8) & 0xFF, (bitLenHi >>> 16) & 0xFF, (bitLenHi >>> 24) & 0xFF);
        for (var i = 0; i < padding.length; i += 64) {
          md5cycle(state, md5blk(padding, i));
        }
        resolve(rhex(state[0]) + rhex(state[1]) + rhex(state[2]) + rhex(state[3]));
      }
      function processChunk() {
        var slice = file.slice(offset, offset + CHUNK);
        var reader = new FileReader();
        reader.onload = function(e) {
          var chunk = new Uint8Array(e.target.result);
          totalBytes += chunk.length;
          processBytes(chunk);
          offset += chunk.length;
          if (onProgress) onProgress(Math.min(offset, file.size), file.size);
          if (offset < file.size) {
            setTimeout(processChunk, 0);
          } else {
            finish();
          }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(slice);
      }
      processChunk();
    });
  }

  function ESPNowOTAController() {
    this.mac = parseQueryMac();
    this.nodeInfo = null;
    this.binHeader = null;
    this.fileSize = 0;
    this.fileMd5 = '';
    this.currentFile = null;
    this.chunkSize = 750;
    this.inFlightChunks = {};
    this.pendingChunks = {};
    this.maxConcurrentChunkUploads = 2;
    this.lastStatusOkMs = 0;
    this.statusPollFailures = 0;
    this.statusRequestInFlight = false;
    this.transferTerminal = false;
    this.lastKnownState = 'idle';
    this.statusPollTimer = null;
    this.rejoinPollTimer = null;
    this.el = {};
    this.init();
  }

  ESPNowOTAController.prototype.init = function() {
    this.bindElements();
    this.bindEvents();
    this.loadNodeInfo();
  };

  ESPNowOTAController.prototype.bindElements = function() {
    var ids = ['phase1','phase3','phase4','nodeMac','nodeName','nodeProject','nodeVersion',
               'nodeBuildDate','nodeChip','nodeOnline','nodeRssi','nodeHops','nodeEntities',
               'fileInput','fileZone','fileInfo','fileNameDisplay','fileSizeDisplay','md5Computing',
               'comparisonCard','comparisonBody','startUploadBtn','cancelBtn','statusDot','statusLabel','progressFill',
               'progressPct','progressDetail','progressRate','targetMacDisplay','abortRow','abortBtn',
               'successCard','errorCard','errorMsgText','rejoinMsg','retryBtn','backBtn'];
    for (var i = 0; i < ids.length; i++) {
      this.el[ids[i]] = document.getElementById(ids[i]);
    }
  };

  ESPNowOTAController.prototype.bindEvents = function() {
    var self = this;
    this.el.fileZone.addEventListener('click', function() { self.el.fileInput.click(); });
    this.el.fileInput.addEventListener('change', function(e) { self.handleFileSelect(e.target.files[0]); });
    this.el.fileZone.addEventListener('dragover', function(e) { e.preventDefault(); self.el.fileZone.classList.add('dragover'); });
    this.el.fileZone.addEventListener('dragleave', function() { self.el.fileZone.classList.remove('dragover'); });
    this.el.fileZone.addEventListener('drop', function(e) { e.preventDefault(); self.el.fileZone.classList.remove('dragover'); if (e.dataTransfer.files.length) self.handleFileSelect(e.dataTransfer.files[0]); });
    this.el.startUploadBtn.addEventListener('click', function() { self.startUpload(); });
    this.el.cancelBtn.addEventListener('click', function() { self.cancelSelection(); });
    var acceptWarn = document.getElementById('acceptWarnings');
    if (acceptWarn) acceptWarn.addEventListener('change', function() { self.el.startUploadBtn.disabled = !this.checked; });
    this.el.abortBtn.addEventListener('click', function() { self.sendAbort(); });
    this.el.retryBtn.addEventListener('click', function() { self.retry(); });
    this.el.backBtn.addEventListener('click', function() { self.reset(); window.location.href = '/topology'; });
  };

  ESPNowOTAController.prototype.showPhase = function(n) {
    ['phase1','phase3','phase4'].forEach(function(id) {
      document.getElementById(id).classList.remove('active');
    });
    document.getElementById('phase' + n).classList.add('active');
  };

  ESPNowOTAController.prototype.loadNodeInfo = function() {
    var self = this;
    this.el.nodeMac.textContent = this.mac ? this.mac.toUpperCase() : '\u2014';
    fetchTopology().then(function(topo) {
      var node = findNode(topo, self.mac);
      if (!node) {
        self.el.nodeName.textContent = 'Unknown';
        return;
      }
      self.nodeInfo = node;
      self.el.nodeMac.textContent = node.mac ? node.mac.toUpperCase() : '\u2014';
      self.el.nodeName.textContent = node.esphome_name || node.label || node.mac || '\u2014';
      self.el.nodeProject.textContent = node.project_name || '\u2014';
      self.el.nodeVersion.textContent = node.project_version || node.firmware_version || '\u2014';
      self.el.nodeOnline.textContent = node.online ? 'Yes' : 'No';
      var rssi = node.rssi;
      if (rssi !== undefined && rssi !== null) {
        var pct = rssi <= -100 ? 0 : (rssi >= -60 ? 100 : Math.round((rssi + 100) * 5 / 2));
        self.el.nodeRssi.textContent = rssi + ' dBm (' + pct + '%)';
      } else {
        self.el.nodeRssi.textContent = '\u2014';
      }
      self.el.nodeHops.textContent = (node.hops !== undefined) ? node.hops : '\u2014';
      self.el.nodeEntities.textContent = (node.entity_count !== undefined) ? node.entity_count : '\u2014';
      self.el.nodeBuildDate.textContent = node.firmware_build_date || '\u2014';
      self.el.nodeChip.textContent = CHIP_TYPE_DECIMAL[node.chip_type] || '\u2014';
    });
  };

  ESPNowOTAController.prototype.handleFileSelect = function(file) {
    if (!file) return;
    var self = this;
    document.getElementById('fileZoneCard').style.display = 'none';
    this.currentFile = file;
    this.el.fileInfo.classList.remove('hidden');
    this.el.fileNameDisplay.textContent = file.name;
    this.el.fileSizeDisplay.textContent = fmtBytes(file.size);
    this.fileSize = file.size;
    this.el.md5Computing.classList.remove('hidden');
    this.el.md5Computing.textContent = 'Reading firmware header...';
    this.el.comparisonCard.style.display = 'none';

    var reader = new FileReader();
    reader.onload = function(e) {
      var header = parseBinHeader(e.target.result);
      self.binHeader = header;
      self.el.md5Computing.textContent = 'Computing MD5...';
      computeFileMd5(file, function(done, total) {
        var pct = Math.round((done / total) * 100);
        self.el.md5Computing.textContent = 'Computing MD5... ' + pct + '%';
      }).then(function(md5) {
        self.fileMd5 = md5;
        self.el.md5Computing.classList.add('hidden');
        self.showComparison();
      }).catch(function() {
        self.fileMd5 = 'error';
        self.el.md5Computing.textContent = 'MD5 compute failed';
      });
    };
    reader.onerror = function() {
      self.el.md5Computing.textContent = 'Failed to read file';
    };
    reader.readAsArrayBuffer(file.slice(0, 256));
  };

  ESPNowOTAController.prototype.showComparison = function() {
    var node = this.nodeInfo || {};
    var bin = this.binHeader;

    var binDateFormatted = fmtBinDateTime(bin.build_date, bin.build_time);
    var dateBadge = compareDateBadge(this.el.nodeBuildDate.textContent, bin.build_date, bin.build_time);

    var nameMatch = (node.esphome_name && bin.esphome_name && node.esphome_name === bin.esphome_name);
    var nameBadge = nameMatch ? '<br><span class="ver-badge match">MATCH</span>' : '<br><span class="ver-badge mismatch">MISMATCH</span>';

    var currentChip = CHIP_TYPE_DECIMAL[node.chip_type] || '\u2014';
    var newChip = bin.chip_name || '\u2014';
    var chipMatch = (currentChip !== '\u2014' && newChip !== '\u2014' && currentChip === newChip);
    var chipBadge = chipMatch ? '<br><span class="ver-badge match">MATCH</span>' : '<br><span class="ver-badge mismatch">MISMATCH</span>';

    var hasWarnings = !nameMatch || !chipMatch || !dateBadge.includes('same');
    var acceptCheckbox = document.getElementById('acceptWarnings');
    if (acceptCheckbox) acceptCheckbox.checked = false;

    var html = '';
    var fields = [
      ['Name', (node.esphome_name || '\u2014'), (bin.esphome_name || '\u2014') + nameBadge],
      ['Build Date', this.el.nodeBuildDate.textContent, binDateFormatted + (dateBadge ? '<br>' + dateBadge : '')],
      ['Chip Type', currentChip, newChip + chipBadge]
    ];
    for (var i = 0; i < fields.length; i++) {
      html += '<tr><td>' + fields[i][0] + '</td><td>' + fields[i][1] + '</td><td>' + fields[i][2] + '</td></tr>';
    }
    this.el.comparisonBody.innerHTML = html;
    this.el.comparisonCard.style.display = 'block';
    document.getElementById('fileZoneCard').style.display = 'none';
    document.getElementById('warningBox').style.display = hasWarnings ? 'block' : 'none';
    this.el.startUploadBtn.disabled = hasWarnings;
  };

  ESPNowOTAController.prototype.cancelSelection = function() {
    this.currentFile = null;
    this.binHeader = null;
    this.fileMd5 = '';
    this.el.fileInput.value = '';
    this.el.comparisonCard.style.display = 'none';
    document.getElementById('fileZoneCard').style.display = 'block';
    this.el.fileInfo.classList.add('hidden');
    this.el.fileNameDisplay.textContent = '';
    this.el.fileSizeDisplay.textContent = '';
  };

  ESPNowOTAController.prototype.startUpload = function() {
    var self = this;
    if (!this.currentFile) return;
    this.showPhase(3);
    this.el.targetMacDisplay.textContent = this.mac.toUpperCase();
    this.el.statusDot.className = 'dot start_received';
    this.el.statusLabel.textContent = 'Starting transfer...';
    this.el.progressFill.style.width = '0%';
    this.el.progressPct.textContent = '0%';
    this.el.progressDetail.textContent = '';
    this.el.progressRate.textContent = '';
    this.el.abortRow.style.display = 'block';
    this.el.startUploadBtn.disabled = true;
    this.inFlightChunks = {};
    this.pendingChunks = {};
    this.lastStatusOkMs = Date.now();
    this.statusPollFailures = 0;
    this.statusRequestInFlight = false;
    this.transferTerminal = false;
    this.lastKnownState = 'start_received';
    fetch('/api/ota/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({
        target: this.mac,
        size: String(this.fileSize),
        md5: this.fileMd5
      }).toString()
    }).then(function(r) { return r.json(); }).then(function(data) {
      if (data.error) {
        self.showError(data.error);
        return;
      }
      self.el.statusLabel.textContent = 'Preparing transfer...';
      self.startStatusPoll();
    }).catch(function(err) {
      self.showError('Start request failed: ' + err.message);
    });
  };

  ESPNowOTAController.prototype.sendChunk = function(seq) {
    if (!this.currentFile) return;
    if (this.transferTerminal) return;
    if (this.inFlightChunks[seq]) return;
    var offset = seq * this.chunkSize;
    if (offset >= this.fileSize) return;
    this.inFlightChunks[seq] = true;
    delete this.pendingChunks[seq];
    var self = this;
    var slice = this.currentFile.slice(offset, offset + this.chunkSize);
    var reader = new FileReader();
    reader.onload = function(e) {
      var data = new Uint8Array(e.target.result);
      var partSize = 512;
      var sendPart = function(partOffset) {
        var part = data.subarray(partOffset, Math.min(data.length, partOffset + partSize));
        var partBinary = '';
        for (var j = 0; j < part.length; j++) partBinary += String.fromCharCode(part[j]);
        fetch('/api/ota/chunk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: new URLSearchParams({
            seq: String(seq),
            offset: String(partOffset),
            total: String(data.length),
            data: btoa(partBinary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
          }).toString()
        }).then(function(r) { return r.json(); }).then(function(resp) {
          if (resp.error === 'no active ota transfer') {
            delete self.inFlightChunks[seq];
            self.processPendingChunks();
            if (!self.transferTerminal) {
              self.el.statusLabel.textContent = 'Waiting for bridge transfer status...';
            }
            return;
          }
          if (resp.error && resp.error !== 'chunk rejected') {
            delete self.inFlightChunks[seq];
            self.showError(resp.error);
            return;
          }
          if (resp.status === 'chunk_part_accepted' && partOffset + part.length < data.length) {
            sendPart(partOffset + part.length);
            return;
          }
          delete self.inFlightChunks[seq];
          self.processPendingChunks();
        }).catch(function(err) {
          delete self.inFlightChunks[seq];
          var staleMs = Date.now() - self.lastStatusOkMs;
          if (staleMs > 5000) {
            self.showError('Chunk upload failed: ' + err.message);
            return;
          }
          if (self.el.statusLabel) self.el.statusLabel.textContent = 'Retrying chunk upload...';
          self.pendingChunks[seq] = true;
          self.processPendingChunks();
        });
      };
      sendPart(0);
    };
    reader.onerror = function() {
      delete self.inFlightChunks[seq];
      self.showError('Failed to read firmware chunk');
    };
    reader.readAsArrayBuffer(slice);
  };

  ESPNowOTAController.prototype.processPendingChunks = function() {
    if (this.transferTerminal) return;
    var inflight = Object.keys(this.inFlightChunks).length;
    if (inflight >= this.maxConcurrentChunkUploads) return;
    var queued = Object.keys(this.pendingChunks);
    for (var i = 0; i < queued.length && inflight < this.maxConcurrentChunkUploads; i++) {
      var seq = parseInt(queued[i], 10);
      if (this.inFlightChunks[seq]) continue;
      this.sendChunk(seq);
      inflight = Object.keys(this.inFlightChunks).length;
    }
  };

  ESPNowOTAController.prototype.startStatusPoll = function() {
    var self = this;
    if (this.statusPollTimer) clearInterval(this.statusPollTimer);
    this.statusPollTimer = setInterval(function() {
      if (self.statusRequestInFlight || self.transferTerminal) return;
      self.statusRequestInFlight = true;
      fetch('/api/ota/status').then(function(r) { return r.json(); }).then(function(data) {
        self.statusRequestInFlight = false;
        self.statusPollFailures = 0;
        self.lastStatusOkMs = Date.now();
        self.updateProgress(data);
      }).catch(function() {
        self.statusRequestInFlight = false;
        self.statusPollFailures += 1;
        if (self.statusPollFailures >= 15 && Date.now() - self.lastStatusOkMs > 5000) {
          self.showError('Lost connection to bridge during transfer');
        }
      });
    }, 350);
  };

  ESPNowOTAController.prototype.stopStatusPoll = function() {
    if (this.statusPollTimer) { clearInterval(this.statusPollTimer); this.statusPollTimer = null; }
  };

  ESPNowOTAController.prototype.updateProgress = function(data) {
    var state = (data.state || 'idle').toLowerCase();
    this.lastKnownState = state;
    var pct = data.percent || 0;
    var packetsSent = data.packets_sent || 0;
    var packetsTotal = data.packets_total || 0;
    if (data.chunk_size) this.chunkSize = data.chunk_size;
    this.el.progressFill.style.width = pct + '%';
    this.el.progressPct.textContent = pct + '%';
    this.el.progressDetail.textContent = packetsSent + ' / ' + packetsTotal + ' packets';
    this.el.progressFill.className = 'progress-fill ' + state;
    this.el.statusDot.className = 'dot ' + state;

    if (state === 'start_received' || state === 'uploading' || state === 'transferring') {
      if (Array.isArray(data.requested)) {
        for (var i = 0; i < data.requested.length; i++) this.pendingChunks[data.requested[i]] = true;
        this.processPendingChunks();
      }
    }

    if (data.active_target) {
      this.el.targetMacDisplay.textContent = data.active_target;
    }

    if (state === 'start_received' || state === 'uploading' || state === 'transferring') {
      this.el.statusLabel.textContent = state === 'transferring' ? 'Transferring... ' + pct + '%' :
          (state === 'uploading' ? 'Uploading firmware... ' + pct + '%' : 'Preparing transfer...');
      this.el.abortRow.style.display = 'block';
    } else if (state === 'verifying') {
      this.el.statusLabel.textContent = 'Verifying firmware...';
      this.el.abortRow.style.display = 'block';
    } else if (state === 'success') {
      this.transferTerminal = true;
      this.el.statusLabel.textContent = 'Success';
      this.el.abortRow.style.display = 'none';
      this.stopStatusPoll();
      this.showPhase(4);
      this.el.successCard.classList.remove('hidden');
      this.el.errorCard.classList.add('hidden');
      this.startRejoinPoll();
    } else if (state === 'fail') {
      this.transferTerminal = true;
      this.el.statusLabel.textContent = 'Failed';
      this.el.abortRow.style.display = 'none';
      this.stopStatusPoll();
      this.showError(data.error_msg || 'Transfer error');
    } else if (state === 'idle') {
      this.transferTerminal = true;
      this.el.statusLabel.textContent = 'Idle';
      this.el.abortRow.style.display = 'none';
    }
  };

  ESPNowOTAController.prototype.sendAbort = function() {
    this.el.abortRow.style.display = 'none';
    fetch('/api/ota/abort', { method: 'POST' }).catch(function() {});
    this.el.statusLabel.textContent = 'Transfer Aborted';
    this.el.statusDot.className = 'dot fail';
    this.el.progressFill.className = 'progress-fill fail';
    this.stopStatusPoll();
  };

  ESPNowOTAController.prototype.startRejoinPoll = function() {
    var self = this;
    if (this.rejoinPollTimer) clearInterval(this.rejoinPollTimer);
    this.rejoinPollTimer = setInterval(function() {
      fetchTopology().then(function(topo) {
        var node = findNode(topo, self.mac);
        if (node && node.online) {
          self.el.rejoinMsg.classList.add('visible');
          clearInterval(self.rejoinPollTimer);
        }
      });
    }, 5000);
  };

  ESPNowOTAController.prototype.showError = function(msg) {
    this.transferTerminal = true;
    this.pendingChunks = {};
    this.inFlightChunks = {};
    this.statusRequestInFlight = false;
    this.el.statusDot.className = 'dot fail';
    this.el.progressFill.className = 'progress-fill fail';
    this.stopStatusPoll();
    this.showPhase(4);
    this.el.successCard.classList.add('hidden');
    this.el.errorCard.classList.remove('hidden');
    this.el.errorMsgText.textContent = msg;
    this.el.abortRow.style.display = 'none';
    if (this.rejoinPollTimer) clearInterval(this.rejoinPollTimer);
  };

  ESPNowOTAController.prototype.retry = function() {
    this.reset();
    this.showPhase(1);
  };

  ESPNowOTAController.prototype.reset = function() {
    if (this.rejoinPollTimer) clearInterval(this.rejoinPollTimer);
    this.stopStatusPoll();
    this.chunkSize = 750;
    this.inFlightChunks = {};
    this.pendingChunks = {};
    this.maxConcurrentChunkUploads = 2;
    this.lastStatusOkMs = 0;
    this.statusPollFailures = 0;
    this.statusRequestInFlight = false;
    this.transferTerminal = false;
    this.lastKnownState = 'idle';
    this.fileMd5 = '';
    this.binHeader = null;
    this.currentFile = null;
    this.el.progressFill.style.width = '0%';
    this.el.progressPct.textContent = '0%';
    this.el.progressDetail.textContent = '';
    this.el.progressRate.textContent = '';
    this.el.abortRow.style.display = 'none';
    this.el.rejoinMsg.classList.remove('visible');
    this.el.successCard.classList.add('hidden');
    this.el.errorCard.classList.add('hidden');
  };

  window.addEventListener('DOMContentLoaded', function() {
    window.controller = new ESPNowOTAController();
  });
})();
</script>
</body>
</html>)raw";
