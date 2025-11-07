// =================================================================
// =================== CONFIGURACIÓN Y LÓGICA DEL MAPA (LIMPIA Y ESTABLE) ===================
// =================================================================

mapboxgl.accessToken = 'pk.eyJ1IjoidXNvcGRldiIsImEiOiJjbWd2ZW1ubGkwcW5xMm5uYXhtb2ptZHF4In0.OE8nb_G4PE0_PduKWdjunw';
const supabaseUrl = "https://mrtxcikgockhokbnphrh.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ydHhjaWtnb2NraG9rYm5waHJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxMTY3MjcsImV4cCI6MjA3NTY5MjcyN30.0jzFNjkqNlc4nIPY38YkpAHqCE2ozV6ZQmSWBszFqww"; 

// Capas - is3D: true usará fill-extrusion-base: 0 para estabilidad.
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
    pitch: 60, 
    bearing: -30, 
    antialias: true
});

// =================================================================
// 1. FUNCIÓN AUXILIAR PARA GENERAR EL CONTENIDO DEL POPUP
// =================================================================

function generatePopupHTML(props, vista) {
    const val = (property) => {
        const value = props[property];
        if (value === null || value === undefined || value === '') {
            return 'N/D';
        }
        if (property === 'area' || property === 'extension') {
            return `${parseFloat(value).toFixed(2)} km²`;
        }
        return value;
    };
    
    const renderPhoto = (url) => {
        if (url && typeof url === 'string' && url.trim().length > 5 && (url.startsWith('http') || url.startsWith('data:'))) {
            return `<div style="max-height: 150px; overflow: hidden; margin-bottom: 10px; border-radius: 4px; border: 1px solid #ddd;"><img src="${url}" alt="Foto" style="width: 100%; height: auto; display: block; object-fit: cover;"></div>`;
        }
        return '';
    };

    const htmlTemplates = {
        'vw_laguna_wgs84': `
            ${renderPhoto(props['foto'])}
            <h4 style="color:#1E90FF; margin-top:0; border-bottom: 2px solid #1E90FF;">💧 Laguna: ${val('nombre')}</h4>
            <p><strong>Sitio ID:</strong> ${val('sitio_id')}</p>
            <p><strong>Área:</strong> ${val('area')}</p>
            <p><strong>Tipo de Agua:</strong> ${val('tipo_agua')}</p>
            <p><strong>Flora/Fauna:</strong> ${val('flora_fauna')}</p>
            <p><strong>Uso Actual:</strong> ${val('uso_actual')}</p>
        `,
        'vw_pasivominero_wgs84': `
            <h4 style="color:#8B0000; margin-top:0; border-bottom: 2px solid #8B0000;">⚠️ Pasivo Minero</h4>
            <p><strong>Sitio Estudio ID:</strong> ${val('idSitioEstudio')}</p>
            <p><strong>Cantón:</strong> ${val('Canton')}</p>
            <p><strong>Provincia:</strong> ${val('Prov')}</p>
            <p><strong>Municipio:</strong> ${val('Municipio')}</p>
            <p><strong>Cuenca Hidrográfica:</strong> ${val('Cuenca_Hid')}</p>
            <p><strong>Clima:</strong> ${val('Clima')}</p>
        `,
        'vw_zonaturistica_wgs84': `
            ${renderPhoto(props['foto'])}
            <h4 style="color:#FFD700; margin-top:0; border-bottom: 2px solid #FFD700;">🏞️ ${val('tipo')}: ${val('nombre')}</h4>
            <p><strong>Descripción:</strong> ${val('descripcion')}</p>
            <p><strong>Popularidad:</strong> ${val('popularidad')}</p>
            <p><strong>Horario:</strong> ${val('horario_apertura')}</p>
            <p><strong>Tarifa:</strong> ${val('tarifa_entrada')}</p>
            <p><strong>Actividades:</strong> ${val('actividades')}</p>
        `,
        'vw_areaminera_wgs84': `
            <h4 style="color:#00FF7F; margin-top:0; border-bottom: 2px solid #00FF7F;">⛏️ Área Minera (${val('tipo_area_')})</h4>
            <p><strong>Actor Minero:</strong> ${val('actor_mine')}</p>
            <p><strong>Extensión:</strong> ${val('extension')} ${val('unidad')}</p>
            <p><strong>Fecha Inscripción:</strong> ${val('fecha_insc')}</p>
            <p><strong>Municipio:</strong> ${val('municipio')}</p>
            <p><strong>Provincia:</strong> ${val('provincia')}</p>
            <p><strong>ID Estudio:</strong> ${val('idSitioEstudio')}</p>
        `
    };

    return htmlTemplates[vista] || `<h4>Información no disponible para esta capa (${vista}).</h4>`;
}

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

        // Lógica de 2D/3D
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
        
        // Activación de Popups y Cursor
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
    
    // 1. IMPLEMENTACIÓN DE TERRENO 3D y FONDO
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
    
    // 2. Carga de las vistas de Supabase
    setupCheckboxHandlers();
    for (const c of CAPAS) {
      cargarVista(c.vista, c.color, c.idBase, c.extrusionHeight);
    }
    
    // 3. NO HAY CÓDIGO DE GLACIAR NI SLIDER AQUÍ.
    
    setTimeout(() => setLegendStatus(''), 5000);
});

// ... (El resto del código de scroll es el mismo)
