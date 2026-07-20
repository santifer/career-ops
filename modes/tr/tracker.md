# Mod: tracker — Başvuru Takipçisi

`data/applications.md` dosyasını oku ve görüntüle.

**Takip Formatı:**

```markdown
| # | Tarih | Şirket | Rol | Puan | Durum | PDF | Rapor | Notlar |
```

Olası durumlar: `Evaluated` → `Applied` → `Responded` → `Interview` → `Offer` / `Rejected` / `Discarded` / `SKIP`

- `Evaluated` = teklif raporla değerlendirildi, karar bekleniyor
- `Applied` = aday başvurusunu gönderdi
- `Responded` = Şirket yanıt verdi (henüz mülakat değil)
- `Interview` = aktif mülakat süreci
- `Offer` = iş teklifi alındı
- `Rejected` = şirket tarafından reddedildi
- `Discarded` = aday tarafından reddedildi veya teklif kapandı
- `SKIP` = uygun değil, başvurma

Kullanıcı bir durumu güncellemeyi isterse, ilgili satırı düzenleyin.

Ayrıca istatistikleri de gösterin:
- Toplam başvuru sayısı
- Duruma göre dağılım
- Ortalama puan
- PDF oluşturulanların yüzdesi (%)
- Rapor oluşturulanların yüzdesi (%)
