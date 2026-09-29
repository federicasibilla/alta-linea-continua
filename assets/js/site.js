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
    return { "Topographic": topo, "Minimal": light, "Satellite": sat };
  }

  function makeMap(el) {
    var layers = baseLayers();
    var map = L.map(el, { scrollWheelZoom: false, zoomSnap: 0.25, layers: [layers.Topographic] });
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
      function highlight(n) {
        Object.keys(groups).forEach(function (k) {
          var on = +k === n;
          groups[k].line.setStyle({ color: on ? COL.accent : COL.route, weight: on ? 6 : 3.2, opacity: on ? 1 : 0.85 });
          if (on) groups[k].line.bringToFront();
        });
        listLinks.forEach(function (a) { a.classList.toggle("on", +a.dataset.n === n); });
      }
      geo.forEach(function (s) {
        var meta = META[s.n] || { n: s.n, start: "", end: "", date: "", url: "#" };
        var ll = s.line.map(function (p) { return [p[0], p[1]]; });
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
      listLinks.forEach(function (a) {
        a.addEventListener("mouseenter", function () { highlight(+a.dataset.n); });
        a.addEventListener("mouseleave", function () { highlight(-1); });
      });
    });
  }

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

  var a = document.getElementById("atlas-map"); if (a && window.L) atlas(a);
  var st = document.getElementById("stage-map"); if (st && window.L) stage(st);
  lightbox();
})();
