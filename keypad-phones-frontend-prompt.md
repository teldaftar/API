# Frontend vazifa: "Klaviaturali telefonlar" sahifasi

Backendga **klaviaturali telefonlar** (tugmali telefonlar) qo'shildi. Ular
aksessuarlar bilan **bir xil ishlaydi** (miqdor modeli, batch/partiya bo'yicha
tannarx, kirim orqali qo'shiladi, partiyani tanlab sotiladi), lekin **alohida
sahifa**, **alohida sotuv turi** va **statistikada alohida qator** sifatida
ko'rsatiladi.

Texnik jihatdan bu aksessuarning bir turi: har bir yozuvda `kind` maydoni bor —
`"ACCESSORY"` yoki `"KEYPAD_PHONE"`. Shu bitta maydon hamma joyni ajratadi.

---

## 1. Yangi sahifa: "Klaviaturali telefonlar"

Aksessuarlar sahifasining **aynan nusxasi**, faqat `kind=KEYPAD_PHONE` bilan
ishlaydi. Ro'yxatda telefonlar ko'rinadi; **sotish**, **o'zgartirish**,
**yorliq (label) chiqarish**, **o'chirish** mumkin. Sotib olingan narx
(purchasePrice) o'zgartirilmaydi.

### Ro'yxat
```
GET /api/accessories?kind=KEYPAD_PHONE&search=<matn>&inStock=<true|false>&page=1&limit=20
```
- `kind` berilmasa → faqat **ACCESSORY** qaytadi (shuning uchun aksessuarlar
  sahifasi o'zgarmaydi). Klaviaturali sahifada **doim** `kind=KEYPAD_PHONE`
  yuboring.
- Javob elementi (har biri):
  ```json
  {
    "id": "uuid",
    "kind": "KEYPAD_PHONE",
    "name": "Nokia 105",
    "purchasePrice": 100000,     // eng eski qolgan partiya tannarxi (ko'rsatish uchun)
    "salePrice": 150000,          // null bo'lishi mumkin
    "quantity": 3,                // qoldiq (Σ partiyalar)
    "imageUrl": "/uploads/...",   // null bo'lishi mumkin
    "note": "...",                // null bo'lishi mumkin
    "createdAt": "...", "updatedAt": "..."
  }
  ```

### Bitta element / o'zgartirish / o'chirish
```
GET    /api/accessories/:id
PATCH  /api/accessories/:id      body: { name?, salePrice?, imageUrl?, note? }
DELETE /api/accessories/:id
```
- **PATCH'da `purchasePrice` YUBORMANG** va `kind` o'zgartirib bo'lmaydi
  (tannarx faqat kirim orqali boshqariladi — aksessuarlardagi kabi).

### Sotib olingan (sotilgan) ko'rinishlar
```
GET /api/accessories/sold?kind=KEYPAD_PHONE&search=&page=&limit=   // umumiy jadval
GET /api/accessories/:id/sold                                       // bitta element bo'yicha (kind avtomatik)
```

### Yorliq (label)
Aksessuarlar/telefonlardagi mavjud yorliq mexanizmini **o'zgarishsiz** qo'llang
(nom + narx + shtrix, sizda qanday bo'lsa). Yangi endpoint yo'q.

---

## 2. Kirim (prixod) modalida TAB qo'shish

Hozir "Kirim qilish" bosilganda modal ochilib, mavjud **aksessuarlar**
ko'rsatiladi. Endi modal tepasida **ikki tab** bo'ladi:

```
[ Aksessuarlar ]  [ Klaviaturali telefonlar ]
```

- Tanlangan tab **`kind`ni belgilaydi** (`ACCESSORY` yoki `KEYPAD_PHONE`).
- Mavjud element qidiruvi/ro'yxati o'sha tabning kind'i bilan filtrlanadi:
  `GET /api/accessories?kind=<tanlangan>`.
- Qolgan hamma narsa **avvalgidek** ishlaydi. Bitta kirim ichida ikkala turdan
  ham qo'shsa bo'ladi (tab almashtirib), backend aralashiga ruxsat beradi.

### Kirim yuborish
```
POST /api/stock-receipts
{
  "supplierName": "...",        // optional
  "supplierPhone": "...",       // optional
  "note": "...",                // optional
  "items": [
    {
      // MAVJUD elementga qo'shish:
      "accessoryId": "uuid",
      // YOKI yangi yaratish:
      "newAccessory": {
        "name": "Nokia 105",
        "kind": "KEYPAD_PHONE",   // ← klaviaturali tabda shu; aksessuar tabda "ACCESSORY" yoki tashlab keting
        "salePrice": 150000,      // optional
        "imageUrl": "/uploads/...", // optional
        "note": "..."             // optional
      },
      "quantity": 1,              // default 1
      "purchasePrice": 100000,    // 0 ham bo'lishi mumkin (bepul kirim)
      "salePrice": 150000         // optional — elementning standart sotish narxini o'rnatadi/yangilaydi
    }
  ]
}
```
- Har bir liniyada **`accessoryId` YOKI `newAccessory`** — bittasi (ikkovi
  emas). Aks holda `RECEIPT_LINE_INVALID`.
- Yangi **klaviaturali telefon** yaratish uchun: `newAccessory.kind =
  "KEYPAD_PHONE"`. Yangi aksessuar uchun `"ACCESSORY"` (yoki tashlab keting —
  default ACCESSORY).
- Maydonlar (foydalanuvchi so'ragan): **Nom/model** (`name`), **sotib olingan
  narx** (`purchasePrice`), **sotish narxi** (`salePrice`, optional), **izoh**
  (`note`, optional), **rasm** (`imageUrl`, optional), **miqdor** (`quantity`,
  default 1).

### Kirim tafsiloti / ro'yxati
```
GET /api/stock-receipts/:id
```
- Endi javob liniyalarida **`kind`** bor — kirim tafsilotida qaysi liniya
  klaviaturali telefon, qaysi biri aksessuar ekanini ajratib ko'rsatish mumkin
  (masalan tab/belgi bilan).

---

## 3. Sotish

Sotish **avvalgidek**. Klaviaturali telefon sotuv liniyasi aksessuar liniyasiga
o'xshaydi — faqat `type` boshqacha:

```
POST /api/sales
{
  "items": [
    {
      "type": "KEYPAD_PHONE",     // ← aksessuarda "ACCESSORY", telefonda "PHONE"
      "accessoryId": "uuid",
      "stockEntryId": "uuid",     // sotiladigan partiya — GET /accessories/:id/stock?available=true dan
      "quantity": 1,
      "unitPrice": 150000         // sotuvchi kiritadi (default = salePrice)
    }
  ],
  "note": "...",                  // optional
  "customerName": "...",          // optional
  "customerPhone": "...",         // optional
  "debt": { ... }                 // optional (avvalgidek)
}
```
- **Partiya tanlash** aksessuardagi kabi: `GET
  /api/accessories/:id/stock?available=true` (faqat qoldig'i bor partiyalar,
  eski-birinchi). Sotuvchi partiyani tanlaydi, tannarx o'sha partiyaniki.
- **Muhim:** liniya `type` tovar turiga mos kelishi shart. Klaviaturali
  telefonni `type:"ACCESSORY"` bilan yuborsangiz → `SALE_LINE_INVALID`. Har
  doim klaviaturali element uchun `type:"KEYPAD_PHONE"` yuboring.
- Bitta sotuvda aralash bo'lsa (telefon + aksessuar + klaviaturali) — sotuv
  `type` avtomatik **`MIXED`** bo'ladi.

### Sotuv turlari (endi 4 ta)
`sales[].type` va `sale.items[].itemType` endi quyidagilardan biri bo'lishi
mumkin:
- `PHONE` — smartfon
- `ACCESSORY` — aksessuar
- `KEYPAD_PHONE` — klaviaturali telefon  ← **yangi**
- `MIXED` — aralash (faqat `sale.type` da)

Sotuvlar ro'yxati/filtrida shu turlarni hisobga oling (masalan "Klaviaturali"
filtri: `GET /api/sales?type=KEYPAD_PHONE`).

### Qaytarish
`POST /api/sales/:id/return` — **o'zgarmagan**. Qaytarilgan klaviaturali telefon
avtomatik qayta omborga kiradi (aksessuardagi kabi, o'z partiyasi sifatida).

---

## 4. Statistika

`GET /api/statistics/summary` javobiga **`keypadPhones`** bo'limi qo'shildi —
aksessuar bo'limi bilan **bir xil shakl**:

```json
{
  "phones": { ... },
  "accessories": {
    "purchasedQty", "purchasedAmount", "soldQty", "soldAmount",
    "soldCostAmount", "profit", "returnedQty", "returnedAmount",
    "remainingQty", "remainingCostAmount"
  },
  "keypadPhones": { /* aynan yuqoridagi maydonlar */ },   // ← YANGI
  "expenses": { ... }, "debts": { ... }, "totals": { ... }
}
```
- Statistika sahifasida aksessuarlar kartochkasi yoniga **"Klaviaturali
  telefonlar"** kartochkasini qo'shing (xuddi shu maydonlar bilan).
- **`accessories` endi klaviaturali telefonlarni O'Z ICHIGA OLMAYDI** — ular
  `keypadPhones`ga ajratildi. Agar oldin "aksessuarlar" umumiy ko'rsatilgan
  bo'lsa, endi ikki alohida blok.
- `totals` (grossProfit, netProfit, cashIn, cashOut) ikkalasini ham hisobga
  oladi — o'zgartirish shart emas.

---

## Qisqa xulosa (frontend uchun ish ro'yxati)
1. **Yangi sahifa** "Klaviaturali telefonlar" — aksessuar sahifasini `kind=KEYPAD_PHONE` bilan klonlang (ro'yxat, sotish, tahrirlash, yorliq, o'chirish).
2. **Kirim modaliga tab** qo'shing (Aksessuarlar / Klaviaturali) — tab `kind`ni tanlaydi va mavjud element qidiruvini filtrlaydi; yangi element `newAccessory.kind` bilan yaratiladi.
3. **Sotuv**da klaviaturali liniya uchun `type:"KEYPAD_PHONE"` yuboring; `MIXED` va yangi filtrlarni qo'llab-quvvatlang.
4. **Statistika**da `keypadPhones` bo'limini alohida kartochka qilib ko'rsating.

To'liq API shartnomasi: `openapi.json` (yangilangan). Barcha endpointlar
`Authorization: Bearer <token>` talab qiladi.
