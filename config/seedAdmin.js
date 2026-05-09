const User = require('../models/User');
const Category = require('../models/Category');

module.exports = async function seedAdmin() {
  try {
    // Create admin if none exists
    const adminExists = await User.findOne({ role: 'admin' });
    if (!adminExists) {
      await User.create({
        name: 'Admin',
        email: process.env.ADMIN_EMAIL || 'admin@nqshop.com',
        password: process.env.ADMIN_PASSWORD || 'Admin@123456',
        role: 'admin',
      });
      console.log('✅ Admin user created');
    }

    // Seed default categories
    const defaultCategories = [
      { name: 'Wigs', description: 'Premium quality wigs — straight, curly, lace front & more', sortOrder: 1 },
      { name: 'Bags', description: 'Classy designer-inspired bags for every occasion', sortOrder: 2 },
      { name: 'Accessories', description: 'Hair accessories and styling tools', sortOrder: 3 },
    ];

    for (const cat of defaultCategories) {
      await Category.findOneAndUpdate({ name: cat.name }, cat, { upsert: true });
    }
    console.log('✅ Default categories seeded');
  } catch (err) {
    console.error('Seed error:', err.message);
  }
};
