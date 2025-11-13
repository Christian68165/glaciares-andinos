// =================================================================
// =================== CONFIGURACIÓN Y LÓGICA DEL MAPA (LIMPIA Y ESTABLE) ===================
// =================================================================

mapboxgl.accessToken = 'pk.eyJ1IjoidXNvcGRldiIsImEiOiJjbWd2ZW1ubGkwcW5xMm5uYXhtb2ptZHF4In0.OE8nb_G4PE0_PduKWdjunw';
const supabaseUrl = "https://mrtxcikgockhokbnphrh.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ydHhjaWtnb2NraG9rYm5waHJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxMTY3MjcsImV4cCI6MjA3NTY5MjcyN30.0jzFNjkqNlc4nIPY38YkpAHqCE2ozV6ZQmSWBszFqww"; 

// =================================================================
// 🛑 NUEVA CONFIGURACIÓN: Capas GeoJSON Fijas (desde Supabase Storage)
// =================================================================

const GEOJSON_LAYERS = {
    // ❗ REEMPLAZA LAS URLs con las rutas reales de tu Supabase Storage
    "Glaciar Línea de Crecida": {
        url: "URL_STORAGE_GLACIAR_LINEA", 
        color: "#B22222", 
        tipo: "línea"
    },
    "Cabañas y Refugios": {
        url: "URL_STORAGE_REFUGIOS", 
        color: "#FFA500", 
        tipo: "punto"
    },
    "Límites de Cuenca": {
        url: "URL_STORAGE_CUENCA", 
        color: "#4682B4", 
        tipo: "polígono"
    },
    // Añade tus otras dos capas aquí...
};

// Variable para rastrear las capas GeoJSON fijas cargadas (no las vistas)
const activeGeoJSONLayers = {}; 

// Capas de Vistas de Supabase (las que ya tenías)
const CAPAS = [
    { vista: 'vw_laguna_wgs84', idBase: 'lagunas', color: '#1E90FF', extrusionHeight: 10, is3D: true }, 
    { vista: 'vw_zonaturistica_wgs84', idBase: 'zonas_turisticas', color: '#FFD700', extrusionHeight: 0, is3D: false }, 
    { vista: 'vw_pasivominero_wgs84', idBase: 'pasivos_mineros', color: '#8B0000', extrusionHeight: 0, is3D: false }, 
    { vista: 'vw_areaminera_wgs84', idBase: 'areas_mineras', color: '#00FF7F', extrusionHeight: 0, is3D: false } 
];

// ***************************************************************
// CONFIGURACIÓN DE VISTA (CENTRO EN LA ZONA DE INTERÉS)
// ***************************************************************
const INITIAL_VIEW = {
    // Usamos el centro del glaciar Chacaltaya, pero sin forzarlo
    center: [-68.138, -16.353], 
    zoom: 12
};

const capaState = {}; 
const pendingVisibility = {}; 
const legendStatus = document.getElementById('legendStatus');
let is3DView = true; // Estado inicial según tu configuración de map.js

function setLegendStatus(txt) { 
    if (legendStatus) { 
        legendStatus.textContent = txt; 
    }
}

// ====== INICIALIZAR MAPA ======
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/satellite-streets-v12', 
    center: INITIAL_VIEW.center, 
    zoom: INITIAL_VIEW.zoom, 
    pitch: 60, // Pitch inicial para vista 3D
    bearing: -30, // Rotación inicial
    antialias: true
});

// =================================================================
// 🛑 NUEVA FUNCIÓN: Lógica para el control 2D/3D
// =================================================================

function setupViewToggle() {
    const toggleButton = document.getElementById('toggle-3d');
    if (!toggleButton) return;

    // Estado inicial del botón
    toggleButton.textContent = is3DView ? 'Cambiar a 2D' : 'Cambiar a 3D';

    toggleButton.addEventListener('click', () => {
        if (is3DView) {
            // Ir a 2D
            map.easeTo({
                pitch: 0,
                bearing: 0,
                duration: 1500,
            });
            toggleButton.textContent = 'Cambiar a 3D';
            is3DView = false;
        } else {
            // Ir a 3D
            map.easeTo({
                pitch: 60, // Ángulo de inclinación 3D
                bearing: -30, // Rotación
                duration: 1500,
            });
            toggleButton.textContent = 'Cambiar a 2D';
            is3DView = true;
        }
    });
}


