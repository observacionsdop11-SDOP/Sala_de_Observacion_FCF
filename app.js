/* ==========================================================================
   SALA DE OBSERVACIÓN FCF - UNALM | GEOPORTAL MAPBIOMAS FUEGO PERÚ
   Lógica JavaScript Modular, Proj4js, Turf.js, Leaflet y GIS Importer
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // Global State
  const state = {
    map: null,
    baseLayers: {},
    activeBaseLayer: null,
    drawnItems: null,
    importedLayers: [],
    featuresList: [], // Stores feature objects for Attribute Table
    scaleUnit: 'm_km', // Scale bar unit toggle state
    nextFeatureId: 1
  };

  // Initialize Application Components
  initProjections();
  initMap();
  initAnimatedKPIs();
  initLayerSelector();
  initVectorBoundaryLayers();
  initDrawingTools();
  initCoordinateTracker();
  initDragAndDrop();
  initModals();
  initAttributeTable();

  /* ==========================================================================
     1. Configuración de Proyecciones UTM Perú (Proj4js)
     ========================================================================== */
  function initProjections() {
    if (typeof proj4 !== 'undefined') {
      // UTM Zone 17S (WGS84) - EPSG:32717
      proj4.defs("EPSG:32717", "+proj=utm +zone=17 +south +datum=WGS84 +units=m +no_defs");
      // UTM Zone 18S (WGS84) - EPSG:32718
      proj4.defs("EPSG:32718", "+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs");
      // UTM Zone 19S (WGS84) - EPSG:32719
      proj4.defs("EPSG:32719", "+proj=utm +zone=19 +south +datum=WGS84 +units=m +no_defs");
    }
  }

  /* ==========================================================================
     2. Inicialización de Mapa Leaflet y Capas Base Google
     ========================================================================== */
  function initMap() {
    // Center map over Peru (Lat: -9.19, Lon: -75.01, Zoom: 6)
    state.map = L.map('map', {
      center: [-9.1900, -75.0150],
      zoom: 6,
      zoomControl: false
    });

    // Custom Zoom control positioned top-right
    L.control.zoom({ position: 'topright' }).addTo(state.map);

    // Google Tiles & Extra Base Layers
    state.baseLayers = {
      'esri-satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: '&copy; Esri World Imagery'
      }),
      'esri-topo': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: '&copy; Esri World Topo Map | SERFOR'
      }),
      'google-satellite': L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '&copy; Google Satellite | SdO FCF UNALM'
      }),
      'google-hybrid': L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '&copy; Google Hybrid | SdO FCF UNALM'
      }),
      'google-roads': L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '&copy; Google Roads | SdO FCF UNALM'
      }),
      'google-terrain': L.tileLayer('https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '&copy; Google Terrain | SdO FCF UNALM'
      }),
      'osm': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      })
    };

    // Default base layer: ESRI Satellite (Centrado en Perú)
    state.activeBaseLayer = state.baseLayers['esri-satellite'];
    state.activeBaseLayer.addTo(state.map);

    // Automatic Tile Error Handling (Failover to OSM)
    Object.keys(state.baseLayers).forEach(key => {
      state.baseLayers[key].on('tileerror', function() {
        console.warn(`Error en baldosa ${key}, conmutando a OpenStreetMap`);
        if (state.map && state.map.hasLayer(state.baseLayers[key]) && key !== 'osm') {
          state.map.removeLayer(state.baseLayers[key]);
          state.baseLayers['osm'].addTo(state.map);
          state.activeBaseLayer = state.baseLayers['osm'];
        }
      });
    });

    // Leaflet Native Scale Control
    state.scaleControl = L.control.scale({
      position: 'bottomright',
      metric: true,
      imperial: false
    }).addTo(state.map);

    // FeatureGroup for Drawn Elements
    state.drawnItems = new L.FeatureGroup();
    state.map.addLayer(state.drawnItems);

    // Invalidate map size to fix blank/black container issues on initial load
    const refreshMapSize = () => {
      if (state.map) {
        state.map.invalidateSize(true);
        state.map.setView([-9.1900, -75.0150], 6, { animate: false });
      }
    };

    [0, 50, 150, 300, 600, 1200, 2500].forEach(delay => setTimeout(refreshMapSize, delay));
    window.addEventListener('resize', refreshMapSize);
    window.addEventListener('DOMContentLoaded', refreshMapSize);
    window.addEventListener('load', refreshMapSize);
  }

  /* ==========================================================================
     3. Contadores Estadísticos Animados (KPIs)
     ========================================================================== */
  function initAnimatedKPIs() {
    const counters = document.querySelectorAll('.kpi-number');
    
    counters.forEach(counter => {
      const target = parseInt(counter.getAttribute('data-target'), 10);
      const duration = 2000; // 2 seconds
      const startTime = performance.now();

      function updateCounter(currentTime) {
        const elapsedTime = currentTime - startTime;
        const progress = Math.min(elapsedTime / duration, 1);
        
        // Easing function (easeOutExpo)
        const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        const currentValue = Math.floor(easeProgress * target);

        counter.innerText = currentValue.toLocaleString('es-PE');

        if (progress < 1) {
          requestAnimationFrame(updateCounter);
        } else {
          counter.innerText = target.toLocaleString('es-PE');
        }
      }

      requestAnimationFrame(updateCounter);
    });
  }

  /* ==========================================================================
     4. Selector de Capas Base (Google / OSM / ESRI)
     ========================================================================== */
  function initLayerSelector() {
    const layerBtns = document.querySelectorAll('.layer-option-btn');
    
    layerBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const layerKey = btn.getAttribute('data-layer');
        if (state.baseLayers[layerKey] && state.map) {
          // Remove current base layer
          state.map.removeLayer(state.activeBaseLayer);
          
          // Add new base layer
          state.activeBaseLayer = state.baseLayers[layerKey];
          state.activeBaseLayer.addTo(state.map);

          // Update UI Active States
          layerBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        }
      });
    });
  }

  /* ==========================================================================
     4b. Capas Vectoriales de Límites Políticos (Sudamérica, Departamentos, Provincias, Distritos)
     ========================================================================== */
  function initVectorBoundaryLayers() {
    state.vectorLayers = {};

    const configs = [
      { id: 'chk-departamentos', key: 'departamentos', url: './data/departamentos.geojson', style: { color: '#00f0ff', weight: 2, fillOpacity: 0.12 } },
      { id: 'chk-provincias', key: 'provincias', url: './data/provincias.geojson', style: { color: '#f59e0b', weight: 1.8, fillOpacity: 0.1, dashArray: '3, 3' } },
      { id: 'chk-distritos', key: 'distritos', url: './data/distritos.geojson', style: { color: '#ef4444', weight: 1.5, fillOpacity: 0.15 } },
      { id: 'chk-sudamerica', key: 'sudamerica', url: './data/sudamerica.geojson', style: { color: '#64748b', weight: 1.5, fillOpacity: 0.05, dashArray: '4, 4' } },
      { id: 'chk-lago', key: 'lago', url: './data/lago.geojson', style: { color: '#38bdf8', weight: 1.5, fillOpacity: 0.35 } }
    ];

    configs.forEach(cfg => {
      const checkbox = document.getElementById(cfg.id);
      
      fetch(cfg.url)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(data => {
          const layer = L.geoJSON(data, {
            style: cfg.style,
            onEachFeature: (feature, l) => {
              const props = feature.properties || {};
              const title = props.NOMBDEP || props.NOMBPROV || props.NOMBDIST || props.PAIS || 'Límite Político';
              let popupHtml = `<strong style="color:#059669; font-size:0.95rem;">${title}</strong><br/>`;
              for (let k in props) {
                popupHtml += `<strong>${k}:</strong> ${props[k]}<br/>`;
              }
              l.bindPopup(popupHtml);
              l.bindTooltip(title, { sticky: true });
            }
          });

          state.vectorLayers[cfg.key] = layer;

          if (checkbox && checkbox.checked) {
            layer.addTo(state.map);
          }

          if (checkbox) {
            checkbox.addEventListener('change', (e) => {
              if (e.target.checked) {
                layer.addTo(state.map);
              } else {
                state.map.removeLayer(layer);
              }
            });
          }
        })
        .catch(err => console.log(`Capa GeoJSON ${cfg.key}:`, err));
    });
  }

  /* ==========================================================================
     5. Coordenadas en Tiempo Real (WGS84 + UTM Zonas 17S, 18S, 19S)
     ========================================================================== */
  function initCoordinateTracker() {
    const wgsBadge = document.querySelector('#badge-wgs84 strong');
    const utmBadge = document.querySelector('#badge-utm strong');
    const scaleText = document.getElementById('scale-text');

    state.map.on('mousemove', (e) => {
      const lat = e.latlng.lat;
      const lon = e.latlng.lng;

      // Update WGS84 Display
      if (wgsBadge) {
        wgsBadge.innerText = `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
      }

      // Calculate UTM Zone & Coordinates in Peru
      if (utmBadge && typeof proj4 !== 'undefined') {
        let zone = 18;
        let epsg = 'EPSG:32718';

        if (lon < -78) {
          zone = 17;
          epsg = 'EPSG:32717';
        } else if (lon >= -72) {
          zone = 19;
          epsg = 'EPSG:32719';
        }

        try {
          // Transform WGS84 [lon, lat] to UTM [Easting, Northing]
          const utmResult = proj4('EPSG:4326', epsg, [lon, lat]);
          const easting = Math.round(utmResult[0]);
          const northing = Math.round(utmResult[1]);

          utmBadge.innerText = `Zona ${zone}S | E: ${easting.toLocaleString('es-PE')}, N: ${northing.toLocaleString('es-PE')}`;
        } catch (err) {
          utmBadge.innerText = `Zona ${zone}S | Fuera de rango`;
        }
      }
    });

    // Update Approximate Scale Text on Zoom Change
    state.map.on('zoomend', () => {
      const zoom = state.map.getZoom();
      // Approximate scale calculation based on zoom level at equator/mid-latitudes
      const scaleValue = Math.round(591657550.500000 / Math.pow(2, zoom - 1));
      if (scaleText) {
        scaleText.innerText = `1:${scaleValue.toLocaleString('es-PE')}`;
      }
    });

    // Toggle Scale Unit button
    const scaleUnitBtn = document.getElementById('btn-toggle-scale-unit');
    if (scaleUnitBtn) {
      scaleUnitBtn.addEventListener('click', () => {
        if (state.scaleControl) {
          state.map.removeControl(state.scaleControl);
          state.scaleUnit = (state.scaleUnit === 'm_km') ? 'imperial' : 'm_km';
          state.scaleControl = L.control.scale({
            position: 'bottomright',
            metric: state.scaleUnit === 'm_km',
            imperial: state.scaleUnit !== 'm_km'
          }).addTo(state.map);
        }
      });
    }
  }

  /* ==========================================================================
     6. Herramientas de Dibujo y Mediciones con Turf.js (Área ha / Perímetro km)
     ========================================================================== */
  function initDrawingTools() {
    if (typeof L.Control.Draw === 'undefined') return;

    const drawControl = new L.Control.Draw({
      position: 'topleft',
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
          shapeOptions: {
            color: '#10b981',
            fillColor: '#10b981',
            fillOpacity: 0.35,
            weight: 2
          }
        },
        rectangle: {
          shapeOptions: {
            color: '#f59e0b',
            fillColor: '#f59e0b',
            fillOpacity: 0.35,
            weight: 2
          }
        },
        polyline: {
          shapeOptions: {
            color: '#06b6d4',
            weight: 3
          }
        },
        circle: false,
        circlemarker: false,
        marker: true
      },
      edit: {
        featureGroup: state.drawnItems,
        remove: true
      }
    });

    state.map.addControl(drawControl);

    // Event: Feature Created
    state.map.on(L.Draw.Event.CREATED, (event) => {
      const layer = event.layer;
      const layerType = event.layerType;

      state.drawnItems.addLayer(layer);

      // Convert layer to GeoJSON for Turf.js calculations
      const geoJson = layer.toGeoJSON();
      let areaHa = 0;
      let perimeterKm = 0;

      if (layerType === 'polygon' || layerType === 'rectangle') {
        if (typeof turf !== 'undefined') {
          const areaM2 = turf.area(geoJson);
          areaHa = (areaM2 / 10000).toFixed(2); // Convert m² to Hectares (ha)
          perimeterKm = (turf.length(geoJson, { units: 'kilometers' })).toFixed(2);
        }

        const popupContent = `
          <div style="font-family: 'Inter', sans-serif; font-size: 0.85rem; color: #0f172a;">
            <strong style="color: #059669; font-size: 0.95rem;"><i class="fa-solid fa-draw-polygon"></i> Polígono Dibujado</strong><br/>
            <hr style="margin: 6px 0; border: 0; border-top: 1px solid #e2e8f0;"/>
            <strong>Área:</strong> ${areaHa} ha<br/>
            <strong>Perímetro:</strong> ${perimeterKm} km
          </div>
        `;
        layer.bindPopup(popupContent).openPopup();

      } else if (layerType === 'polyline') {
        if (typeof turf !== 'undefined') {
          perimeterKm = (turf.length(geoJson, { units: 'kilometers' })).toFixed(2);
        }
        layer.bindPopup(`<strong>Línea/Ruta:</strong> ${perimeterKm} km`).openPopup();

      } else if (layerType === 'marker') {
        const coords = layer.getLatLng();
        layer.bindPopup(`<strong>Punto:</strong> Lat ${coords.lat.toFixed(5)}, Lon ${coords.lng.toFixed(5)}`).openPopup();
      }

      // Add feature to Attribute Table Data List
      registerFeatureToTable({
        id: state.nextFeatureId++,
        type: layerType.toUpperCase(),
        areaHa: areaHa > 0 ? `${areaHa} ha` : '-',
        perimeterKm: perimeterKm > 0 ? `${perimeterKm} km` : '-',
        name: `Entidad Dibujada #${state.nextFeatureId - 1}`,
        leafletLayer: layer
      });
    });

    // Clear drawings button
    const btnClear = document.getElementById('btn-clear-drawings');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        if (confirm('¿Deseas eliminar todas las entidades dibujadas del mapa?')) {
          state.drawnItems.clearLayers();
          state.featuresList = [];
          renderAttributeTable();
        }
      });
    }
  }

  /* ==========================================================================
     7. Importador de Datos GIS (Drag & Drop + File Upload)
     ========================================================================== */
  function initDragAndDrop() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');

    if (!dropzone || !fileInput) return;

    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('drag-over');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      if (e.dataTransfer.files.length > 0) {
        handleImportedFiles(e.dataTransfer.files);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleImportedFiles(e.target.files);
      }
    });
  }

  function handleImportedFiles(files) {
    const fileList = Array.from(files);

    // Support individual shapefile components (.shp, .dbf, .prj, .shx)
    const shpFile = fileList.find(f => f.name.toLowerCase().endsWith('.shp'));
    const dbfFile = fileList.find(f => f.name.toLowerCase().endsWith('.dbf'));
    const prjFile = fileList.find(f => f.name.toLowerCase().endsWith('.prj'));

    if (shpFile && typeof shp !== 'undefined') {
      const promises = [shpFile.arrayBuffer()];
      if (dbfFile) promises.push(dbfFile.arrayBuffer());
      if (prjFile) promises.push(prjFile.text());

      Promise.all(promises).then(buffers => {
        try {
          const parsedGeom = shp.parseShp(buffers[0], buffers[2] || null);
          let properties = [];
          if (buffers[1]) {
            properties = shp.parseDbf(buffers[1]);
          }
          const features = parsedGeom.map((g, idx) => ({
            type: "Feature",
            geometry: g,
            properties: properties[idx] || {}
          }));
          addGeoJSONToMap({ type: "FeatureCollection", features: features }, shpFile.name);
        } catch(err) {
          alert(`Error al procesar Shapefile (.shp/.dbf): ${err.message}`);
        }
      }).catch(err => alert(`Error al leer componentes Shapefile: ${err.message}`));
      closeModal('modal-import');
      return;
    }

    fileList.forEach(file => {
      const name = file.name.toLowerCase();

      if (name.endsWith('.geojson') || name.endsWith('.json')) {
        parseGeoJSONFile(file);
      } else if (name.endsWith('.zip')) {
        parseShapefileZip(file);
      } else if (name.endsWith('.csv')) {
        parseCSVFile(file);
      } else if (name.endsWith('.xlsx')) {
        parseExcelFile(file);
      } else if (name.endsWith('.tif') || name.endsWith('.tiff')) {
        parseGeoTIFFFile(file);
      }
    });

    // Close import modal after loading
    closeModal('modal-import');
  }

  // Parse GeoJSON
  function parseGeoJSONFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const geoJsonData = JSON.parse(e.target.result);
        addGeoJSONToMap(geoJsonData, file.name);
      } catch (err) {
        alert(`Error al leer archivo GeoJSON: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  // Parse Shapefile (.zip) using shpjs
  function parseShapefileZip(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof shp !== 'undefined') {
        shp(e.target.result).then((geoJsonData) => {
          addGeoJSONToMap(geoJsonData, file.name);
        }).catch(err => {
          alert(`Error al procesar el Shapefile (.zip): ${err.message}`);
        });
      } else {
        alert('Librería shpjs no disponible para procesar Shapefile.');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // Parse CSV File using PapaParse
  function parseCSVFile(file) {
    if (typeof Papa === 'undefined') return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const features = [];
        results.data.forEach(row => {
          // Detect Lat/Lon or X/Y columns
          const lat = parseFloat(row.lat || row.latitude || row.Latitud || row.y || row.Y);
          const lon = parseFloat(row.lon || row.longitude || row.Longitud || row.x || row.X);

          if (!isNaN(lat) && !isNaN(lon)) {
            features.push({
              type: "Feature",
              properties: row,
              geometry: {
                type: "Point",
                coordinates: [lon, lat]
              }
            });
          }
        });

        if (features.length > 0) {
          const geoJsonData = { type: "FeatureCollection", features: features };
          addGeoJSONToMap(geoJsonData, file.name);
        } else {
          alert('No se encontraron columnas de Latitud/Longitud en el archivo CSV.');
        }
      }
    });
  }

  // Parse Excel File using SheetJS (XLSX)
  function parseExcelFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof XLSX !== 'undefined') {
        try {
          const workbook = XLSX.read(e.target.result, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[firstSheetName];
          const jsonRows = XLSX.utils.sheet_to_json(sheet);

          const features = [];
          jsonRows.forEach(row => {
            const lat = parseFloat(row.lat || row.latitude || row.Latitud || row.y || row.Y);
            const lon = parseFloat(row.lon || row.longitude || row.Longitud || row.x || row.X);

            if (!isNaN(lat) && !isNaN(lon)) {
              features.push({
                type: "Feature",
                properties: row,
                geometry: {
                  type: "Point",
                  coordinates: [lon, lat]
                }
              });
            }
          });

          if (features.length > 0) {
            addGeoJSONToMap({ type: "FeatureCollection", features: features }, file.name);
          } else {
            alert('No se encontraron coordenadas válidas en la hoja de Excel.');
          }
        } catch (err) {
          alert(`Error procesando Excel: ${err.message}`);
        }
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // Parse GeoTIFF File using georaster
  function parseGeoTIFFFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof parseGeoraster !== 'undefined' && typeof GeoRasterLayer !== 'undefined') {
        parseGeoraster(e.target.result).then(georaster => {
          const layer = new GeoRasterLayer({
            georaster: georaster,
            opacity: 0.7,
            resolution: 256
          });
          layer.addTo(state.map);
          state.map.fitBounds(layer.getBounds());
          alert(`GeoTIFF "${file.name}" cargado exitosamente en el mapa.`);
        }).catch(err => {
          alert(`Error procesando GeoTIFF: ${err.message}`);
        });
      } else {
        alert('Librería GeoTIFF no lista.');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // Helper to add GeoJSON features to Leaflet
  function addGeoJSONToMap(geoJsonData, fileName) {
    const geoJsonLayer = L.geoJSON(geoJsonData, {
      style: () => ({
        color: '#f59e0b',
        fillColor: '#f59e0b',
        fillOpacity: 0.4,
        weight: 2
      }),
      onEachFeature: (feature, layer) => {
        let propsText = `<strong style="color: #059669;">Capa: ${fileName}</strong><br/>`;
        let areaHa = '-';
        let perimeterKm = '-';

        if (feature.properties) {
          for (let key in feature.properties) {
            propsText += `<strong>${key}:</strong> ${feature.properties[key]}<br/>`;
          }
        }

        if (typeof turf !== 'undefined' && feature.geometry) {
          if (feature.geometry.type.includes('Polygon')) {
            areaHa = (turf.area(feature) / 10000).toFixed(2) + ' ha';
            perimeterKm = (turf.length(feature, { units: 'kilometers' })).toFixed(2) + ' km';
            propsText += `<hr/><strong>Área:</strong> ${areaHa}<br/><strong>Perímetro:</strong> ${perimeterKm}`;
          }
        }

        layer.bindPopup(propsText);

        registerFeatureToTable({
          id: state.nextFeatureId++,
          type: feature.geometry ? feature.geometry.type : 'Feature',
          areaHa: areaHa,
          perimeterKm: perimeterKm,
          name: feature.properties?.name || feature.properties?.NOMBRE || `${fileName} #${state.nextFeatureId - 1}`,
          leafletLayer: layer
        });
      }
    }).addTo(state.map);

    state.importedLayers.push(geoJsonLayer);
    
    // Zoom to layer bounds
    try {
      state.map.fitBounds(geoJsonLayer.getBounds());
    } catch(e) {}
  }

  /* ==========================================================================
     8. Tabla de Atributos & Exportación
     ========================================================================== */
  function initAttributeTable() {
    const btnToggleTable = document.getElementById('btn-toggle-table');
    const btnCloseTable = document.getElementById('btn-close-table');
    const drawer = document.getElementById('attribute-drawer');

    if (btnToggleTable && drawer) {
      btnToggleTable.addEventListener('click', () => drawer.classList.toggle('active'));
    }

    if (btnCloseTable && drawer) {
      btnCloseTable.addEventListener('click', () => drawer.classList.remove('active'));
    }

    // Export GeoJSON Button
    const btnExportGeoJSON = document.getElementById('btn-export-data');
    if (btnExportGeoJSON) {
      btnExportGeoJSON.addEventListener('click', exportToGeoJSON);
    }

    // Export Excel Button
    const btnExportXLSX = document.getElementById('btn-export-xlsx');
    if (btnExportXLSX) {
      btnExportXLSX.addEventListener('click', exportToExcel);
    }

    // Export SHP Zip Button
    const btnExportSHP = document.getElementById('btn-export-shp');
    if (btnExportSHP) {
      btnExportSHP.addEventListener('click', exportToGeoJSON); // GeoJSON format fallback
    }
  }

  function registerFeatureToTable(featureRecord) {
    state.featuresList.push(featureRecord);
    renderAttributeTable();
  }

  function renderAttributeTable() {
    const tbody = document.getElementById('table-body');
    const countSpan = document.getElementById('table-count');

    if (!tbody) return;

    if (countSpan) {
      countSpan.innerText = state.featuresList.length;
    }

    if (state.featuresList.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-dim); padding: 20px;">
            No hay entidades dibujadas o importadas. Usa la herramienta de dibujo o importa archivos GIS.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = '';

    state.featuresList.forEach((feat, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${feat.id}</td>
        <td><span class="format-badge">${feat.type}</span></td>
        <td>${feat.areaHa}</td>
        <td>${feat.perimeterKm}</td>
        <td contenteditable="true" class="editable-td" data-index="${index}">${feat.name}</td>
        <td>
          <button class="btn-table-action btn-zoom" data-index="${index}" title="Centrar en Mapa">
            <i class="fa-solid fa-crosshairs"></i> Centrar
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Attach listener for editable name
    tbody.querySelectorAll('.editable-td').forEach(cell => {
      cell.addEventListener('blur', (e) => {
        const idx = e.target.getAttribute('data-index');
        if (state.featuresList[idx]) {
          state.featuresList[idx].name = e.target.innerText;
        }
      });
    });

    // Attach listener for Zoom button
    tbody.querySelectorAll('.btn-zoom').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = btn.getAttribute('data-index');
        const feat = state.featuresList[idx];
        if (feat && feat.leafletLayer) {
          if (feat.leafletLayer.getBounds) {
            state.map.fitBounds(feat.leafletLayer.getBounds());
          } else if (feat.leafletLayer.getLatLng) {
            state.map.setView(feat.leafletLayer.getLatLng(), 14);
          }
          feat.leafletLayer.openPopup();
        }
      });
    });
  }

  function exportToGeoJSON() {
    if (state.featuresList.length === 0) {
      alert('No hay datos para exportar.');
      return;
    }

    const featureCollection = {
      type: "FeatureCollection",
      features: state.featuresList.map(f => {
        const geoJson = f.leafletLayer.toGeoJSON();
        geoJson.properties = geoJson.properties || {};
        geoJson.properties.name = f.name;
        geoJson.properties.areaHa = f.areaHa;
        geoJson.properties.perimeterKm = f.perimeterKm;
        return geoJson;
      })
    };

    const blob = new Blob([JSON.stringify(featureCollection, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sdo_fcf_mapbiomas_export_${Date.now()}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportToExcel() {
    if (state.featuresList.length === 0) {
      alert('No hay datos para exportar.');
      return;
    }

    if (typeof XLSX === 'undefined') {
      alert('SheetJS (XLSX) no está disponible.');
      return;
    }

    const dataToExport = state.featuresList.map(f => ({
      ID: f.id,
      Tipo: f.type,
      Nombre: f.name,
      'Área (ha)': f.areaHa,
      'Perímetro (km)': f.perimeterKm
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Entidades_GIS");
    XLSX.writeFile(workbook, `sdo_fcf_mapbiomas_atributos_${Date.now()}.xlsx`);
  }

  /* ==========================================================================
     9. Sistema de Modales Interactivos & Galería Lightbox
     ========================================================================== */
  function initModals() {
    const btnAbout = document.getElementById('btn-about');
    const btnMethodology = document.getElementById('btn-methodology');
    const btnGallery = document.getElementById('btn-gallery');
    const btnVideo = document.getElementById('btn-video');
    const btnImport = document.getElementById('btn-import');

    if (btnAbout) btnAbout.addEventListener('click', () => openModal('modal-about'));
    if (btnMethodology) btnMethodology.addEventListener('click', () => openModal('modal-methodology'));
    if (btnGallery) btnGallery.addEventListener('click', () => openModal('modal-gallery'));
    if (btnVideo) btnVideo.addEventListener('click', () => openModal('modal-video'));
    if (btnImport) btnImport.addEventListener('click', () => openModal('modal-import'));

    // Lightbox handlers
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxCaption = document.getElementById('lightbox-caption');
    const btnCloseLightbox = document.getElementById('btn-close-lightbox');

    document.querySelectorAll('.gallery-card').forEach(card => {
      card.addEventListener('click', () => {
        const fullSrc = card.getAttribute('data-full');
        const caption = card.getAttribute('data-caption');
        if (lightbox && lightboxImg) {
          lightboxImg.src = fullSrc;
          if (lightboxCaption) lightboxCaption.innerText = caption;
          lightbox.classList.add('active');
        }
      });
    });

    if (btnCloseLightbox && lightbox) {
      btnCloseLightbox.addEventListener('click', () => lightbox.classList.remove('active'));
    }
    if (lightbox) {
      lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) lightbox.classList.remove('active');
      });
    }

    // Close Modal Listeners
    document.querySelectorAll('.btn-close-modal, [data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-close') || btn.closest('.modal-overlay')?.id;
        if (modalId) closeModal(modalId);
      });
    });

    // Close on overlay backdrop click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          closeModal(overlay.id);
        }
      });
    });
  }

  function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
    if (id === 'modal-video') {
      const iframe = document.getElementById('video-iframe');
      if (iframe) {
        iframe.src = "https://www.youtube.com/embed/55yFDzljq-E?autoplay=1&rel=0&modestbranding=1";
      }
    }
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
    if (id === 'modal-video') {
      const iframe = document.getElementById('video-iframe');
      if (iframe) {
        iframe.src = "";
      }
    }
  }
});
