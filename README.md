# E-Temir Daftar Demo - Xabar Tizimi

Bu loyiha qarzdorlar boshqaruvi tizimi bo'lib, foydalanuvchilar va adminlar o'rtasida xabar almashish imkoniyatini taqdim etadi.

## Xabar Tizimi Xususiyatlari

### Foydalanuvchilar uchun (xabarlar.html)
- Adminlarga xabar yuborish
- Adminlardan kelgan xabarlarni o'qish
- Xabarlarga javob berish
- O'qilmagan xabarlarni belgilash
- Xabarlarni o'chirish
- Real-time xabar yangilanishlari

### Adminlar uchun (admin-messages.html)
- Barcha foydalanuvchilarga xabar yuborish
- Aniq foydalanuvchiga xabar yuborish
- Foydalanuvchilardan kelgan xabarlarni ko'rish
- Xabarlarga javob berish
- Barcha xabarlarni o'qilgan deb belgilash
- Barcha xabarlarni o'chirish
- Foydalanuvchilar ro'yxatini ko'rish va qidirish

## Foydalanish

### Foydalanuvchilar
1. `bosh-sahifa.html` yoki `dashboard.html` dan "Xabarlar" tugmasini bosing
2. Yangi xabar yozish uchun "Yangi xabar yozish" tugmasini bosing
3. Adminlarga xabar yuboring
4. Kelgan xabarlarni o'qing va javob bering

### Adminlar
1. `dashboard.html` dan "Admin Xabarlar" tugmasini bosing
2. Foydalanuvchilar ro'yxatini ko'ring
3. Aniq foydalanuvchiga yoki barchaga xabar yuboring
4. Kelgan xabarlarni ko'ring va javob bering

## Texnik Ma'lumotlar

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Firebase Firestore
- **Authentication**: Firebase Auth
- **Real-time updates**: Firebase onSnapshot

## Xabar Turlari

- `user_to_admin`: Foydalanuvchidan adminlarga
- `admin_to_user`: Adminlardan foydalanuvchilarga
- `admin_broadcast`: Adminlardan barcha foydalanuvchilarga

## Xavfsizlik

- Foydalanuvchilar faqat o'z xabarlarini ko'ra oladi
- Adminlar barcha xabarlarni ko'ra oladi
- Firebase Authentication orqali foydalanuvchilar autentifikatsiya qilinadi 