const fs = require('fs-extra');
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.json');

// 1. LISTA INICIAL (Se usa solo la primera vez para crear la base de datos)
const companiasIniciales = [
    "Fast Fortunes", "Lucky Duck Lounge", "Innercore Games", "Paper Route",
    "Simply Unmatched", "Lucky Shamrock", "Crazy Coins", "Club Vpower",
    "Dragons Den", "Game Lounge", "Lucky Fin", "House of LingLing",
    "Galaxy Entertainment", "Rapid Reloads", "Ms Lady Vegas", "The Hot Spot",
    "Best Fish Games", "Wager Island", "777 Twenty Four Seven", "Two City Takeover",
    "Luxury Slots", "Fast Play Slots", "Black Sheep Gameroom", "Slot Luck",
    "Wysaro", "Legendary Millions Casino", "Lucky Waves Arcade", "The Penthouse",
    "Candy World"
].map((name, index) => ({ id: index + 1, name, enviado: false }));

// --- FUNCIONES DE PERSISTENCIA ---

// Cargar los datos del JSON
async function obtenerDatos() {
    try {
        if (!await fs.exists(DB_PATH)) {
            await fs.writeJson(DB_PATH, companiasIniciales, { spaces: 2 });
            return companiasIniciales;
        }
        return await fs.readJson(DB_PATH);
    } catch (err) {
        console.error("Error leyendo la base de datos:", err);
    }
}

// Guardar los datos en el JSON
async function guardarDatos(datos) {
    await fs.writeJson(DB_PATH, datos, { spaces: 2 });
}

// --- LÓGICA DE NEGOCIO ---

// Obtener solo las pendientes para tu select/checklist
async function obtenerPendientes() {
    const datos = await obtenerDatos();
    return datos.filter(c => !c.enviado);
}

// Marcar como enviada y verificar Auto-Reset
async function marcarComoEnviada(id) {
    let datos = await obtenerDatos();
    
    // 1. Encontrar y marcar la compañía
    const index = datos.findIndex(c => c.id === id);
    if (index !== -1) {
        datos[index].enviado = true;
        console.log(`✅ ${datos[index].name} marcada como enviada.`);
    }

    // 2. Lógica de Auto-Reset: ¿Quedan pendientes?
    const pendientes = datos.filter(c => !c.enviado);
    
    if (pendientes.length === 0) {
        console.log("♻️ ¡Todas las compañías completadas! Reseteando checklist...");
        datos = datos.map(c => ({ ...c, enviado: false }));
    } else {
        console.log(`⏳ Faltan ${pendientes.length} compañías por enviar.`);
    }

    await guardarDatos(datos);
    return datos;
}

module.exports = { obtenerPendientes, marcarComoEnviada, obtenerDatos, guardarDatos };