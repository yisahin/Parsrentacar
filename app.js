const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const app = express();

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));


// Session ayarları
app.use(session({
    secret: 'gizli_bir_anahtar', // sabit ve güvenli bir metin
    resave: false,
    saveUninitialized: true
}));

// Veritabanını oluştur ve tabloları ayarla
const db = new sqlite3.Database('users.db');
// Veritabanı bağlantısından hemen sonra ekle
// Kiralama bilgilerini tutacak tablo
db.run(`CREATE TABLE IF NOT EXISTS rentals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    car_id INTEGER,
    user_id INTEGER,
    start_date TEXT,
    end_date TEXT,
    driver_age INTEGER,
    FOREIGN KEY(car_id) REFERENCES cars(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
)`);

db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    password TEXT
)`);

db.run(`CREATE TABLE IF NOT EXISTS cars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brand TEXT,
    model TEXT,
    price INTEGER,
    status TEXT,
    rented_by INTEGER
)`);

// Kayıt sayfasını göster
app.get('/register', (req, res) => {
    res.render('register');
});
// Geçici olarak admin sütunu eklemek için
app.get('/setupAdminColumn', (req, res) => {
    db.run(`ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0`, (err) => {
        if (err) {
            if (err.message.includes("duplicate column name")) {
                return res.send("✅ 'is_admin' sütunu zaten var.");
            }
            return res.send("❌ Hata oluştu: " + err.message);
        }
        res.send("✅ 'is_admin' sütunu başarıyla eklendi.");
    });
});
// Bir kullanıcıyı admin yapmak için geçici route
app.get('/makeAdmin', (req, res) => {
    const email = req.query.email;

    if (!email) {
        return res.send("❌ Lütfen URL'ye ?email=kullanici@mail.com şeklinde e-posta ekleyin.");
    }

    db.run(`UPDATE users SET is_admin = 1 WHERE email = ?`, [email], function(err) {
        if (err) {
            return res.send("❌ Admin yapılırken hata oluştu: " + err.message);
        }

        if (this.changes === 0) {
            return res.send("❌ Böyle bir kullanıcı bulunamadı.");
        }

        res.send(`✅ ${email} artık admin!`);
    });
});
// Ana sayfa yönlendirmesi
app.get('/', (req, res) => {
    // Giriş yapmışsa direkt araç listesine gönder
    if (req.session.user) {
        return res.redirect('/cars');
    }

    // Giriş yapılmamışsa karşılama sayfasını göster
    res.render('home');
});
app.get('/users', (req, res) => {
    db.all('SELECT id, name, email, is_admin FROM users', (err, rows) => {
        if (err) {
            return res.send("❌ Kullanıcılar alınamadı: " + err.message);
        }
        res.send(rows);
    });
});

// Kullanıcıyı kaydet
const axios = require('axios'); // Üste ekle

app.post('/register', async (req, res) => {
    const { name, email, password } = req.body;
    const token = req.body['g-recaptcha-response'];
    const secretKey = '6LetoCIrAAAAAD6UXnc_CNsSle30KYEdC1mBmhEq';

    if (!token) {
        return res.send("❌ Lütfen reCAPTCHA doğrulamasını tamamlayın.");
    }

    try {
        const response = await axios.post(
            `https://www.google.com/recaptcha/api/siteverify`,
            null,
            {
                params: {
                    secret: secretKey,
                    response: token
                }
            }
        );

        if (!response.data.success) {
            return res.send("❌ reCAPTCHA doğrulaması başarısız.");
        }

        // Doğrulama başarılıysa kullanıcıyı veritabanına kaydet
        db.run(`INSERT INTO users (name, email, password) VALUES (?, ?, ?)`,
            [name, email, password],
            function(err) {
                if (err) {
                    return res.send("❌ Kayıt sırasında hata oluştu: " + err.message);
                }
                res.send("✅ Kayıt başarılı! Giriş yapabilirsiniz.");
            }
        );
    } catch (error) {
        console.error(error);
        res.send("❌ Google doğrulama sırasında bir hata oluştu.");
    }
});

