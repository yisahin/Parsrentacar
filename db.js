const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS cars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      price INTEGER NOT NULL,
      engine_size TEXT,
      year INTEGER,
      status TEXT DEFAULT 'müsait',
      rented_by INTEGER
    )
  `);

  console.log("✅ 'cars' tablosu başarıyla oluşturuldu (veya zaten vardı).");
});

module.exports = db;