require('dotenv').config();
const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const path = require('path');
const cors = require('cors'); // <--- 1. AGREGADO
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

app.use(cors()); // <--- 2. AGREGADO (Permite que el front le hable al back)
app.use(express.json());
app.use(express.static('public'));

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

// 2. GENERAR PDF
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
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null, // Render a veces requiere esto
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', // Ayuda con la memoria limitada de Render
            '--single-process'         // Ahorra recursos
        ] 
        });
        const page = await browser.newPage();
        
        // --- 3. CAMBIO AQUÍ: Usamos una ruta relativa para Puppeteer ---
        const htmlPath = path.join(__dirname, 'public', 'pdf-generated.html');
        let html = await fs.readFile(htmlPath, 'utf8');

        const finalHtml = html
            .replace('{{baseUrl}}', '') // Dejamos vacío para usar rutas locales del sistema
            .replace(/{{companyName}}/g, companyName)
            .replace(/{{date}}/g, date)
            .replace(/{{deposits}}/g, dep.toLocaleString('en-US', { minimumFractionDigits: 2 }))
            .replace(/{{cashouts}}/g, cash.toLocaleString('en-US', { minimumFractionDigits: 2 }))
            .replace(/{{fee}}/g, f.toLocaleString('en-US', { minimumFractionDigits: 2 }))
            .replace(/{{credits}}/g, cred.toLocaleString('en-US', { minimumFractionDigits: 2 }))
            .replace(/{{totalBalance}}/g, totalFormatted);

        // Importante: Usamos setContent con una ruta base de archivo
        await page.setContent(finalHtml, { 
            waitUntil: 'networkidle0',
            basePath: path.join(__dirname, 'public') // <--- Esto carga las imágenes correctamente
        });

        const pdfBuffer = await page.pdf({ 
            format: 'A4', 
            printBackground: true,
            margin: { top: '1cm', bottom: '1cm', left: '1cm', right: '1cm' }
        });

        await browser.close();

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

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${companyName.replace(/\s+/g, '_')}.pdf`);
        res.send(pdfBuffer);

    } catch (error) {
        if (browser) await browser.close();
        console.error("ERROR:", error);
        res.status(500).json({ error: error.message });
    }
});

// RUTAS DE ADMIN (Tus rutas actuales están perfectas)
app.post('/api/admin/compania', async (req, res) => {
    const { id, name, telefono } = req.body;
    const payload = { name, telefono, activo: true };
    let query = id ? supabase.from('Companies').update(payload).eq('id', id) : supabase.from('Companies').insert([payload]);
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