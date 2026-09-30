(function () {
  var ALC = window.ALC || { base: "", stages: [] };
  var css = getComputedStyle(document.documentElement);
  var C = function (name) { return css.getPropertyValue(name).trim(); };
  var COL = { route: C("--route"), accent: C("--accent"), green: C("--green"), yellow: C("--yellow"), edge: C("--edge"), paper: C("--paper") };
  var META = {};
  ALC.stages.forEach(function (s) { META[s.n] = s; });

  /* ---------- helpers ---------- */
  function pointAtKm(line, km) {
    // line: [[lat, lon, km], ...]
    if (km <= line[0][2]) return [line[0][0], line[0][1]];
    for (var i = 1; i < line.length; i++) {
      if (line[i][2] >= km) {
        var a = line[i - 1], b = line[i], t = (km - a[2]) / ((b[2] - a[2]) || 1);
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      }
    }
    var l = line[line.length - 1];
    return [l[0], l[1]];
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function triSVG(color, size) {
    var h = size, w = size * 1.12;
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '"><path d="M' + w / 2 + ',1 L' + (w - 1) + "," + (h - 1) + " L1," + (h - 1) + ' Z" fill="' + color + '" stroke="' + COL.edge + '" stroke-width="1.3" stroke-linejoin="round"/></svg>';
  }
  function climbColor(c) { return (c.color || "").toLowerCase().indexOf("yellow") === 0 ? COL.yellow : COL.green; }

  function baseLayers() {
    var topo = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      maxZoom: 17, attribution: 'Map data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM · Style © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)'
    });
    var light = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19, subdomains: "abcd", attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>'
    });
    var sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 18, attribution: "Imagery © Esri, Maxar, Earthstar Geographics"
    });
    var relief = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 17, attribution: "Relief: Esri, Vantor, Airbus DS, USGS, NGA, NASA, CGIAR, N Robinson, NCEAS, NLS, OS, NMA, Geodatastyrelsen, Rijkswaterstaat, GSA, Geoland, FEMA, Intermap and the GIS user community"
    });
    return { "Relief": relief, "Topographic": topo, "Minimal": light, "Satellite": sat };
  }

  function makeMap(el) {
    var layers = baseLayers();
    var style = el.dataset.style || "";
    var start = style.indexOf("relief") === 0 ? layers.Relief : layers.Topographic;
    var map = L.map(el, { scrollWheelZoom: false, zoomSnap: 0.25, layers: [start] });
    if (style) el.classList.add("m-" + style);
    el.classList.toggle("tinted", start === layers.Relief);
    map.on("baselayerchange", function (e) { el.classList.toggle("tinted", e.layer === layers.Relief); });
    L.control.layers(layers, null, { position: "topright" }).addTo(map);
    L.control.scale({ imperial: false }).addTo(map);
    map.on("focus", function () { map.scrollWheelZoom.enable(); });
    map.on("blur", function () { map.scrollWheelZoom.disable(); });
    return map;
  }

  function addClimbMarkers(map, stageGeo, stageMeta, size) {
    (Array.isArray(stageMeta.climbing) ? stageMeta.climbing : []).forEach(function (c) {
      if (c.km === undefined || c.km === null || c.km === "") return;
      var pos = pointAtKm(stageGeo.line, +c.km);
      var icon = L.divIcon({ className: "climb-icon", html: triSVG(climbColor(c), size), iconSize: [size * 1.12, size], iconAnchor: [size * 0.56, size * 0.66] });
      var m = L.marker(pos, { icon: icon, riseOnHover: true, zIndexOffset: 1000, keyboard: true, title: c.name }).addTo(map);
      var tip = "<b>STAGE " + stageMeta.n + " · CLIMBING SECTION</b><span class=\"t\">" + esc(c.name) + "</span>" +
        (c.grade ? "Grade " + esc(c.grade) + "<br>" : "") + (c.link ? "Click for the route description ↗" : "Route description coming soon");
      m.bindTooltip(tip, { className: "stage-tip", direction: "top", offset: [0, -size * 0.6] });
      m.on("click", function () { if (c.link) window.open(c.link, "_blank", "noopener"); });
    });
  }

  function load(cb) {
    fetch(ALC.base + "/assets/data/stages.json").then(function (r) { return r.json(); }).then(cb);
  }

  /* ---------- whole-route map ---------- */
  function atlas(el) {
    load(function (geo) {
      var map = makeMap(el), groups = {}, bounds = L.latLngBounds([]);
      var listLinks = document.querySelectorAll(".list a[data-n]");
      var current = -1, spineApi = null;
      function highlight(n) {
        if (n === current) return;
        current = n;
        Object.keys(groups).forEach(function (k) {
          var on = +k === n;
          groups[k].line.setStyle({ color: on ? COL.accent : COL.route, weight: on ? 6 : 3.2, opacity: on ? 1 : (n >= 0 ? 0.35 : 0.85) });
          if (on) groups[k].line.bringToFront();
        });
        listLinks.forEach(function (a) { a.classList.toggle("on", +a.dataset.n === n); });
        if (spineApi) spineApi.set(n);
      }
      geo.forEach(function (s) {
        var meta = META[s.n] || { n: s.n, start: "", end: "", date: "", url: "#" };
        var ll = s.line.map(function (p) { return [p[0], p[1]]; });
        if ((el.dataset.style || "").indexOf("mist") > -1) {
          [[46, 0.10], [28, 0.14], [16, 0.2]].forEach(function (m) { L.polyline(ll, { color: COL.paper, weight: m[0], opacity: m[1], interactive: false, lineCap: "round", lineJoin: "round" }).addTo(map); });
        }
        var halo = L.polyline(ll, { color: COL.paper, weight: 7, opacity: 0.8, interactive: false }).addTo(map);
        var line = L.polyline(ll, { color: COL.route, weight: 3.2, opacity: 0.85, interactive: false, lineJoin: "round" }).addTo(map);
        var hit = L.polyline(ll, { color: "#000", weight: 22, opacity: 0 }).addTo(map);
        hit.bindTooltip("<b>STAGE " + s.n + " · " + esc(meta.date).toUpperCase() + "</b><span class=\"t\">" + esc(meta.start) + " → " + esc(meta.end) + "</span>" + s.km + " km · +" + s.up + " m · −" + s.down + " m", { sticky: true, className: "stage-tip", direction: "top", offset: [0, -12] });
        hit.on("mouseover", function () { highlight(s.n); });
        hit.on("mouseout", function () { highlight(-1); });
        hit.on("click", function () { window.location.href = meta.url; });
        groups[s.n] = { line: line, halo: halo };
        bounds.extend(line.getBounds());
        L.circleMarker(ll[ll.length - 1], { radius: 3.2, color: COL.edge, weight: 1.2, fillColor: COL.paper, fillOpacity: 1, interactive: false }).addTo(map);
      });
      geo.forEach(function (s) { if (META[s.n]) addClimbMarkers(map, s, META[s.n], 17); });
      map.fitBounds(bounds, { padding: [24, 24] });
      var sp = document.getElementById("spine");
      if (sp) spineApi = spine(sp, geo, highlight);
      listLinks.forEach(function (a) {
        a.addEventListener("mouseenter", function () { highlight(+a.dataset.n); });
        a.addEventListener("mouseleave", function () { highlight(-1); });
      });
    });
  }

  /* ---------- the continuous line (home page) ---------- */
  function spine(el, geo, highlight) {
    var W = 1000, H = 150, TOP = 6, off = 0, segs = [];
    geo.forEach(function (s) { var end = s.profile[s.profile.length - 1][0]; segs.push({ s: s, off: off, len: end }); off += end; });
    var TOT = off, amin = Infinity, amax = -Infinity;
    geo.forEach(function (s) { s.profile.forEach(function (p) { if (p[1] < amin) amin = p[1]; if (p[1] > amax) amax = p[1]; }); });
    var X = function (km) { return km / TOT * W; };
    var Y = function (a) { return TOP + (1 - (a - amin) / (amax - amin)) * (H - TOP - 4); };
    var svg = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="Elevation profile of the whole route">';
    segs.forEach(function (g, i) { if (i) { var x = X(g.off); svg += '<line class="tick" x1="' + x + '" x2="' + x + '" y1="' + (H - 7) + '" y2="' + H + '"/>'; } });
    segs.forEach(function (g) {
      var pr = g.s.profile, step = Math.max(1, Math.round(pr.length / 160));
      var pts = pr.filter(function (p, i) { return i % step === 0 || i === pr.length - 1; });
      var d = pts.map(function (p, i) { return (i ? "L" : "M") + X(g.off + p[0]).toFixed(1) + "," + Y(p[1]).toFixed(1); }).join("");
      svg += '<g class="seg" data-n="' + g.s.n + '"><path class="seg-fill" d="' + d + "L" + X(g.off + g.len).toFixed(1) + "," + H + "L" + X(g.off).toFixed(1) + "," + H + 'Z"/><path class="seg-line" d="' + d + '"/></g>';
    });
    segs.forEach(function (g) { svg += '<rect class="hit" data-n="' + g.s.n + '" x="' + X(g.off).toFixed(1) + '" y="0" width="' + Math.max(1, X(g.len)).toFixed(1) + '" height="' + H + '"/>'; });
    el.innerHTML = svg + "</svg>";
    var cap = document.getElementById("cap");
    var idle = cap ? '<span class="d">' + esc(cap.dataset.idleTop || "") + "</span><b>" + esc(cap.dataset.idle || "") + "</b>" : "";
    if (cap) cap.innerHTML = idle;
    el.querySelectorAll(".hit").forEach(function (r) {
      var n = +r.dataset.n, meta = META[n];
      r.addEventListener("mouseenter", function () { highlight(n); });
      r.addEventListener("mouseleave", function () { highlight(-1); });
      r.addEventListener("click", function () { if (meta) window.location.href = meta.url; });
    });
    var byN = {}; geo.forEach(function (s) { byN[s.n] = s; });
    return {
      set: function (n) {
        el.classList.toggle("dim", n >= 0);
        el.querySelectorAll(".seg").forEach(function (g) { g.classList.toggle("on", +g.dataset.n === n); });
        if (!cap) return;
        if (n < 0) { cap.innerHTML = idle; return; }
        var s = byN[n], m = META[n] || {};
        cap.innerHTML = '<span class="d">Stage ' + n + " · " + esc(m.date || "") + " · " + s.km + " km · +" + s.up + " m · high point " + s.max + " m</span><b>" + esc(m.start || "") + " → " + esc(m.end || "") + "</b>";
      }
    };
  }
  function fitName() {
    var n1 = document.getElementById("n1"), n2 = document.getElementById("n2");
    if (!n1 || !n2) return;
    n2.style.fontSize = "";
    var r = document.createRange();
    r.selectNodeContents(document.getElementById("n1t") || n1); var w1 = r.getBoundingClientRect().width;
    r.selectNodeContents(n2); var w2 = r.getBoundingClientRect().width;
    if (w2) n2.style.fontSize = (parseFloat(getComputedStyle(n2).fontSize) * w1 / w2).toFixed(2) + "px";
  }
  fitName();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitName);
  window.addEventListener("resize", fitName);


  /* ---------- aerial haze (Stages page) ---------- */
  function haze(el) {
    load(function (geo) {
      var C = COL.accent, Hz = C_("--haze") || "#B9CDD1";
      var COLS = [["Colle di Tenda", 1871, 44.150, 7.563], ["Colle della Lombarda", 2350, 44.202, 7.149], ["Colle della Maddalena", 1996, 44.421, 6.893], ["Colle dell'Agnello", 2744, 44.684, 6.979]];
      var S = geo.map(function (s) {
        var pr = s.profile, j = 0;
        var line = s.line.map(function (p) { while (j < pr.length - 1 && pr[j][0] < p[2]) j++; return [p[0], p[1], pr[j][1], p[2]]; });
        return { n: s.n, km: s.km, up: s.up, line: line };
      });
      var all = []; S.forEach(function (s) { all = all.concat(s.line); });
      var la0 = Infinity, la1 = -Infinity, lo0 = Infinity, lo1 = -Infinity, a0 = Infinity, a1 = -Infinity;
      all.forEach(function (p) { la0 = Math.min(la0, p[0]); la1 = Math.max(la1, p[0]); lo0 = Math.min(lo0, p[1]); lo1 = Math.max(lo1, p[1]); a0 = Math.min(a0, p[2]); a1 = Math.max(a1, p[2]); });
      var kx = Math.cos(44.45 * Math.PI / 180), W = 1200, H = 720;
      var sx = (W - 120) / ((lo1 - lo0) * kx), Y0 = H - 70, dk = H * 0.52, ak = H * 0.25;
      var depth = function (p) { return (p[0] - la0) / (la1 - la0); };
      var P = function (p) { return [60 + (p[1] - lo0) * kx * sx, Y0 - depth(p) * dk - ((p[2] - a0) / (a1 - a0)) * ak]; };
      var G = function (p) { return [60 + (p[1] - lo0) * kx * sx, Y0 - depth(p) * dk]; };
      var path = function (pts, f) { return pts.map(function (p, i) { var q = f(p); return (i ? "L" : "M") + q[0].toFixed(1) + "," + q[1].toFixed(1); }).join(""); };
      function mix(a, b, t) { var h = function (x) { return [1, 3, 5].map(function (i) { return parseInt(x.slice(i, i + 2), 16); }); }; var A = h(a), B = h(b); return "#" + A.map(function (v, i) { return Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0"); }).join(""); }
      var g = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="The route seen from the south"><defs><linearGradient id="hzg" x1="0" y1="1" x2="0" y2="0"><stop offset="0" class="hz-a" stop-opacity="0"/><stop offset="1" class="hz-a" stop-opacity=".45"/></linearGradient></defs>';
      S.slice().sort(function (a, b) { return b.line[0][0] - a.line[0][0]; }).forEach(function (s) {
        var d = s.line.reduce(function (a, p) { return a + depth(p); }, 0) / s.line.length, col = mix(C, Hz, Math.min(1, d * 0.8)), m = META[s.n] || {};
        var curtain = ""; s.line.forEach(function (p, i) { if (i % 2) return; var q = P(p), gq = G(p); curtain += "M" + q[0].toFixed(1) + "," + q[1].toFixed(1) + "V" + gq[1].toFixed(1); });
        var end = P(s.line[s.line.length - 1]);
        var mk = (Array.isArray(m.climbing) ? m.climbing : []).map(function (c) {
          if (c.km === undefined || c.km === "") return "";
          var q = s.line[s.line.length - 1]; for (var i = 0; i < s.line.length; i++) { if (s.line[i][3] >= +c.km) { q = s.line[i]; break; } }
          var xy = P(q), r = 6; return '<path class="mk" fill="' + climbColor(c) + '" d="M' + xy[0].toFixed(1) + "," + (xy[1] - r).toFixed(1) + "L" + (xy[0] + r * .9).toFixed(1) + "," + (xy[1] + r * .55).toFixed(1) + "L" + (xy[0] - r * .9).toFixed(1) + "," + (xy[1] + r * .55).toFixed(1) + 'Z"/>';
        }).join("");
        g += '<g class="st" data-n="' + s.n + '"><path d="' + curtain + '" stroke="' + col + '" stroke-width=".5" opacity=".3" fill="none"/><path d="' + path(s.line, G) + '" stroke="' + col + '" stroke-width=".8" opacity=".45" fill="none"/><path d="' + path(s.line, P) + '" stroke="' + col + '" stroke-width="' + (2.4 - d).toFixed(2) + '" fill="none" stroke-linejoin="round"/>' + mk +
          '<circle class="hutdot" cx="' + end[0].toFixed(1) + '" cy="' + end[1].toFixed(1) + '" r="2.6"/><g class="hover-only"><line class="lead" x1="' + end[0].toFixed(1) + '" x2="' + end[0].toFixed(1) + '" y1="' + (end[1] - 5).toFixed(1) + '" y2="' + (end[1] - 34).toFixed(1) + '"/><text class="hut" x="' + end[0].toFixed(1) + '" y="' + (end[1] - 39).toFixed(1) + '" text-anchor="middle">' + esc(m.end || "") + "</text></g>" +
          '<path class="hit" d="' + path(s.line, P) + '"/></g>';
      });
      COLS.forEach(function (c) {
        var best = null, bd = 1e9; all.forEach(function (p) { var dd = Math.pow(p[0] - c[2], 2) + Math.pow((p[1] - c[3]) * kx, 2); if (dd < bd) { bd = dd; best = p; } });
        var q = P(best), gq = G(best), x = q[0], y = q[1];
        g += '<path class="colmark" d="M' + (x - 6) + "," + (y - 6) + "Q" + x + "," + (y + 1) + " " + (x + 6) + "," + (y - 6) + "M" + (x - 6) + "," + (y + 6) + "Q" + x + "," + (y - 1) + " " + (x + 6) + "," + (y + 6) + '"/><line class="lead" x1="' + x + '" x2="' + x + '" y1="' + (y + 8) + '" y2="' + (gq[1] + 10) + '"/><text class="colname" x="' + x + '" y="' + (gq[1] + 26) + '" text-anchor="middle">' + esc(c[0]) + '</text><text class="colalt" x="' + x + '" y="' + (gq[1] + 40) + '" text-anchor="middle">' + c[1] + " m</text>";
      });
      el.innerHTML = g + "</svg>";
      var svg = el.querySelector("svg"), cap = document.getElementById("hcap"), links = document.querySelectorAll(".list a[data-n]");
      var idle = cap ? '<span class="d">' + esc(cap.dataset.idleTop || "") + "</span><b>" + esc(cap.dataset.idle || "") + "</b>" : "";
      if (cap) cap.innerHTML = idle;
      function set(n) {
        svg.classList.toggle("dim", n >= 0);
        svg.querySelectorAll("g.st").forEach(function (x) { x.classList.toggle("on", +x.dataset.n === n); });
        links.forEach(function (a) { a.classList.toggle("on", +a.dataset.n === n); });
        if (!cap) return;
        if (n < 0) { cap.innerHTML = idle; return; }
        var s = S[n], m = META[n] || {};
        cap.innerHTML = '<span class="d">Stage ' + n + " · " + esc(m.date || "") + " · " + s.km + " km · +" + s.up + " m</span><b>" + esc(m.start || "") + " → " + esc(m.end || "") + "</b>";
      }
      svg.querySelectorAll("g.st").forEach(function (x) {
        var n = +x.dataset.n;
        x.addEventListener("mouseenter", function () { set(n); });
        x.addEventListener("mouseleave", function () { set(-1); });
        x.addEventListener("click", function () { if (META[n]) window.location.href = META[n].url; });
      });
      links.forEach(function (a) { a.addEventListener("mouseenter", function () { set(+a.dataset.n); }); a.addEventListener("mouseleave", function () { set(-1); }); });
    });
  }
  var C_ = function (n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); };
  var hz = document.getElementById("haze"); if (hz) haze(hz);

  /* ---------- single stage ---------- */
  function stage(el) {
    var n = +el.dataset.n;
    load(function (geo) {
      var map = makeMap(el), s = null;
      geo.forEach(function (g) {
        var ll = g.line.map(function (p) { return [p[0], p[1]]; });
        if (g.n === n) { s = g; return; }
        var meta = META[g.n];
        var other = L.polyline(ll, { color: COL.route, weight: 2.2, opacity: 0.45 }).addTo(map);
        if (meta) { other.bindTooltip("Stage " + g.n + " · " + esc(meta.start) + " → " + esc(meta.end), { sticky: true, className: "stage-tip" }); other.on("click", function () { window.location.href = meta.url; }); }
      });
      if (!s) return;
      var ll = s.line.map(function (p) { return [p[0], p[1]]; });
      L.polyline(ll, { color: COL.paper, weight: 8, opacity: 0.85 }).addTo(map);
      var line = L.polyline(ll, { color: COL.accent, weight: 4.5 }).addTo(map);
      L.circleMarker(ll[0], { radius: 5, color: COL.edge, weight: 1.5, fillColor: COL.paper, fillOpacity: 1 }).bindTooltip("Start").addTo(map);
      L.circleMarker(ll[ll.length - 1], { radius: 5, color: COL.edge, weight: 1.5, fillColor: COL.edge, fillOpacity: 1 }).bindTooltip("End").addTo(map);
      if (META[n]) addClimbMarkers(map, s, META[n], 20);
      map.invalidateSize(); map.fitBounds(line.getBounds(), { padding: [28, 28] });
      profile(document.getElementById("profile"), s, META[n]);
    });
  }

  /* ---------- elevation profile ---------- */
  function profile(el, s, meta) {
    if (!el) return;
    var W = Math.max(360, Math.min(1100, el.clientWidth || 900)), H = W < 600 ? 170 : 190, L0 = 44, R0 = 12, T0 = 26, B0 = 24;
    var pr = s.profile, maxd = pr[pr.length - 1][0];
    var amin = Math.floor(s.min / 200) * 200, amax = Math.ceil(s.max / 200) * 200;
    var X = function (d) { return L0 + d / maxd * (W - L0 - R0); };
    var Y = function (a) { return H - B0 - (a - amin) / (amax - amin) * (H - T0 - B0); };
    var g = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Elevation profile">';
    for (var a = amin; a <= amax; a += 200) g += '<line class="g" x1="' + L0 + '" x2="' + (W - R0) + '" y1="' + Y(a) + '" y2="' + Y(a) + '"/><text x="' + (L0 - 6) + '" y="' + (Y(a) + 3) + '" text-anchor="end">' + a + "</text>";
    var step = (maxd > 16 ? 4 : maxd > 8 ? 2 : 1) * (W < 600 ? 2 : 1);
    for (var d = 0; d <= maxd + 0.01; d += step) g += '<text x="' + X(d) + '" y="' + (H - 6) + '" text-anchor="middle">' + d + " km</text>";
    var path = pr.map(function (p, i) { return (i ? "L" : "M") + X(p[0]).toFixed(1) + "," + Y(p[1]).toFixed(1); }).join("");
    g += '<path class="area" d="' + path + "L" + X(maxd) + "," + Y(amin) + "L" + L0 + "," + Y(amin) + 'Z"/><path class="ln" d="' + path + '"/>';
    ((meta && Array.isArray(meta.climbing)) ? meta.climbing : []).forEach(function (c) {
      if (c.km === undefined || c.km === "") return;
      var km = +c.km, alt = pr[0][1];
      for (var i = 0; i < pr.length; i++) { if (pr[i][0] >= km) { alt = pr[i][1]; break; } }
      var x = X(km), y = Y(alt) - 4, cls = climbColor(c) === COL.yellow ? "mk-y" : "mk-g";
      g += '<path class="mk ' + cls + '" d="M' + x + "," + (y - 11) + " L" + (x + 6.5) + "," + y + " L" + (x - 6.5) + "," + y + ' Z"/>';
      g += '<text class="mk-l" x="' + x + '" y="' + (y - 15) + '" text-anchor="middle">' + esc(c.name) + "</text>";
    });
    el.innerHTML = g + "</svg>";
  }

  /* ---------- lightbox ---------- */
  function lightbox() {
    var box = document.getElementById("lightbox");
    if (!box) return;
    var img = box.querySelector("img"), cap = box.querySelector("figcaption");
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a.lb");
      if (a) { e.preventDefault(); img.src = a.getAttribute("href"); cap.textContent = a.dataset.caption || ""; box.hidden = false; }
      else if (!box.hidden && (e.target === box || e.target.tagName === "BUTTON")) { box.hidden = true; img.src = ""; }
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { box.hidden = true; img.src = ""; } });
  }

  if (window.L) document.querySelectorAll(".js-atlas").forEach(function (m) { atlas(m); });
  var st = document.getElementById("stage-map"); if (st && window.L) stage(st);
  document.querySelectorAll("details.talk-form").forEach(function (d) {
    d.addEventListener("toggle", function () { if (d.open && window.Tally) window.Tally.loadEmbeds(); });
  });
  lightbox();
})();
