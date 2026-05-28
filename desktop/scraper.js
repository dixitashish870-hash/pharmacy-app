const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'pharmacy.db');
const db = new Database(dbPath);

const searchTerm = process.argv[2] && process.argv[2].trim() !== "" ? process.argv[2] : 'paracetamol';

const generateSKU = () => {
    return '1MG-' + Math.random().toString(36).substring(2, 10).toUpperCase();
};

const insertProduct = (product) => {
    try {
        const insertStmt = db.prepare(`
            INSERT INTO products (
                name, brand_name, salt_composition, description, 
                price, purchase_price, stock, sku, mrp, gst
            ) VALUES (
                @name, @brand_name, @salt_composition, @description, 
                @price, @purchase_price, @stock, @sku, @mrp, @gst
            )
        `);

        insertStmt.run({
            name: product.name || 'Unknown',
            brand_name: product.manufacturer || null,
            salt_composition: product.short_composition1 || null,
            description: 'Imported from 1mg',
            price: product.price || 0,
            purchase_price: (product.price || 0) * 0.7, // Assume 30% margin
            stock: 100, // Default stock
            sku: generateSKU(),
            mrp: product.price || 0,
            gst: 12
        });
        console.log(`✅ Added: ${product.name} (₹${product.price})`);
    } catch (err) {
        if (!err.message.includes('UNIQUE constraint failed: products.sku')) {
            console.error(`Error inserting ${product.name}:`, err.message);
        }
    }
};

(async () => {
    console.log(`Starting 1mg scraper for search term: "${searchTerm}"\n`);
    
    let browser;
    try {
        browser = await puppeteer.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
        });
        
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        
        let productsFound = [];

        // Intercept API calls - 1mg uses /api/v4/search/all
        page.on('response', async (response) => {
            const url = response.url();
            if (url.includes('/api/v4/search/all') || url.includes('/api/v4/search')) {
                try {
                    const contentType = response.headers()['content-type'];
                    if (contentType && contentType.includes('application/json')) {
                        const json = await response.json();
                        const items = json.data?.skus || json.data?.products || json.products || [];
                        if (items && items.length > 0) {
                            console.log(`[API Intercept] Found ${items.length} products...`);
                            productsFound = [...productsFound, ...items];
                        }
                    }
                } catch (_e) {
                    // Ignore parse errors
                }
            }
        });

        const searchUrl = `https://www.1mg.com/search/all?name=${encodeURIComponent(searchTerm)}`;
        console.log(`Navigating to: ${searchUrl}`);
        
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Wait an extra amount for React hydration / API
        await new Promise(resolve => setTimeout(resolve, 8000));

        if (productsFound.length > 0) {
            console.log(`\nSuccessfully scraped ${productsFound.length} products via API intercept! Inserting to DB...`);
            let count = 0;
            // distinct by name to prevent duplicates
            const unique = [...new Map(productsFound.map(item => [item.name, item])).values()];
            unique.forEach(item => {
                const medicine = {
                    name: item.name || '',
                    manufacturer: item.manufacturer_name || item.brand || item.label || '',
                    price: parseFloat((item.prices?.discounted_price || item.prices?.mrp || item.price || '0').toString().replace('₹', '').replace(',', '')),
                    short_composition1: item.short_composition1 || ''
                };
                if (medicine.name && medicine.price) {
                    insertProduct(medicine);
                    count++;
                }
            });
            console.log(`\n🎉 Web scraping complete! Inserted ${count} medicines into pharmacy.db.`);
        } else {
             console.log(`\n[DOM Fallback] No API response intercepted. Extracting from DOM...`);
             const scrapedItems = await page.evaluate(() => {
                 const results = [];
                 // 1mg cards are usually within a.noAnchorColor.width-100
                 document.querySelectorAll("a.noAnchorColor, div[class*='style__product-card']").forEach((el) => {
                     const text = el.innerText;
                     if(text && text.includes('Add to cart') && text.includes('₹')) {
                         results.push({ 
                            raw_text: text,
                            html: el.outerHTML
                         });
                     }
                 });
                 return results;             
             });

             if (scrapedItems.length > 0) {
                 console.log(`Found ${scrapedItems.length} potential items via DOM. Parsing...`);
                 let count = 0;
                 
                 scrapedItems.forEach(item => {
                     const text = item.raw_text;
                     // Regex to find price: ₹ followed by digits/dots
                     const priceMatch = text.match(/₹([0-9,.]+)/);
                     const price = priceMatch ? parseFloat(priceMatch[1].replace(',', '')) : 0;
                     
                     // Get name: Usually the first part before subtitiles/bestseller
                     // The subagent saw: "Bestseller Dolo 650 Tablet strip of 15 tablets ..."
                     let name = text.replace('Bestseller', '').trim();
                     let manufacturer = '';
                     
                     // Heuristic: Name is usually the first 2-4 words
                     const parts = name.split(/\s(strip of|bottle of|box of|pack of|tablet|capsule|Price:)/i);
                     if (parts.length > 0) {
                         name = parts[0].trim();
                         // The segment after might be the "strip of..."
                         manufacturer = parts.length > 1 ? parts[1] + (parts[2] || '') : '';
                     }

                     if (name && price > 0 && !name.toLowerCase().includes('add to cart')) {
                         insertProduct({
                             name: name.substring(0, 100),
                             manufacturer: manufacturer.substring(0, 100),
                             price: price,
                             short_composition1: ''
                         });
                         count++;
                     }
                 });
                 console.log(`\n🎉 DOM scraping fallback complete! Inserted ${count} medicines into pharmacy.db.`);
             } else {
                 console.log(`\n❌ Failed to scrape data. 1mg may have blocked the request or the DOM structure changed.`);
                 await page.screenshot({ path: path.join(__dirname, '..', 'error_screenshot.png') });
                 console.log(`Screenshot saved to error_screenshot.png`);
             }
        }
        
    } catch (error) {
        console.error("Scraper Error:", error.message);
    } finally {
        if (browser) await browser.close();
    }
})();
