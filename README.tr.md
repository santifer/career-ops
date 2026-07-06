# Career-Ops

[English](README.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Français](README.fr.md) | [Português (Brasil)](README.pt-BR.md) | [한국어](README.ko-KR.md) | [日本語](README.ja.md) | [简体中文](README.cn.md) | [繁體中文](README.zh-TW.md) | [Українська](README.ua.md) | [Русский](README.ru.md) | [Polski](README.pl.md) | [Dansk](README.da.md) | [العربية](README.ar.md) | [Türkçe](README.tr.md)

<p align="center">
  <a href="https://x.com/santifer"><img src="docs/hero-banner.jpg" alt="Career-Ops Multi-Agent İş Arama Sistemi" width="800"></a>
</p>

[Claude Code](https://github.com/anthropics/claude-code), [Google Antigravity](https://github.com/google/antigravity), [OpenCode](https://github.com/opencode/opencode) veya [Codex](https://github.com/microsoft/codex) terminalinizde yerel olarak çalışan açık kaynaklı, çoklu aracı destekli bir iş arama komuta merkezi.

- İş portallarını otomatik olarak **tarar** (Greenhouse, Ashby, Lever, şirket sayfaları)
- **Toplu işlem yapar** -- alt-aracılarla paralel olarak 10'dan fazla ilanı değerlendirir
- Bütünlük kontrolleriyle her şeyi tek bir doğruluk kaynağında **takip eder**
- **Şirketleri araştırır ve iletişime geçilecek doğru kişiyi bulur** -- başvurular sizi sıraya sokar; araştırma ise size bir görüşme kazandırır

> **Önemli: Bu bir "rastgele herkese başvur" (spray-and-pray) aracı DEĞİLDİR.** career-ops bir filtredir -- yüzlerce ilan arasından zamanınıza değecek birkaç tanesini bulmanıza yardımcı olur. Sistem, 4.0/5'in altında puan alan hiçbir şeye başvurmamanızı şiddetle tavsiye eder. Sizin zamanınız değerlidir, İK uzmanınınki de öyle. Göndermeden önce daima gözden geçirin.

career-ops otonom bir sistemdir: Hangi AI kodlama CLI'sini seçerseniz seçin, kariyer sayfalarında Playwright ile gezinir, uygunluğu anahtar kelime eşleştirmesiyle değil, Özgeçmişinizi iş tanımıyla (JD) kıyaslayıp mantık yürüterek değerlendirir ve özgeçmişinizi her ilana göre uyarlar.

> **Uyarı: İlk değerlendirmeler harika olmayacaktır.** Sistem sizi henüz tanımıyor. Ona bağlam sağlayın -- Özgeçmişiniz, kariyer hikayeniz, kanıt noktalarınız, tercihleriniz, nelerde iyi olduğunuz, nelerden kaçınmak istediğiniz. Onu ne kadar beslerseniz, o kadar iyi hale gelir. Bunu yeni bir İK uzmanını işe başlatmak gibi düşünün: İlk hafta sizi tanımaları gerekir, sonrasında ise paha biçilmez hale gelirler.

Bu araç, onu 740+ iş ilanını değerlendirmek, 100+ özel Özgeçmiş oluşturmak ve Head of Applied AI (Uygulamalı Yapay Zeka Başkanı) rolüne yerleşmek için kullanan biri tarafından geliştirilmiştir. [Vaka çalışmasının tamamını okuyun](https://santifer.io/career-ops-system).

## Özellikler

| Özellik                  | Açıklama                                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Otomatik Süreç (Auto-Pipeline)** | Bir URL yapıştırın, tam bir değerlendirme + PDF + takip listesi girdisi alın                                                                                 |
| **6-Blok Değerlendirme**   | Rol özeti, Özgeçmiş eşleşmesi, seviye stratejisi, maaş araştırması, kişiselleştirme, mülakat hazırlığı (STAR+R) -- ayrıca dolandırıcılık ve sahte işleri tespit eden Blok G ilan yasallığı kontrolü |
| **Mülakat Hikaye Bankası** | Değerlendirmeler boyunca STAR+Yansıma (Reflection) hikayelerini biriktirir -- her türlü davranışsal soruya cevap verebilecek 5-10 ana hikaye                        |
| **Müzakere Senaryoları**  | Maaş müzakeresi çerçeveleri, coğrafi kesintilere itiraz, rakip teklif kozları                                                    |
| **ATS Uyumlu PDF Üretimi**   | Space Grotesk + DM Sans tasarımıyla anahtar kelime enjekte edilmiş Özgeçmişler                                                                                 |
| **Ön Yazı Oluşturucu** | Anahtar kelime yansıtmasıyla araştırmaya dayalı ön yazılar, dört interaktif açı istemi (neden/problemler/yaklaşım/ton), sohbette taslak onay kapısı ve Özgeçmişler ile aynı HTML + Playwright hattı üzerinden A4 PDF. Her değerlendirmede otomatik taslak çıkarır; tamamlamak ve oluşturmak için isteğe bağlı olarak `/career-ops cover` komutunu kullanın |
| **Başvuru E-posta Taslakları** | Bir rapordan veya yapıştırılmış iş tanımından; konu satırı, ek listesi, kaynağa dayalı uygunluk noktaları ve profile dayalı iletişim bloğu içeren resmi İK/referans/soğuk başvuru e-postaları. Yalnızca taslaktır -- career-ops asla hiçbir şey göndermez, tıklamaz veya başvuruyu kendi başına yapmaz. |
| **Portal Tarayıcı**       | Önceden yapılandırılmış 45+ şirket (Anthropic, OpenAI, ElevenLabs, Retool, n8n...) + Ashby, Greenhouse, Lever, Wellfound üzerinde özel sorgular |
| **Toplu İşleme**     | Başsız CLI çalışanlarıyla paralel değerlendirme (`claude -p` / `opencode run`)                                                             |
| **Dashboard TUI**        | Sürecinizi (pipeline) taramak, filtrelemek ve sıralamak için Terminal arayüzü                                                                             |
| **Döngüde İnsan (Human-in-the-Loop)**    | Yapay zeka değerlendirir ve önerir, siz karar verir ve eyleme geçersiniz. Sistem asla kendi kendine başvuru göndermez -- son karar her zaman sizindir               |
| **Süreç Bütünlüğü (Pipeline Integrity)**   | Otomatik birleştirme, mükerrer kayıt engelleme (dedup), durum normalizasyonu, sağlık kontrolleri                                                                              |
| **Özgeçmişin Ötesinde**        | Şirket araştırması ([`deep`](modes/deep.md)) yapay zeka stratejisini, son hamleleri, mühendislik kültürünü ve profilinizin alması gereken açıyı ortaya çıkarır. İletişim keşfi ([`contacto`](modes/contacto.md)), ulaşmaya değer işe alım yöneticisini, İK uzmanını veya takım arkadaşını belirler ve her iletişim türüne göre ayarlanmış ≤300 karakterlik bir LinkedIn mesajı taslağı oluşturur. Resmi başvuru e-posta taslakları ([`email`](modes/email.md)), değerlendirilmiş bir raporu veya yapıştırılmış iş tanımını, herhangi bir şey göndermeden, tıklamadan veya başvurmadan bir konu satırına, gövdeye ve ek listesine dönüştürür. Başvurular sizi sıraya sokar; araştırma ise size bir görüşme kazandırır. |

## Hızlı Başlangıç

**En hızlı yol — tek komut:**

```bash
npx @santifer/career-ops init
```

> 💡 `npx`, [Node.js](https://nodejs.org) ile birlikte gelir — global olarak hiçbir şey yüklemeden kurulumu bir kez çalıştırır. Henüz Node yok mu? Önce onu yükleyin.
> (Zaten Claude Code / Gemini / Codex CLI mi kullanıyorsunuz? O zaman zaten sahibisiniz demektir.)

Bu komut en son sürümü `./career-ops` klasörüne kopyalar ve bağımlılıkları yükler. Ardından:

```bash
cd career-ops
claude   # veya gemini / codex / qwen / opencode / agy / grok — AI CLI'nizi burada açın
```

**İlk açılışta, career-ops sizi yalnızca sohbet ederek kurulum (Özgeçmişiniz, profiliniz ve hedef rolleriniz) konusunda yönlendirir. Elle düzenlemeniz gereken hiçbir şey yok.**

<details>
<summary><b>Manuel olarak mı kurmayı tercih edersiniz? (git clone)</b></summary>

```bash
git clone https://github.com/santifer/career-ops.git
cd career-ops && npm install
npx playwright install chromium   # sadece PDF üretimi için gereklidir

# 2. Kurulumu kontrol et
npm run doctor                     # Tüm önkoşulları doğrular

# 3. Yapılandır
cp config/profile.example.yml config/profile.yml  # Kendi detaylarınızla düzenleyin
cp templates/portals.example.yml portals.yml       # Şirketleri özelleştirin

# 4. Özgeçmişinizi ekleyin
# Proje kök dizininde, Özgeçmişinizi markdown formatında içeren cv.md dosyasını oluşturun

# 5. Bu dizinde AI CLI'nizi açın
claude   # veya codex / opencode / gemini / qwen / agy / grok

# Ardından CLI'nizden sistemi size uyarlamasını isteyin:
# "Arketipleri backend mühendisliği rollerine değiştir"
# "Modları Türkçeye çevir"
# "portals.yml'ye şu 5 şirketi ekle"
# "Profilimi yapıştırdığım bu Özgeçmiş ile güncelle"

# 6. Kullanmaya başlayın
# Otomatik süreci tetiklemek için bir iş URL'sini veya iş tanımı metnini yapıştırın
# CLI'niz eğik çizgi komutlarını (slash commands) destekliyorsa, /career-ops (veya CLI'ye özel takma adını) kullanın
# Codex'te, aynı modu düz bir dille isteyin, örn:
# "Run the career-ops scan mode"
# "Run the career-ops pipeline mode for data/pipeline.md"
# "Run the career-ops pdf mode for the latest evaluated role"
# "Run the career-ops tracker mode and summarize the current statuses"
```

</details>

> **Sistem, AI kodlama CLI'niz tarafından özelleştirilmek üzere tasarlanmıştır.** Modlar, arketipler, puanlama ağırlıkları, müzakere senaryoları -- sadece değiştirmesini isteyin. Kullandığı dosyaların aynısını okur, bu yüzden neyi düzenleyeceğini tam olarak bilir.

Tam kurulum kılavuzu için [docs/SETUP.md](docs/SETUP.md), career-ops'u özel veya yerel modeller kullanarak ucuza çalıştırma talimatları için [docs/RUNNING_ON_A_BUDGET.md](docs/RUNNING_ON_A_BUDGET.md), ATS otomatik doldurma akışı hakkındaki detaylar için [docs/APPLY_AUTOFILL.md](docs/APPLY_AUTOFILL.md) ve yaygın kurulum sorularının cevapları için [docs/FAQ.md](docs/FAQ.md) dosyalarına bakın.

## Antigravity CLI Entegrasyonu

career-ops, Claude Code ve OpenCode'u desteklediği gibi Antigravity CLI'yi de yerel olarak destekler. Tüm eğik çizgi komutları (slash commands), aynı `modes/*.md` değerlendirme mantığını kullanarak paylaşılan yetenek (skill) giriş noktası üzerinden kullanılabilir.

Google, tüketici Gemini CLI erişimini Antigravity CLI'ye geçirmiştir. `GEMINI.md` artık Antigravity'nin hem `AGENTS.md` hem de `GEMINI.md` dosyalarını okuduğunda tüm proje talimatlarını çoğaltmasını önleyen, etkisiz (no-op) bir uyumluluk kalkanıdır.

### Yerel Antigravity CLI

```bash
# 1. career-ops dizininde çalıştırın
cd career-ops
agy

# 2. Alt komutlarla birleştirilmiş /career-ops komutunu kullanın:
/career-ops "Senior AI Engineer at Anthropic..."
/career-ops pipeline
/career-ops scan
/career-ops pdf
/career-ops tracker
```

## Önceden Yapılandırılmış Portallar

Tarayıcı, taranmaya hazır **45+ şirket** ve büyük iş panolarında **19 arama sorgusu** ile birlikte gelir. Kendi listenizi eklemek için `templates/portals.example.yml` dosyasını `portals.yml` olarak kopyalayın:

**AI Labs:** Anthropic, OpenAI, Mistral, Cohere, LangChain, Pinecone
**Voice AI:** ElevenLabs, PolyAI, Parloa, Hume AI, Deepgram, Vapi, Bland AI
**AI Platforms:** Retool, Airtable, Vercel, Temporal, Glean, Arize AI
**Contact Center:** Ada, LivePerson, Sierra, Decagon, Talkdesk, Genesys
**Enterprise:** Salesforce, Twilio, Gong, Dialpad
**LLMOps:** Langfuse, Weights & Biases, Lindy, Cognigy, Speechmatics
**Automation:** n8n, Zapier, Make.com
**European:** Factorial, Attio, Tinybird, Clarity AI, Travelperk

**Aranan iş panoları:** 21 sağlayıcı modülü ATS API'lerini, pano genelindeki yayınları (feed), XML/RSS yayınlarını, markdown yayınlarını ve yerel ayrıştırıcıları kapsar. Tam tablo için [Desteklenen iş panolarına (Supported job boards)](docs/SUPPORTED_JOB_BOARDS.md) bakın.

Varsayılan olarak `node scan.mjs` (diğer adıyla `npm run scan`) her ATS yayınının ne döndürdüğüne güvenir. Bazı şirketler rol kapandıktan sonra bile bayat ilanları herkese açık API'lerinde bırakır, bu nedenle süresi dolmuş kayıtlar `pipeline.md` içine sızabilir. API geçişinden sonra Playwright'ı başlatmak ve süresi dolmuş ilanları sürece girmeden önce bırakmak için `--verify` parametresini iletin:

```bash
node scan.mjs --verify          # sıfır token keşfi + Playwright canlılık kontrolü
```

Doğrulama işlemi ardışık olarak yapılır ve yalnızca (mükerrer kayıt engellemesinden sonraki) yeni tekliflere karşı çalışır, böylece maliyet sınırlı kalır.

## Dashboard TUI (Terminal Arayüzü)

Dahili terminal arayüzü, sürecinize (pipeline) görsel olarak göz atmanızı sağlar:

```bash
npm run serve:dashboard   # TUI'yi başlatır
npm run build:dashboard   # isteğe bağlı: bağımsız binary dosyasını derler
```

Özellikler: 6 filtre sekmesi, 4 sıralama modu, gruplandırılmış/düz görünüm, tembel yüklenen (lazy-loaded) önizlemeler, satır içi durum değişiklikleri.

Ayrıca **deneysel bir web arayüzü** (alfa sürümü, isteğe bağlı — siz başlatmadıkça hiçbir şey çalışmaz) de bulunmaktadır: bkz. [`web/README.md`](web/README.md).

## Proje Yapısı

```
career-ops/
├── AGENTS.md                    # Canonical aracı talimatları (tüm CLI'ler için)
├── CLAUDE.md                    # Claude Code sarmalayıcısı (AGENTS.md'yi içe aktarır)
├── CODEX.md                     # Codex sarmalayıcısı (AGENTS.md'yi içe aktarır)
├── OPENCODE.md                  # OpenCode sarmalayıcısı (AGENTS.md'yi içe aktarır)
├── GEMINI.md                    # Antigravity mükerrer bağlamını önlemek için eski no-op kalkanı
├── cv.md                        # Sizin Özgeçmişiniz (bunu oluşturun)
├── article-digest.md            # Kanıt noktalarınız (isteğe bağlı)
├── config/
│   └── profile.example.yml      # Profiliniz için şablon
├── modes/                       # Yetenek (Skill) modları
│   ├── _shared.md               # Paylaşılan bağlam (bunu özelleştirin)
│   ├── oferta.md                # Tekil değerlendirme
│   ├── pdf.md                   # PDF üretimi
│   ├── cover.md                 # Ön yazı üretimi
│   ├── email.md                 # Resmi başvuru e-posta taslakları
│   ├── scan.md                  # Portal tarayıcı
│   ├── batch.md                 # Toplu işleme
│   └── ...
├── templates/
│   ├── cv-template.html         # ATS optimizasyonlu Özgeçmiş şablonu
│   ├── portals.example.yml      # Tarayıcı konfigürasyon şablonu
│   └── states.yml               # Canonical durumlar
├── batch/
│   ├── batch-prompt.md          # Kendi kendine yeten worker istemi
│   └── batch-runner.sh          # Orkestratör betiği
├── dashboard/                   # Go TUI süreç görüntüleyici
├── data/                        # Takip verileriniz (gitignored)
├── reports/                     # Değerlendirme raporları (gitignored)
├── output/                      # Üretilen PDF'ler (gitignored)
├── fonts/                       # Space Grotesk + DM Sans
├── docs/                        # Kurulum, özelleştirme, bütçe rehberi, mimari
└── examples/                    # Örnek Özgeçmiş, rapor, kanıt noktaları
```

## Teknoloji Yığını

![Claude Code](https://img.shields.io/badge/Claude_Code-000?style=flat&logo=anthropic&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=flat&logo=playwright&logoColor=white)
![Go](https://img.shields.io/badge/Go-00ADD8?style=flat&logo=go&logoColor=white)
![Bubble Tea](https://img.shields.io/badge/Bubble_Tea-FF75B5?style=flat&logo=go&logoColor=white)

- **Aracı (Agent)**: Paylaşılan yetenekler ve modlar içeren AI kodlama CLI'si (`AGENTS.md` + CLI sarmalayıcısı)
- **PDF**: Playwright/Puppeteer + HTML şablonu
- **Ön Yazılar (Cover letters)**: HTML şablonu + Playwright (A4 PDF, Özgeçmişler ile aynı hat)
- **Tarayıcı (Scanner)**: Playwright + Greenhouse API + WebSearch
- **Dashboard**: Go + Bubble Tea + Lipgloss (Catppuccin Mocha teması)
- **Veri**: Markdown tabloları + YAML konfigürasyonları + TSV toplu dosyaları

## Ayrıca Açık Kaynaklı

- **[cv-santiago](https://github.com/santifer/cv-santiago)** -- Yapay zeka sohbet botu, LLMOps panosu ve vaka çalışmaları içeren portföy web sitesi (santifer.io). İş aramanızla birlikte sergileyecek bir portföye ihtiyacınız varsa, bunu forklayıp kendinize ait hale getirin.

## Yazar Hakkında

Ben Santiago -- Head of Applied AI, eski kurucu (kendi adımla çalışan ve hala faaliyette olan bir işletme kurup sattım). career-ops'u kendi iş arama sürecimi yönetmek için geliştirdim. Ve işe yaradı: Onu şu anki rolüme girmek için kullandım.

Portföyüm ve diğer açık kaynaklı projelerim → [santifer.io](https://santifer.io)

## Sorumluluk Reddi (Disclaimer)

**career-ops yerel, açık kaynaklı bir araçtır, barındırılan (hosted) bir hizmet DEĞİLDİR.** Bu yazılımı kullanarak şunları kabul edersiniz:

1. **Verilerinizin kontrolü sizdedir.** Özgeçmişiniz, iletişim bilgileriniz ve kişisel verileriniz makinenizde kalır ve doğrudan seçtiğiniz yapay zeka sağlayıcısına (Anthropic, OpenAI vb.) gönderilir. Verilerinizin hiçbirini toplamıyor, saklamıyor veya bunlara erişmiyoruz.
2. **Yapay zekanın kontrolü sizdedir.** Varsayılan istemler yapay zekaya başvuruları otomatik olarak göndermemesini söyler, ancak yapay zeka modelleri tahmin edilemez şekilde davranabilir. İstemleri değiştirirseniz veya farklı modeller kullanırsanız, riski size aittir. **Göndermeden önce yapay zeka tarafından oluşturulan içeriğin doğruluğunu daima gözden geçirin.**
3. **Üçüncü taraf Hizmet Şartlarına uyarsınız.** Bu aracı etkileşimde bulunduğunuz kariyer portallarının (Greenhouse, Lever, Workday, LinkedIn vb.) Hizmet Şartlarına uygun olarak kullanmalısınız. Bu aracı işverenlere spam göndermek veya ATS sistemlerini bunaltmak için kullanmayın.
4. **Garantisi yoktur.** Değerlendirmeler tavsiye niteliğindedir, kesin gerçekler değildir. Yapay zeka modelleri becerileri veya deneyimleri uydurabilir (halüsinasyon görebilir). Yazarlar istihdam sonuçlarından, reddedilen başvurulardan, hesap kısıtlamalarından veya diğer herhangi bir sonuçtan sorumlu değildir.

Tüm detaylar için [LEGAL_DISCLAIMER.md](LEGAL_DISCLAIMER.md) dosyasına bakın. Bu yazılım, [MIT Lisansı](LICENSE) kapsamında, zımni veya açık hiçbir garanti verilmeksizin "olduğu gibi" sağlanmaktadır.

## Katkıda Bulunanlar

<a href="https://github.com/santifer/career-ops/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=santifer/career-ops" />
</a>

career-ops kullanarak iş mi buldunuz? [Hikayenizi paylaşın!](https://github.com/santifer/career-ops/issues/new?template=i-got-hired.yml)

## Lisans & Ticari Marka

Kod [MIT](LICENSE) kapsamında lisanslanmıştır. "career-ops" adı ve markası [Ticari Marka Politikası (Trademark Policy)](TRADEMARK.md) ile yönetilmektedir; topluluk kullanımı için serbest, ticari ürün adlandırma ve onaylama için ise saklıdır.

## İletişime Geçelim

[![Website](https://img.shields.io/badge/santifer.io-000?style=for-the-badge&logo=safari&logoColor=white)](https://santifer.io)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://linkedin.com/in/santifer)
[![X](https://img.shields.io/badge/X-000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/santifer)
[![Discord](https://img.shields.io/badge/Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/8pRpHETxa4)
[![Email](https://img.shields.io/badge/Email-EA4335?style=for-the-badge&logo=gmail&logoColor=white)](mailto:hi@santifer.io)
