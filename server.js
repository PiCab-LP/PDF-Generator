require('dotenv').config();
const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs-extra'); // Lo dejamos solo para leer el HTML del PDF
const path = require('path');
const { createClient } = require('@supabase/supabase-js'); // Nueva librería

const app = express();
const PORT = 3000;

// CONFIGURACIÓN DE SUPABASE
// Reemplaza estos valores con los que copiaste de Settings > API
const supabaseUrl = process.env.SUPABASE_URL; 
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('TU_URL')) {
    console.error("❌ ERROR: No has configurado correctamente el archivo .env");
    process.exit(1); 
}

const supabase = createClient(supabaseUrl, supabaseKey);

app.use(express.json());
app.use(express.static('public'));

// 1. OBTENER COMPAÑÍAS DESDE SUPABASE
app.get('/api/companias', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('Companies') // Asegúrate de que se llame exactamente como la creaste (mayúsculas/minúsculas)
            .select('*')
            .eq('activo', true)
            .order('name', { ascending: true });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error("Error al leer Supabase:", err);
        res.status(500).json({ error: "Error al leer DB" });
    }
});

// 2. GENERAR PDF Y ACTUALIZAR ESTADO
app.post('/api/generar-pdf', async (req, res) => {
    const { id, companyName, date, deposits, cashouts, fee, credits } = req.body;
    
    const dep = parseFloat(deposits) || 0;
    const cash = parseFloat(cashouts) || 0;
    const f = parseFloat(fee) || 0;
    const cred = parseFloat(credits) || 0;
    const total = dep - cash - f - cred;
    const totalFormatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(total);

    let browser;
    try {
        browser = await puppeteer.launch({ 
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        const page = await browser.newPage();
        
        const baseUrl = `http://localhost:${PORT}/`;
        let html = await fs.readFile(path.join(__dirname, 'public', 'pdf-generated.html'), 'utf8');

        const finalHtml = html
            .replace('{{baseUrl}}', baseUrl)
            .replace(/{{companyName}}/g, companyName)
            .replace(/{{date}}/g, date)
            .replace(/{{deposits}}/g, dep.toLocaleString('en-US', { minimumFractionDigits: 2 }))
            .replace(/{{cashouts}}/g, cash.toLocaleString('en-US', { minimumFractionDigits: 2 }))
            .replace(/{{fee}}/g, f.toLocaleString('en-US', { minimumFractionDigits: 2 }))
            .replace(/{{credits}}/g, cred.toLocaleString('en-US', { minimumFractionDigits: 2 }))
            .replace(/{{totalBalance}}/g, totalFormatted);

        await page.setContent(finalHtml, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ 
            format: 'A4', 
            printBackground: true,
            margin: { top: '1cm', bottom: '1cm', left: '1cm', right: '1cm' }
        });

        await browser.close();

        // --- ACTUALIZACIÓN EN SUPABASE ---
        
        // A. Marcar compañía actual como enviada
        const { error: updateError } = await supabase
            .from('Companies')
            .update({ enviado: true })
            .eq('id', id);

        if (updateError) throw updateError;

        // B. Lógica de Auto-Reset (¿Quedan pendientes?)
        const { data: pendientes, error: checkError } = await supabase
            .from('Companies')
            .select('id')
            .eq('enviado', false)
            .eq('activo', true);

        if (pendientes.length === 0) {
            console.log("♻️ Todas enviadas. Reseteando ciclo...");
            await supabase
                .from('Companies')
                .update({ enviado: false })
                .eq('activo', true);
        }

        // Envío del PDF al cliente
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${companyName.replace(/\s+/g, '_')}.pdf`);
        res.send(pdfBuffer);

    } catch (error) {
        if (browser) await browser.close();
        console.error("ERROR DETECTADO:", error);
        res.status(500).json({ error: error.message });
    }
});

// A. Agregar o Editar Compañía (Upsert)
app.post('/api/admin/compania', async (req, res) => {
    const { id, name, telefono } = req.body;
    const payload = { name, telefono, activo: true };
    
    let query;
    if (id) {
        // Si hay ID, editamos
        query = supabase.from('Companies').update(payload).eq('id', id);
    } else {
        // Si no hay ID, creamos nueva
        query = supabase.from('Companies').insert([payload]);
    }

    const { error } = await query;
    if (error) return res.status(500).json(error);
    res.json({ success: true });
});

// B. "Borrar" Compañía (La marcamos como inactiva)
app.delete('/api/admin/compania/:id', async (req, res) => {
    const { error } = await supabase
        .from('Companies')
        .update({ activo: false })
        .eq('id', req.params.id);

    if (error) return res.status(500).json(error);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor con Supabase listo en http://localhost:${PORT}`);
});