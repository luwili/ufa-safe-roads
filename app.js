(() => {
  'use strict';

  const DATA = window.UFA_DATA;
  const formatRub = (n) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';

  function getOsagoRule(violationsCount) {
    if (violationsCount <= 0) return DATA.osagoScale[0]; // 12%
    if (violationsCount === 1) return DATA.osagoScale[1]; // 9%
    if (violationsCount === 2) return DATA.osagoScale[2]; // 6%
    if (violationsCount === 3) return DATA.osagoScale[3]; // 3%
    return DATA.osagoScale[4]; // 0%
  }

  // -----------------------------
  // 1. Калькулятор скидки на ОСАГО
  // -----------------------------
  let selectedViolations = 0;

  const calcEls = {
    osago: document.getElementById('calc-osago'),
    valOsago: document.getElementById('val-osago'),
    finalPrice: document.getElementById('res-final-price'),
    discountBadge: document.getElementById('res-discount-badge'),
    resBase: document.getElementById('res-base'),
    resViolLabel: document.getElementById('res-viol-label'),
    resSaving: document.getElementById('res-saving'),
    resStatusNote: document.getElementById('res-status-note')
  };

  function updateCalculator() {
    const basePrice = Number(calcEls.osago.value);
    const rule = getOsagoRule(selectedViolations);
    const saving = Math.round(basePrice * (rule.discount / 100));
    const finalPrice = basePrice - saving;

    calcEls.valOsago.textContent = formatRub(basePrice);
    calcEls.resBase.textContent = formatRub(basePrice);
    calcEls.resViolLabel.textContent = rule.label;
    calcEls.resSaving.textContent = saving > 0 ? `- ${formatRub(saving)}` : '0 ₽';
    calcEls.finalPrice.textContent = formatRub(finalPrice);
    calcEls.discountBadge.textContent = rule.discount > 0 ? `Скидка: ${rule.discount}%` : 'Скидки нет (0%)';
    calcEls.resStatusNote.textContent = rule.status;
  }

  calcEls.osago.addEventListener('input', updateCalculator);
  document.querySelectorAll('.viol-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.viol-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedViolations = Number(btn.dataset.violations);
      updateCalculator();
    });
  });
  updateCalculator();

  // -----------------------------
  // 2. Подробная карта Уфы + OSM Overpass API + переключение слоев
  // -----------------------------
  const state = {
    activeFilter: 'all',
    activeBasemap: '2gis',
    cameras: [...DATA.baselineCameras],
    driverViolations: 1
  };

  let map = null;
  let baseLayers = {};
  let layers = {
    corridors: null,
    zones: null,
    cameras: null
  };

  const detailEls = {
    badge: document.getElementById('detail-badge'),
    title: document.getElementById('detail-title'),
    district: document.getElementById('detail-district'),
    desc: document.getElementById('detail-desc'),
    risk: document.getElementById('detail-risk'),
    violations: document.getElementById('detail-violations'),
    forecast: document.getElementById('detail-forecast'),
    prevention: document.getElementById('detail-prevention')
  };

  function showDetails(info) {
    detailEls.badge.textContent = info.badge || 'Участок Уфы';
    detailEls.title.textContent = info.title;
    detailEls.district.textContent = info.district || 'г. Уфа';
    detailEls.desc.textContent = info.desc;
    detailEls.risk.textContent = info.risk;
    detailEls.violations.textContent = info.violations;
    detailEls.forecast.textContent = info.forecast || 'Мониторинг и профилактика нарушений';
    detailEls.prevention.textContent = info.prevention;
  }

  function zoneColor(zone) {
    if (zone.type === 'tech1' || zone.type === 'danger') return '#DC2626';
    if (zone.type === 'tech2') return '#2563EB';
    if (zone.type === 'tech3') return '#059669';
    return '#1D4ED8';
  }

  function selectZoneOnMap(zone) {
    showDetails({
      badge: zone.techLabel,
      title: zone.name,
      district: `${zone.district} · Лимит: ${zone.speedLimit}`,
      desc: zone.description,
      risk: `${zone.riskScore} / 100 (${zone.risk === 'high' ? 'Высокий' : 'Средний'}) · ${zone.camerasCount} камер`,
      violations: zone.violations,
      forecast: zone.forecast,
      prevention: zone.prevention
    });
    if (map) {
      map.flyTo(zone.coords, 14, { duration: 0.7 });
    }
  }

  function renderMapLayers() {
    if (!map) return;

    layers.corridors.clearLayers();
    layers.zones.clearLayers();
    layers.cameras.clearLayers();

    const f = state.activeFilter;
    let visibleZones = 0;
    let visibleCameras = 0;

    // Ключевые магистрали Уфы
    DATA.corridors.forEach((cor) => {
      const showCor = f === 'all' || f === cor.type || (f === 'danger' && cor.type === 'danger');
      if (!showCor) return;
      const line = L.polyline(cor.coords, {
        color: cor.color,
        weight: 4,
        opacity: 0.65,
        dashArray: cor.type === 'tech3' ? '8 6' : null
      });
      line.bindTooltip(`<strong>${cor.name}</strong><br>${cor.note}`, { sticky: true });
      line.addTo(layers.corridors);
    });

    // Опасные зоны и пилотные участки
    DATA.zones.forEach((zone) => {
      const match =
        f === 'all' ||
        (f === 'danger' && (zone.type === 'danger' || zone.risk === 'high')) ||
        f === zone.type;

      if (!match) return;
      visibleZones += 1;

      const color = zoneColor(zone);
      const circle = L.circle(zone.coords, {
        radius: zone.radius,
        color: color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.16
      });

      circle.on('click', () => selectZoneOnMap(zone));
      circle.bindTooltip(
        `<strong>${zone.name}</strong><br>${zone.techLabel} · Риск: ${zone.riskScore}/100`,
        { direction: 'top', sticky: true }
      );
      circle.addTo(layers.zones);

      // Графический маркер-значок в центре каждой зоны
      const pinCode = zone.type === 'tech1' ? 'П2' : zone.type === 'tech2' ? 'LED' : zone.type === 'tech3' ? 'IoT' : '!';
      const icon = L.divIcon({
        className: 'custom-pin',
        html: `<div class="pin-badge" style="background:${color};">${pinCode}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
      const pin = L.marker(zone.coords, { icon });
      pin.on('click', () => selectZoneOnMap(zone));
      pin.addTo(layers.zones);
    });

    // Камеры (открытые данные OSM + базовый реестр)
    if (f === 'all' || f === 'camera') {
      state.cameras.forEach((cam) => {
        visibleCameras += 1;
        const marker = L.circleMarker([cam.lat, cam.lon], {
          radius: cam.fromOsm ? 6 : 5.5,
          color: '#FFFFFF',
          weight: 1.5,
          fillColor: cam.fromOsm ? '#1D4ED8' : '#0F172A',
          fillOpacity: 0.92
        });

        marker.on('click', () => {
          showDetails({
            badge: cam.fromOsm ? 'Открытые данные OSM (живая синхронизация)' : cam.source,
            title: cam.name,
            district: `${cam.district ? cam.district + ' район · ' : ''}Координаты: ${cam.lat.toFixed(4)}, ${cam.lon.toFixed(4)}`,
            desc: 'Комплекс автоматической фотовидеофиксации нарушений ПДД. Постановления с камер учитываются в годовом счетчике скидки на ОСАГО.',
            risk: `Ограничение скорости: ${cam.limit ? cam.limit + ' км/ч' : 'по знакам ПДД'}`,
            violations: cam.control || 'Контроль скоростного режима и соблюдения ПДД',
            forecast: 'Автоматический контроль 24/7',
            prevention: 'Соблюдение скоростного режима и разметки сохраняет годовую скидку на ОСАГО.'
          });
        });

        marker.bindTooltip(`${cam.name}${cam.limit ? ` (${cam.limit} км/ч)` : ''}`, {
          direction: 'top'
        });

        marker.addTo(layers.cameras);
      });
    }

    document.getElementById('count-cameras').textContent = String(visibleCameras);
    document.getElementById('count-zones').textContent = String(visibleZones);
    document.getElementById('stat-total-cameras').textContent = String(state.cameras.length);
  }

  async function syncOpenDataCameras() {
    const statusEl = document.getElementById('sync-status-text');
    const osmNote = document.getElementById('stat-osm-note');
    const btn = document.getElementById('btn-sync-osm');
    btn.disabled = true;
    statusEl.textContent = 'Синхронизация камер Уфы с OpenStreetMap (Overpass API)...';

    const query = `
      [out:json][timeout:12];
      (
        node["highway"="speed_camera"](54.56,55.80,54.89,56.20);
        node["enforcement"="maxspeed"](54.56,55.80,54.89,56.20);
        node["enforcement"="traffic_signals"](54.56,55.80,54.89,56.20);
      );
      out body;
    `;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: 'data=' + encodeURIComponent(query),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const elements = Array.isArray(json.elements) ? json.elements : [];

      const osmCameras = elements
        .filter((el) => typeof el.lat === 'number' && typeof el.lon === 'number')
        .map((el, idx) => {
          const tags = el.tags || {};
          const limit = tags.maxspeed ? parseInt(tags.maxspeed, 10) || null : null;
          const label = tags.name || tags['addr:street'] || `Камера фиксации OSM #${idx + 1}`;
          const control = tags.enforcement === 'traffic_signals'
            ? 'Проезд на запрещающий сигнал, стоп-линия'
            : 'Контроль скоростного режима (открытые данные OSM)';
          return {
            id: `osm-${el.id}`,
            name: label,
            district: '',
            lat: el.lat,
            lon: el.lon,
            limit,
            control,
            source: 'OpenStreetMap Overpass API',
            fromOsm: true
          };
        });

      const merged = [...osmCameras];
      DATA.baselineCameras.forEach((baseCam) => {
        const duplicate = osmCameras.some(
          (o) => Math.abs(o.lat - baseCam.lat) < 0.0007 && Math.abs(o.lon - baseCam.lon) < 0.0009
        );
        if (!duplicate) merged.push(baseCam);
      });

      state.cameras = merged;
      const now = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      statusEl.textContent = `Синхронизировано с OSM в ${now}: получено ${osmCameras.length} открытых камер (всего на карте: ${merged.length}).`;
      osmNote.textContent = `OSM (${osmCameras.length}) + реестр Уфы`;
    } catch (err) {
      state.cameras = [...DATA.baselineCameras];
      statusEl.textContent = `Активен базовый открытый реестр Уфы (${DATA.baselineCameras.length} камер). Онлайн-сервер OSM временно недоступен.`;
      osmNote.textContent = 'Локальный реестр Уфы';
    } finally {
      btn.disabled = false;
      renderMapLayers();
    }
  }

  function setBasemap(type) {
    if (!map || !baseLayers[type]) return;
    Object.values(baseLayers).forEach((l) => map.removeLayer(l));
    baseLayers[type].addTo(map);
    state.activeBasemap = type;
  }

  function initMap() {
    if (typeof L === 'undefined') {
      document.getElementById('sync-status-text').textContent = 'Библиотека карт не загрузилась (проверьте интернет).';
      return;
    }

    map = L.map('ufa-map', {
      center: DATA.center,
      zoom: DATA.defaultZoom,
      scrollWheelZoom: true
    });

    baseLayers = {
      '2gis': L.tileLayer('https://tile{s}.maps.2gis.com/tiles?x={x}&y={y}&z={z}&v=1', {
        attribution: '&copy; 2GIS · OpenStreetMap',
        subdomains: ['0', '1', '2', '3'],
        maxZoom: 18
      }),
      osm: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
      }),
      sat: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri World Imagery',
        maxZoom: 18
      })
    };

    baseLayers['2gis'].addTo(map);

    // Авто-фолбэк на OSM, если тайлы 2ГИС не загрузились в браузере пользователя
    let gisErrCount = 0;
    baseLayers['2gis'].on('tileerror', () => {
      gisErrCount += 1;
      if (gisErrCount === 4 && state.activeBasemap === '2gis') {
        setBasemap('osm');
        document.querySelectorAll('.basemap-btn').forEach((b) => {
          b.classList.toggle('active', b.dataset.basemap === 'osm');
        });
      }
    });

    setTimeout(() => map.invalidateSize(), 250);
    window.addEventListener('resize', () => map.invalidateSize());

    // Быстрый список в боковой панели в стиле 2ГИС
    function renderGisQuickList(q = '') {
      const box = document.getElementById('gis-quick-list');
      if (!box) return;
      const term = q.trim().toLowerCase();
      const matched = DATA.zones.filter((z) =>
        !term || z.name.toLowerCase().includes(term) || z.district.toLowerCase().includes(term) || z.techLabel.toLowerCase().includes(term)
      );
      box.innerHTML = matched.map((z) => `
        <button type="button" class="gis-list-item" data-zone-id="${z.id}">
          <div>
            <strong>${escapeHtml(z.name)}</strong>
            <span>${escapeHtml(z.district)} · ${escapeHtml(z.techLabel)}</span>
          </div>
          <span class="badge ${z.risk === 'high' ? 'badge-red' : 'badge-blue'}">${z.riskScore}</span>
        </button>
      `).join('');
      box.querySelectorAll('.gis-list-item').forEach((btn) => {
        btn.addEventListener('click', () => {
          box.querySelectorAll('.gis-list-item').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          const found = DATA.zones.find((z) => z.id === btn.dataset.zoneId);
          if (found) selectZoneOnMap(found);
        });
      });
    }
    const gisSearch = document.getElementById('gis-quick-search');
    if (gisSearch) {
      gisSearch.addEventListener('input', (e) => renderGisQuickList(e.target.value));
    }
    renderGisQuickList();

    layers.corridors = L.layerGroup().addTo(map);
    layers.zones = L.layerGroup().addTo(map);
    layers.cameras = L.layerGroup().addTo(map);

    // Районы Уфы
    const districtBar = document.getElementById('district-bar');
    DATA.districts.forEach((d, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'district-chip' + (index === 0 ? ' active' : '');
      btn.textContent = d.name;
      btn.addEventListener('click', () => {
        districtBar.querySelectorAll('.district-chip').forEach((el) => el.classList.remove('active'));
        btn.classList.add('active');
        map.flyTo(d.coords, d.zoom, { duration: 0.7 });
      });
      districtBar.appendChild(btn);
    });

    // Фильтры слоев
    document.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.activeFilter = btn.dataset.filter;
        renderMapLayers();
      });
    });

    // Переключатель подложки карты
    document.querySelectorAll('.basemap-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.basemap-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        setBasemap(btn.dataset.basemap);
      });
    });

    document.getElementById('btn-sync-osm').addEventListener('click', syncOpenDataCameras);

    renderMapLayers();
    syncOpenDataCameras();
  }

  // -----------------------------
  // 3. Таблица-реестр опасных участков Уфы
  // -----------------------------
  function renderZonesTable(searchQuery = '') {
    const tbody = document.getElementById('zones-table-body');
    const q = searchQuery.trim().toLowerCase();
    tbody.innerHTML = '';

    const filtered = DATA.zones.filter((z) => {
      if (!q) return true;
      return (
        z.name.toLowerCase().includes(q) ||
        z.district.toLowerCase().includes(q) ||
        z.techLabel.toLowerCase().includes(q) ||
        z.violations.toLowerCase().includes(q)
      );
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#64748B;padding:20px;">По вашему запросу участки не найдены.</td></tr>';
      return;
    }

    filtered.forEach((zone) => {
      const tr = document.createElement('tr');
      const riskBadgeClass = zone.risk === 'high' ? 'badge-red' : 'badge-blue';
      tr.innerHTML = `
        <td><strong>${escapeHtml(zone.name)}</strong><div class="table-sub">Лимит: ${escapeHtml(zone.speedLimit)} · Камер: ${zone.camerasCount}</div></td>
        <td>${escapeHtml(zone.district)}</td>
        <td><span class="badge ${riskBadgeClass}">${zone.riskScore} / 100</span></td>
        <td class="table-viol">${escapeHtml(zone.violations)}</td>
        <td><span class="table-tech">${escapeHtml(zone.techLabel)}</span></td>
        <td><button type="button" class="btn btn-outline btn-xs">На карте</button></td>
      `;
      tr.addEventListener('click', () => {
        selectZoneOnMap(zone);
        document.getElementById('ufa-map').scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      tbody.appendChild(tr);
    });
  }

  document.getElementById('zone-search').addEventListener('input', (e) => {
    renderZonesTable(e.target.value);
  });

  // -----------------------------
  // 4. Статус водителя (без баллов, только счетчик нарушений за год)
  // -----------------------------
  function renderCabinet() {
    const v = state.driverViolations;
    const rule = getOsagoRule(v);

    document.getElementById('cab-violations').textContent = String(v);
    document.getElementById('cab-discount-text').textContent = `${rule.discount}%`;

    const badge = document.getElementById('cab-discount-badge');
    badge.textContent = rule.discount > 0 ? `Скидка ОСАГО: ${rule.discount}%` : 'Скидки нет (0%)';
    badge.className = rule.discount > 0 ? 'badge badge-green' : 'badge badge-red';

    const ring = document.getElementById('cab-ring');
    ring.style.borderColor = rule.discount >= 9 ? '#047857' : rule.discount >= 3 ? '#B45309' : '#B91C1C';

    const remaining = document.getElementById('cab-remaining');
    if (v >= 4) {
      remaining.textContent = 'Скидка утрачена на этот год';
    } else {
      remaining.textContent = `${4 - v} до потери скидки`;
    }

    const list = document.getElementById('cab-scale-list');
    list.innerHTML = '';
    DATA.osagoScale.forEach((item) => {
      const isCurrent = (item.violations < 4 && v === item.violations) || (item.violations === 4 && v >= 4);
      const row = document.createElement('div');
      row.className = 'scale-row' + (isCurrent ? ' scale-row-active' : '') + (item.discount === 0 ? ' scale-row-zero' : '');
      row.innerHTML = `
        <span>${item.label} за год</span>
        <strong>${item.discount > 0 ? `-${item.discount}% ОСАГО` : '0% (без скидки)'}</strong>
      `;
      list.appendChild(row);
    });
  }

  document.getElementById('btn-add-viol').addEventListener('click', () => {
    state.driverViolations += 1;
    const rule = getOsagoRule(state.driverViolations);
    renderCabinet();
    document.getElementById('cab-toast').textContent =
      rule.discount > 0
        ? `Зафиксировано нарушение #${state.driverViolations} (обычный штраф). Текущая скидка на ОСАГО снижена до ${rule.discount}%.`
        : `Зафиксировано нарушение #${state.driverViolations}. Превышен лимит 3 нарушений в год: скидка на ОСАГО аннулирована.`;
  });

  document.getElementById('btn-reset-viol').addEventListener('click', () => {
    state.driverViolations = 0;
    renderCabinet();
    document.getElementById('cab-toast').textContent = 'Сброшено на 0 нарушений за год: доступна максимальная скидка 12% на ОСАГО.';
  });

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderDistrictChart() {
    const container = document.getElementById('chart-districts');
    if (!container) return;
    const items = [
      { name: 'Кировский', score: 92, color: '#DC2626' },
      { name: 'Октябрьский', score: 89, color: '#DC2626' },
      { name: 'Калининский', score: 86, color: '#EA580C' },
      { name: 'Советский', score: 84, color: '#D97706' },
      { name: 'Орджоникидз.', score: 82, color: '#D97706' },
      { name: 'Ленинский', score: 78, color: '#2563EB' },
      { name: 'Демский', score: 74, color: '#2563EB' }
    ];
    container.innerHTML = items.map((it) => `
      <div class="bar-row">
        <span>${it.name}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${it.score}%;background:${it.color};"></div></div>
        <strong>${it.score}</strong>
      </div>
    `).join('');
  }

  renderDistrictChart();
  renderZonesTable();
  renderCabinet();
  initMap();
})();
