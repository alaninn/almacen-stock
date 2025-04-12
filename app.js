const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const { db } = require('./database/database');
const bcrypt = require('bcryptjs');
const methodOverride = require('method-override');
const ExcelJS = require('exceljs');

const app = express();
const upload = multer({ dest: 'public/uploads/' });

// ================= CONFIGURACIÓN INICIAL =================
app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true
}));
app.use(methodOverride('_method'));

// ================= MIDDLEWARE DE AUTENTICACIÓN =================
const requireLogin = (req, res, next) => {
  if (!req.session.user) res.redirect('/login');
  else next();
};

// ================= RUTAS =================

// ---------- Login ----------
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
  const { usuario, contraseña } = req.body;
  db.get('SELECT * FROM usuarios WHERE usuario = ?', [usuario], async (err, user) => {
    if (err || !user || !(await bcrypt.compare(contraseña, user.contraseña))) {
      res.render('login', { error: 'Credenciales incorrectas' });
    } else {
      req.session.user = user;
      res.redirect('/dashboard');
    }
  });
});

// ---------- Logout ----------
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// ---------- Dashboard ----------
app.get('/dashboard', requireLogin, (req, res) => {
  res.render('dashboard');
});

// ---------- Crear Producto get ----------
app.get('/crear-producto', requireLogin, (req, res) => {
  db.all('SELECT * FROM categorias', (err, categorias) => {
  
 res.render('crear-producto', { 
  categorias: categorias || [], 
  error: null,
  success: null // Quitar mensaje hardcodeado
});
  
  });
});

// ---------- Crear Producto post ----------

app.post('/crear-producto', upload.single('imagen'), (req, res) => {
  const { nombre, descripcion, categoria_id, stock_minimo } = req.body;
  const stock = parseInt(req.body.stock, 10);
  const imagen = req.file ? `/uploads/${req.file.filename}` : '';

  if (isNaN(stock)) {
    return res.render('crear-producto', { 
      error: 'Stock debe ser un número', 
      categorias: [] 
    });
  }
  
   if (stock < 0 || stock_minimo < 0) {
    return res.render('crear-producto',  { 
      error: 'El stock y stock mínimo no pueden ser negativos', 
      categorias: [] 
    });
  }

  db.run(
    'INSERT INTO productos (nombre, descripcion, stock, stock_minimo, categoria_id, imagen) VALUES (?, ?, ?, ?, ?, ?)',
    [nombre, descripcion, stock, stock_minimo, categoria_id, imagen],
    (err) => {
      if (err) return res.render('crear-producto', { error: 'Error al guardar', categorias: [] });
	  
      db.all('SELECT * FROM categorias', (err, categorias) => {
  res.render('crear-producto', { 
    categorias: categorias || [], 
    error: null,
    success: 'Producto creado exitosamente!' // Mensaje temporal
  });
});
	   
    }
  );
});




// ---------- Editar Producto (GET) ----------
app.get('/productos/:id/editar', requireLogin, (req, res) => {
  db.get('SELECT * FROM productos WHERE id = ?', [req.params.id], (err, producto) => {
    if (err || !producto) {
      return res.redirect('/stock?error=Producto no encontrado');
    }
    
    db.all('SELECT * FROM categorias', (err, categorias) => {
      if (err) {
        return res.redirect('/stock?error=Error al cargar categorías');
      }
      res.render('Modificarproducto', { 
        producto,
        categorias: categorias || [], 
        error: null, success: 'Producto agregado con éxito'
      });
    });
  });
});

// ---------- Editar Producto (POST) ----------
app.post('/productos/:id/actualizar', upload.single('imagen'), (req, res) => {
  const { nombre, descripcion, stock, categoria_id, imagen_actual, stock_minimo } = req.body;
  
  // Validación mejorada
 if (isNaN(stock)) {
    return res.render('Modificarproducto', {
      error: 'Stock inválido',
      producto: { id: req.params.id, ...req.body },
      categorias: []
    });
  }
   // Conversión a números
  const parsedStock = parseInt(stock, 10);
  const parsedStockMinimo = parseInt(stock_minimo, 10);

  if (parsedStock < 0 || parsedStockMinimo < 0) {
    return res.render('Modificarproducto', {
      error: 'Valores no pueden ser negativos',
      producto: { id: req.params.id, ...req.body },
      categorias: []
    });
  }
   if (stock < 0 || stock_minimo < 0) {
    return res.render('Modificarproducto', {
      error: 'Stock y stock mínimo no pueden ser negativos',
      producto: { id: req.params.id, ...req.body },
      categorias: []
    });
  }

  const imagen = req.file ? `/uploads/${req.file.filename}` : imagen_actual;

  db.run(
    'UPDATE productos SET nombre = ?, descripcion = ?, stock = ?, stock_minimo = ?, categoria_id = ?, imagen = ? WHERE id = ?',
    [
      nombre,
      descripcion,
      parsedStock,
      parsedStockMinimo,
      categoria_id,
      req.file ? `/uploads/${req.file.filename}` : imagen_actual,
      req.params.id
    ],
    (err) => {
      if (err) {
        console.error('Error DB:', err);
        return res.render('Modificarproducto', { 
          error: 'Error al guardar', 
          producto: req.body, 
          categorias: [] 
        });
      }
      res.redirect('/stock?success=Actualizado');
    }
  );
});


