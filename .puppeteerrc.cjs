const {join} = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Cambia la caché a una carpeta local dentro de tu proyecto
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};