// Giriş sayfasını göster
app.get('/login', (req, res) => {
    res.render('login');
});



app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const token = req.body['g-recaptcha-response'];
    const secretKey = '6LetoCIrAAAAAD6UXnc_CNsSle30KYEdC1mBmhEq';

    if (!token) {
        return res.send("❌ Lütfen reCAPTCHA doğrulamasını tamamlayın.");
    }

    try {
        // Google'a doğrulama isteği gönder
        const response = await axios.post(
            `https://www.google.com/recaptcha/api/siteverify`,
            null,
            {
                params: {
                    secret: secretKey,
                    response: token
                }
            }
        );

        // reCAPTCHA başarısızsa
        if (!response.data.success) {
            return res.send("❌ reCAPTCHA doğrulaması başarısız.");
        }

        // reCAPTCHA başarılıysa giriş işlemine devam
        db.get(`SELECT * FROM users WHERE email = ? AND password = ?`, 
            [email, password], 
            (err, user) => {
                if (err) {
                    return res.send("❌ Bir hata oluştu: " + err.message);
                }
                if (user) {
                    req.session.user = user;

                    // Adminse admin paneline
                    if (user.is_admin === 1) {
                        return res.redirect('/admin');
                    }

                    // Normal kullanıcıysa araçlara
                    return res.redirect('/cars');
                } else {
                    res.send("❌ Hatalı email veya şifre!");
                }
            }
        );
    } catch (error) {
        console.error(error);
        res.send("❌ Google doğrulama sırasında bir hata oluştu.");
    }
});
app.get('/admin/login', (req, res) => {
    res.render('admin_login');
});

app.post('/admin/login', (req, res) => {
    const { email, password } = req.body;
    db.get(`SELECT * FROM users WHERE email = ? AND password = ?`, 
        [email, password], 
        (err, user) => {
            if (err) return res.send("❌ Bir hata oluştu: " + err.message);

            // Tür farkını düzelt!
            if (!user || user.is_admin != 1)  {
                return res.send("❌ Sadece admin kullanıcılar giriş yapabilir!");
            }

            req.session.user = user;
            res.redirect('/admin');
        }
    );
});
app.get('/setupCarColumns', (req, res) => {
    db.run(`ALTER TABLE cars ADD COLUMN engine_size TEXT`, (err) => {
        if (err && !err.message.includes("duplicate column name")) {
            return res.send("❌ Motor hacmi sütunu eklenemedi: " + err.message);
        }

        db.run(`ALTER TABLE cars ADD COLUMN year INTEGER`, (err2) => {
            if (err2 && !err2.message.includes("duplicate column name")) {
                return res.send("❌ Yıl sütunu eklenemedi: " + err2.message);
            }

            res.send("✅ 'engine_size' ve 'year' sütunları başarıyla eklendi (veya zaten vardı).");
        });
    });
});

// Çıkış işlemi
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// Araçları listele (sadece giriş yapmış kullanıcılar)
app.get('/cars', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    db.all('SELECT * FROM cars', (err, cars) => {
        if (err) {
            return res.send("❌ Bir hata oluştu: " + err.message);
        }
        res.render('cars', { cars: cars, user: req.session.user });
    });
});

// Araç kiralama işlemi
app.post('/rentCar', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const carId = req.body.carId;
    const userId = req.session.user.id;

    db.run('UPDATE cars SET status = ?, rented_by = ? WHERE id = ?', 
        ['Kiralandı', userId, carId], 
        (err) => {
            if (err) {
                return res.send("❌ Kiralama sırasında hata oluştu: " + err.message);
            }
            res.redirect('/cars');
        }
    );
});
app.get('/rent/:id', (req, res) => {
    const carId = req.params.id;
    if (!req.session.user) return res.redirect('/login');
  
    db.get('SELECT * FROM cars WHERE id = ?', [carId], (err, car) => {
      if (err || !car) return res.send('Araç bulunamadı');
      res.render('rent_form', { car }); // car objesini rent_form.ejs'e gönderiyoruz
    });
  });