// =================================================================
// 🛑 NUEVAS FUNCIONES: Lógica de Carga y Control para GeoJSON Fijo
// =================================================================

function styleGeoJSONLayer(geomType, color, opacity = 0.7) {
    if (geomType === 'Point' || geomType === 'MultiPoint') {
        return {
            'circle-radius': 8, 
            'circle-color': color, 
            'circle-stroke-color': '#fff', 
            'circle-stroke-width': 1.5 
        };
    } else if (geomType === 'LineString' || geomType === 'MultiLineString') {
        return {
            'line-color': color, 
            'line-width': 4,
            'line-opacity': opacity
        };
    } else { // Polygon
        return {
            'fill-color': color, 
            'fill-opacity': opacity,
            'fill-outline-color': color
        };
    }
}

async function toggleGeoJSONLayer(layerKey, layerConfig, checkbox) {
    const sourceId = `geojson_src_${layerKey}`;
    const layerId = `geojson_lyr_${layerKey}`;
    const mapboxGeomType = layerConfig.tipo === 'punto' ? 'circle' : layerConfig.tipo === 'línea' ? 'line' : 'fill';

    if (checkbox.checked) {
        setLegendStatus(`Cargando capa fija: ${layerKey}...`);
        
        // Cargar datos
        try {
            const res = await fetch(layerConfig.url);
            const geojson = await res.json();

            if (!map.getSource(sourceId)) {
                map.addSource(sourceId, { type: 'geojson', data: geojson });
            } else {
                map.getSource(sourceId).setData(geojson);
            }

            // Añadir capa (si no existe)
            if (!map.getLayer(layerId)) {
                map.addLayer({
                    id: layerId,
                    type: mapboxGeomType,
                    source: sourceId,
                    paint: styleGeoJSONLayer(mapboxGeomType === 'circle' ? 'Point' : mapboxGeomType === 'line' ? 'LineString' : 'Polygon', layerConfig.color)
                }, 'sky'); // Añadir antes de la capa 'sky' para que esté sobre el terreno
            } else {
                 // Si existe, simplemente hacerla visible
                 map.setLayoutProperty(layerId, 'visibility', 'visible');
            }
            
            // Asignar Popups (solo la primera vez)
            if (!activeGeoJSONLayers[layerKey] || !activeGeoJSONLayers[layerKey].eventsAdded) {
                map.on('click', layerId, (e) => {
                    const feat = e.features && e.features[0];
                    if (!feat) return;

                    let popupHTML = `<h4>🗺️ Capa: ${layerKey}</h4><hr style="margin-bottom: 5px;">`;
                    // Itera sobre todas las propiedades del GeoJSON
                    for (const prop in feat.properties) {
                        popupHTML += `<p><strong>${prop}:</strong> ${feat.properties[prop]}</p>`;
                    }

                    new mapboxgl.Popup()
                        .setLngLat(e.lngLat)
                        .setHTML(popupHTML)
                        .addTo(map);
                });
                activeGeoJSONLayers[layerKey] = { eventsAdded: true };
            }

            activeGeoJSONLayers[layerKey] = { id: layerId, eventsAdded: true };
            setLegendStatus(`Capa ${layerKey} cargada.`);
            
        } catch (err) {
            console.error(`Error cargando capa GeoJSON ${layerKey}:`, err);
            setLegendStatus(`Error cargando ${layerKey}.`);
            checkbox.checked = false; // Desmarcar si falla la carga
        }

    } else {
        // Desactivar capa
        if (map.getLayer(layerId)) {
            map.setLayoutProperty(layerId, 'visibility', 'none');
            setLegendStatus(`Capa ${layerKey} desactivada.`);
        }
    }
}

