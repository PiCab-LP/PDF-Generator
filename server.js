require('dotenv').config();
const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const path = require('path');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// CONFIGURACIÓN DE SUPABASE
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ ERROR: Faltan variables de entorno");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// VARIABLE GLOBAL PARA PUPPETEER (Browser Pooling)
let globalBrowser = null;

// 1. OBTENER COMPAÑÍAS
app.get('/api/companias', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('Companies')
            .select('*')
            .eq('activo', true)
            .order('name', { ascending: true });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: "Error al leer DB" });
    }
});

// --- NUEVO ENDPOINT: REVERTIR ESTADO ---
app.post('/api/revertir', async (req, res) => {
    const { id } = req.body;
    try {
        const { error } = await supabase
            .from('Companies')
            .update({ enviado: false })
            .eq('id', id);

        if (error) throw error;

        res.json({ success: true, message: "Compañía revertida a estado pendiente." });
    } catch (error) {
        console.error("Error al revertir compañía:", error);
        res.status(500).json({ error: "Error interno al revertir el estado." });
    }
});

// 2. GENERAR IMAGEN (PNG)
app.post('/api/generar-pdf', async (req, res) => {
    const { id, companyName, date, deposits, cashouts, fee, credits, pastBalance } = req.body;

    const dep = parseFloat(deposits) || 0;
    const cash = parseFloat(cashouts) || 0;
    const f = parseFloat(fee) || 0;
    const cred = parseFloat(credits) || 0;
    const pastBal = parseFloat(pastBalance) || 0;
    const total = dep - cash - f - cred + pastBal;

    const totalFormatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(total);
    const pastBalFormatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(pastBal));
    const pastBalSign = pastBal >= 0 ? '+' : '-';
    const pastBalClass = pastBal >= 0 ? 'plus' : 'minus';
    const pastBalanceDisplay = (pastBal !== 0 && !isNaN(pastBal)) ? 'flex' : 'none';

    let feePercentage = "0%";
    if (dep >= 0 && dep <= 60000) {
        feePercentage = "10%";
    } else if (dep > 60000 && dep <= 200000) {
        feePercentage = "8%";
    } else if (dep > 200000 && dep <= 500000) {
        feePercentage = "6%";
    } else if (dep > 500000 && dep <= 1000000) {
        feePercentage = "4%";
    } else if (dep > 1000000) {
        feePercentage = "2%";
    }

    try {
        // --- INICIO DE BROWSER POOLING ---
        if (!globalBrowser || !globalBrowser.isConnected()) {
            console.log("🚀 Iniciando instancia global de Puppeteer...");
            globalBrowser = await puppeteer.launch({
                headless: "new",
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--single-process'
                ]
            });
        }

        const page = await globalBrowser.newPage();
        await page.setCacheEnabled(false);
        // --- FIN DE BROWSER POOLING ---

        const htmlPath = path.join(__dirname, 'public', 'pdf-generated.html');
        let html = await fs.readFile(htmlPath, 'utf8');

        const finalHtml = html
            .replace('{{baseUrl}}', 'https://wys-receipts.vercel.app/')
            .replace(/{{companyName}}/g, companyName)
            .replace(/{{date}}/g, date)
            .replace(/{{deposits}}/g, dep.toLocaleString('en-US', { minimumFractionDigits: 2 }))
            .replace(/{{cashouts}}/g, cash.toLocaleString('en-US', { minimumFractionDigits: 2 }))
            .replace(/{{fee}}/g, f.toLocaleString('en-US', { minimumFractionDigits: 2 }))
            .replace(/{{credits}}/g, cred.toLocaleString('en-US', { minimumFractionDigits: 2 }))
            .replace(/{{pastBalFormatted}}/g, pastBalFormatted)
            .replace(/{{pastBalSign}}/g, pastBalSign)
            .replace(/{{pastBalClass}}/g, pastBalClass)
            .replace(/{{pastBalanceDisplay}}/g, pastBalanceDisplay)
            .replace(/{{totalBalance}}/g, totalFormatted)
            .replace(/{{feePercentage}}/g, feePercentage);

        await page.setContent(finalHtml, {
            waitUntil: 'networkidle0',
            basePath: path.join(__dirname, 'public')
        });

        // --- CAMBIO A GENERACIÓN DE IMAGEN ---
        // Ajustamos la resolución para alta calidad
        await page.setViewport({ width: 800, height: 1200, deviceScaleFactor: 2 });

        const reciboElement = await page.$('.container');

        if (!reciboElement) {
            throw new Error("No se encontró el elemento .container en la plantilla HTML.");
        }

        // Generamos el buffer de la imagen
        const imageBuffer = await reciboElement.screenshot({ type: 'png' });
        await page.close();

        // Convertimos el Buffer a una cadena Base64
        const base64Image = imageBuffer.toString('base64');

        // ACTUALIZACIÓN EN SUPABASE
        await supabase.from('Companies').update({ enviado: true }).eq('id', id);

        const { data: pendientes } = await supabase
            .from('Companies')
            .select('id')
            .eq('enviado', false)
            .eq('activo', true);

        if (pendientes && pendientes.length === 0) {
            await supabase.from('Companies').update({ enviado: false }).eq('activo', true);
        }

        // --- ENVIAR RESPUESTA COMO JSON CON LA IMAGEN BASE64 ---
        res.json({
            success: true,
            message: "Recibo generado con éxito",
            image: `data:image/png;base64,${base64Image}`,
            companyName: companyName
        });

    } catch (error) {
        console.error("ERROR:", error);
        res.status(500).json({ error: error.message });
    }
});



// RUTAS DE ADMIN
app.post('/api/admin/compania', async (req, res) => {
    const { id, name, telefono } = req.body;
    const payload = { name, telefono, activo: true, created_at: new Date().toISOString() };
    let query = id ? supabase.from('Companies').update({ name, telefono, activo: true }).eq('id', id) : supabase.from('Companies').insert([payload]);
    const { error } = await query;
    if (error) return res.status(500).json(error);
    res.json({ success: true });
});

app.delete('/api/admin/compania/:id', async (req, res) => {
    const { error } = await supabase.from('Companies').update({ activo: false }).eq('id', req.params.id);
    if (error) return res.status(500).json(error);
    res.json({ success: true });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});