// Kiralama formunu göster
app.get('/rent/:carId', (req, res) => {
    const carId = req.params.carId;
    db.get('SELECT * FROM cars WHERE id = ?', [carId], (err, car) => {
      if (err || !car) return res.send('Araç bulunamadı');
      res.render('rent_form', { car });
    });
  });
  // Kiralama formunu göster

  app.post('/rent/:carId', (req, res) => {
    const carId = req.params.carId;
    const userId = req.session.user?.id;
    const { start_date, end_date, driver_age } = req.body;

    console.log("🚗 KİRALAMA İŞLEMİ BAŞLIYOR");
    console.log("Car ID:", carId);
    console.log("User ID:", userId);
    console.log("Start Date:", start_date);
    console.log("End Date:", end_date);
    console.log("Driver Age:", driver_age);

    db.run(
        'INSERT INTO rentals (car_id, user_id, start_date, end_date, driver_age) VALUES (?, ?, ?, ?, ?)',
        [carId, userId, start_date, end_date, driver_age],
        function(err) {
            if (err) {
                console.error("❌ INSERT HATASI:", err.message);
                return res.send("Kayıt başarısız: " + err.message);
            }

            console.log("✅ RENTALS tablosuna eklendi, id:", this.lastID);

            db.run(
                'UPDATE cars SET status = ?, rented_by = ? WHERE id = ?',
                ['Kiralandı', userId, carId],
                function(err2) {
                    if (err2) {
                        console.error("❌ UPDATE HATASI:", err2.message);
                        return res.send("Araç güncellenemedi: " + err2.message);
                    }

                    console.log("✅ Araç başarıyla güncellendi");
                    res.redirect('/cars');
                }
            );
        }
    );
});
  
  // Kiralama işlemini kaydet
app.get('/about', (req, res) => {
    res.render('about'); // views klasöründe about.ejs olacak
});

// Araç ekleme sayfası (giriş kontrolü isteğe bağlı)
app.get('/addCar', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.render('addCar');
});

// Araç ekleme işlemi
app.post('/addCar', (req, res) => {
    const { brand, model, price, status, engine_size, year } = req.body;

    db.run(
        'INSERT INTO cars (brand, model, price, status, engine_size, year) VALUES (?, ?, ?, ?, ?, ?)', 
        [brand, model, price, status, engine_size, year], 
        (err) => {
            if (err) {
                return res.send("❌ Bir hata oluştu: " + err.message);
            }
            res.redirect('/cars');
        }
    );
});
app.get('/admin', (req, res) => {
    if (!req.session.user || req.session.user.is_admin !== 1) {
        return res.send("⛔ Bu sayfaya sadece admin kullanıcılar erişebilir.");
    }

    db.all('SELECT * FROM users', (err, users) => {
        if (err) return res.send("❌ Kullanıcılar alınamadı: " + err.message);

        db.all('SELECT * FROM cars', (err, cars) => {
            if (err) return res.send("❌ Araçlar alınamadı: " + err.message);

            db.all(`SELECT rentals.*, users.name AS user_name, cars.brand || ' ' || cars.model AS car_name
                    FROM rentals
                    JOIN users ON rentals.user_id = users.id
                    JOIN cars ON rentals.car_id = cars.id`, (err, rentals) => {
                if (err) return res.send("❌ Kiralamalar alınamadı: " + err.message);
                console.log("Kiralama verileri:", rentals);
                res.render('admin', { users, cars, rentals });
            });
        });
    });
});
app.get('/admin/rentals', (req, res) => {
    // İade edilmemiş kiralama bilgilerini çekme
    db.all('SELECT * FROM rentals WHERE is_returned = 0', (err, rentals) => {
      if (err) {
        return console.log(err.message);
      }
  
      res.render('admin/rentals', { rentals: rentals });
    });
  });