// Genera los checkboxes de GeoJSON en el sidebar
function setupGeoJSONLayerControls() {
    const container = document.getElementById('layer-list-container');
    if (!container) return;
    container.innerHTML = ''; // Limpiar el estado de carga

    Object.keys(GEOJSON_LAYERS).forEach(key => {
        const config = GEOJSON_LAYERS[key];
        const layerKey = key.replace(/\s/g, '-').toLowerCase(); // Ejemplo: glaciar-linea-de-crecida

        const div = document.createElement('div');
        div.className = 'row';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `chk_geojson_${layerKey}`;

        const swatch = document.createElement('div');
        swatch.className = 'swatch';
        swatch.style.background = config.color;

        const label = document.createElement('label');
        label.htmlFor = checkbox.id;
        label.textContent = key;

        checkbox.addEventListener('change', () => {
            toggleGeoJSONLayer(layerKey, config, checkbox);
        });

        div.appendChild(checkbox);
        div.appendChild(swatch);
        div.appendChild(label);
        container.appendChild(div);
    });
}


// ... (El resto de las funciones son las mismas, solo se añaden los nuevos setup al load) ...
// -----------------------------------------------------------------------------------------
// 1. FUNCIÓN AUXILIAR PARA GENERAR EL CONTENIDO DEL POPUP
// ... (mantenida) ...

