# JEJAMA CTF

Jalankan `python server.py` dari folder proyek, lalu buka http://127.0.0.1:8765. Server lokal menyimpan pendaftaran ke `registrations.sqlite3` dan menampilkan kode pendaftaran. Pengiriman ulang dengan nama tim dan email yang sama mengembalikan kode yang sama.

Folder `dist` berisi situs statis dan asetnya. Saat disajikan sendiri, formulir berjalan dalam mode pratinjau. Untuk registrasi online, sambungkan endpoint `/api/registrations` ke penyimpanan di hosting. GET mengembalikan `{"enabled":true}`, POST menerima JSON berisi `team`, `captain`, dan `email` lalu mengembalikan `{"id":"..."}` saat berhasil.

Aset hero dibuat dengan ImageGen bawaan. Briefnya adalah ilustrasi kartun sinematik kapten gajah di kemudi kapal, laut senja, awan abstrak, dan pulau dengan rumah panggung beratap siger, dengan ruang gelap di kiri untuk judul. Ikon kompas dibuat dalam SVG.