// ---------- Eliminar Producto ----------
app.delete('/productos/:id', requireLogin, (req, res) => {
  db.serialize(() => {
    db.run('DELETE FROM historial_stock WHERE producto_id = ?', [req.params.id]);
    db.run('DELETE FROM productos WHERE id = ?', [req.params.id], (err) => {
      res.json({ success: !err });
    });
  });
});

// ---------- Stock (Con Filtros) ----------
app.get('/stock', requireLogin, (req, res) => {
  const categoriaId = req.query.categoria;

  let query = `
    SELECT productos.*, categorias.nombre as categoria_nombre 
    FROM productos 
    LEFT JOIN categorias ON productos.categoria_id = categorias.id
  `;
  let params = [];

  if (categoriaId) {
    query += ' WHERE categorias.id = ?';
    params.push(categoriaId);
  }

  db.all(query, params, (err, productos) => {
    db.all('SELECT * FROM categorias', (err, categorias) => {
      res.render('stock', { 
        productos: productos || [], 
        categorias: categorias || [],
        categoriaSeleccionada: categoriaId 
      });
    });
  });
});

// ---------- Actualizar Stock (Con Historial) ----------
app.put('/productos/:id/stock', (req, res) => {
  const { stock } = req.body;
  const productoId = req.params.id;

  db.get('SELECT stock FROM productos WHERE id = ?', [productoId], (err, row) => {
    if (err) return res.json({ success: false });

    const stockAnterior = row.stock;

    // Registrar en historial
    db.run(
      'INSERT INTO historial_stock (producto_id, stock_anterior, stock_nuevo) VALUES (?, ?, ?)',
      [productoId, stockAnterior, stock]
    );

    // Actualizar stock
    db.run(
      'UPDATE productos SET stock = ? WHERE id = ?',
      [stock, productoId],
      (err) => res.json({ success: !err })
    );
  });
});


// ---------- Obtener Historial ----------
// Ruta GET /productos/:id/historial (actualizada)
app.get('/productos/:id/historial', (req, res) => {
  db.all(
    `SELECT *, 
    strftime('%Y-%m-%dT%H:%M:%SZ', fecha) as fecha_iso  -- Formato ISO con Z (UTC)
    FROM historial_stock 
    WHERE producto_id = ? 
    ORDER BY fecha DESC`,
    [req.params.id],
    (err, rows) => res.json(rows)
  );
});

app.delete('/productos/:id/historial', requireLogin, (req, res) => {
  db.run(
    'DELETE FROM historial_stock WHERE producto_id = ?',
    [req.params.id],
    (err) => res.json({ success: !err })
  );
});

// ---------------------- STOCK BAJO ----------------------
app.get('/stock-bajo', requireLogin, (req, res) => {
  db.all(`
    SELECT productos.*, categorias.nombre as categoria_nombre 
    FROM productos 
    LEFT JOIN categorias ON productos.categoria_id = categorias.id
    WHERE productos.stock <= productos.stock_minimo
  `, (err, productos) => {
    res.render('stock', { 
      productos: productos || [], 
      categorias: [], 
      categoriaSeleccionada: null 
    });
  });
});

// Ruta para obtener conteo de stock bajo
app.get('/api/stock-bajo/count', requireLogin, (req, res) => {
  db.get(
    'SELECT COUNT(*) as count FROM productos WHERE stock <= stock_minimo',
    (err, row) => {
      if (err) {
        console.error('Error en la consulta:', err);
        return res.json({ count: 0 });
      }
      res.json({ count: row ? row.count : 0 }); // <- Corrección clave
    }
  );
});


// ---------- Categorías ----------
app.get('/categorias', requireLogin, (req, res) => {
  db.all('SELECT * FROM categorias ORDER BY nombre', (err, categorias) => {
    res.render('categorias', { categorias: categorias || [], error: null });
  });
});

app.post('/categorias', requireLogin, (req, res) => {
  const { nombre } = req.body;
  if (!nombre.trim()) {
    return res.render('categorias', { error: 'Nombre obligatorio', categorias: [] });
  }

  db.run(
    'INSERT INTO categorias (nombre) VALUES (?)',
    [nombre.trim()],
    (err) => {
      if (err) return res.render('categorias', { error: 'Categoría duplicada', categorias: [] });
      res.redirect('/categorias');
    }
  );
});

app.delete('/categorias/:id', requireLogin, (req, res) => {
  db.serialize(() => {
    db.run('UPDATE productos SET categoria_id = NULL WHERE categoria_id = ?', [req.params.id]);
    db.run('DELETE FROM categorias WHERE id = ?', [req.params.id], () => res.redirect('/categorias'));
  });
});

// ---------- Exportar a Excel ----------
app.get('/exportar-excel', requireLogin, (req, res) => {
  db.all(`
    SELECT productos.*, categorias.nombre as categoria_nombre 
    FROM productos 
    LEFT JOIN categorias ON productos.categoria_id = categorias.id
  `, async (err, productos) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Stock');

    worksheet.columns = [
      { header: 'Nombre', key: 'nombre' },
      { header: 'Descripción', key: 'descripcion' },
      { header: 'Categoría', key: 'categoria_nombre' },
      { header: 'Stock', key: 'stock' }
    ];

    productos.forEach(p => worksheet.addRow(p));
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=stock.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  });
});

// ================= INICIAR SERVIDOR =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor en http://localhost:${PORT}`);
});