app.post('/admin/addCar', (req, res) => {
    const { brand, model, price, engine_size, year } = req.body;

    db.run(
        `INSERT INTO cars (brand, model, price, engine_size, year) VALUES (?, ?, ?, ?, ?)`,
        [brand, model, price, engine_size, year],
        function (err) {
            if (err) {
                console.error("Araç eklenirken hata oluştu:", err.message);
                return res.send("❌ Araç eklenirken bir hata oluştu.");
            }
            res.redirect('/admin');
        }
    );
});

app.post('/admin/deleteCar', (req, res) => {
    if (!req.session.user || req.session.user.is_admin !== 1) {
        return res.send("❌ Yetkisiz erişim!");
    }

    const carId = req.body.carId;
    db.run('DELETE FROM cars WHERE id = ?', [carId], (err) => {
        if (err) {
            return res.send("❌ Araç silinirken hata oluştu: " + err.message);
        }
        res.redirect('/admin');
    });
});
app.get('/admin/editCar/:id', (req, res) => {
    if (!req.session.user || req.session.user.is_admin !== 1) {
        return res.send("❌ Yetkisiz erişim!");
    }

    const carId = req.params.id;
    db.get('SELECT * FROM cars WHERE id = ?', [carId], (err, car) => {
        if (err || !car) {
            return res.send("❌ Araç bulunamadı.");
        }
        res.render('editCar', { car: car });
    });
});
app.post('/admin/editCar/:id', (req, res) => {
    if (!req.session.user || req.session.user.is_admin !== 1) {
        return res.send("❌ Yetkisiz erişim!");
    }

    const carId = req.params.id;
    const { brand, model, price, status, engine_size, year } = req.body;

    db.run(
        'UPDATE cars SET brand = ?, model = ?, price = ?, status = ?, engine_size = ?, year = ? WHERE id = ?',
        [brand, model, price, status, engine_size, year, carId],
        (err) => {
            if (err) {
                return res.send("❌ Güncelleme sırasında hata oluştu: " + err.message);
            }
            res.redirect('/admin');
        }
    );
});

// Araç iade işlemi
app.post('/returnCar', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const carId = req.body.carId;
    const userId = req.session.user.id;

    // 1. Araba statüsünü "müsait" olarak güncelleme
    db.run('UPDATE cars SET status = ?, rented_by = NULL WHERE id = ? AND rented_by = ?',
        ['müsait', carId, userId],
        function (err) {
            if (err) {
                return res.send("❌ İade sırasında hata oluştu: " + err.message);
            }

            if (this.changes === 0) {
                return res.send("❌ Bu aracı iade etme yetkiniz yok.");
            }

            // 2. Kiralama bilgisini güncelleme
            db.run('UPDATE rentals SET is_returned = 1 WHERE car_id = ? AND user_id = ? AND is_returned = 0',
                [carId, userId],
                function (err) {
                    if (err) {
                        return res.send("❌ Kiralama kaydını güncellerken hata oluştu: " + err.message);
                    }

                    if (this.changes === 0) {
                        return res.send("❌ İade işlemi tamamlanamadı.");
                    }

                    // Başarılı işlem sonrası başarılı mesajı ve yönlendirme
                    req.session.successMessage = "✅ Araç başarıyla iade edildi.";
                    res.redirect('/cars');
                }
            );
        }
    );
});
app.get('/cars/:id', async (req, res) => {
  const carId = req.params.id;
  const car = await db.get('SELECT * FROM cars WHERE id = ?', [carId]);
  const user = req.session.user;

  if (!car) {
    return res.status(404).send('Araç bulunamadı');
  }

  res.render('car_detail', { car, user });
});

// Kiralama bilgilerini tutacak tablo
// Sunucuyu başlat
app.listen(3000, () => {
    console.log("Sunucu çalışıyor: http://localhost:3000");
});