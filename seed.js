require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function sembrarDatos() {
    console.log("🌱 Iniciando siembra de datos...");

    const nombres = [
        "Fast Fortunes", "Lucky Duck Lounge", "Innercore Games", "Paper Route",
        "Simply Unmatched", "Lucky Shamrock", "Crazy Coins", "Club Vpower",
        "Dragons Den", "Game Lounge", "Lucky Fin", "House of LingLing",
        "Galaxy Entertainment", "Rapid Reloads", "Ms Lady Vegas", "The Hot Spot",
        "Best Fish Games", "Wager Island", "777 Twenty Four Seven", "Two City Takeover",
        "Luxury Slots", "Fast Play Slots", "Black Sheep Gameroom", "Slot Luck",
        "Wysaro", "Legendary Millions Casino", "Lucky Waves Arcade", "The Penthouse",
        "Candy World"
    ];

    // Preparamos los objetos para Supabase
    const datosParaInsertar = nombres.map(nombre => ({
        name: nombre,
        enviado: false,
        activo: true,
        telefono: "" // Puedes dejarlo vacío por ahora y editarlo en el panel luego
    }));

    const { data, error } = await supabase
        .from('Companies') // ⚠️ OJO: Verifica que en Supabase se llame 'Companies' con C mayúscula
        .insert(datosParaInsertar);

    if (error) {
        console.error("❌ Error al insertar datos:", error.message);
    } else {
        console.log("✅ ¡29 compañías insertadas con éxito!");
    }
}

sembrarDatos();