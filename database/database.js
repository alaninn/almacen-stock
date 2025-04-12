const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const db = new sqlite3.Database('./database/almacen.db');

db.serialize(() => {
  // Tabla Usuarios
  db.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT UNIQUE,
      contraseña TEXT
    )
  `);

  // Tabla Categorías
  db.run(`
    CREATE TABLE IF NOT EXISTS categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT UNIQUE
    )
  `);

  // Tabla Productos
  db.run(`
    CREATE TABLE IF NOT EXISTS productos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT,
      descripcion TEXT,
      stock INTEGER,
	  stock_minimo INTEGER DEFAULT 0,
      categoria_id INTEGER,
      imagen TEXT,
      FOREIGN KEY(categoria_id) REFERENCES categorias(id)
    )
  `);

  // Tabla Historial Stock
  db.run(`
    CREATE TABLE IF NOT EXISTS historial_stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_id INTEGER,
      stock_anterior INTEGER,
      stock_nuevo INTEGER,
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(producto_id) REFERENCES productos(id)
    )
  `);

  // Usuario admin por defecto
  bcrypt.hash('admin123', 10, (err, hash) => {
    db.run(`
      INSERT OR IGNORE INTO usuarios (usuario, contraseña)
      VALUES (?, ?)
    `, ['admin', hash]);
  });
});

module.exports = { db };