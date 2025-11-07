// =================================================================
// CONFIGURACIÓN DE SUPABASE Y FUNCIONES BASE
// =================================================================

// Asegúrate que estas constantes sean EXACTAMENTE las mismas que usas en map.js
const supabaseUrl = "https://mrtxcikgockhokbnphrh.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ydHhjaWtnb2NraG9rYm5waHJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxMTY3MjcsImV4cCI6MjA3NTY5MjcyN30.0jzFNjkqNlc4nIPY38YkpAHqCE2ozV6ZQmSWBszFqww";

/**
 * Función genérica para obtener datos de una tabla de Supabase.
 * @param {string} tableName El nombre de la tabla (ej: 'tbHistoriaGlaciar').
 */

async function fetchData(tableName) {
    const url = `${supabaseUrl}/rest/v1/${tableName}?select=*`;
    try {
        const res = await fetch(url, {
            headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` }
        });
        if (!res.ok) throw new Error(`Error al cargar ${tableName}: ${res.statusText}`);
        return await res.json();
    } catch (error) {
        console.error(`Fallo en la carga de datos de ${tableName}:`, error);
        return null;
    }
}

// =================================================================
// 2. FUNCIONES PARA datos.html (Glaciar e Hidrología)
// Tablas: tbHistoriaGlaciar, tbFactorDeshieloContaminacion
// =================================================================

/**
 * Carga y muestra los datos de la evolución del glaciar (tbHistoriaGlaciar).
 */
async function loadGlaciarHistory() {
    const container = document.getElementById('glacierHistoryContainer');
    const data = await fetchData('tbHistoriaGlaciar');

    if (!data || data.length === 0) {
        container.innerHTML = '<p class="error-msg">No se encontraron datos históricos del glaciar.</p>';
        return;
    }

    // Ordenar por año
    data.sort((a, b) => a.anioEstudio - b.anioEstudio); 

    let html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Año</th>
                    <th>Área (km²)</th>
                    <th>Espesor Promedio</th>
                    <th>Volumen Estimado</th>
                    <th>Fuente</th>
                </tr>
            </thead>
            <tbody>`;
    data.forEach(row => {
        html += `<tr>
            <td>${row.anioEstudio || 'N/D'}</td>
            <td>${(row.areaKm2 !== null && row.areaKm2 !== undefined) ? row.areaKm2.toFixed(3) : 'N/D'}</td>
            <td>${(row.espesorPromedio !== null && row.espesorPromedio !== undefined) ? row.espesorPromedio.toFixed(2) : 'N/D'}</td>
            <td>${(row.volumenEstimado !== null && row.volumenEstimado !== undefined) ? row.volumenEstimado.toFixed(2) : 'N/D'}</td>
            <td>${row.fuenteDatos || 'N/D'}</td>
        </tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}

/**
 * Carga y muestra los factores climáticos (tbFactorDeshieloContaminacion).
 * CORRECCIÓN: Se añaden verificaciones de null/undefined para toFixed().
 */
async function loadFactorData() {
    const container = document.getElementById('factorDeshieloContainer');
    const data = await fetchData('tbFactorDeshieloContaminacion');
    
    if (!data || data.length === 0) {
        container.innerHTML = '<p class="error-msg">No se encontraron datos de factores climáticos.</p>';
        return;
    }

    // Generar tarjetas para destacar los factores
    let html = '<div class="data-grid">';
    data.forEach(row => {
        // CORRECCIÓN APLICADA: Proteger todas las llamadas a toFixed()
        const tempMedia = (row.tempMediaCelsius !== null && row.tempMediaCelsius !== undefined) 
                          ? row.tempMediaCelsius.toFixed(1) + '°C' 
                          : 'N/D';
                          
        const radiacion = (row.radiacionSolar !== null && row.radiacionSolar !== undefined) 
                          ? row.radiacionSolar.toFixed(2) 
                          : 'N/D';
                          
        const difTermica = (row.diferenciaTermicaMensual !== null && row.diferenciaTermicaMensual !== undefined) 
                          ? row.diferenciaTermicaMensual.toFixed(1) 
                          : 'N/D';
                          
        html += `
            <div class="data-card">
                <h3>Factores ${row.mesEstudio || 'N/D'} ${row.anioEstudio || 'N/D'}</h3>
                <p><strong>Temperatura Media:</strong> ${tempMedia}</p>
                <p><strong>Radiación Solar:</strong> ${radiacion}</p>
                <p><strong>Dif. Térmica Mensual:</strong> ${difTermica}</p>
                <p class="source">Fuente: ${row.fuenteDatos || 'N/D'}</p>
            </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

// =================================================================
// 3. FUNCIONES PARA impacto.html (Contaminación e Hidrología)
// Tablas: tbContaminacionAmbiental, tbCampoClimatologicoHidrologico
// =================================================================

/**
 * Carga y muestra los registros de contaminación (tbContaminacionAmbiental).
 */
async function loadContaminacionData() {
    const container = document.getElementById('contaminationContainer');
    const data = await fetchData('tbContaminacionAmbiental');

    if (!data || data.length === 0) {
        container.innerHTML = '<p class="error-msg">No se encontraron registros de contaminación.</p>';
        return;
    }
    
    // Generar tarjetas con el detalle de la contaminación
    let html = '<div class="data-grid">';
    data.forEach(row => {
        const riesgoColor = row.nivel_riesgo === 'Alto' ? 'red' : (row.nivel_riesgo === 'Medio' ? 'orange' : 'green');
        html += `
            <div class="data-card" style="border-left-color: ${riesgoColor};">
                <h3>Fuente: ${row.fuente_contaminacion || 'Desconocida'}</h3>
                <p><strong>Ubicación:</strong> ${row.ubicacion || 'N/D'}</p>
                <p><strong>Fecha Muestreo:</strong> ${row.fecha_muestreo || 'N/D'}</p>
                <p><strong>Nivel de Riesgo:</strong> <span style="font-weight:700; color: ${riesgoColor};">${row.nivel_riesgo || 'N/D'}</span></p>
                <p><strong>Referencia:</strong> ${row.referencia_fuente || 'N/D'}</p>
                ${row.foto ? `<img src="${row.foto}" alt="Foto de la fuente" style="width:100%; max-height:150px; object-fit:cover; margin-top:10px; border-radius: 5px;">` : ''}
            </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

/**
 * Carga y muestra los eventos hidrológicos (tbCampoClimatologicoHidrologico).
 */
async function loadEventosClimaticos() {
    const container = document.getElementById('eventosClimaticosContainer');
    const data = await fetchData('tbCampoClimatologicoHidrologico');

    if (!data || data.length === 0) {
        container.innerHTML = '<p class="error-msg">No se encontraron registros de eventos climatológicos.</p>';
        return;
    }
    
    // Generar una lista de eventos con descripción de efectos
    let html = '<ul class="event-list">';
    data.forEach(row => {
        html += `
            <li class="data-card">
                <h4>${row.tipo_evento || 'Evento Registrado'} (${row.fecha_registro || 'N/D'})</h4>
                <p><strong>Descripción:</strong> ${row.descripcion_evento || 'N/D'}</p>
                <p><strong>Causas:</strong> ${row.causas || 'N/D'}</p>
                <p><strong>Efectos Ambientales:</strong> ${row.efectos_ambientales || 'N/D'}</p>
                <p><strong>Efectos Humanos:</strong> ${row.efectos_humanos || 'N/D'}</p>
                <p><strong>Mitigación:</strong> ${row.medidas_mitigacion || 'No aplica'}</p>
            </li>`;
    });
    html += '</ul>';
    container.innerHTML = html;
}

// =================================================================
// 4. FUNCIONES PARA proyectos.html (Reconstrucción y Adaptación)
// Tabla: tbReconstruccionRa
// =================================================================

/**
 * Carga y muestra los proyectos de reconstrucción (tbReconstruccionRa).
 */
async function loadProyectos() {
    const container = document.getElementById('reconstructionContainer');
    const data = await fetchData('tbReconstruccionRa');

    if (!data || data.length === 0) {
        container.innerHTML = '<p class="error-msg">No hay proyectos de reconstrucción registrados.</p>';
        return;
    }

    // Generar tarjetas para los proyectos
    let html = '<div class="data-grid">';
    data.forEach(row => {
        html += `
            <div class="data-card">
                <h3>${row.nombre_proyecto || 'Proyecto sin nombre'}</h3>
                <p>${row.descripcion || 'Sin descripción.'}</p>
                <p><strong>Estado Actual:</strong> <span style="font-weight:700;">${row.estado_proyecto || 'N/D'}</span></p>
                <p><strong>Fase de Desarrollo:</strong> ${row.estado_desarrollo || 'N/D'}</p>
                <p><strong>Equipo Responsable:</strong> ${row.equipo_responsable || 'N/D'}</p>
            </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

// =================================================================
// NOTA: Estas funciones deben ser llamadas desde los archivos HTML 
// correspondientes (datos.html, impacto.html, proyectos.html).
// =================================================================