// ************ FUNCIONES DE CARGA DE DATOS ************
async function cargarVista(vista, color, idBase, extrusionHeight) {
    const config = CAPAS.find(c => c.vista === vista) || {};
    const is3D = config.is3D;
    
    setLegendStatus(`Cargando ${vista}...`); 
    const url = `${supabaseUrl}/rest/v1/${vista}?select=*`; 
    try {
        const res = await fetch(url, {
            headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` }
        });
        const data = await res.json();
        if (!Array.isArray(data)) { 
             console.error(`La vista ${vista} no devolvió un array.`, data); 
             setLegendStatus(`Error cargando ${vista}`); 
             return; 
        }

        const features = [];
        for (const f of data) {
            if (!f.geom) continue; 
            try {
                const geometry = (typeof f.geom === 'string') ? JSON.parse(f.geom) : f.geom;
                const { geom, ...properties } = f; 
                features.push({ type: "Feature", geometry: geometry, properties: properties });
            } catch (err) { console.warn('GeoJSON inválido en fila', f, err); }
        }
        const geojson = { type: "FeatureCollection", features };
        const first = features.find(x => x.geometry && x.geometry.type);
        const geomType = first ? first.geometry.type : null; 

        const sourceId = `src_${vista}`;
        if (map.getSource(sourceId)) {
            map.getSource(sourceId).setData(geojson);
        } else {
            map.addSource(sourceId, { type: 'geojson', data: geojson });
        }

        const layerId = `lyr_${vista}`;
        if (map.getLayer(layerId)) { map.removeLayer(layerId); }

        const beforeId = 'sky'; 

        // Lógica de 2D/3D (Mantenida)
        if (geomType === 'Point' || geomType === 'MultiPoint') {
            map.addLayer({
                id: layerId,
                type: 'circle',
                source: sourceId,
                paint: { 'circle-radius': 6, 'circle-color': color, 'circle-stroke-color': '#000', 'circle-stroke-width': 1 }
            }, beforeId); 
        } else if (geomType === 'LineString' || geomType === 'MultiLineString') {
            map.addLayer({
                id: layerId,
                type: 'line',
                source: sourceId,
                paint: { 'line-color': color, 'line-width': 2 }
            }, beforeId); 
        } else { // Polygon
            if (is3D) {
                 // Polígonos 3D (Lagunas) - Extrusión simple con BASE 0 (Estable)
                 map.addLayer({
                     id: layerId,
                     type: 'fill-extrusion', 
                     source: sourceId,
                     paint: {
                         'fill-extrusion-color': color,
                         'fill-extrusion-height': extrusionHeight, 
                         'fill-extrusion-base': 0, // BASE CERO FORZADA para estabilidad
                         'fill-extrusion-opacity': 0.75 
                     }
                 }, beforeId); 
            } else {
                // Polígonos 2D Planos
                map.addLayer({
                    id: layerId,
                    type: 'fill', 
                    source: sourceId,
                    paint: {
                        'fill-color': color,
                        'fill-opacity': 0.5
                    }
                }, beforeId); 
            }
        }
        
        // Activación de Popups y Cursor (Mantenida)
        const state = capaState[vista] || {};
        if (!state.eventsAdded) {
            map.on('click', layerId, (e) => {
                const feat = e.features && e.features[0];
                if (!feat) return;

                const props = feat.properties; 
                const htmlContent = generatePopupHTML(props, vista); 

                new mapboxgl.Popup() 
                    .setLngLat(e.lngLat)
                    .setHTML(htmlContent)
                    .addTo(map);
            });
            
            map.on('mouseenter', layerId, () => map.getCanvas().style.cursor = 'pointer');
            map.on('mouseleave', layerId, () => map.getCanvas().style.cursor = '');
            
            state.eventsAdded = true;
        }

        capaState[vista] = { added: true, layerId, geomType, eventsAdded: state.eventsAdded };
        setLegendStatus(`Cargado ${vista} (${features.length} features)`);
        applyPendingVisibility(vista);

    } catch (err) {
        console.error(`Error cargando vista ${vista}:`, err);
        setLegendStatus(`Error cargando ${vista} (ver consola)`);
    }
}

// ************ FUNCIONES DE HANDLERS DEL MENÚ ************
function applyPendingVisibility(vista) {
    const pref = pendingVisibility[vista];
    const state = capaState[vista];
    if (!state || !state.added) return;
    const layerId = state.layerId;
    if (!map.getLayer(layerId)) return;
    const vis = (typeof pref === 'boolean') ? (pref ? 'visible' : 'none') : 'visible';
    map.setLayoutProperty(layerId, 'visibility', vis);
}

function setupCheckboxHandlers() {
    const mappings = [
        { chk: 'chk_lagunas', vista: 'vw_laguna_wgs84' },
        { chk: 'chk_zonas', vista: 'vw_zonaturistica_wgs84' },
        { chk: 'chk_pasivos', vista: 'vw_pasivominero_wgs84' },
        { chk: 'chk_areas', vista: 'vw_areaminera_wgs84' }
    ];

    mappings.forEach(m => {
        const cb = document.getElementById(m.chk);
        if (!cb) return;

        const visible = cb.checked;
        pendingVisibility[m.vista] = visible; 

        cb.addEventListener('change', () => {
            const visible = cb.checked;
            const state = capaState[m.vista];
            if (state && state.added && map.getLayer(state.layerId)) {
                map.setLayoutProperty(state.layerId, 'visibility', visible ? 'visible' : 'none');
            } else {
                pendingVisibility[m.vista] = visible;
            }
        });
    });
}

// ************ INICIALIZACIÓN DEL MAPA ************
map.on('load', () => {
    
    setLegendStatus('Iniciando carga de capas...');
    
    // 1. IMPLEMENTACIÓN DE TERRENO 3D y FONDO (Mantenido)
    map.addSource('mapbox-dem', {
      'type': 'raster-dem',
      'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
      'tileSize': 512,
      'maxzoom': 14
    });
    
    map.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 1.5 });
    map.setFog({}); 

    map.addLayer({
        'id': 'sky',
        'type': 'sky',
        'paint': {
            'sky-type': 'atmosphere',
            'sky-atmosphere-sun-intensity': 5 
        }
    });
    
    // 2. Carga de las vistas de Supabase (Mantenido)
    setupCheckboxHandlers();
    for (const c of CAPAS) {
      cargarVista(c.vista, c.color, c.idBase, c.extrusionHeight);
    }
    
    // 🛑 NUEVOS HANDLERS
    setupGeoJSONLayerControls(); // Genera y asigna handlers a las capas GeoJSON fijas
    setupViewToggle(); // Asigna handler al botón 2D/3D

    setTimeout(() => setLegendStatus(''), 5000);
});
// -----------------------------------------------------------------------------------------
// ... (El resto del código de scroll es el mismo)
