// =================================================================
// =========== SIMULACIÓN DE DESHIELO CON DATOS DE SUPABASE ========
// =================================================================

mapboxgl.accessToken = 'pk.eyJ1IjoidXNvcGRldiIsImEiOiJjbWd2ZW1ubGkwcW5xMm5uYXhtb2ptZHF4In0.OE8nb_G4PE0_PduKWdjunw';

// ***************************************************************
// 1. CONFIGURACIÓN INICIAL Y DE SUPABASE 🌐
// ***************************************************************

// >>> REEMPLAZA TUS CREDENCIALES REALES DE SUPABASE AQUÍ <<<
const supabaseUrl = "https://mrtxcikgockhokbnphrh.supabase.co"; 
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ydHhjaWtnb2NraG9rYm5waHJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxMTY3MjcsImV4cCI6MjA3NTY5MjcyN30.0jzFNjkqNlc4nIPY38YkpAHqCE2ozV6ZQmSWBszFqww"; 
// =======================================================================

// Mapeo de nombres a IDs (usado por el selector y la consulta)
const GLACIER_IDS = {
    'chacaltaya': 1,
    'huayna_potosi': 2 
};

// 🎯 COORDENADAS FIJAS PARA CENTRADO Y EXCLUSIVIDAD DE VISTA
const CHACALTAYA_CENTER = [-68.138, -16.353];
const HUAYNA_POTOSI_CENTER = [-68.149, -16.262]; 
const INITIAL_ZOOM = 14;

const GLACIER_LAYER_ID = 'glacier-layer';
const GLACIER_SOURCE_ID = 'glacier-source';
const GLACIER_COLOR_INITIAL = 'rgba(255, 255, 255, 1)'; 
const GLACIER_COLOR_FINAL = 'rgba(100, 150, 200, 0.2)'; 

let currentGlacier = 'chacaltaya'; 
let initialGlacierGeoJSON = null; 

// Variables que se llenarán con los datos de Supabase
let HEIGHTS_BY_YEAR = {}; 
let SCALE_FACTORS_BY_YEAR = {};
let ANIO_INICIO_SIMULACION = 1990;
let ANIO_FIN_SIMULACION = 2025;
let currentYear = ANIO_INICIO_SIMULACION; 

// Variables de Control de Animación
let animationInterval = null; 
const ANIMATION_SPEED = 100; 
const YEAR_STEP = 1; 
let isPlaying = false; 

// ---------------------------------------------------------------

// ***************************************************************
// 2. CONEXIÓN A SUPABASE Y CARGA DE DATOS REALES (ERROR 400 CORREGIDO)
// ***************************************************************

/**
 * Carga y procesa los datos históricos de deshielo desde Supabase usando el ID.
 */
