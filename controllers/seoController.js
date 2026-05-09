const Product = require('../models/Product');
const Category = require('../models/Category');

exports.sitemap = async (req, res) => {
  try {
    const baseUrl = process.env.CLIENT_URL || 'https://yourdomain.com';
    const products = await Product.find({ isActive: true }).select('slug updatedAt');
    const categories = await Category.find({ isActive: true }).select('slug updatedAt');

    const staticPages = ['', '/shop', '/about', '/contact'];
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`;

    staticPages.forEach(page => {
      xml += `\n  <url><loc>${baseUrl}${page}</loc><changefreq>weekly</changefreq><priority>${page === '' ? '1.0' : '0.8'}</priority></url>`;
    });

    categories.forEach(cat => {
      xml += `\n  <url><loc>${baseUrl}/shop?category=${cat.slug}</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>`;
    });

    products.forEach(p => {
      xml += `\n  <url><loc>${baseUrl}/product/${p.slug}</loc><lastmod>${p.updatedAt.toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>`;
    });

    xml += '\n</urlset>';
    res.type('application/xml').send(xml);
  } catch (err) {
    res.status(500).send('Sitemap error');
  }
};