async function loadGlacierHistoryData(glacierName) {
    const glacierId = GLACIER_IDS[glacierName];
    if (!glacierId) {
        console.error(`ID de sitio de estudio no encontrado para: ${glacierName}`);
        return false;
    }
    
    // ✅ Se usan los nombres exactos y comillas para respetar el CamelCase (Solución al Error 400)
    const selectColumns = "%22anioEstudio%22,%22areaKm2%22,%22espesorPromedio_m%22";
    const orderColumn = "%22anioEstudio%22";
    
    const url = `${supabaseUrl}/rest/v1/tbHistoriaGlaciar?select=${selectColumns}&idSitioEstudio=eq.${glacierId}&order=${orderColumn}.asc`; 
    
    try {
        const res = await fetch(url, {
            headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` }
        });
        
        if (!res.ok) {
            throw new Error(`Error en la consulta Supabase: ${res.statusText}. Revisar URL: ${url}`); 
        }
        
        const data = await res.json();
        
        if (!Array.isArray(data) || data.length === 0) {
            console.warn(`No se encontraron datos históricos para ID ${glacierId}. Usando valores por defecto.`);
            // Fallback: Datos fijos
            HEIGHTS_BY_YEAR = { 1990: 150, 2000: 120, 2010: 80, 2020: 40 };
            SCALE_FACTORS_BY_YEAR = { 1990: 1.0, 2000: 0.75, 2010: 0.40, 2020: 0.10 };
            ANIO_INICIO_SIMULACION = 1990;
            ANIO_FIN_SIMULACION = 2020;
            return false;
        }

        // 2. Encontrar el área máxima para normalizar
        const areas = data.map(row => parseFloat(row.areaKm2) || 0);
        const areaMaxima = Math.max(...areas);
        
        // 3. Llenar las estructuras de datos globales.
        HEIGHTS_BY_YEAR = {};
        SCALE_FACTORS_BY_YEAR = {};
        data.forEach(row => {
            const year = parseInt(row.anioEstudio);
            const area = parseFloat(row.areaKm2) || 0;
            const height = parseFloat(row.espesorPromedio_m) || 0; 
            
            HEIGHTS_BY_YEAR[year] = height;
            SCALE_FACTORS_BY_YEAR[year] = areaMaxima > 0 ? (area / areaMaxima) : 0;
        });

        // 4. Determinar el rango de la simulación
        const years = Object.keys(HEIGHTS_BY_YEAR).map(y => parseInt(y)).sort((a, b) => a - b);
        if (years.length > 0) {
            ANIO_INICIO_SIMULACION = years[0];
            ANIO_FIN_SIMULACION = years[years.length - 1];
        }
        
        return true;
        
    } catch (err) {
        console.error("Error al cargar datos de Supabase:", err);
        return false;
    }
}

// ---------------------------------------------------------------

// ***************************************************************
// 3. FUNCIONES DE APOYO Y SIMULACIÓN 🛠️
// ***************************************************************

function getHeightByYear(year) {
    const years = Object.keys(HEIGHTS_BY_YEAR).map(Number);
    const lowerYear = years.filter(y => y <= year).pop();
    const upperYear = years.find(y => y >= year);

    if (lowerYear === upperYear) return HEIGHTS_BY_YEAR[lowerYear] || 0;
    if (lowerYear === undefined || upperYear === undefined) return HEIGHTS_BY_YEAR[lowerYear] || HEIGHTS_BY_YEAR[upperYear] || 0;

    const lowerValue = HEIGHTS_BY_YEAR[lowerYear];
    const upperValue = HEIGHTS_BY_YEAR[upperYear];
    const ratio = (year - lowerYear) / (upperYear - lowerYear);
    
    return lowerValue + (upperValue - lowerValue) * ratio;
}

async function loadInitialGeoJSON(glacierName) {
    let fileName = glacierName;

    // 🎯 CORRECCIÓN: Si el nombre del glaciar es 'huayna_potosi', 
    // lo renombramos a 'huayna' para que coincida con tu archivo local.
    if (glacierName === 'huayna_potosi') {
        fileName = 'huayna'; 
    }
    
    // Construye la ruta usando el nombre corregido (por ejemplo, 'data/huayna1990.geojson')
    const path = `data/${fileName}1990.geojson`; 
    
    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`No se pudo cargar: ${path}`);
        initialGlacierGeoJSON = await response.json();
        return initialGlacierGeoJSON;
    } catch (error) {
        console.error('Error al cargar el GeoJSON:', error);
        // Devuelve una colección vacía en caso de error
        initialGlacierGeoJSON = { type: 'FeatureCollection', features: [] };
        return initialGlacierGeoJSON;
    }
}

function getInterpolatedScale(year) {
    const years = Object.keys(SCALE_FACTORS_BY_YEAR).map(Number);
    const lowerYear = years.filter(y => y <= year).pop();
    const upperYear = years.find(y => y >= year);

    if (lowerYear === upperYear) return SCALE_FACTORS_BY_YEAR[lowerYear] || 1.0;
    if (lowerYear === undefined || upperYear === undefined) return SCALE_FACTORS_BY_YEAR[lowerYear] || SCALE_FACTORS_BY_YEAR[upperYear] || 1.0;

    const lowerScale = SCALE_FACTORS_BY_YEAR[lowerYear];
    const upperScale = SCALE_FACTORS_BY_YEAR[upperYear];
    const ratio = (year - lowerYear) / (upperYear - lowerYear);
    
    return lowerScale + (upperScale - lowerScale) * ratio;
}

function scaleAndSetGeoJSON(year) {
    const source = map.getSource(GLACIER_SOURCE_ID);
    
    // 🛑 CORRECCIÓN CLAVE: Si la geometría base es nula o no tiene features, no dibujes nada.
    if (!initialGlacierGeoJSON || initialGlacierGeoJSON.features.length === 0) {
        if (source) source.setData({ type: 'FeatureCollection', features: [] });
        return;
    }

    const scaleFactor = getInterpolatedScale(year);
    
    // Si el factor de escala es casi cero (glaciar desaparecido), vacía el mapa.
    if (scaleFactor <= 0.001) {
        source.setData({ type: 'FeatureCollection', features: [] });
        return;
    }

    const centroid = turf.centroid(initialGlacierGeoJSON);
    const scaledGeoJSON = turf.transformScale(initialGlacierGeoJSON, scaleFactor, {
        pivot: centroid.geometry.coordinates
    });

    source.setData(scaledGeoJSON);
}

function updateSimulationLayer(year) {
    if (!map.getLayer(GLACIER_LAYER_ID)) return;
    
    const height = getHeightByYear(year);
    scaleAndSetGeoJSON(year);
    
    const color = height > 5 ? GLACIER_COLOR_INITIAL : GLACIER_COLOR_FINAL;

    map.setPaintProperty(GLACIER_LAYER_ID, 'fill-extrusion-height', height);
    map.setPaintProperty(GLACIER_LAYER_ID, 'fill-extrusion-color', color);

    const yearSlider = document.getElementById('yearSlider');
    const yearLabel = document.getElementById('yearLabel');
    if (yearLabel) yearLabel.textContent = Math.round(year); 
    if (yearSlider) yearSlider.value = year;
}

/**
 * Inicia la reproducción automática de la simulación.
 */
function playSimulation() {
    if (isPlaying) return; 

    if (currentYear >= ANIO_FIN_SIMULACION) {
        currentYear = ANIO_INICIO_SIMULACION;
    }

    isPlaying = true;
    
    const playBtn = document.getElementById('playBtn');
    if (playBtn) playBtn.textContent = '▶ Reproduciendo...';

    animationInterval = setInterval(() => {
        currentYear += YEAR_STEP; 

        if (currentYear > ANIO_FIN_SIMULACION) {
            pauseSimulation();
            currentYear = ANIO_FIN_SIMULACION;
        }
        
        updateSimulationLayer(currentYear); 
    }, ANIMATION_SPEED);
}

/**
 * Detiene la reproducción automática de la simulación.
 */
function pauseSimulation() {
    if (!isPlaying) return; 

    clearInterval(animationInterval);
    animationInterval = null;
    isPlaying = false;
    
    const playBtn = document.getElementById('playBtn');
    if (playBtn) playBtn.textContent = '▶ Reproducir';
}

// ---------------------------------------------------------------

// ***************************************************************
// 4. MAPA PRINCIPAL
// ***************************************************************

const map = new mapboxgl.Map({
    container: 'map',
    style:  'mapbox://styles/mapbox/satellite-streets-v12',
    center: CHACALTAYA_CENTER,
    zoom: INITIAL_ZOOM,
    pitch: 70,
    bearing: -30,
    antialias: true
});

map.on('load', async () => {
    // 1. Cargar datos de Supabase antes de todo
    await loadGlacierHistoryData(currentGlacier);
    
    // 2. Sincronizar el slider con los nuevos límites
    const yearSlider = document.getElementById('yearSlider');
    if (yearSlider) {
        yearSlider.min = ANIO_INICIO_SIMULACION;
        yearSlider.max = ANIO_FIN_SIMULACION;
        currentYear = ANIO_INICIO_SIMULACION;
        yearSlider.value = currentYear;
    }

    // 3. Cargar y mostrar el glaciar
    await loadAndShowGlacier(currentGlacier);
});

async function loadAndShowGlacier(glacierName) {
    if (glacierName !== currentGlacier) {
        pauseSimulation(); 
        await loadGlacierHistoryData(glacierName); 
        currentGlacier = glacierName;

        // Sincronizar el slider con los nuevos límites de año
        const yearSlider = document.getElementById('yearSlider');
        if (yearSlider) {
            yearSlider.min = ANIO_INICIO_SIMULACION;
            yearSlider.max = ANIO_FIN_SIMULACION;
            currentYear = ANIO_INICIO_SIMULACION;
            yearSlider.value = currentYear;
        }
    }
    
    const geojson = await loadInitialGeoJSON(glacierName);

    // 1. Manejo de la fuente: Esto garantiza el cambio exclusivo de glaciar
    if (map.getSource(GLACIER_SOURCE_ID)) {
        if (geojson.features.length > 0) {
            // Carga la nueva geometría (Huayna Potosí)
            map.getSource(GLACIER_SOURCE_ID).setData(geojson);
        } else {
            // Vacía la fuente, borrando Chacaltaya si Huayna Potosí no tiene GeoJSON.
            map.getSource(GLACIER_SOURCE_ID).setData({ type: 'FeatureCollection', features: [] });
            console.warn(`GeoJSON de ${glacierName} no válido o vacío. La fuente del mapa ha sido vaciada.`);
        }
    } else {
        map.addSource(GLACIER_SOURCE_ID, { type: 'geojson', data: geojson });
        map.addLayer({
            id: GLACIER_LAYER_ID,
            type: 'fill-extrusion',
            source: GLACIER_SOURCE_ID,
            paint: {
                'fill-extrusion-color': GLACIER_COLOR_INITIAL,
                'fill-extrusion-height': getHeightByYear(currentYear),
                'fill-extrusion-opacity': 1.0
            }
        });
    }

    // 2. Centrado y Zoom del Mapa (Movimiento a la ubicación correcta)
    let centerCoordinates;
    let zoomLevel = INITIAL_ZOOM;

    if (glacierName === 'huayna_potosi') {
        centerCoordinates = HUAYNA_POTOSI_CENTER;
        zoomLevel = 13; // Un zoom un poco más alejado para el Huayna Potosí
    } else {
        centerCoordinates = CHACALTAYA_CENTER;
        zoomLevel = INITIAL_ZOOM;
    }
    
    map.flyTo({
        center: centerCoordinates,
        zoom: zoomLevel,
        pitch: 70,
        bearing: -30,
        duration: 1500 
    });

    // 3. Ajustar los límites (refina la vista si el GeoJSON es válido)
    if (geojson.features.length > 0) {
        const bbox = turf.bbox(geojson);
        map.fitBounds(bbox, { padding: 50, duration: 1500 });
    }

    // Ajuste de terreno
    if (!map.getSource('mapbox-dem')) {
        map.addSource('mapbox-dem', {
            type: 'raster-dem',
            url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
            tileSize: 512,
            maxzoom: 14
        });
        map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
        map.setFog({});
    }

    // 4. Actualizar la vista con el año inicial y los datos cargados
    updateSimulationLayer(currentYear);
}

// ---------------------------------------------------------------

// ***************************************************************
// 5. EVENTOS DE INTERFAZ
// ***************************************************************

const yearSlider = document.getElementById('yearSlider');
const glacierSelect = document.getElementById('glacierSelect');
const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');

if (yearSlider) {
    yearSlider.addEventListener('input', (e) => {
        pauseSimulation(); 
        const newYear = parseInt(e.target.value);
        updateSimulationLayer(newYear); 
        currentYear = newYear;
    });
}

if (glacierSelect) {
    glacierSelect.addEventListener('change', async (e) => {
        const newGlacierName = e.target.value;
        await loadAndShowGlacier(newGlacierName);
    });
}

if (playBtn) {
    playBtn.addEventListener('click', playSimulation);
}

if (pauseBtn) {
    pauseBtn.addEventListener('click', pauseSimulation);
}